// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Handy-Scan: Kamera mit Live-Kantenerkennung und automatischer Aufnahme, mehrseitig am Stück.
   Oben die reine Logik (auch in Node-Tests), unten die Kamera-Ansicht (nur im Browser). */
(function (root) {
  'use strict';
  const quadArea = c => Math.abs(c.reduce((a, [x, y], i) => { const [x2, y2] = c[(i + 1) % 4]; return a + x * y2 - x2 * y; }, 0)) / 2;
  const quadDelta = (a, b) => Math.max(...a.map(([x, y], i) => Math.hypot(x - b[i][0], y - b[i][1])));
  // Innenwinkel zwischen 50° und 130° → ein plausibles (perspektivisch verzerrtes) Rechteck
  function anglesOk(c) {
    return c.every((p, i) => {
      const a = c[(i + 3) % 4], b = c[(i + 1) % 4];
      const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
      const deg = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
      return deg > 50 && deg < 130;
    });
  }
  // Ist die Erkennung gut genug für eine automatische Aufnahme?
  function plausible(det) {
    if (!det || !det.found) return false;
    const A = quadArea(det.corners);
    return A > 0.16 && A < 0.97 && (det.score != null ? det.score > 0.4 : det.fill == null || det.fill > 0.8) && anglesOk(det.corners);
  }
  // Unterschied zweier kleiner Graustufen-Abdrücke (0–255): hat sich das Blatt geändert?
  const fpDiff = (a, b) => { if (!a || !b || a.length !== b.length) return 255; let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

  /* Auto-Auslöser: löst aus, wenn ein Blatt erkannt ist und das Bild kurz ruhig steht.
     Danach wartet er, bis ein neues Blatt da ist (Blatt weg oder Inhalt deutlich anders) – so entstehen keine Doppelten. */
  class AutoShutter {
    constructor({ steadyMs = 900, move = 0.025, cooldownMs = 1200, changeDiff = 14, goneMs = 350 } = {}) {
      Object.assign(this, { steadyMs, move, cooldownMs, changeDiff, goneMs });
      this.anchor = null; this.since = 0; this.lastFire = -1e9; this.lastFp = null; this.waiting = false; this.goneSince = null;
    }
    update(det, t, fp) {
      const ok = plausible(det);
      if (this.waiting) {
        if (!ok) { this.goneSince ??= t; if (t - this.goneSince >= this.goneMs) this.waiting = false; }
        else { this.goneSince = null; if (t - this.lastFire > this.cooldownMs && fpDiff(fp, this.lastFp) > this.changeDiff) this.waiting = false; }
        if (this.waiting) return { state: 'wait', progress: 0 };
        this.anchor = null;
      }
      if (!ok) { this.anchor = null; return { state: 'search', progress: 0 }; }
      if (!this.anchor || quadDelta(det.corners, this.anchor) > this.move) { this.anchor = det.corners; this.since = t; }
      const progress = Math.min(1, (t - this.since) / this.steadyMs);
      if (progress >= 1) { this.fire(t, fp); return { state: 'fire', progress: 1 }; }
      return { state: 'hold', progress };
    }
    fire(t, fp) { this.lastFire = t; this.lastFp = fp; this.waiting = true; this.goneSince = null; this.anchor = null; }
  }

  // Ecken weich nachführen: kleine Zitterbewegungen glätten, große Sprünge (neues Blatt) sofort übernehmen
  function smoothCorners(prev, cur, k = 0.45) {
    if (!prev || quadDelta(prev, cur) > 0.08) return cur.map(p => p.slice());
    return cur.map(([x, y], i) => [prev[i][0] + (x - prev[i][0]) * k, prev[i][1] + (y - prev[i][1]) * k]);
  }
  const api = { quadArea, quadDelta, anglesOk, plausible, fpDiff, AutoShutter, smoothCorners };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.CamLogic = api;

  /* ------------------------------ Kamera-Ansicht ------------------------------ */
  const $ = s => document.querySelector(s);
  let stream = null, raf = 0, shots = [], shutter = null, auto = true, lastDet = null, busy = false, onDone = null, lastTick = 0, smooth = null, searchSince = 0, reviewIdx = -1;
  const small = document.createElement('canvas');
  function fingerprint(cv, det) {
    // 16×16-Abdruck des erkannten Blatts (grob über das umschließende Rechteck)
    const xs = det.corners.map(p => p[0]), ys = det.corners.map(p => p[1]);
    const x0 = Math.min(...xs) * cv.width, y0 = Math.min(...ys) * cv.height, w = (Math.max(...xs) - Math.min(...xs)) * cv.width, h = (Math.max(...ys) - Math.min(...ys)) * cv.height;
    const f = document.createElement('canvas'); f.width = f.height = 16;
    const x = f.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, x0, y0, Math.max(1, w), Math.max(1, h), 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data, out = new Uint8Array(256);
    for (let i = 0; i < 256; i++) out[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0;
    return out;
  }
  // Schärfe (Varianz des Laplace-Filters) – verwackelte Bilder nicht automatisch aufnehmen
  function sharpness(cv) {
    const x = cv.getContext('2d', { willReadFrequently: true }), { width: W, height: H } = cv, d = x.getImageData(0, 0, W, H).data;
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < H - 1; y += 2) for (let xx = 1; xx < W - 1; xx += 2) {
      const g = i => d[i * 4 + 1], i = y * W + xx;
      const l = 4 * g(i) - g(i - 1) - g(i + 1) - g(i - W) - g(i + W);
      s += l; s2 += l * l; n++;
    }
    return n ? s2 / n - (s / n) ** 2 : 0;
  }
  function drawOverlay(det, st) {
    const v = $('#camVideo'), o = $('#camOverlay'), r = v.getBoundingClientRect();
    o.width = r.width * devicePixelRatio; o.height = r.height * devicePixelRatio;
    const x = o.getContext('2d'); x.clearRect(0, 0, o.width, o.height);
    if (!det || !plausible(det)) return;
    // Video wird mit object-fit:contain dargestellt → Koordinaten umrechnen
    const k = Math.min(o.width / v.videoWidth, o.height / v.videoHeight), w = v.videoWidth * k, h = v.videoHeight * k, ox = (o.width - w) / 2, oy = (o.height - h) / 2;
    x.beginPath(); det.corners.forEach(([px, py], i) => (i ? x.lineTo : x.moveTo).call(x, ox + px * w, oy + py * h)); x.closePath();
    const col = st.state === 'wait' ? '255,255,255' : '74,222,128';
    x.fillStyle = `rgba(${col},${st.state === 'hold' ? 0.12 + st.progress * 0.2 : 0.1})`; x.fill();
    x.lineWidth = 3 * devicePixelRatio; x.strokeStyle = `rgba(${col},.95)`; x.stroke();
  }
  function setHint(t) { $('#camHint').textContent = t; }
  function tick(t) {
    raf = requestAnimationFrame(tick);
    const v = $('#camVideo');
    if (!v.videoWidth || busy || t - lastTick < 150) return;
    lastTick = t;
    const k = Math.min(1, 320 / Math.max(v.videoWidth, v.videoHeight));
    small.width = Math.round(v.videoWidth * k); small.height = Math.round(v.videoHeight * k);
    small.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0, small.width, small.height);
    const det = Imaging.detectDocument(small, 320);
    if (plausible(det)) { smooth = smoothCorners(smooth, det.corners); det.corners = smooth; } else smooth = null;
    lastDet = det;
    const ok = plausible(det), fp = ok ? fingerprint(small, det) : null;
    if (ok) searchSince = 0; else if (!searchSince) searchSince = t;
    let st = auto ? shutter.update(det, t, fp) : { state: ok ? 'hold' : 'search', progress: 0 };
    if (st.state === 'fire' && sharpness(small) < 40) { shutter.waiting = false; st = { state: 'hold', progress: 0.9 }; setHint('Ruhig halten …'); }
    drawOverlay(det, st);
    $('#camRing').style.setProperty('--p', st.state === 'hold' ? st.progress : 0);
    if (st.state === 'fire') capture(det);
    else if (st.state === 'wait') setHint(`Seite ${shots.length} aufgenommen – nächstes Blatt hinlegen oder „Fertig“`);
    else if (st.state === 'hold') setHint(auto ? 'Blatt erkannt – ruhig halten …' : 'Blatt erkannt – auf den Auslöser tippen');
    else if (searchSince && t - searchSince > 4500) setHint('Kein Blatt erkannt – auf einen dunklen Untergrund legen, etwas Abstand halten oder selbst auslösen');
    else setHint(shots.length ? `${shots.length} Seite(n) – nächstes Blatt ins Bild` : 'Blatt auf eine dunkle Fläche legen und ins Bild halten');
  }
  async function capture(det) {
    const v = $('#camVideo'); if (!v.videoWidth || busy) return;
    busy = true;
    try {
      // Echtes Foto in voller Sensorauflösung (Android/Chrome: ImageCapture, z. B. 4000×3000) statt des Videobilds (oft nur 1280×720)
      let full = null;
      try {
        const track = stream?.getVideoTracks()[0];
        if (track && 'ImageCapture' in window) {
          const ic = new ImageCapture(track), caps = await ic.getPhotoCapabilities().catch(() => null);
          const blob = await ic.takePhoto(caps?.imageWidth?.max ? { imageWidth: caps.imageWidth.max, imageHeight: caps.imageHeight.max } : {});
          const bmp = await createImageBitmap(blob);
          if (bmp.width > v.videoWidth) { full = Imaging.canvas(bmp.width, bmp.height); full.getContext('2d').drawImage(bmp, 0, 0); }
          bmp.close?.();
        }
      } catch (e) { console.warn('Foto in voller Auflösung nicht möglich, nehme Videobild:', e); }
      const sameAspect = full && Math.abs(full.width / full.height - v.videoWidth / v.videoHeight) < 0.02, fromPhoto = !!full;
      // Ohne echtes Foto (z. B. iPhone): mehrere Videobilder kurz hintereinander – werden unten einzeln entzerrt und gemittelt
      const extra = [];
      if (!full) {
        full = Imaging.canvas(v.videoWidth, v.videoHeight); full.getContext('2d').drawImage(v, 0, 0);
        for (let k = 0; k < 3; k++) {
          await new Promise(r => requestAnimationFrame(() => setTimeout(r, 40)));
          const f = Imaging.canvas(v.videoWidth, v.videoHeight); f.getContext('2d').drawImage(v, 0, 0); extra.push(f);
        }
      }
      // Ecken in hoher Auflösung genau auf die Blattkanten setzen; ohne Live-Erkennung (Auslöser von Hand) ganzes Foto untersuchen
      let use = null;
      try {
        if (det && plausible(det) && (sameAspect || full.width === v.videoWidth)) use = Imaging.detectDocument(full, 1400, det.corners);
        else { const d2 = Imaging.detectDocument(full, 700); if (plausible(d2)) use = Imaging.detectDocument(full, 1400, d2.corners); }
      } catch (e) { console.warn('Blatterkennung:', e); use = det && plausible(det) ? det : null; }
      let page = use ? Imaging.warp(full, use.corners) : full;
      if (use && extra.length) {
        // jedes weitere Bild an den eigenen Blattkanten ausrichten; verwackelte (Ecken weit weg) auslassen
        const pages = [page];
        for (const f of extra) {
          try {
            const d3 = Imaging.detectDocument(f, 1400, use.corners);
            if (quadDelta(d3.corners, use.corners) < 0.012) pages.push(Imaging.warp(f, d3.corners));
          } catch (e) { console.warn(e); }
          f.width = 0;
        }
        if (pages.length > 1) { const avg = Imaging.average(pages); pages.forEach(x => { x.width = 0; }); page = avg; }
      } else extra.forEach(f => { f.width = 0; });
      // Speicher sparen (wichtig auf dem iPhone): Seite auf max. 2600 px begrenzen, Vollbild sofort freigeben
      if (Math.max(page.width, page.height) > 2600) { const s = Imaging.scaled(page, 2600); if (page !== full) { page.width = 0; page.height = 0; } page = s; }
      if (page !== full) { full.width = 0; full.height = 0; }
      shots.push({ canvas: page, cropped: !!use });
      $('#camFlash').classList.remove('go'); void $('#camFlash').offsetWidth; $('#camFlash').classList.add('go');
      navigator.vibrate?.(35);
      renderStrip();
      if (!auto) shutter.fire(performance.now(), lastDet && plausible(lastDet) ? fingerprint(small, lastDet) : null);
    } finally { busy = false; }
  }
  function renderStrip() {
    const s = $('#camStrip'); s.innerHTML = '';
    shots.forEach((sh, i) => {
      const t = Imaging.scaled(sh.canvas, 120), im = new Image(); im.src = t.toDataURL('image/jpeg', 0.7); im.alt = `Seite ${i + 1}`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'camthumb'; b.title = `Seite ${i + 1} ansehen, drehen oder löschen`;
      b.append(im); const n = document.createElement('span'); n.textContent = i + 1; b.append(n);
      b.onclick = () => review(i);
      s.append(b);
    });
    $('#camDone').textContent = shots.length ? `Fertig (${shots.length})` : 'Fertig';
    $('#camDone').disabled = !shots.length;
    s.scrollLeft = s.scrollWidth;
  }
  // Prüfansicht einer aufgenommenen Seite: groß ansehen, drehen, löschen
  function review(i) {
    reviewIdx = i; const sh = shots[i]; if (!sh) return closeReview();
    $('#camRevImg').src = Imaging.scaled(sh.canvas, 1400).toDataURL('image/jpeg', 0.85);
    $('#camRevTitle').textContent = `Seite ${i + 1} von ${shots.length}`;
    $('#camReview').hidden = false;
  }
  function closeReview() { reviewIdx = -1; $('#camReview').hidden = true; }
  async function torch(on) {
    const tr = stream?.getVideoTracks()[0];
    try { await tr.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; }
  }
  function close(deliver) {
    cancelAnimationFrame(raf); raf = 0;
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    $('#camDlg').close();
    const list = deliver ? shots.map(s => s.canvas) : [];
    shots = [];
    if (deliver && list.length && onDone) onDone(list);
  }
  async function open(done, fallback) {
    onDone = done;
    if (!navigator.mediaDevices?.getUserMedia) { fallback?.(); return; }
    try {
      // 4:3 nutzt den ganzen Kamerasensor (16:9 schneidet oben/unten ab) – das Blatt bekommt mehr Bildpunkte
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 }, aspectRatio: { ideal: 4 / 3 } } });
    } catch (e) {
      console.warn('Kamera:', e);
      if (e.name === 'NotAllowedError') alert('Der Kamerazugriff wurde nicht erlaubt. Bitte in den Browser-Einstellungen die Kamera für diese Seite freigeben – oder ein Foto aus der Galerie wählen.');
      fallback?.(); return;
    }
    shots = []; shutter = new AutoShutter(); auto = (() => { try { return localStorage.getItem('mpdf.camAuto') !== '0'; } catch { return true; } })();
    $('#camAuto').checked = auto;
    const v = $('#camVideo'); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.muted = true; v.playsInline = true; v.srcObject = stream;
    $('#camDlg').showModal(); renderStrip();
    try { await v.play(); } catch {}
    const track = stream.getVideoTracks()[0], caps = track.getCapabilities?.() || {};
    // Viele Handys starten mit mittlerer Auflösung – die höchste anfordern (iPhone oft 4K), damit auch kleine Schrift scharf ist
    if (caps.width?.max && caps.height?.max && caps.width.max > (v.videoWidth || 0)) {
      try { await track.applyConstraints({ width: { ideal: caps.width.max }, height: { ideal: caps.height.max } }); } catch (e) { console.warn('Auflösung:', e); }
    }
    if (caps.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    smooth = null; searchSince = 0; closeReview();
    $('#camTorch').hidden = !caps.torch; $('#camTorch').setAttribute('aria-pressed', 'false');
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener('DOMContentLoaded', () => {});
  if (document.readyState !== 'loading') wire(); else document.addEventListener('DOMContentLoaded', wire);
  function wire() {
    if (!$('#camDlg')) return;
    $('#camShutter').onclick = () => capture(lastDet);
    // Foto-App: volle Auflösung der Handykamera (iPhone liefert im Browser nur ein Videobild); bisherige Aufnahmen werden übernommen
    $('#camPhotoApp').onclick = () => { const had = shots.length; close(true); setTimeout(() => document.querySelector('#camIn')?.click(), had ? 400 : 0); };
    $('#camRevBack').onclick = closeReview;
    $('#camRevDel').onclick = () => { shots.splice(reviewIdx, 1); renderStrip(); closeReview(); };
    $('#camRevRot').onclick = () => { const sh = shots[reviewIdx]; if (!sh) return; const r = Imaging.rotate90(sh.canvas, 90); sh.canvas.width = 0; sh.canvas = r; renderStrip(); review(reviewIdx); };
    $('#camDone').onclick = () => close(true);
    $('#camClose').onclick = () => { if (shots.length && !confirm(`${shots.length} aufgenommene Seite(n) verwerfen?`)) return; close(false); };
    $('#camDlg').addEventListener('cancel', e => { e.preventDefault(); $('#camClose').click(); });
    $('#camAuto').onchange = e => { auto = e.target.checked; try { localStorage.setItem('mpdf.camAuto', auto ? '1' : '0'); } catch {} shutter = new AutoShutter(); };
    $('#camTorch').onclick = async () => { const on = $('#camTorch').getAttribute('aria-pressed') !== 'true'; if (await torch(on)) $('#camTorch').setAttribute('aria-pressed', String(on)); };
  }
  root.Camera = { open, close, get shots() { return shots; } };
})(typeof self !== 'undefined' ? self : this);
