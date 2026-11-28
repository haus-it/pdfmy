// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
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
  const tooDark = mean => mean < 45;   // mittlere Helligkeit 0–255: Texterkennung und Blatterkennung werden darunter unzuverlässig
  // Licht auf dem Blatt: Grauwerte (0–255) → Mittel, Anteil ausgebrannter Stellen (≥ 250) und Median
  function lightStats(gray) {
    const h = new Uint32Array(256); let s = 0;
    for (const v of gray) { h[v]++; s += v; }
    const n = gray.length || 1; let sat = 0; for (let v = 250; v < 256; v++) sat += h[v];
    let p50 = 0; for (let c = 0; p50 < 255 && (c += h[p50]) < n / 2; p50++);
    return { mean: s / n, sat: sat / n, p50 };
  }
  /* 'dark': zu wenig Licht. 'glare': Spiegelung – ein Teil des Blatts ist ausgebrannt (Schrift dort verloren), während das übrige
     Papier normal belichtet ist. Gleichmäßig sehr helles Papier (Median ≥ 235) gilt nicht als Spiegelung. */
  function lightIssue({ mean, sat, p50 }) {
    if (tooDark(mean)) return 'dark';
    if (sat > 0.03 && sat < 0.5 && p50 < 235) return 'glare';
    return '';
  }
  /* Spiegelung entfernen (app-v369): zwei Aufnahmen desselben Blatts aus leicht verschiedenem Winkel, beide an den Blattkanten entzerrt.
     Glanz wandert mit dem Winkel; die Schrift bleibt. Ausgebrannte Stellen der ersten Aufnahme (A) werden aus der zweiten (B) ersetzt –
     Helligkeit von B an A angeglichen, weicher Übergang, Rest bleibt unverändert aus A. a, b: RGBA gleicher Größe (w × h). */
  const lum = (d, i) => (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
  // kleine Verschiebung von B gegen A (Graustufen la/lb, w × h), die am besten passt – nur auf Stellen ohne Glanz in beiden
  function bestShift(la, lb, w, h, r = 4) {
    let best = { dx: 0, dy: 0, e: Infinity };
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      let e = 0, n = 0;
      for (let y = r; y < h - r; y += 2) for (let x = r; x < w - r; x += 2) {
        const va = la[y * w + x], vb = lb[(y + dy) * w + x + dx];
        if (va >= 245 || vb >= 245) continue;
        e += Math.abs(va - vb); n++;
      }
      if (n && e / n < best.e) best = { dx, dy, e: e / n };
    }
    return best;
  }
  function glareMerge(a, b, w, h) {
    const n = w * h, la = new Uint8Array(n), lb = new Uint8Array(n);
    for (let p = 0; p < n; p++) { la[p] = lum(a, p * 4); lb[p] = lum(b, p * 4); }
    // Helligkeit angleichen: Median des Papiers (ohne Glanz) in beiden Bildern
    const med = (l, o) => { const h0 = new Uint32Array(256); let c = 0; for (let p = 0; p < n; p += 7) if (l[p] < 245 && o[p] < 245) { h0[l[p]]++; c++; } let v = 0; for (let s = 0; v < 255 && (s += h0[v]) < c / 2; v++); return v || 1; };
    const pA = med(la, lb), k = Math.max(0.7, Math.min(1.4, pA / med(lb, la)));
    /* Maske: A heller als das Papier (Glanz samt aufgehelltem Rand) UND B dort dunkler – Glanz hellt nur auf, darum stammt das Dunklere
       aus B nur dort, wo A überstrahlt ist; Schrift außerhalb des Glanzes bleibt aus A (kein Doppelbild bei kleinem Versatz) */
    const m = new Uint8Array(n); let glare = 0;
    for (let p = 0; p < n; p++) {
      const ex = la[p] - (pA + 2); if (la[p] >= 248) glare++;
      if (ex <= 0) continue;
      const d = (la[p] - lb[p] * k - 2) / 6;
      if (d > 0) m[p] = Math.round(255 * Math.min(1, ex / 8) * Math.min(1, d));
    }
    // Maske weich ausdehnen (Rand des Glanzflecks ist ebenfalls aufgehellt): Kastenfilter waagerecht und senkrecht, Maximum mit Original
    const r = Math.max(2, Math.round(Math.max(w, h) / 400)), t = new Uint16Array(n);
    for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x < w; x++) { if (x + r < w) s += m[o + x + r]; if (x - r - 1 >= 0) s -= m[o + x - r - 1]; if (x >= 0) t[o + x] = s; } }
    const d = 2 * r + 1, out = new Uint8ClampedArray(a.length); let fixed = 0;
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y < h; y++) { if (y + r < h) s += t[(y + r) * w + x]; if (y - r - 1 >= 0) s -= t[(y - r - 1) * w + x]; if (y >= 0) {
      const p = y * w + x, q = p * 4, mm = Math.min(255, Math.max(m[p], (s / (d * d)) * 2)) / 255;
      if (mm > 0.5) fixed++;
      for (let c = 0; c < 3; c++) out[q + c] = a[q + c] * (1 - mm) + Math.min(255, b[q + c] * k) * mm;
      out[q + 3] = 255; } } }
    return { data: out, k, glare: glare / n, fixed: fixed / n };
  }
  const api = { quadArea, quadDelta, anglesOk, plausible, fpDiff, AutoShutter, smoothCorners, tooDark, lightStats, lightIssue, bestShift, glareMerge };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.CamLogic = api;

  /* ------------------------------ Kamera-Ansicht ------------------------------ */
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const BLUR_LIMIT = 45;
  /* Größte Seitenlänge einer Aufnahme: 3508 px = A4 mit 300 dpi auf Geräten mit mindestens 4 GB Arbeitsspeicher (Meldung 2026-0016),
     sonst 2600 px (rund 220 dpi) – iPhone und kleine Android-Geräte schließen den Tab sonst bei langen Stapeln. */
  const CAP = (navigator.deviceMemory || 0) >= 4 ? 3508 : 2600;
  let glareFix = null;   // { idx, fp, corners, gone } – letzte Seite hat eine Spiegelung, zweite Aufnahme aus anderem Winkel erwartet
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
  // Fertige Seite unscharf? Nur ein Hinweis, die Aufnahme bleibt. Fast leere Seiten haben keine Kanten und gelten nicht als unscharf.
  function looksBlurry(cv) {
    const s = Imaging.scaled(cv, 800), d = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height).data;
    let dark = 0; for (let i = 1; i < d.length; i += 16) if (d[i] < 120) dark++;
    const blurry = dark / (d.length / 16) > 0.004 && sharpness(s) < BLUR_LIMIT;
    s.width = 0; s.height = 0;   // iPhone: Canvas-Speicher sofort freigeben
    return blurry;
  }
  // Grauwerte eines Ausschnitts (Anteile 0–1, ohne Rand) – jeder 3. Bildpunkt reicht
  function grayOf(cv, x0 = 0, y0 = 0, x1 = 1, y1 = 1) {
    const W = cv.width, H = cv.height, ix = Math.max(0, Math.floor(x0 * W)), iy = Math.max(0, Math.floor(y0 * H));
    const w = Math.max(1, Math.min(W - ix, Math.floor((x1 - x0) * W))), h = Math.max(1, Math.min(H - iy, Math.floor((y1 - y0) * H)));
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(ix, iy, w, h).data, out = [];
    for (let i = 0; i < d.length; i += 12) out.push((d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) | 0);
    return out;
  }
  // Licht im erkannten Blatt (umschließendes Rechteck, 10 % eingerückt, damit der Untergrund nicht mitzählt)
  function sheetLight(cv, det) {
    const xs = det.corners.map(p => p[0]), ys = det.corners.map(p => p[1]);
    const ax = Math.min(...xs), bx = Math.max(...xs), ay = Math.min(...ys), by = Math.max(...ys), mx = (bx - ax) * 0.1, my = (by - ay) * 0.1;
    return lightIssue(lightStats(grayOf(cv, ax + mx, ay + my, bx - mx, by - my)));
  }
  // Seiten als JPEG im Speicher: unkomprimiert wären es rund 19 MB je Seite, bei langen Stapeln schließt Android sonst den Tab
  async function packShot(c, cropped) {
    const sh = { w: c.width, h: c.height, cropped, blurry: false, glare: false, thumb: Imaging.scaled(c, 120).toDataURL('image/jpeg', 0.7) };
    try { sh.blurry = looksBlurry(c); } catch (e) { console.warn('Schärfe:', e); }
    try { if (cropped) { const s = Imaging.scaled(c, 400); sh.glare = lightIssue(lightStats(grayOf(s, 0.05, 0.05, 0.95, 0.95))) === 'glare'; if (s !== c) s.width = 0; } } catch (e) { console.warn('Licht:', e); }
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
    if (blob) { sh.blob = blob; c.width = 0; c.height = 0; } else sh.canvas = c;   // ohne JPEG (Speicher knapp) bleibt das Bild, wie es ist
    return sh;
  }
  /* Zwischenstand: Stürzt der Browser beim Scannen ab, wären die Aufnahmen weg, denn der Absturzschutz greift erst im Dokument.
     Jede Aufnahme liegt deshalb sofort in der IndexedDB dieses Browsers (nichts verlässt das Gerät). Gelöscht beim Verwerfen,
     sobald der Absturzschutz die Seiten übernommen hat oder gespeichert wurde, sonst nach 7 Tagen (renderRescue in pro.js). */
  const BACKUP_DAYS = 7;
  let cid = '', shotNo = 0, saveQ = Promise.resolve(), saveWarned = false;
  const handed = [];
  const shotKey = id => 'camshot-' + id;
  const queue = fn => (saveQ = saveQ.then(fn).catch(e => {
    console.warn('Kamera-Zwischenstand:', e);
    if (!saveWarned) { saveWarned = true; window.toast?.(I18N.t('Zwischenstand konnte nicht gesichert werden (Gerätespeicher voll?). Die Aufnahmen bleiben, solange diese Seite offen ist.'), 8000); }
  }));
  const manifests = async () => (await idb.get('camscans')) || [];
  // Erst die Bilder, dann die Liste: Bricht es dazwischen ab, zeigt die Liste nie auf ein fehlendes Bild
  function persist() {
    if (!cid) return;
    const id = cid, list = shots.filter(s => s.blob);
    queue(async () => {
      for (const sh of list) if (!sh.saved) { sh.id ||= `${id}-${++shotNo}`; await idb.put(shotKey(sh.id), sh.blob); sh.saved = true; }
      const all = await manifests(), old = all.find(x => x.cid === id), keep = new Set(list.map(s => s.id));
      const rest = all.filter(x => x.cid !== id);
      if (list.length) rest.unshift({ cid: id, sid: SID, at: Date.now(), items: list.map(s => s.id) });
      await idb.put('camscans', rest);
      for (const k of old?.items || []) if (!keep.has(k)) await idb.del(shotKey(k));
    });
  }
  function dropBackup(id) {
    const h = handed.indexOf(id); if (h >= 0) handed.splice(h, 1);
    return queue(async () => {
      const all = await manifests(), e = all.find(x => x.cid === id); if (!e) return;
      await idb.put('camscans', all.filter(x => x.cid !== id));
      for (const k of e.items) await idb.del(shotKey(k));
    });
  }
  // Zwischenstände anderer, beendeter Sitzungen; zu alte werden dabei gelöscht
  async function backups() {
    const all = await manifests();
    for (const e of all) if (Date.now() - e.at >= BACKUP_DAYS * 864e5) await dropBackup(e.cid);
    return all.filter(e => Date.now() - e.at < BACKUP_DAYS * 864e5);
  }
  async function restoreBackup(id) {
    const e = (await manifests()).find(x => x.cid === id), list = [];
    for (const k of e?.items || []) {
      const blob = await idb.get(shotKey(k)); if (!blob) continue;
      list.push(await shotCanvas({ blob }));
    }
    if (list.length) handed.push(id);
    return list;
  }
  async function shotCanvas(sh) {
    if (sh.canvas) return sh.canvas;
    const bmp = await createImageBitmap(sh.blob), c = Imaging.canvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
    return c;
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
  const darkHint = () => stream?.getVideoTracks()[0]?.getCapabilities?.().torch ? 'Zu dunkel – mehr Licht oder die Taschenlampe einschalten' : 'Zu dunkel – bitte für mehr Licht sorgen';
  // Hinweis zu einer fertigen Seite (leer, wenn alles gut aussieht); die Aufnahme bleibt immer erhalten
  const shotNote = (sh, n) => sh?.blurry ? `Seite ${n} wirkt unscharf – antippen zum Prüfen` : sh?.glare ? `Seite ${n} hat eine Spiegelung – antippen zum Prüfen` : '';
  function meanLight(cv) {
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
    let s = 0, n = 0; for (let i = 1; i < d.length; i += 40) { s += d[i]; n++; }
    return n ? s / n : 255;
  }
  function tick(t) {
    raf = requestAnimationFrame(tick);
    const v = $('#camVideo');
    if (!v.videoWidth || busy || t - lastTick < 150) return;
    lastTick = t;
    const k = Math.min(1, 320 / Math.max(v.videoWidth, v.videoHeight));
    small.width = Math.round(v.videoWidth * k); small.height = Math.round(v.videoHeight * k);
    small.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, 0, small.width, small.height);
    // iPhone: ist der Grafikspeicher kurz voll (InvalidStateError), dieses Bild auslassen statt einen Programmfehler zu melden
    let det; try { det = Imaging.detectDocument(small, 320); } catch (e) { if (e?.name !== 'InvalidStateError') console.warn('Live-Erkennung:', e); return; }
    if (plausible(det)) { smooth = smoothCorners(smooth, det.corners); det.corners = smooth; } else smooth = null;
    lastDet = det;
    const ok = plausible(det), fp = ok ? fingerprint(small, det) : null;
    if (ok) searchSince = 0; else if (!searchSince) searchSince = t;
    // Blatt verschwindet länger aus dem Bild → keine zweite Aufnahme mehr erwartet (das nächste Blatt ist eine neue Seite)
    if (glareFix) { if (!ok) { glareFix.gone ??= t; if (t - glareFix.gone > 700) glareFix = null; } else glareFix.gone = null; }
    if (glareFix && auto && ok && shutter.waiting && quadDelta(det.corners, glareFix.corners) > 0.035) shutter.waiting = false;   // Winkel geändert → erneut auslösen
    let st = auto ? shutter.update(det, t, fp) : { state: ok ? 'hold' : 'search', progress: 0 };
    if (st.state === 'fire' && sharpness(small) < 40) { shutter.waiting = false; st = { state: 'hold', progress: 0.9 }; setHint('Ruhig halten …'); }
    drawOverlay(det, st);
    $('#camRing').style.setProperty('--p', st.state === 'hold' ? st.progress : 0);
    if (st.state === 'fire') capture(det);
    else if (glareFix && (st.state === 'wait' || st.state === 'hold')) setHint(st.state === 'hold' && quadDelta(det.corners, glareFix.corners) > 0.035 ? 'Ruhig halten – zweite Aufnahme gegen die Spiegelung …' : auto ? 'Spiegelung erkannt – Handy etwas kippen, dann nimmt PDFMy das Blatt noch einmal auf und entfernt sie' : 'Spiegelung erkannt – Handy etwas kippen und noch einmal auslösen, PDFMy entfernt sie');
    else if (st.state === 'wait') setHint(shotNote(shots.at(-1), shots.length) || `Seite ${shots.length} aufgenommen – nächstes Blatt hinlegen oder „Fertig“`);
    else if (st.state === 'hold') {
      const li = ok ? sheetLight(small, det) : '';
      setHint(li === 'dark' ? darkHint() : li === 'glare' ? 'Spiegelung auf dem Blatt – Handy etwas schräg halten oder Licht von der Seite' : auto ? 'Blatt erkannt – ruhig halten …' : 'Blatt erkannt – auf den Auslöser tippen');
    }
    else if (tooDark(meanLight(small))) setHint(darkHint());
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
      // Ausgangsbild für „Ecken anpassen“ aufbewahren (als JPEG, höchstens 2600 px)
      let source = null;
      try { const s = Imaging.scaled(full, Math.round(CAP * 1.25)); source = await new Promise(res => s.toBlob(res, 'image/jpeg', 0.85)); if (s !== full) s.width = 0; } catch (e) { console.warn('Ausgangsbild:', e); }
      const corners = use ? use.corners.map(p => p.slice()) : [[0.03, 0.03], [0.97, 0.03], [0.97, 0.97], [0.03, 0.97]];
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
      // Speicher sparen (wichtig auf dem iPhone): Seite auf CAP begrenzen, Vollbild sofort freigeben
      if (Math.max(page.width, page.height) > CAP) { const s = Imaging.scaled(page, CAP); if (page !== full) { page.width = 0; page.height = 0; } page = s; }
      if (page !== full) { full.width = 0; full.height = 0; }
      const fp = lastDet && plausible(lastDet) ? fingerprint(small, lastDet) : null;
      // Zweite Aufnahme desselben Blatts nach einer Spiegelung: beide zusammensetzen statt eine neue Seite anzulegen
      const gi = glareFix ? glareFix.idx : -1;
      if (glareFix && use && shots[gi] && (!fp || !glareFix.fp || fpDiff(fp, glareFix.fp) < 30)) {
        glareFix = null;
        let msg = '';
        try {
          const prev = shots[gi], a = await shotCanvas(prev), m = mergeGlare(a, page);
          if (a !== prev.canvas) { a.width = 0; a.height = 0; }
          page.width = 0; page.height = 0;
          const n = await packShot(m.canvas, true); n.source = prev.source; n.corners = prev.corners; n.deglared = true;
          shots[gi] = n; persist();
          msg = n.glare ? `Seite ${gi + 1}: Spiegelung verringert – antippen zum Prüfen` : `Seite ${gi + 1}: Spiegelung entfernt`;
        } catch (e) { console.warn('glareMerge:', e); msg = 'Spiegelung ließ sich nicht entfernen – die erste Aufnahme bleibt.'; }
        $('#camFlash').classList.remove('go'); void $('#camFlash').offsetWidth; $('#camFlash').classList.add('go');
        navigator.vibrate?.(35);
        renderStrip(); window.toast?.(msg, 3500);
        shutter.fire(performance.now(), fp);   // wartet danach auf das nächste Blatt
        return;
      }
      const sh = await packShot(page, !!use); sh.source = source; sh.corners = corners;
      glareFix = sh.glare && use ? { idx: shots.length, fp, corners: use.corners.map(p => p.slice()), gone: null } : null;
      shots.push(sh);
      persist();
      $('#camFlash').classList.remove('go'); void $('#camFlash').offsetWidth; $('#camFlash').classList.add('go');
      navigator.vibrate?.(35);
      renderStrip();
      if (!auto) shutter.fire(performance.now(), lastDet && plausible(lastDet) ? fingerprint(small, lastDet) : null);
    } finally { busy = false; }
  }
  function mergeGlare(a, b) {
    const w = a.width, h = a.height, sw = Math.min(1, 480 / Math.max(w, h)), W2 = Math.max(1, Math.round(w * sw)), H2 = Math.max(1, Math.round(h * sw));
    const gray = src => { const c = Imaging.canvas(W2, H2), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0, W2, H2);
      const d = x.getImageData(0, 0, W2, H2).data, l = new Uint8Array(W2 * H2); for (let p = 0; p < l.length; p++) l[p] = d[p * 4] * 0.3 + d[p * 4 + 1] * 0.59 + d[p * 4 + 2] * 0.11; c.width = 0; return l; };
    const s = bestShift(gray(a), gray(b), W2, H2, 6);
    const bb = Imaging.canvas(w, h), x = bb.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(b, -s.dx / sw, -s.dy / sw, w, h);
    const r = glareMerge(a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, x.getImageData(0, 0, w, h).data, w, h);
    bb.width = 0; bb.height = 0;
    const out = Imaging.canvas(w, h); out.getContext('2d').putImageData(new ImageData(r.data, w, h), 0, 0);
    return { canvas: out, fixed: r.fixed, glare: r.glare };
  }
  function renderStrip() {
    const s = $('#camStrip'); s.innerHTML = '';
    shots.forEach((sh, i) => {
      const im = new Image(); im.src = sh.thumb ||= Imaging.scaled(sh.canvas, 120).toDataURL('image/jpeg', 0.7); im.alt = `Seite ${i + 1}`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'camthumb' + (sh.blurry || sh.glare ? ' camblur' : ''); b.title = shotNote(sh, i + 1) || `Seite ${i + 1} ansehen, drehen oder löschen`;
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
    if (revUrl) URL.revokeObjectURL(revUrl);
    revUrl = sh.blob ? URL.createObjectURL(sh.blob) : '';
    $('#camRevImg').src = revUrl || Imaging.scaled(sh.canvas, 1400).toDataURL('image/jpeg', 0.85);
    $('#camRevTitle').textContent = `Seite ${i + 1} von ${shots.length}`;
    $('#camRevCorners').hidden = !sh.source;
    $('#camReview').hidden = false;
  }
  let revUrl = '';
  // Ecken von Hand: falls die Blatterkennung danebenlag. Griffe per Finger, Maus oder Pfeiltasten verschieben.
  let edit = null, cornUrl = '';
  const cornDraw = () => {
    if (!edit) return;
    $$('.camhandle').forEach((b, k) => { const [x, y] = edit.c[k]; b.style.left = x * 100 + '%'; b.style.top = y * 100 + '%'; });
    $('#camCornPoly').setAttribute('points', edit.c.map(([x, y]) => `${x * 100},${y * 100}`).join(' '));
  };
  function cornFit() {
    const im = $('#camCornImg'), a = $('#camCornArea'), box = $('#camCornBox'); if (!im.naturalWidth) return;
    const cs = getComputedStyle(a), W = a.clientWidth - parseFloat(cs.paddingLeft) * 2, H = a.clientHeight - parseFloat(cs.paddingTop) * 2, k = Math.min(W / im.naturalWidth, H / im.naturalHeight);
    box.style.width = im.naturalWidth * k + 'px'; box.style.height = im.naturalHeight * k + 'px';
  }
  function cornOpen() {
    const sh = shots[reviewIdx]; if (!sh?.source) return;
    edit = { i: reviewIdx, c: sh.corners.map(p => p.slice()) };
    if (cornUrl) URL.revokeObjectURL(cornUrl);
    cornUrl = URL.createObjectURL(sh.source);
    $('#camCornImg').onload = cornFit; $('#camCornImg').src = cornUrl;
    $('#camCorners').hidden = false; cornDraw(); $$('.camhandle')[0].focus();
  }
  function cornClose() { edit = null; $('#camCorners').hidden = true; $('#camCornImg').removeAttribute('src'); if (cornUrl) { URL.revokeObjectURL(cornUrl); cornUrl = ''; } }
  async function cornApply() {
    if (!edit) return;
    const { i, c } = edit, sh = shots[i]; if (!sh) return cornClose();
    const src = await shotCanvas({ blob: sh.source });
    let page = Imaging.warp(src, c);
    src.width = 0; src.height = 0;
    if (Math.max(page.width, page.height) > CAP) { const s = Imaging.scaled(page, CAP); if (s !== page) page.width = 0; page = s; }
    const n = await packShot(page, true); n.source = sh.source; n.corners = c;
    shots[i] = n; persist(); cornClose(); renderStrip(); review(i);
  }
  function closeReview() { reviewIdx = -1; $('#camReview').hidden = true; }
  async function torch(on) {
    const tr = stream?.getVideoTracks()[0];
    try { await tr.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; }
  }
  // Zurück-Geste und Herunterziehen zum Neuladen passieren beim Ausrichten leicht und würden die Seite verlassen, die Aufnahmen wären weg:
  // eigener Verlaufseintrag und kein Neuladen per Geste, solange die Kamera offen ist
  let histGuard = false;
  function guardOn() {
    document.documentElement.classList.add('camguard');
    if (!histGuard) { try { history.pushState({ pdfmyCam: 1 }, ''); histGuard = true; } catch {} }
  }
  function guardOff() {
    document.documentElement.classList.remove('camguard');
    if (histGuard) { histGuard = false; try { if (history.state?.pdfmyCam) history.back(); } catch {} }
  }
  // Zurück: ohne Aufnahmen die Kamera schließen, mit Aufnahmen weiterscannen (beenden über „Fertig“ oder ×)
  function onBack() {
    if (!$('#camDlg').open) return;
    if (edit) cornClose();
    if (reviewIdx >= 0) closeReview();
    if (shots.length) { window.toast?.('Ihre Aufnahmen sind sicher. Zum Beenden auf „Fertig“ tippen.', 4000); return true; }
    close(false); return false;
  }
  addEventListener('popstate', () => { if (!histGuard) return; histGuard = false; if (onBack()) guardOn(); });
  // Bildschirm während des Scannens anlassen (lange Stapel); der Browser gibt die Sperre im Hintergrund selbst frei
  let wake = null;
  async function wakeOn() { try { if (!wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { console.warn('Bildschirm wach halten:', e); } }
  function wakeOff() { wake?.release().catch(() => {}); wake = null; }
  const CAM_VIDEO = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 }, aspectRatio: { ideal: 4 / 3 } } };   // 4:3 nutzt den ganzen Kamerasensor (16:9 schneidet oben/unten ab) – das Blatt bekommt mehr Bildpunkte
  // Zurück aus Anruf oder App-Wechsel: Bild kann eingefroren sein, die Kamera dann neu holen
  async function resume() {
    wakeOn();
    const v = $('#camVideo'), tr = stream?.getVideoTracks()[0];
    if (tr && tr.readyState === 'live' && !tr.muted) { try { await v.play(); } catch {} return; }
    try {
      stream?.getTracks().forEach(t => t.stop());
      stream = await navigator.mediaDevices.getUserMedia(CAM_VIDEO);
      v.srcObject = stream; await v.play();
    } catch (e) { console.warn('Kamera neu starten:', e); setHint('Kamera startet …'); }
  }
  let closing = false;
  async function close(deliver) {
    if (closing) return;
    closing = true;
    guardOff(); wakeOff();
    cancelAnimationFrame(raf); raf = 0;
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    $('#camDlg').close();
    if (revUrl) { URL.revokeObjectURL(revUrl); revUrl = ''; }
    const list = [], id = cid;
    cid = '';
    try { if (deliver) for (const sh of shots) list.push(await shotCanvas(sh)); shots = []; }
    finally { closing = false; }
    // Übergeben: Der Zwischenstand bleibt, bis der Absturzschutz die Seiten gesichert hat (rescueSave in pro.js)
    if (deliver && list.length && onDone) { handed.push(id); onDone(list); }
    else dropBackup(id);
  }
  async function open(done, fallback) {
    onDone = done;
    if (!navigator.mediaDevices?.getUserMedia) { fallback?.(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia(CAM_VIDEO);
    } catch (e) {
      console.warn('Kamera:', e);
      if (e.name === 'NotAllowedError') alert('Der Kamerazugriff wurde nicht erlaubt. Bitte in den Browser-Einstellungen die Kamera für diese Seite freigeben – oder ein Foto aus der Galerie wählen.');
      fallback?.(); return;
    }
    shots = []; glareFix = null; cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); shutter = new AutoShutter(); auto =(() => { try { return localStorage.getItem('mpdf.camAuto') !== '0'; } catch { return true; } })();
    $('#camAuto').checked = auto;
    const v = $('#camVideo'); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.muted = true; v.playsInline = true; v.srcObject = stream;
    $('#camDlg').showModal(); guardOn(); wakeOn(); renderStrip();
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
    $('#camDlg').addEventListener('cancel', e => { e.preventDefault(); onBack(); });   // Android-Zurück schließt Dialoge sonst selbst, die Kamera liefe weiter
    $('#camShutter').onclick = () => capture(lastDet);
    // Foto-App: volle Auflösung der Handykamera (iPhone liefert im Browser nur ein Videobild); bisherige Aufnahmen werden übernommen
    $('#camPhotoApp').onclick = () => { const had = shots.length; close(true); setTimeout(() => document.querySelector('#camIn')?.click(), had ? 400 : 0); };
    $('#camRevBack').onclick = closeReview;
    $('#camRevOk').onclick = closeReview;   // vorher Inline-onclick – auf pdfmy.de von der CSP blockiert, „Passt“ tat nichts
    $('#camRevCorners').onclick = cornOpen; $('#camCornCancel').onclick = cornClose; $('#camCornOk').onclick = cornApply;
    addEventListener('resize', () => { if (edit) cornFit(); });
    $$('.camhandle').forEach((b, k) => {
      b.onpointerdown = e => { b.setPointerCapture(e.pointerId); b.dataset.drag = '1'; e.preventDefault(); };
      b.onpointerup = b.onpointercancel = () => { delete b.dataset.drag; };
      b.onpointermove = e => { if (!b.dataset.drag || !edit) return; const r = $('#camCornBox').getBoundingClientRect(); edit.c[k] = [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; cornDraw(); };
      b.onkeydown = e => { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d || !edit) return; e.preventDefault(); const s = e.shiftKey ? 0.002 : 0.01; edit.c[k] = [Math.max(0, Math.min(1, edit.c[k][0] + d[0] * s)), Math.max(0, Math.min(1, edit.c[k][1] + d[1] * s))]; cornDraw(); };
    });
    $('#camRevDel').onclick = () => { shots.splice(reviewIdx, 1); glareFix = null; persist(); renderStrip(); closeReview(); };
    $('#camRevRot').onclick = async () => { const i = reviewIdx, sh = shots[i]; if (!sh) return; const c = await shotCanvas(sh), r = Imaging.rotate90(c, 90); c.width = 0; const { blurry, glare } = sh; shots[i] = await packShot(r, sh.cropped); Object.assign(shots[i], { blurry, glare }); persist(); renderStrip(); review(i); };
    $('#camDone').onclick = () => close(true);
    // Anruf oder App-Wechsel: Das Handy kann die Seite im Hintergrund beenden – bisherige Aufnahmen ins Dokument übernehmen
    // (dort greift der Absturzschutz); weiterscannen mit „Kamera“ hängt neue Seiten hinten an
    document.addEventListener('visibilitychange', () => { if (document.hidden && stream && shots.length) close(true); else if (!document.hidden && $('#camDlg').open) resume(); });
    $('#camClose').onclick = () => { if (shots.length && !confirm(`${shots.length} aufgenommene Seite(n) verwerfen?`)) return; close(false); };
    $('#camAuto').onchange = e => { auto = e.target.checked; try { localStorage.setItem('mpdf.camAuto', auto ? '1' : '0'); } catch {} shutter = new AutoShutter(); };
    $('#camTorch').onclick = async () => { const on = $('#camTorch').getAttribute('aria-pressed') !== 'true'; if (await torch(on)) $('#camTorch').setAttribute('aria-pressed', String(on)); };
  }
  root.Camera = { open, close, backups, restoreBackup, dropBackup, get handed() { return handed; }, get shots() { return shots; } };
})(typeof self !== 'undefined' ? self : this);
