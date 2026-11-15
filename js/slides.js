// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* PowerPoint (.pptx, .ppsx, .potx) und Impress (.odp) → PDF, ohne Server und ohne Bibliothek (ZIP und XML über js/office.js).
   Folien mit fester Lage wie im Original: Hintergrund, Formen des Masters und Layouts, Platzhalter mit geerbter Lage und Schrift,
   Textrahmen (Umbruch, Ausrichtung, Aufzählung, Zeilenabstand, automatische Verkleinerung), Bilder (mit Zuschnitt), Formen
   (vordefiniert und frei), Linien mit Pfeilspitzen, Gruppen, Drehung/Spiegelung, Tabellen. Farben aus dem Design (Theme).
   Schriften mit gleicher Laufweite wie Calibri, Arial, Times, Cambria, Courier (vendor/fonts/metric), fehlende Zeichen aus DejaVu.
   Diagramme (Säulen, Balken, Linie, Fläche, Kreis/Ring) aus den gespeicherten Werten. Nicht nachgebildet: andere Diagrammarten (Platzhalter mit Titel), SmartArt ohne gespeicherte Zeichnung, Effekte (Schatten, Spiegelung),
   Animationen, EMF/WMF-Grafiken. Ausgeblendete Folien werden wie beim PDF-Export von PowerPoint weggelassen.
   Slides.pptx(bytes) / Slides.odp(bytes) → { w, h, slides: [{ bg, items }], skipped }
   Slides.render(PDFLib, model, { fontkit, font(fam, bold, italic) → bytes, image?(bytes, ext) → { png } | null, title, locale }) → { bytes, missing } */
(function (root) {
  'use strict';
  const Office = root.Office || (typeof require === 'function' ? require('./office.js') : null);
  const EMU = 12700;   // EMU je Punkt
  const els = el => el ? el.kids.filter(k => typeof k === 'object') : [];
  const kid = (el, name) => el && els(el).find(k => k.name === name);
  const kids = (el, name) => els(el).filter(k => k.name === name);
  const all = (el, name, out = []) => { for (const k of els(el)) { if (k.name === name) out.push(k); else all(k, name, out); } return out; };
  const txt = el => el.kids.map(k => typeof k === 'string' ? k : txt(k)).join('');
  const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const path = (base, rel) => {   // relatives Ziel einer Beziehung auflösen
    if (!rel) return null;
    if (rel.startsWith('/')) return rel.slice(1);
    const parts = base.split('/'); parts.pop();
    for (const p of rel.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }
    return parts.join('/');
  };

  // ---------- Farben ----------
  const hex = s => { s = String(s || '').replace('#', ''); if (s.length === 3) s = s.replace(/./g, c => c + c); const n = parseInt(s, 16); return Number.isFinite(n) && s.length === 6 ? { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255, a: 1 } : null; };
  const PRST = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', navy: '000080', silver: 'C0C0C0' };
  function toHsl({ r, g, b }) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return { h, s, l };
  }
  function fromHsl({ h, s, l }) {
    if (!s) return { r: l, g: l, b: l };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return { r: f(h + 1 / 3), g: f(h), b: f(h - 1 / 3) };
  }
  // Farbänderungen (DrawingML): lumMod/lumOff (Helligkeit), tint (heller), shade (dunkler), alpha
  function mods(c, el) {
    if (!c) return c;
    let o = { ...c };
    for (const m of els(el)) {
      const v = num(m.attrs.val) / 100000, n = m.name.replace(/^a:/, '');
      if (n === 'lumMod' || n === 'lumOff') { const h = toHsl(o); h.l = Math.min(1, Math.max(0, n === 'lumMod' ? h.l * v : h.l + v)); o = { ...o, ...fromHsl(h) }; }
      else if (n === 'tint' || n === 'shade') {   // wie Office im linearen Farbraum (scRGB)
        const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4, srgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
        for (const k of ['r', 'g', 'b']) { const l = lin(o[k]); o[k] = srgb(n === 'tint' ? 1 - (1 - l) * v : l * v); }
      }
      else if (n === 'alpha') o.a = v;
    }
    return o;
  }

  // ---------- Schriften: Name → Familie mit gleicher Laufweite ----------
  function family(face) {
    const f = String(face || '').toLowerCase();
    if (/calibri|carlito|aptos|segoe|corbel|candara/.test(f)) return 'calibri';
    if (/cambria|caladea/.test(f)) return 'cambria';
    if (/times|georgia|garamond|book antiqua|palatino|constantia|serif/.test(f) && !/sans/.test(f)) return 'times';
    if (/courier|consolas|mono|lucida console/.test(f)) return 'courier';
    return 'arial';
  }

  // ---------- Vordefinierte Formen als SVG-Pfad (Ursprung oben links, w × h in Punkt) ----------
  function shapePath(prst, w, h, adj = {}) {
    const m = Math.min(w, h), a = (k, d) => (adj[k] ?? d) / 100000;
    const poly = pts => 'M' + pts.map(p => p.map(v => v.toFixed(2)).join(' ')).join(' L') + ' Z';
    switch (prst) {
      case 'ellipse': case 'flowChartConnector': {
        const rx = w / 2, ry = h / 2, k = 0.5523;
        return `M${rx} 0 C${rx + rx * k} 0 ${w} ${ry - ry * k} ${w} ${ry} C${w} ${ry + ry * k} ${rx + rx * k} ${h} ${rx} ${h} C${rx - rx * k} ${h} 0 ${ry + ry * k} 0 ${ry} C0 ${ry - ry * k} ${rx - rx * k} 0 ${rx} 0 Z`;
      }
      case 'roundRect': case 'flowChartAlternateProcess': {
        const r = Math.min(m * a('adj', 16667), w / 2, h / 2), k = r * 0.4477;
        return `M${r} 0 L${w - r} 0 C${w - k} 0 ${w} ${k} ${w} ${r} L${w} ${h - r} C${w} ${h - k} ${w - k} ${h} ${w - r} ${h} L${r} ${h} C${k} ${h} 0 ${h - k} 0 ${h - r} L0 ${r} C0 ${k} ${k} 0 ${r} 0 Z`;
      }
      case 'triangle': case 'flowChartExtract': return poly([[w * a('adj', 50000), 0], [w, h], [0, h]]);
      case 'rtTriangle': return poly([[0, 0], [w, h], [0, h]]);
      case 'diamond': case 'flowChartDecision': return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
      case 'parallelogram': case 'flowChartInputOutput': { const d = m * a('adj', 25000); return poly([[d, 0], [w, 0], [w - d, h], [0, h]]); }
      case 'trapezoid': { const d = m * a('adj', 25000); return poly([[d, 0], [w - d, 0], [w, h], [0, h]]); }
      case 'pentagon': return poly([[w / 2, 0], [w, h * 0.382], [w * 0.809, h], [w * 0.191, h], [0, h * 0.382]]);
      case 'hexagon': { const d = m * a('adj', 25000); return poly([[d, 0], [w - d, 0], [w, h / 2], [w - d, h], [d, h], [0, h / 2]]); }
      case 'octagon': { const d = m * a('adj', 29289); return poly([[d, 0], [w - d, 0], [w, d], [w, h - d], [w - d, h], [d, h], [0, h - d], [0, d]]); }
      case 'homePlate': { const d = m * a('adj', 50000); return poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h]]); }
      case 'chevron': { const d = m * a('adj', 50000); return poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]); }
      case 'rightArrow': { const t = h * a('adj1', 50000), d = m * a('adj2', 50000), y0 = (h - t) / 2; return poly([[0, y0], [w - d, y0], [w - d, 0], [w, h / 2], [w - d, h], [w - d, y0 + t], [0, y0 + t]]); }
      case 'leftArrow': { const t = h * a('adj1', 50000), d = m * a('adj2', 50000), y0 = (h - t) / 2; return poly([[w, y0], [d, y0], [d, 0], [0, h / 2], [d, h], [d, y0 + t], [w, y0 + t]]); }
      case 'upArrow': { const t = w * a('adj1', 50000), d = m * a('adj2', 50000), x0 = (w - t) / 2; return poly([[x0, h], [x0, d], [0, d], [w / 2, 0], [w, d], [x0 + t, d], [x0 + t, h]]); }
      case 'downArrow': { const t = w * a('adj1', 50000), d = m * a('adj2', 50000), x0 = (w - t) / 2; return poly([[x0, 0], [x0, h - d], [0, h - d], [w / 2, h], [w, h - d], [x0 + t, h - d], [x0 + t, 0]]); }
      case 'star5': {
        const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.38 : 0.5, t = -Math.PI / 2 + i * Math.PI / 5; pts.push([w / 2 + Math.cos(t) * w * r * 1.0, h * 0.55 + Math.sin(t) * h * r * 1.05]); }
        return poly(pts);
      }
      case 'plus': case 'flowChartSummingJunction': { const d = m * a('adj', 25000); return poly([[d, 0], [w - d, 0], [w - d, d], [w, d], [w, h - d], [w - d, h - d], [w - d, h], [d, h], [d, h - d], [0, h - d], [0, d], [d, d]]); }
      case 'snip1Rect': { const d = m * a('adj', 16667); return poly([[0, 0], [w - d, 0], [w, d], [w, h], [0, h]]); }
      case 'round1Rect': case 'round2SameRect': { const r = m * a('adj', 16667), k = r * 0.4477; return `M0 0 L${w - r} 0 C${w - k} 0 ${w} ${k} ${w} ${r} L${w} ${h} L0 ${h} Z`; }
      case 'line': case 'straightConnector1': case 'bentConnector2': case 'bentConnector3': case 'curvedConnector3': return null;
      default: return `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;   // Rechteck und alles Unbekannte
    }
  }
  // Freie Form (a:custGeom): Pfade in eigenen Einheiten → Punkt
  function custPath(geom, w, h) {
    let d = '';
    for (const p of all(geom, 'a:path')) {
      const pw = num(p.attrs.w) || w * EMU, ph = num(p.attrs.h) || h * EMU, sx = w / pw, sy = h / ph;
      let cx = 0, cy = 0;
      const pt = e => { const x = num(e.attrs.x) * sx, y = num(e.attrs.y) * sy; cx = x; cy = y; return `${x.toFixed(2)} ${y.toFixed(2)}`; };
      for (const c of els(p)) {
        const n = c.name.replace(/^a:/, ''), ps = kids(c, 'a:pt');
        if (n === 'moveTo') d += 'M' + pt(ps[0]) + ' ';
        else if (n === 'lnTo') d += 'L' + pt(ps[0]) + ' ';
        else if (n === 'cubicBezTo' && ps.length === 3) d += 'C' + ps.map(pt).join(' ') + ' ';
        else if (n === 'quadBezTo' && ps.length === 2) d += 'Q' + ps.map(pt).join(' ') + ' ';
        else if (n === 'arcTo') {   // Ellipsenbogen: Start aus aktuellem Punkt, wR/hR Radien, stAng/swAng in 60000stel Grad
          const wr = num(c.attrs.wR) * sx, hr = num(c.attrs.hR) * sy, st = num(c.attrs.stAng) / 60000 * Math.PI / 180, sw = num(c.attrs.swAng) / 60000 * Math.PI / 180;
          const ox = cx - wr * Math.cos(st), oy = cy - hr * Math.sin(st), steps = Math.max(2, Math.ceil(Math.abs(sw) / (Math.PI / 8)));
          for (let i = 1; i <= steps; i++) { const t = st + sw * i / steps; cx = ox + wr * Math.cos(t); cy = oy + hr * Math.sin(t); d += `L${cx.toFixed(2)} ${cy.toFixed(2)} `; }
        } else if (n === 'close') d += 'Z ';
      }
    }
    return d.trim() || null;
  }

  // ======================================================================
  // PowerPoint (PresentationML)
  // ======================================================================
  async function pptx(bytes) {
    const z = Office.readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const xml = async name => { const t = await z.text(name); return t ? Office.parseXml(t) : null; };
    const relsOf = async part => { const m = new Map(), x = await z.text(part.replace(/([^/]+)$/, '_rels/$1.rels')); if (x) for (const r of all(Office.parseXml(x), 'Relationship')) m.set(r.attrs.Id, { target: r.attrs.TargetMode === 'External' ? null : path(part, r.attrs.Target), type: r.attrs.Type || '' }); return m; };
    const pres = await xml('ppt/presentation.xml');
    if (!pres) throw new Error('Keine PowerPoint-Datei (ppt/presentation.xml fehlt).');
    const sz = all(pres, 'p:sldSz')[0], W = num(sz?.attrs.cx, 9144000) / EMU, H = num(sz?.attrs.cy, 6858000) / EMU;
    const presRels = await relsOf('ppt/presentation.xml');
    const defaultStyle = all(pres, 'p:defaultTextStyle')[0];
    const cache = new Map();
    const part = async name => { if (!cache.has(name)) cache.set(name, (async () => ({ name, x: await xml(name), rels: await relsOf(name) }))()); return cache.get(name); };
    const skipped = { charts: 0, images: 0, hidden: 0, smartart: 0 };
    const slides = [];

    for (const id of all(pres, 'p:sldId')) {
      const rel = presRels.get(id.attrs['r:id']); if (!rel?.target) continue;
      const slide = await part(rel.target); if (!slide.x) continue;
      const sld = kid(slide.x, 'p:sld') || els(slide.x)[0];
      if (sld?.attrs.show === '0') { skipped.hidden++; continue; }
      const layout = await part([...slide.rels.values()].find(r => /slideLayout$/.test(r.type))?.target || '');
      const master = layout.x ? await part([...layout.rels.values()].find(r => /slideMaster$/.test(r.type))?.target || '') : { x: null, rels: new Map() };
      const theme = master.x ? await part([...master.rels.values()].find(r => /theme$/.test(r.type))?.target || '') : { x: null };
      // Design: Farbschema, Schriften, Zuordnung tx1/bg1 … (clrMap des Masters)
      const scheme = {}, fonts = { major: 'Calibri Light', minor: 'Calibri' };
      for (const c of els(all(theme.x || { kids: [] }, 'a:clrScheme')[0])) {
        const v = kid(c, 'a:srgbClr')?.attrs.val || kid(c, 'a:sysClr')?.attrs.lastClr; scheme[c.name.replace(/^a:/, '')] = hex(v);
      }
      const fs = all(theme.x || { kids: [] }, 'a:fontScheme')[0];
      if (fs) { fonts.major = kid(kid(fs, 'a:majorFont'), 'a:latin')?.attrs.typeface || fonts.major; fonts.minor = kid(kid(fs, 'a:minorFont'), 'a:latin')?.attrs.typeface || fonts.minor; }
      const clrMap = all(master.x || { kids: [] }, 'p:clrMap')[0]?.attrs || { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
      const color = (el, phClr) => {   // Element mit Farbkind (srgbClr, schemeClr …) → Farbe
        if (!el) return null;
        for (const c of els(el)) {
          let base = null;
          if (c.name === 'a:srgbClr') base = hex(c.attrs.val);
          else if (c.name === 'a:schemeClr') { const v = c.attrs.val; base = v === 'phClr' ? phClr : scheme[clrMap[v] || v] || null; }
          else if (c.name === 'a:sysClr') base = hex(c.attrs.lastClr || (c.attrs.val === 'window' ? 'FFFFFF' : '000000'));
          else if (c.name === 'a:prstClr') base = hex(PRST[c.attrs.val] || '000000');
          else if (c.name === 'a:scrgbClr') base = { r: num(c.attrs.r) / 100000, g: num(c.attrs.g) / 100000, b: num(c.attrs.b) / 100000, a: 1 };
          else continue;
          return mods(base, c);
        }
        return null;
      };
      const face = f => !f ? null : f === '+mj-lt' ? fonts.major : f === '+mn-lt' ? fonts.minor : f;

      // Füllung aus spPr/bg: Farbe, Verlauf (Mittel aus erstem und letztem Punkt), Bild
      const imageOf = async (blipFill, p) => {
        const blip = kid(blipFill, 'a:blip'), r = blip && p.rels.get(blip.attrs['r:embed']);
        if (!r?.target) return null;
        const data = await z.get(r.target); if (!data) return null;
        const src = kid(blipFill, 'a:srcRect')?.attrs || {};
        return { data, ext: (r.target.split('.').pop() || '').toLowerCase(), crop: ['l', 't', 'r', 'b'].map(k => num(src[k]) / 100000) };
      };
      const fillOf = async (pr, p, phClr) => {
        if (!pr) return undefined;
        if (kid(pr, 'a:noFill')) return null;
        const sf = kid(pr, 'a:solidFill'); if (sf) return { color: color(sf, phClr) };
        const gf = kid(pr, 'a:gradFill');
        if (gf) { const gs = all(gf, 'a:gs').map(g => color(g, phClr)).filter(Boolean); if (gs.length) { const a = gs[0], b = gs[gs.length - 1]; return { color: { r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2, a: a.a } }; } }
        const pf = kid(pr, 'a:pattFill'); if (pf) return { color: color(kid(pf, 'a:fgClr'), phClr) };
        const bf = kid(pr, 'a:blipFill'); if (bf) { const im = await imageOf(bf, p); return im ? { image: im } : undefined; }
        return undefined;
      };
      const lineOf = (ln, phClr) => {
        if (!ln) return undefined;
        if (kid(ln, 'a:noFill')) return null;
        const c = color(kid(ln, 'a:solidFill'), phClr) || color(kid(ln, 'a:gradFill') && all(ln, 'a:gs')[0], phClr);
        const end = e => e && e.attrs.type && e.attrs.type !== 'none' ? e.attrs.type : null;
        return { color: c, w: ln.attrs.w ? num(ln.attrs.w) / EMU : undefined, dash: kid(ln, 'a:prstDash')?.attrs.val, head: end(kid(ln, 'a:headEnd')), tail: end(kid(ln, 'a:tailEnd')) };
      };

      // Hintergrund: Folie → Layout → Master
      let bg = null;
      for (const p of [slide, layout, master]) {
        const b = p.x && all(p.x, 'p:bg')[0]; if (!b) continue;
        const bp = kid(b, 'p:bgPr');
        if (bp) { bg = await fillOf(bp, p); if (bg !== undefined) break; }
        const br = kid(b, 'p:bgRef');
        if (br) { bg = { color: color(br) }; break; }
      }

      // Platzhalter im Layout/Master finden (idx, sonst Art)
      const phOf = sp => { const ph = all(sp, 'p:ph')[0]; return ph ? { type: ph.attrs.type || (ph.attrs.idx ? 'body' : 'body'), idx: ph.attrs.idx, typed: !!ph.attrs.type } : null; };
      const kindOf = t => t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' ? 'body' : t;
      const shapesOf = p => p.x ? els(all(p.x, 'p:spTree')[0] || { kids: [] }) : [];
      const findPh = (p, ph) => {
        if (!p.x || !ph) return null;
        const list = shapesOf(p).filter(s => phOf(s));
        return (ph.idx != null && list.find(s => phOf(s).idx === ph.idx)) || list.find(s => kindOf(phOf(s).type) === kindOf(ph.type) && (phOf(s).type === ph.type || !ph.typed || kindOf(ph.type) !== 'body')) || list.find(s => kindOf(phOf(s).type) === kindOf(ph.type)) || null;
      };
      const txStyles = all(master.x || { kids: [] }, 'p:txStyles')[0];
      const styleFor = ph => !ph ? null : ['title', 'ctrTitle'].includes(ph.type) ? kid(txStyles, 'p:titleStyle') : ['body', 'subTitle', 'obj'].includes(ph.type) ? kid(txStyles, 'p:bodyStyle') : kid(txStyles, 'p:otherStyle');

      // Text eines txBody → Absätze mit Läufen (Schrift, Größe, Farbe …), geerbt über Liste von lstStyle-Quellen
      const lvlPr = (lst, l) => lst && kid(lst, `a:lvl${l + 1}pPr`);
      const textOf = (txBody, chain, phClr, fontColor) => {
        if (!txBody) return null;
        const bodies = [...chain.map(c => c.body), kid(txBody, 'a:bodyPr')].filter(Boolean);
        const bp = {}; for (const b of bodies) Object.assign(bp, b.attrs);
        const autofit = bodies.map(b => kid(b, 'a:normAutofit')).filter(Boolean).pop();
        const lists = [defaultStyle, ...chain.map(c => c.lst), kid(txBody, 'a:lstStyle')];
        const paras = [];
        for (const p of kids(txBody, 'a:p')) {
          const pPr = kid(p, 'a:pPr'), lvl = num(pPr?.attrs.lvl);
          const levels = [...lists.map(l => lvlPr(l, lvl)), pPr], nBase = 2;   // die ersten beiden: Vorgaben der Präsentation und des Masters
          const pa = {}; let defR = {}, bullet = undefined, lnSpc = null, spcBef = null, spcAft = null, defColor = null, baseColor = null, defFace = null;
          for (const [li, L] of levels.entries()) {
            if (!L) continue;
            Object.assign(pa, L.attrs);
            const dr = kid(L, 'a:defRPr'); if (dr) { defR = { ...defR, ...dr.attrs }; const dc = color(kid(dr, 'a:solidFill'), phClr); if (li < nBase) baseColor = dc || baseColor; else defColor = dc || defColor; defFace = kid(dr, 'a:latin')?.attrs.typeface || defFace; }
            if (kid(L, 'a:buNone')) bullet = null;
            const bc = kid(L, 'a:buChar'), ba = kid(L, 'a:buAutoNum');
            const bfont = kid(L, 'a:buFont')?.attrs.typeface; if (bfont && bullet) bullet.font = bfont;
            if (bc) bullet = { char: bc.attrs.char || '•', font: bfont || bullet?.font }; else if (ba) bullet = { auto: ba.attrs.type || 'arabicPeriod', start: num(ba.attrs.startAt, 1) };
            if (bullet && kid(L, 'a:buClr')) bullet.color = color(kid(L, 'a:buClr'), phClr);
            if (bullet && kid(L, 'a:buSzPct')) bullet.scale = num(kid(L, 'a:buSzPct').attrs.val) / 100000;
            const ls = kid(L, 'a:lnSpc'); if (ls) lnSpc = kid(ls, 'a:spcPct') ? { pct: num(kid(ls, 'a:spcPct').attrs.val) / 100000 } : { pts: num(kid(ls, 'a:spcPts')?.attrs.val) / 100 };
            const sb = kid(L, 'a:spcBef'); if (sb) spcBef = kid(sb, 'a:spcPts') ? { pts: num(kid(sb, 'a:spcPts').attrs.val) / 100 } : { pct: num(kid(sb, 'a:spcPct')?.attrs.val) / 100000 };
            const sa = kid(L, 'a:spcAft'); if (sa) spcAft = kid(sa, 'a:spcPts') ? { pts: num(kid(sa, 'a:spcPts').attrs.val) / 100 } : { pct: num(kid(sa, 'a:spcPct')?.attrs.val) / 100000 };
          }
          const runOf = (r, t) => {
            const rp = kid(r, 'a:rPr'), a = { ...defR, ...(rp?.attrs || {}) };
            return {
              t, size: num(a.sz, 1800) / 100, bold: a.b === '1' || a.b === 'true', italic: a.i === '1' || a.i === 'true', u: !!a.u && a.u !== 'none', strike: !!a.strike && a.strike !== 'noStrike',
              color: color(kid(rp, 'a:solidFill'), phClr) || defColor || fontColor || baseColor || scheme[clrMap.tx1 || 'dk1'] || { r: 0, g: 0, b: 0, a: 1 },
              face: face(kid(rp, 'a:latin')?.attrs.typeface) || face(defFace) || (chain.isTitle ? fonts.major : fonts.minor),
              base: num(a.baseline) / 100000, caps: a.cap === 'all',
            };
          };
          const runs = [];
          for (const r of els(p)) {
            if (r.name === 'a:r' || r.name === 'a:fld') { const t = txt(kid(r, 'a:t') || { kids: [] }); if (t) runs.push(runOf(r, t)); }
            else if (r.name === 'a:br') runs.push({ ...runOf(r, '\n'), br: true });
          }
          const endR = kid(p, 'a:endParaRPr');
          paras.push({
            runs, lvl, algn: pa.algn || 'l', marL: num(pa.marL) / EMU, indent: num(pa.indent) / EMU, bullet: runs.length ? bullet : null,
            lnSpc, spcBef, spcAft, empty: runOf(endR || { kids: [], attrs: {} }, ' ').size,
          });
        }
        const scale = autofit ? num(autofit.attrs.fontScale, 100000) / 100000 : 1, red = autofit ? num(autofit.attrs.lnSpcReduction) / 100000 : 0;
        return {
          paras, anchor: bp.anchor || 't', wrap: bp.wrap !== 'none', vert: bp.vert,
          ins: [num(bp.lIns, 91440) / EMU, num(bp.tIns, 45720) / EMU, num(bp.rIns, 91440) / EMU, num(bp.bIns, 45720) / EMU], scale, red,
        };
      };

      const items = [];
      // Formen eines Teils (Master, Layout, Folie) einsammeln. T: Gruppen-Abbildung (Kindkoordinaten → Folie)
      const walk = async (list, p, T, level) => {
        for (const s of list) {
          const n = s.name;
          if (n === 'p:grpSp') {
            const x = all(kid(s, 'p:grpSpPr') || { kids: [] }, 'a:xfrm')[0];
            if (!x) { await walk(els(s), p, T, level); continue; }
            const off = kid(x, 'a:off')?.attrs || {}, ext = kid(x, 'a:ext')?.attrs || {}, co = kid(x, 'a:chOff')?.attrs || off, ce = kid(x, 'a:chExt')?.attrs || ext;
            const sx = num(ext.cx) / (num(ce.cx) || num(ext.cx) || 1), sy = num(ext.cy) / (num(ce.cy) || num(ext.cy) || 1);
            const G = { sx: T.sx * sx, sy: T.sy * sy, dx: T.dx + T.sx * (num(off.x) - num(co.x) * sx), dy: T.dy + T.sy * (num(off.y) - num(co.y) * sy) };
            await walk(els(s), p, G, level); continue;
          }
          if (!['p:sp', 'p:pic', 'p:cxnSp', 'p:graphicFrame'].includes(n)) {
            if (n === 'mc:AlternateContent') await walk(els(kid(s, 'mc:Fallback') || kid(s, 'mc:Choice') || { kids: [] }), p, T, level);
            continue;
          }
          const ph = phOf(s);
          // Platzhalter von Master/Layout zeichnet nur die Folie selbst (dort steht der Text); Datum/Fußzeile/Foliennummer nur, wenn die Folie sie hat
          if (ph && level !== 'slide') continue;
          const lay = ph ? findPh(layout, ph) : null, mas = ph ? findPh(master, lay ? phOf(lay) : ph) : null;
          const chain = [mas, lay].filter(Boolean);
          const spPr = kid(s, 'p:spPr') || kid(s, 'p:grpSpPr');
          let xf = all(spPr || { kids: [] }, 'a:xfrm')[0] || kid(s, 'p:xfrm');
          for (const c of [lay, mas]) if (!xf && c) xf = all(kid(c, 'p:spPr') || { kids: [] }, 'a:xfrm')[0];
          if (!xf) continue;
          const off = kid(xf, 'a:off')?.attrs || {}, ext = kid(xf, 'a:ext')?.attrs || {};
          const box = { x: (T.dx + num(off.x) * T.sx) / EMU, y: (T.dy + num(off.y) * T.sy) / EMU, w: num(ext.cx) * T.sx / EMU, h: num(ext.cy) * T.sy / EMU, rot: num(xf.attrs.rot) / 60000, flipH: xf.attrs.flipH === '1', flipV: xf.attrs.flipV === '1' };
          // Stil-Verweise (p:style): Füllung, Linie, Schriftfarbe der Standardformen
          const st = kid(s, 'p:style'), refClr = r => r && num(r.attrs.idx) > 0 ? color(r) : null;
          const fillRef = refClr(kid(st, 'a:fillRef')), lnRef = refClr(kid(st, 'a:lnRef')), fontRef = st ? color(kid(st, 'a:fontRef')) : null;
          if (n === 'p:graphicFrame') {
            const gd = all(s, 'a:graphicData')[0], uri = gd?.attrs.uri || '';
            const tbl = all(s, 'a:tbl')[0];
            if (tbl) { items.push({ kind: 'table', ...box, table: tableOf(tbl, color, textOf) }); continue; }
            if (/chart/.test(uri)) {
              const cr = p.rels.get(all(s, 'c:chart')[0]?.attrs['r:id']), cx = cr?.target && await xml(cr.target);
              const ch = cx && chartOf(cx, color);
              if (ch) { items.push({ kind: 'chart', ...box, chart: ch }); continue; }
              skipped.charts++;
              const title = cx ? all(all(cx, 'c:title')[0] || { kids: [] }, 'a:t').map(txt).join('') : '';
              items.push({ kind: 'placeholder', ...box, label: title ? 'Diagramm: ' + title : 'Diagramm' }); continue;
            }
            if (/diagram/.test(uri)) {   // SmartArt: gespeicherte Zeichnung (drawingN.xml) verwenden, falls vorhanden
              const dm = all(s, 'dgm:relIds')[0], dr = [...p.rels.values()].find(r => /diagramDrawing$/.test(r.type) && r.target);
              if (dr && dm) {
                const d = await part(dr.target), tree = d.x && all(d.x, 'dsp:spTree')[0];
                if (tree) {
                  const conv = el => ({ ...el, name: el.name.replace(/^dsp:/, 'p:'), kids: el.kids.map(k => typeof k === 'object' ? conv(k) : k) });
                  await walk(els(conv(tree)), d, { sx: T.sx, sy: T.sy, dx: T.dx + num(off.x) * T.sx, dy: T.dy + num(off.y) * T.sy }, 'shape'); continue;   // Formen liegen relativ zum Rahmen des Diagramms
                }
              }
              skipped.smartart++; items.push({ kind: 'placeholder', ...box, label: 'SmartArt' }); continue;
            }
            continue;
          }
          if (n === 'p:pic') {
            const im = await imageOf(kid(s, 'p:blipFill') || all(s, 'a:blipFill')[0] || { kids: [] }, p);
            if (im) items.push({ kind: 'image', ...box, image: im, line: lineOf(kid(spPr, 'a:ln')) || null });
            else skipped.images++;
            continue;
          }
          // Form mit Füllung/Linie und Text
          const geomEl = kid(spPr, 'a:prstGeom') || kid(spPr, 'a:custGeom');
          const prst = geomEl?.name === 'a:prstGeom' ? geomEl.attrs.prst : geomEl ? 'cust' : 'rect';
          const adj = {}; for (const g of all(geomEl || { kids: [] }, 'a:gd')) { const v = /^val (-?\d+)/.exec(g.attrs.fmla || ''); if (v) adj[g.attrs.name] = +v[1]; }
          let fill = await fillOf(spPr, p, fillRef);
          for (const c of [lay, mas]) if (fill === undefined && c) fill = await fillOf(kid(c, 'p:spPr'), p, fillRef);
          if (fill === undefined) fill = fillRef ? { color: fillRef } : null;
          let line = lineOf(kid(spPr, 'a:ln'), lnRef);
          if (line === undefined) line = lnRef ? { color: lnRef } : null;
          if (line && !line.color) line.color = lnRef || { r: 0, g: 0, b: 0, a: 1 };
          if (line && line.w == null) line.w = st ? 1 : 0.75;
          const geo = prst === 'cust' ? custPath(geomEl, box.w, box.h) : shapePath(prst, box.w, box.h, adj);
          const isLine = n === 'p:cxnSp' || /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(prst);
          const chainSrc = chain.map(c => ({ body: kid(kid(c, 'p:txBody'), 'a:bodyPr'), lst: kid(kid(c, 'p:txBody'), 'a:lstStyle') }));
          chainSrc.unshift({ lst: styleFor(ph) || (ph ? null : kid(txStyles, 'p:otherStyle')) });
          chainSrc.isTitle = ph && ['title', 'ctrTitle'].includes(ph.type);
          const text = textOf(kid(s, 'p:txBody'), chainSrc, null, fontRef);
          items.push({ kind: isLine ? 'line' : 'shape', ...box, path: isLine ? null : geo, fill: isLine ? null : fill, line, text: text && text.paras.some(q => q.runs.length) ? text : null });
        }
      };
      const showMaster = sld?.attrs.showMasterSp !== '0' && (!layout.x || els(layout.x)[0]?.attrs.showMasterSp !== '0');
      const I = { sx: 1, sy: 1, dx: 0, dy: 0 };
      if (showMaster) await walk(shapesOf(master), master, I, 'master');
      await walk(shapesOf(layout), layout, I, 'layout');
      await walk(shapesOf(slide), slide, I, 'slide');
      slides.push({ bg, items });
    }
    if (!slides.length) throw new Error(skipped.hidden ? 'Die Präsentation enthält nur ausgeblendete Folien.' : 'Die Präsentation enthält keine Folien.');
    return { w: W, h: H, slides, skipped };
  }

  /* Diagramm (DrawingML Chart) aus den im Diagramm gespeicherten Werten (numCache/strCache): Säulen, Balken (gruppiert, gestapelt,
     100 %), Linie, Fläche, Kreis/Ring. Andere Arten (Punkt, Blase, Netz, Kombination mit zweiter Achse) → null (Platzhalter). */
  function chartOf(cx, color) {
    const plot = all(cx, 'c:plotArea')[0]; if (!plot) return null;
    const kinds = els(plot).filter(k => /^c:(bar|bar3D|line|line3D|area|area3D|pie|pie3D|doughnut)Chart$/.test(k.name));
    if (kinds.length !== 1 || els(plot).some(k => /^c:(scatter|bubble|radar|stock|surface|surface3D|ofPie)Chart$/.test(k.name))) return null;
    const k = kinds[0], type = k.name.replace(/^c:|3D|Chart$/g, '');
    const val = (el, n) => kid(el, n)?.attrs.val;
    const pts = el => { const c = all(el || { kids: [] }, 'c:pt'), out = []; for (const p of c) out[num(p.attrs.idx)] = txt(kid(p, 'c:v') || { kids: [] }); return out; };
    const accent = i => color({ kids: [{ name: 'a:schemeClr', attrs: { val: 'accent' + (i % 6 + 1) }, kids: [] }] }) || { r: 0.3, g: 0.45, b: 0.75, a: 1 };
    const series = kids(k, 'c:ser').map((s, i) => {
      const sp = kid(s, 'c:spPr'), fill = color(kid(sp, 'a:solidFill')), ln = color(kid(kid(sp, 'a:ln'), 'a:solidFill'));
      return {
        name: pts(kid(s, 'c:tx')).filter(v => v != null).join(' ') || `Reihe ${i + 1}`,
        vals: pts(kid(s, 'c:val')).map(v => v == null || v === '' ? null : num(v, null)),
        cats: pts(kid(s, 'c:cat')),
        color: (type === 'line' ? ln || fill : fill || ln) || accent(num(val(s, 'c:idx'), i)),
        points: kids(s, 'c:dPt').map(d => ({ i: num(val(d, 'c:idx')), color: color(kid(kid(d, 'c:spPr'), 'a:solidFill')) })),
      };
    });
    if (!series.length || !series.some(s => s.vals.some(v => v != null))) return null;
    const n = Math.max(...series.map(s => s.vals.length)), cats = Array.from({ length: n }, (_, i) => series.find(s => s.cats[i] != null)?.cats[i] ?? String(i + 1));
    const tEl = all(cx, 'c:title')[0], delTitle = val(all(cx, 'c:chart')[0], 'c:autoTitleDeleted') === '1';
    const title = tEl ? all(tEl, 'a:t').map(txt).join('') || (series.length === 1 ? series[0].name : '') : (!delTitle && series.length === 1 && /pie|doughnut/.test(type) ? series[0].name : '');
    const fmt = all(kid(kid(kids(k, 'c:ser')[0], 'c:val') || { kids: [] }, 'c:numRef') || { kids: [] }, 'c:formatCode')[0];
    return {
      type, dir: val(k, 'c:barDir') || 'col', grouping: val(k, 'c:grouping') || 'clustered', title, cats, series,
      legend: !!all(cx, 'c:legend')[0], legendPos: val(all(cx, 'c:legend')[0], 'c:legendPos') || 'r', percent: /%/.test(fmt ? txt(fmt) : ''),
      vary: val(k, 'c:varyColors') === '1' || /pie|doughnut/.test(type), hole: type === 'doughnut' ? num(val(k, 'c:holeSize'), 50) / 100 : 0,
      accents: Array.from({ length: Math.max(6, n) }, (_, i) => accent(i)),
      size: num(all(kid(cx.kids.find(e => typeof e === 'object') || cx, 'c:txPr') || { kids: [] }, 'a:defRPr')[0]?.attrs.sz, 1000) / 100,   // Schriftgröße des Diagramms (Vorgabe 10 pt)
    };
  }

  // Tabelle (a:tbl): Spaltenbreiten, Zeilenhöhen, Zellen mit Text und Füllung; ohne eigene Farben wie die Office-Vorlage „Mittel 2 – Akzent 1“
  function tableOf(tbl, color, textOf) {
    const cols = kids(kid(tbl, 'a:tblGrid'), 'a:gridCol').map(c => num(c.attrs.w) / EMU), pr = kid(tbl, 'a:tblPr')?.attrs || {};
    const rows = kids(tbl, 'a:tr').map((tr, ri) => ({
      h: num(tr.attrs.h) / EMU,
      cells: kids(tr, 'a:tc').map(tc => {
        const tcPr = kid(tc, 'a:tcPr');
        const sf = kid(tcPr, 'a:solidFill');
        const header = pr.firstRow === '1' && ri === 0;
        return {
          span: num(tc.attrs.gridSpan, 1), rowSpan: num(tc.attrs.rowSpan, 1), merged: tc.attrs.hMerge === '1' || tc.attrs.vMerge === '1',
          fill: kid(tcPr, 'a:noFill') ? null : sf ? color(sf) : undefined, header,
          text: textOf(kid(tc, 'a:txBody'), [], null, header ? { r: 1, g: 1, b: 1, a: 1 } : null),
          ins: [num(tcPr?.attrs.marL, 91440) / EMU, num(tcPr?.attrs.marT, 45720) / EMU, num(tcPr?.attrs.marR, 91440) / EMU, num(tcPr?.attrs.marB, 45720) / EMU],
          anchor: tcPr?.attrs.anchor || 't',
        };
      }),
    }));
    const accent = color({ kids: [{ name: 'a:schemeClr', attrs: { val: 'accent1' }, kids: [] }] }) || { r: 0.27, g: 0.45, b: 0.77, a: 1 };
    return { cols, rows, firstRow: pr.firstRow === '1', bandRow: pr.bandRow === '1', accent };
  }

  // ======================================================================
  // Impress (OpenDocument Presentation)
  // ======================================================================
  const unit = v => { const m = /^(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(String(v || '').trim()); if (!m) return 0; const n = +m[1]; return { cm: n * 72 / 2.54, mm: n * 72 / 25.4, in: n * 72, pt: n, pc: n * 12, px: n * 0.75 }[m[2] || 'pt'] ?? n; };
  /* Diagramm einer ODF-Präsentation: eigene Datentabelle (Kopfzeile = Reihennamen, erste Spalte = Kategorien), Art aus chart:class.
     Farben aus den Reihenstilen, sonst die LibreOffice-Standardfarben. */
  async function odpChart(z, dir) {
    const t = dir && await z.text(dir + '/content.xml'); if (!t) return null;
    const x = Office.parseXml(t), ch = all(x, 'chart:chart')[0]; if (!ch) return null;
    const cls = String(ch.attrs['chart:class'] || '').replace(/^chart:/, '');
    const type = { bar: 'bar', line: 'line', area: 'area', circle: 'pie', ring: 'doughnut' }[cls]; if (!type) return null;
    const st = new Map(all(x, 'style:style').map(s => [s.attrs['style:name'], s]));
    const cp = name => kid(st.get(name), 'style:chart-properties')?.attrs || {}, gp = name => kid(st.get(name), 'style:graphic-properties')?.attrs || {};
    const tbl = all(ch, 'table:table')[0]; if (!tbl) return null;
    const cells = r => kids(r, 'table:table-cell').flatMap(c => Array(num(c.attrs['table:number-columns-repeated'], 1)).fill(c));
    const head = all(kid(tbl, 'table:table-header-rows') || { kids: [] }, 'table:table-row')[0], body = all(kid(tbl, 'table:table-rows') || tbl, 'table:table-row').filter(r => r !== head);
    const names = head ? cells(head).slice(1).map(c => txt(c).trim()) : [];
    const rows = body.map(r => cells(r)), cats = rows.map(r => r[0] ? txt(r[0]).trim() : '');
    const plot = all(ch, 'chart:plot-area')[0], pst = cp(plot?.attrs['chart:style-name']);
    const LO = ['004586', 'ff420e', 'ffd320', '579d1c', '7e0021', '83caff', '314004', 'aecf00', '4b1f6f', 'ff950e'].map(hex);
    const serEls = all(plot || { kids: [] }, 'chart:series');
    const nSer = Math.max(0, ...rows.map(r => r.length - 1));
    const series = Array.from({ length: nSer }, (_, i) => ({
      name: names[i] || `Reihe ${i + 1}`, cats,
      vals: rows.map(r => { const c = r[i + 1]; if (!c) return null; const v = c.attrs['office:value'] ?? txt(c).replace(',', '.'); return v === '' ? null : num(v, null); }),
      color: hex(gp(serEls[i]?.attrs['chart:style-name'])['draw:fill-color'] || gp(serEls[i]?.attrs['chart:style-name'])['svg:stroke-color']) || LO[i % LO.length],
      points: [],
    }));
    if (!series.length || !series.some(s => s.vals.some(v => v != null))) return null;
    const title = all(kid(ch, 'chart:title') || { kids: [] }, 'text:p').map(txt).join(' ');
    const fsz = num(String(kid(st.get(kid(ch, 'chart:title')?.attrs['chart:style-name']), 'style:text-properties')?.attrs['fo:font-size'] || '').replace('pt', ''), 13) / 1.3;
    return {
      type, dir: pst['chart:vertical'] === 'true' ? 'bar' : 'col', grouping: pst['chart:percentage'] === 'true' ? 'percentStacked' : pst['chart:stacked'] === 'true' ? 'stacked' : 'clustered',
      title, cats, series, legend: !!kid(ch, 'chart:legend'), legendPos: { bottom: 'b', top: 't' }[kid(ch, 'chart:legend')?.attrs['chart:legend-position']] || 'r', percent: false,
      vary: type === 'pie' || type === 'doughnut', hole: type === 'doughnut' ? 0.5 : 0, accents: LO, size: fsz,
    };
  }

  async function odp(bytes) {
    const z = Office.readZip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const content = Office.parseXml(await z.text('content.xml') || ''), stylesX = Office.parseXml(await z.text('styles.xml') || '');
    const pres = all(content, 'office:presentation')[0]; if (!pres) throw new Error('Keine Impress-Präsentation (office:presentation fehlt).');
    // Stile: Name → Eigenschaften (Grafik, Text, Absatz) mit Elternkette; Vorlagenstile (styles.xml) und automatische (content.xml)
    const styles = new Map();
    for (const doc of [stylesX, content]) for (const s of all(doc, 'style:style')) {
      const g = (kid(s, 'style:graphic-properties') || kid(s, 'loext:graphic-properties'))?.attrs || {}, t = kid(s, 'style:text-properties')?.attrs || {}, p = kid(s, 'style:paragraph-properties')?.attrs || {}, d = kid(s, 'style:drawing-page-properties')?.attrs || {};
      styles.set(s.attrs['style:name'], { parent: s.attrs['style:parent-style-name'], g, t, p, d, family: s.attrs['style:family'], list: s.attrs['style:list-style-name'] });
    }
    // Listenstile: Ebene → Aufzählungszeichen, Einzug (space-before) und Platz für das Zeichen (min-label-width)
    const listStyles = new Map();
    for (const doc of [stylesX, content]) for (const ls of all(doc, 'text:list-style')) {
      const lv = new Map();
      for (const l of els(ls)) { const lp = all(l, 'style:list-level-properties')[0]?.attrs || {}; lv.set(num(l.attrs['text:level'], 1) - 1, { char: l.name === 'text:list-level-style-bullet' ? l.attrs['text:bullet-char'] || '•' : null, num: l.name === 'text:list-level-style-number' && l.attrs['style:num-format'] ? l.attrs['style:num-format'] : null, before: unit(lp['text:space-before']), width: unit(lp['text:min-label-width']) }); }
      listStyles.set(ls.attrs['style:name'], lv);
    }
    const gradients = new Map();
    for (const doc of [stylesX, content]) for (const g of all(doc, 'draw:gradient')) { const a = hex(g.attrs['draw:start-color']), b = hex(g.attrs['draw:end-color']); if (a && b) gradients.set(g.attrs['draw:name'], { r: (a.r + b.r) / 2, g: (a.g + b.g) / 2, b: (a.b + b.b) / 2, a: 1 }); }
    const listOf = name => { for (let st = styles.get(name), n = 0; st && n < 8; st = styles.get(st.parent), n++) if (st.list) return st.list; return null; };
    const prop = (name, k, key) => { for (let s = styles.get(name), n = 0; s && n < 8; s = styles.get(s.parent), n++) if (s[k][key] != null) return s[k][key]; return undefined; };
    // Foliengröße: Seitenlayout der ersten Masterfolie (das erste Layout in styles.xml ist oft das der Notizen/Handzettel)
    const pmName = all(stylesX, 'style:master-page')[0]?.attrs['style:page-layout-name'];
    const pmEl = all(stylesX, 'style:page-layout').find(l => l.attrs['style:name'] === pmName) || all(stylesX, 'style:page-layout')[0];
    const pl = all(pmEl || { kids: [] }, 'style:page-layout-properties')[0]?.attrs || {};
    const W = unit(pl['fo:page-width']) || 792, H = unit(pl['fo:page-height']) || 612;
    const masters = new Map(all(stylesX, 'style:master-page').map(m => [m.attrs['style:name'], m]));
    const skipped = { charts: 0, images: 0, hidden: 0, smartart: 0 };
    const textOf = (el, gstyle) => {
      const paras = [];
      const para = (p, lvl, li) => {
        const ps = p.attrs['text:style-name'], runs = [];
        const base = { size: unit(prop(ps, 't', 'fo:font-size') ?? prop(gstyle, 't', 'fo:font-size')) || 18, bold: (prop(ps, 't', 'fo:font-weight') ?? prop(gstyle, 't', 'fo:font-weight')) === 'bold', italic: (prop(ps, 't', 'fo:font-style') ?? prop(gstyle, 't', 'fo:font-style')) === 'italic', color: hex(prop(ps, 't', 'fo:color') ?? prop(gstyle, 't', 'fo:color')) || { r: 0, g: 0, b: 0, a: 1 }, face: prop(ps, 't', 'style:font-name') ?? prop(gstyle, 't', 'style:font-name') ?? prop(gstyle, 't', 'fo:font-family') ?? 'Liberation Sans', base: 0 };
        const add = (node, st) => {
          for (const k of node.kids) {
            if (typeof k === 'string') { if (k) runs.push({ ...st, t: k }); continue; }
            if (k.name === 'text:s') runs.push({ ...st, t: ' '.repeat(num(k.attrs['text:c'], 1)) });
            else if (k.name === 'text:tab') runs.push({ ...st, t: '\t' });
            else if (k.name === 'text:line-break') runs.push({ ...st, t: '\n', br: true });
            else if (k.name === 'text:span' || k.name === 'text:a') {
              const sn = k.attrs['text:style-name'], fs = prop(sn, 't', 'fo:font-size'), fw = prop(sn, 't', 'fo:font-weight'), fi = prop(sn, 't', 'fo:font-style'), fc = prop(sn, 't', 'fo:color'), ff = prop(sn, 't', 'style:font-name');
              add(k, { ...st, size: fs != null ? unit(fs) || st.size : st.size, bold: fw != null ? fw === 'bold' : st.bold, italic: fi != null ? fi === 'italic' : st.italic, color: fc ? hex(fc) || st.color : st.color, face: ff || st.face });
            } else add(k, st);
          }
        };
        add(p, base);
        const al = prop(ps, 'p', 'fo:text-align') ?? prop(gstyle, 'p', 'fo:text-align');
        paras.push({ runs, lvl, algn: { center: 'ctr', end: 'r', right: 'r', justify: 'just' }[al] || 'l', marL: li ? li.marL : 0, indent: li ? li.indent : 0, bullet: li?.char && runs.length ? { char: li.char === '●' || li.char === '' ? '•' : li.char, scale: 0.9 } : li?.num && runs.length ? { auto: 'arabicPeriod', start: 1 } : null, lnSpc: null, spcBef: null, spcAft: { pts: unit(prop(ps, 'p', 'fo:margin-bottom')) || 0 }, empty: base.size });
      };
      const levelInfo = (lsName, lvl) => {   // Einzug und Zeichen der Listenebene (Vorgabe: 0,6 cm je Ebene)
        const l = listStyles.get(lsName)?.get(lvl), w = l?.width || 17, before = l ? l.before : lvl * 17;
        return { char: l ? l.char : '•', num: l?.num, marL: Math.max(0, before + w), indent: -w };
      };
      const walkText = (node, lvl, lsName) => {
        for (const k of els(node)) {
          if (k.name === 'text:p' || k.name === 'text:h') para(k, lvl, null);
          else if (k.name === 'text:list') { const ln = k.attrs['text:style-name'] || lsName || listOf(gstyle); for (const it of kids(k, 'text:list-item')) for (const c of els(it)) { if (c.name === 'text:list') walkText({ kids: [c] }, lvl + 1, ln); else if (c.name === 'text:p' || c.name === 'text:h') para(c, lvl, levelInfo(ln, lvl)); } }
        }
      };
      walkText(el, 0, null);
      const va = prop(gstyle, 'g', 'draw:textarea-vertical-align');
      return paras.some(q => q.runs.length) ? { paras, anchor: { middle: 'ctr', bottom: 'b' }[va] || 't', wrap: true, ins: [unit(prop(gstyle, 'g', 'fo:padding-left') ?? '0.25cm'), unit(prop(gstyle, 'g', 'fo:padding-top') ?? '0.125cm'), unit(prop(gstyle, 'g', 'fo:padding-right') ?? '0.25cm'), unit(prop(gstyle, 'g', 'fo:padding-bottom') ?? '0.125cm')], scale: 1, red: 0 } : null;
    };
    const fillOf = st => {
      const f = prop(st, 'g', 'draw:fill');
      if (f === 'none') return null;
      if (f === 'solid' || (f == null && prop(st, 'g', 'draw:fill-color'))) return { color: hex(prop(st, 'g', 'draw:fill-color') || '#729fcf') };
      if (f === 'gradient') return { color: gradients.get(prop(st, 'g', 'draw:fill-gradient-name')) || hex(prop(st, 'g', 'draw:fill-color') || '#cccccc') };
      return f == null ? undefined : null;
    };
    const lineOf = st => { const s = prop(st, 'g', 'draw:stroke'); if (s === 'none') return null; if (s == null && !prop(st, 'g', 'svg:stroke-color')) return undefined; return { color: hex(prop(st, 'g', 'svg:stroke-color') || '#3465a4'), w: unit(prop(st, 'g', 'svg:stroke-width')) || 0.75, tail: /arrow|triangle/i.test(prop(st, 'g', 'draw:marker-end') || '') ? 'triangle' : null, head: /arrow|triangle/i.test(prop(st, 'g', 'draw:marker-start') || '') ? 'triangle' : null }; };
    const shapes = async (node, items, dx = 0, dy = 0, master = false) => {
      for (const e of els(node)) {
        const st = e.attrs['draw:style-name'] || e.attrs['presentation:style-name'];
        const box = { x: unit(e.attrs['svg:x']) + dx, y: unit(e.attrs['svg:y']) + dy, w: unit(e.attrs['svg:width']), h: unit(e.attrs['svg:height']), rot: 0, flipH: false, flipV: false };
        const tr = /rotate\s*\(\s*(-?[\d.]+)\s*\)/.exec(e.attrs['draw:transform'] || '');
        if (tr) {   // ODF: Form bei (0,0) drehen (Bogenmaß, gegen den Uhrzeigersinn), dann verschieben → Mitte und Drehung im Uhrzeigersinn
          const r = +tr[1], t2 = /translate\s*\(\s*([^\s,)]+)[\s,]+([^\s)]+)\s*\)/.exec(e.attrs['draw:transform']);
          const tx = t2 ? unit(t2[1]) : 0, ty = t2 ? unit(t2[2]) : 0, cx = tx + (box.w / 2) * Math.cos(r) + (box.h / 2) * Math.sin(r), cy = ty - (box.w / 2) * Math.sin(r) + (box.h / 2) * Math.cos(r);
          box.x = cx - box.w / 2 + dx; box.y = cy - box.h / 2 + dy; box.rot = -r * 180 / Math.PI;
        }
        if (e.name === 'draw:g') { await shapes(e, items, dx, dy, master); continue; }
        if (master && e.attrs['presentation:class']) continue;   // Platzhalter des Masters (Titel, Gliederung, Datum, Fußzeile, Seitenzahl)
        if (e.name === 'draw:frame') {
          const img = kid(e, 'draw:image'), tb = kid(e, 'draw:text-box'), tab = kid(e, 'table:table'), obj = kid(e, 'draw:object');
          if (tab) {   // Tabelle (das Vorschaubild daneben bleibt unbenutzt)
            const rows = kids(tab, 'table:table-row').map(r => ({ h: 0, cells: kids(r, 'table:table-cell').map(c => { const cs = c.attrs['table:style-name'] || r.attrs['table:default-cell-style-name']; return { span: num(c.attrs['table:number-columns-spanned'], 1), rowSpan: 1, merged: false, fill: fillOf(cs)?.color ?? null, text: textOf(c, cs), ins: [5, 3, 5, 3], anchor: { middle: 'ctr', bottom: 'b' }[prop(cs, 'g', 'draw:textarea-vertical-align')] || 't' }; }) }));
            const n = Math.max(1, ...rows.map(r => r.cells.reduce((s, c) => s + c.span, 0)));
            rows.forEach(r => { r.h = box.h / Math.max(1, rows.length); });
            items.push({ kind: 'table', ...box, table: { cols: Array(n).fill(box.w / n), rows, firstRow: false, bandRow: false, accent: { r: 0.2, g: 0.4, b: 0.64, a: 1 } } });
          } else if (obj) {   // eingebettetes Diagramm (Object N/content.xml) aus seiner Datentabelle
            const ch = await odpChart(z, String(obj.attrs['xlink:href'] || '').replace(/^\.\//, ''));
            if (ch) items.push({ kind: 'chart', ...box, chart: ch }); else { skipped.charts++; items.push({ kind: 'placeholder', ...box, label: 'Diagramm' }); }
          } else if (img && !tb) {
            const href = String(img.attrs['xlink:href'] || '').replace(/^\.\//, ''), data = href && await z.get(href);
            const alt = els(e).filter(k => k.name === 'draw:image').map(k => String(k.attrs['xlink:href'] || '')).find(h => /\.(png|jpe?g)$/i.test(h));
            const use = data && !/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(href) && alt ? alt.replace(/^\.\//, '') : href;
            const d = use === href ? data : await z.get(use);
            if (d) items.push({ kind: 'image', ...box, image: { data: d, ext: (use.split('.').pop() || '').toLowerCase(), crop: [0, 0, 0, 0] } }); else skipped.images++;
          } else if (tb) {
            const fill = fillOf(st), line = lineOf(st), text = textOf(tb, st);
            items.push({ kind: 'shape', ...box, path: shapePath('rect', box.w, box.h), fill: fill || null, line: line || null, text });
          }
          continue;
        }
        if (['draw:rect', 'draw:ellipse', 'draw:custom-shape', 'draw:polygon'].includes(e.name)) {
          let prst = e.name === 'draw:ellipse' ? 'ellipse' : 'rect';
          const eg = kid(e, 'draw:enhanced-geometry');
          if (eg && /^ooxml-/.test(eg.attrs['draw:type'])) prst = eg.attrs['draw:type'].slice(6);   // aus PowerPoint übernommene Form: gleicher Name
          else if (eg) prst = { ellipse: 'ellipse', 'round-rectangle': 'roundRect', diamond: 'diamond', 'isosceles-triangle': 'triangle', 'right-triangle': 'rtTriangle', parallelogram: 'parallelogram', trapezoid: 'trapezoid', pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon', 'right-arrow': 'rightArrow', 'left-arrow': 'leftArrow', 'up-arrow': 'upArrow', 'down-arrow': 'downArrow', chevron: 'chevron', star5: 'star5', 'cross': 'plus' }[eg.attrs['draw:type']] || 'rect';
          const fill = fillOf(st), line = lineOf(st);
          items.push({ kind: 'shape', ...box, path: shapePath(prst, box.w, box.h), fill: fill === undefined ? { color: hex('#729fcf') } : fill, line: line === undefined ? { color: hex('#3465a4'), w: 0.75 } : line, text: textOf(e, st) });
          continue;
        }
        if (e.name === 'draw:line' || e.name === 'draw:connector') {
          const x1 = unit(e.attrs['svg:x1']) + dx, y1 = unit(e.attrs['svg:y1']) + dy, x2 = unit(e.attrs['svg:x2']) + dx, y2 = unit(e.attrs['svg:y2']) + dy, line = lineOf(st);
          items.push({ kind: 'line', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), rot: 0, flipH: x2 < x1, flipV: y2 < y1, line: line === undefined ? { color: hex('#3465a4'), w: 0.75 } : line });
        }
      }
    };
    const slides = [];
    for (const pg of kids(all(pres, 'office:presentation')[0] || pres, 'draw:page')) {
      const pst = pg.attrs['draw:style-name'];
      if (prop(pst, 'd', 'presentation:visibility') === 'hidden') { skipped.hidden++; continue; }
      const m = masters.get(pg.attrs['draw:master-page-name']), items = [];
      let bg = null; const bf = prop(pst, 'd', 'draw:fill'), mbf = m && prop(m.attrs['draw:style-name'], 'd', 'draw:fill');
      if (bf === 'solid') bg = { color: hex(prop(pst, 'd', 'draw:fill-color')) }; else if (mbf === 'solid') bg = { color: hex(prop(m.attrs['draw:style-name'], 'd', 'draw:fill-color')) };
      if (m) await shapes(m, items, 0, 0, true);
      await shapes(pg, items);
      slides.push({ bg, items });
    }
    if (!slides.length) throw new Error('Die Präsentation enthält keine Folien.');
    return { w: W, h: H, slides, skipped };
  }

  // ======================================================================
  // PDF zeichnen (pdf-lib)
  // ======================================================================
  async function render(L, model, { fontkit, font, image, title, locale } = {}) {
    const doc = await L.PDFDocument.create();
    doc.registerFontkit(fontkit);
    if (title) doc.setTitle(title);
    doc.setProducer('PDFMy (pdfmy.de)'); doc.setCreator('PDFMy – PowerPoint/Impress in PDF');
    const fonts = new Map(), sets = new Map();
    const getFont = async (fam, bold, italic) => {
      const k = `${fam}|${bold ? 1 : 0}|${italic ? 1 : 0}`;
      if (!fonts.has(k)) fonts.set(k, (async () => { const f = await doc.embedFont(await font(fam, bold, italic), { subset: true }); sets.set(f, new Set(f.getCharacterSet())); return f; })());
      return fonts.get(k);
    };
    const imgCache = new Map();
    const embedImage = async im => {
      if (imgCache.has(im.data)) return imgCache.get(im.data);
      const p = (async () => {
        const d = im.data, isPng = d[0] === 0x89 && d[1] === 0x50, isJpg = d[0] === 0xff && d[1] === 0xd8;
        try {
          if (isPng) return await doc.embedPng(d);
          if (isJpg) return await doc.embedJpg(d);
          const conv = image && await image(d, im.ext);   // GIF, BMP, WebP, TIFF, SVG über den Browser
          if (conv?.png) return await doc.embedPng(conv.png);
        } catch (e) { /* defekt oder nicht lesbar */ }
        return null;
      })();
      imgCache.set(im.data, p); return p;
    };
    const rgb = c => L.rgb(Math.min(1, Math.max(0, c.r)), Math.min(1, Math.max(0, c.g)), Math.min(1, Math.max(0, c.b)));
    let missing = 0;

    for (const sl of model.slides) {
      const page = doc.addPage([model.w, model.h]), H = model.h;
      const op = (...o) => page.pushOperators(...o);
      // Drehung/Spiegelung um die Mitte des Kastens (PowerPoint dreht im Uhrzeigersinn, PDF gegen den Uhrzeigersinn)
      const withXf = (it, fn) => {
        const t = (it.rot || 0) * Math.PI / 180;
        if (!t && !it.flipH && !it.flipV) return fn();
        const cx = it.x + it.w / 2, cy = H - (it.y + it.h / 2), c = Math.cos(-t), s = Math.sin(-t), fx = it.flipH ? -1 : 1, fy = it.flipV ? -1 : 1;
        op(L.pushGraphicsState(), L.concatTransformationMatrix(1, 0, 0, 1, cx, cy), L.concatTransformationMatrix(c, s, -s, c, 0, 0), L.concatTransformationMatrix(fx, 0, 0, fy, 0, 0), L.concatTransformationMatrix(1, 0, 0, 1, -cx, -cy));
        const r = fn();
        return Promise.resolve(r).then(v => { op(L.popGraphicsState()); return v; });
      };
      const drawImg = async (im, x, y, w, h) => {
        const e = await embedImage(im); if (!e) return false;
        const [cl, ct, cr, cb] = im.crop || [0, 0, 0, 0];
        if (cl || ct || cr || cb) {   // Zuschnitt: Bild größer zeichnen und auf den Kasten begrenzen
          const fw = w / Math.max(0.01, 1 - cl - cr), fh = h / Math.max(0.01, 1 - ct - cb);
          op(L.pushGraphicsState(), L.rectangle(x, H - y - h, w, h), L.clip(), L.endPath());
          page.drawImage(e, { x: x - fw * cl, y: H - y - h - fh * cb, width: fw, height: fh });
          op(L.popGraphicsState());
        } else page.drawImage(e, { x, y: H - y - h, width: w, height: h });
        return true;
      };
      // Hintergrund
      if (sl.bg?.color) page.drawRectangle({ x: 0, y: 0, width: model.w, height: H, color: rgb(sl.bg.color) });
      else if (sl.bg?.image) await drawImg(sl.bg.image, 0, 0, model.w, H);

      for (const it of sl.items) {
        await withXf(it, async () => {
          if (it.kind === 'image') {
            if (!await drawImg(it.image, it.x, it.y, it.w, it.h)) missing++;
            if (it.line?.color && it.line.w) page.drawRectangle({ x: it.x, y: H - it.y - it.h, width: it.w, height: it.h, borderColor: rgb(it.line.color), borderWidth: it.line.w });
          } else if (it.kind === 'shape') {
            const fillC = it.fill?.color, ln = it.line?.color && it.line.w > 0 ? it.line : null;
            if (it.fill?.image) await drawImg(it.fill.image, it.x, it.y, it.w, it.h);   // Bildfüllung: im Kasten (die Form selbst wird nicht ausgeschnitten)
            if (it.path && (fillC || ln)) page.drawSvgPath(it.path, { x: it.x, y: H - it.y, color: fillC ? rgb(fillC) : undefined, opacity: fillC?.a ?? 1, borderColor: ln ? rgb(ln.color) : undefined, borderWidth: ln ? ln.w : 0, borderDashArray: ln?.dash && ln.dash !== 'solid' ? [ln.w * 3, ln.w * 2] : undefined });
            if (it.text) await drawText(it.text, it.x, it.y, it.w, it.h);
          } else if (it.kind === 'line') {
            const ln = it.line; if (!ln?.color) return;
            const x1 = it.x, y1 = H - it.y, x2 = it.x + it.w, y2 = H - it.y - it.h, w = ln.w || 0.75;
            page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: rgb(ln.color), dashArray: ln.dash && ln.dash !== 'solid' ? [w * 3, w * 2] : undefined });
            const head = (tx, ty, fx, fy) => { const a = Math.atan2(ty - fy, tx - fx), s = Math.max(4, w * 3); page.drawSvgPath(`M0 0 L${-s} ${s / 2} L${-s} ${-s / 2} Z`, { x: tx, y: ty, color: rgb(ln.color), rotate: L.degrees(-a * 180 / Math.PI) }); };
            if (ln.tail) head(x2, y2, x1, y1);
            if (ln.head) head(x1, y1, x2, y2);
          } else if (it.kind === 'table') await drawTable(it);
          else if (it.kind === 'chart') await drawChart(it);
          else if (it.kind === 'placeholder') {
            page.drawRectangle({ x: it.x, y: H - it.y - it.h, width: it.w, height: it.h, color: L.rgb(0.96, 0.96, 0.97), borderColor: L.rgb(0.75, 0.75, 0.8), borderWidth: 0.75 });
            const f = await getFont('arial', false, true), s = Math.min(14, it.h / 4, it.w / 12);
            if (s > 3) page.drawText(it.label, { x: it.x + 8, y: H - it.y - it.h / 2 - s / 3, size: s, font: f, color: L.rgb(0.4, 0.4, 0.45), maxWidth: it.w - 16 });
          }
        });
      }

      // Text eines Kastens: Umbruch, Aufzählung, Ausrichtung, senkrechte Lage
      async function drawText(tx, x, y, w, h) {
        const [li, ti, ri, bi] = tx.ins, width = Math.max(1, w - li - ri);
        const counters = [];
        const lines = [];   // { segs: [{ t, run, font, size, w }], width, height, asc, para, first, bullet }
        let total = 0, prevAft = 0, first = true;
        for (const p of tx.paras) {
          const sc = tx.scale || 1, sizes = p.runs.map(r => r.size * sc), maxS = Math.max(...sizes, (p.empty || 18) * sc);
          const spacing = p.lnSpc?.pct != null ? p.lnSpc.pct * (1 - (tx.red || 0)) : p.lnSpc?.pts ? null : 1 - (tx.red || 0);
          const bef = first ? 0 : p.spcBef?.pts ?? (p.spcBef?.pct ? p.spcBef.pct * maxS * 1.2 : 0), aft = p.spcAft?.pts ?? (p.spcAft?.pct ? p.spcAft.pct * maxS * 1.2 : 0);
          total += Math.max(bef, 0) + prevAft; prevAft = aft; first = false;
          // Aufzählungszeichen
          let bul = null;
          if (p.bullet) {
            if (p.bullet.auto) { counters[p.lvl] = (counters[p.lvl] ?? (p.bullet.start - 1)) + 1; counters.length = p.lvl + 1; bul = autoNum(p.bullet.auto, counters[p.lvl]); }
            else bul = /wingdings|symbol|webdings/i.test(p.bullet.font || '') || isPua(p.bullet.char) ? (WING[String.fromCharCode(p.bullet.char.charCodeAt(0) - (isPua(p.bullet.char) ? 0xf000 : 0))] || '•') : p.bullet.char;
          } else counters.length = p.lvl;
          const textX = p.marL, firstX = p.marL + (p.bullet ? 0 : p.indent);
          // Wörter über alle Läufe hinweg umbrechen
          const tokens = [];
          for (const r of p.runs) {
            const t = r.caps ? r.t.toUpperCase() : r.t;
            if (r.br) { tokens.push({ br: true, run: r }); continue; }
            for (const part of t.replace(/\t/g, '    ').split(/(\s+)/).flatMap(w => /\s/.test(w) ? [w] : w.split(/(?<=[^\s-][-–])(?=[^\s\d-])/))) if (part) tokens.push({ t: part, run: r, space: /^\s+$/.test(part) });   // Umbruch auch nach Bindestrich
          }
          if (!tokens.length) { const lh = maxS * 1.2 * (spacing ?? 1); lines.push({ segs: [], width: 0, height: p.lnSpc?.pts || lh, asc: maxS * 0.9, para: p, x0: textX }); total += p.lnSpc?.pts || lh; continue; }
          let cur = { segs: [], width: 0, x0: firstX, bullet: bul, para: p }, avail = width - firstX;
          const pushLine = () => {
            while (cur.segs.length && cur.segs[cur.segs.length - 1].space) { cur.width -= cur.segs.pop().w; }
            const ms = Math.max(...cur.segs.map(s => s.size), maxS * (cur.segs.length ? 0 : 1), 1);
            cur.height = p.lnSpc?.pts || ms * 1.2 * (spacing ?? 1); cur.asc = ms * 0.92; total += cur.height;
            lines.push(cur); cur = { segs: [], width: 0, x0: textX, para: p }; avail = width - textX;
          };
          for (const tk of tokens) {
            if (tk.br) { pushLine(); continue; }
            const r = tk.run, size = r.size * sc;
            const f = await getFont(family(r.face), r.bold, r.italic), set = sets.get(f);
            // fehlende Zeichen (z. B. Pfeile, Symbole): DejaVu derselben Art
            const segs = []; let buf = '', bufF = f;
            for (const ch of tk.t) {
              const has = set.has(ch.codePointAt(0)) || /\s/.test(ch), ff = has ? f : await getFont(family(r.face) === 'times' || family(r.face) === 'cambria' ? 'serif' : family(r.face) === 'courier' ? 'mono' : 'sans', r.bold, r.italic);
              const ok = has || sets.get(ff).has(ch.codePointAt(0));
              if (!ok) continue;
              if (ff !== bufF && buf) { segs.push({ t: buf, font: bufF }); buf = ''; }
              bufF = ff; buf += ch;
            }
            if (buf) segs.push({ t: buf, font: bufF });
            const ww = segs.reduce((s, g) => s + g.font.widthOfTextAtSize(g.t, size), 0);
            if (tx.wrap && !tk.space && cur.width + ww > avail && cur.segs.some(s => !s.space)) pushLine();
            if (tk.space && !cur.segs.length && lines.length && lines[lines.length - 1].para === p) continue;   // Leerzeichen am Zeilenanfang nach Umbruch
            for (const g of segs) { const gw = g.font.widthOfTextAtSize(g.t, size); cur.segs.push({ t: g.t, font: g.font, size, run: r, w: gw, space: tk.space }); cur.width += gw; }
          }
          pushLine();
        }
        const room = h - ti - bi;
        let top = y + ti + (tx.anchor === 'ctr' ? (room - total) / 2 : tx.anchor === 'b' ? room - total : 0);
        let lastPara = null;
        for (const ln of lines) {
          const p = ln.para;
          if (p !== lastPara && lastPara) {
            const sc = tx.scale || 1, maxS = Math.max(...p.runs.map(r => r.size * sc), 1);
            top += (p.spcBef?.pts ?? (p.spcBef?.pct ? p.spcBef.pct * maxS * 1.2 : 0)) + (lastPara.spcAft?.pts ?? (lastPara.spcAft?.pct ? lastPara.spcAft.pct * maxS * 1.2 : 0));
          }
          lastPara = p;
          const base = H - (top + ln.asc);
          const lw = width - ln.x0;
          let sx = x + li + ln.x0 + (p.algn === 'ctr' ? (lw - ln.width) / 2 : p.algn === 'r' ? lw - ln.width : 0);
          if (ln.bullet && ln.segs.length) {
            const r0 = ln.segs[0].run, bs = ln.segs[0].size * (p.bullet.scale || 1), bf = await getFont(/^\d|^[a-zA-Z]+\.$|^\(/.test(ln.bullet) ? family(r0.face) : 'sans', false, false);
            const bx = x + li + p.marL + p.indent;
            if (sets.get(bf).has(ln.bullet.codePointAt(0))) page.drawText(ln.bullet, { x: bx, y: base, size: bs, font: bf, color: rgb(p.bullet.color || r0.color) });
          }
          for (const s of ln.segs) {
            if (!s.space) {
              page.drawText(s.t, { x: sx, y: base + s.run.base * s.size, size: s.size * (s.run.base ? 0.65 : 1), font: s.font, color: rgb(s.run.color), opacity: s.run.color.a ?? 1 });
              if (s.run.u) page.drawLine({ start: { x: sx, y: base - s.size * 0.1 }, end: { x: sx + s.w, y: base - s.size * 0.1 }, thickness: Math.max(0.5, s.size / 18), color: rgb(s.run.color) });
              if (s.run.strike) page.drawLine({ start: { x: sx, y: base + s.size * 0.3 }, end: { x: sx + s.w, y: base + s.size * 0.3 }, thickness: Math.max(0.5, s.size / 18), color: rgb(s.run.color) });
            } else if (s.run.u) page.drawLine({ start: { x: sx, y: base - s.size * 0.1 }, end: { x: sx + s.w, y: base - s.size * 0.1 }, thickness: Math.max(0.5, s.size / 18), color: rgb(s.run.color) });
            sx += s.w;
          }
          top += ln.height;
        }
      }

      // Diagramm zeichnen: Titel, Legende, Achsen mit „runden“ Schritten, Gitterlinien, Säulen/Balken/Linien/Flächen/Kreis
      async function drawChart(it) {
        const c = it.chart, f = await getFont('calibri', false, false), fb = await getFont('calibri', true, false);
        const fs = Math.max(5, Math.min(c.size || 10, it.h / 14)), grey = L.rgb(0.35, 0.35, 0.35), gridC = L.rgb(0.85, 0.85, 0.85);
        const loc = locale || 'de-DE', fmtN = v => c.percent ? (v * 100).toLocaleString(loc, { maximumFractionDigits: 1 }) + ' %' : v.toLocaleString(loc, { maximumFractionDigits: 2 });
        const clean = s => [...String(s)].filter(ch => sets.get(f).has(ch.codePointAt(0)) || ch === ' ').join('');
        let top = it.y + 4, bottom = it.y + it.h - 4, left = it.x + 4, right = it.x + it.w - 4;
        if (c.title) { const ts = fs * 1.35, t = clean(c.title), tw = fb.widthOfTextAtSize(t, ts); page.drawText(t, { x: it.x + (it.w - tw) / 2, y: H - top - ts, size: ts, font: fb, color: L.rgb(0.1, 0.1, 0.1) }); top += ts * 1.6; }
        const pie = /pie|doughnut/.test(c.type);
        const legendItems = pie ? c.cats.map((cat, i) => ({ name: cat, color: c.series[0].points.find(p => p.i === i)?.color || c.accents[i % c.accents.length] })) : c.series.map(s => ({ name: s.name, color: s.color }));
        if (c.legend || pie || c.series.length > 1) {   // Legende rechts (bzw. unten, wenn so gespeichert)
          const items = legendItems.map(l => ({ ...l, name: clean(l.name) })), sw = fs * 0.8;
          if (c.legendPos === 'b' || c.legendPos === 't') {
            const tot = items.reduce((a, l) => a + sw + 4 + f.widthOfTextAtSize(l.name, fs) + 12, 0); let lx = it.x + Math.max(4, (it.w - tot) / 2);
            const ly = c.legendPos === 'b' ? bottom - fs : top; for (const l of items) { page.drawRectangle({ x: lx, y: H - ly - sw, width: sw, height: sw, color: rgb(l.color) }); page.drawText(l.name, { x: lx + sw + 4, y: H - ly - sw + 1, size: fs, font: f, color: grey }); lx += sw + 4 + f.widthOfTextAtSize(l.name, fs) + 12; }
            if (c.legendPos === 'b') bottom -= fs * 1.8; else top += fs * 1.8;
          } else {
            const lw = Math.min(it.w * 0.35, Math.max(...items.map(l => f.widthOfTextAtSize(l.name, fs))) + sw + 10);
            let ly = top + Math.max(0, (bottom - top - items.length * fs * 1.5) / 2);
            for (const l of items) { page.drawRectangle({ x: right - lw, y: H - ly - sw, width: sw, height: sw, color: rgb(l.color) }); page.drawText(l.name, { x: right - lw + sw + 4, y: H - ly - sw + 1, size: fs, font: f, color: grey, maxWidth: lw - sw - 4 }); ly += fs * 1.5; }
            right -= lw + 8;
          }
        }
        if (pie) {
          const s = c.series[0], vals = s.vals.map(v => Math.max(0, v || 0)), sum = vals.reduce((a, b) => a + b, 0) || 1;
          const r = Math.max(4, Math.min(right - left, bottom - top) / 2), cx = (left + right) / 2, cy = H - (top + bottom) / 2;
          let a0 = Math.PI / 2;
          vals.forEach((v, i) => {
            const a1 = a0 - v / sum * Math.PI * 2, steps = Math.max(2, Math.ceil((a0 - a1) / 0.1)), pts = [];
            for (let k = 0; k <= steps; k++) { const t = a0 + (a1 - a0) * k / steps; pts.push([Math.cos(t) * r, -Math.sin(t) * r]); }
            const inner = c.hole ? pts.slice().reverse().map(([x, y]) => [x * c.hole, y * c.hole]) : [[0, 0]];
            const d = 'M' + [...pts, ...inner].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L') + ' Z';
            if (v > 0) page.drawSvgPath(d, { x: cx, y: cy, color: rgb(s.points.find(p => p.i === i)?.color || c.accents[i % c.accents.length]), borderColor: L.rgb(1, 1, 1), borderWidth: 1 });
            a0 = a1;
          });
          return;
        }
        // Wertebereich (gestapelt: Summen; 100 %: Anteile)
        const n = c.cats.length, stacked = /stacked/i.test(c.grouping), pct = c.grouping === 'percentStacked';
        const totals = c.cats.map((_, i) => c.series.reduce((a, s) => a + Math.abs(s.vals[i] || 0), 0) || 1);
        const v = (s, i) => { const x = s.vals[i]; return x == null ? null : pct ? x / totals[i] : x; };
        let lo = 0, hi = 0;
        c.cats.forEach((_, i) => { if (stacked) { let pos = 0, neg = 0; for (const s of c.series) { const x = v(s, i) || 0; if (x >= 0) pos += x; else neg += x; } hi = Math.max(hi, pos); lo = Math.min(lo, neg); } else for (const s of c.series) { const x = v(s, i); if (x != null) { hi = Math.max(hi, x); lo = Math.min(lo, x); } } });
        if (hi === lo) hi = lo + 1;
        const raw = (hi - lo) / 6, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= raw);
        hi = Math.ceil(hi / step - 1e-9) * step; lo = Math.floor(lo / step + 1e-9) * step;
        const horiz = c.type === 'bar' && c.dir === 'bar';
        const labels = []; for (let t = lo; t <= hi + step / 2; t += step) labels.push(+t.toFixed(10));
        const lw = Math.max(...labels.map(t => f.widthOfTextAtSize(fmtN(pct ? t : t).replace(/ %$/, pct ? ' %' : ''), fs)));
        const catW = Math.max(...c.cats.map(t => f.widthOfTextAtSize(clean(t), fs)));
        if (horiz) { left += catW + 6; bottom -= fs * 1.6; } else { left += lw + 6; bottom -= fs * 1.6; }
        const W = right - left, Hh = bottom - top; if (W < 10 || Hh < 10) return;
        const vx = t => horiz ? left + (t - lo) / (hi - lo) * W : null, vy = t => bottom - (t - lo) / (hi - lo) * Hh;
        for (const t of labels) {   // Gitterlinien und Achsenbeschriftung
          const s = pct ? Math.round(t * 100) + ' %' : fmtN(t), tw = f.widthOfTextAtSize(s, fs);
          if (horiz) { const x = vx(t); page.drawLine({ start: { x, y: H - top }, end: { x, y: H - bottom }, thickness: 0.5, color: gridC }); page.drawText(s, { x: x - tw / 2, y: H - bottom - fs * 1.2, size: fs, font: f, color: grey }); }
          else { const y = vy(t); page.drawLine({ start: { x: left, y: H - y }, end: { x: right, y: H - y }, thickness: 0.5, color: gridC }); page.drawText(s, { x: left - tw - 4, y: H - y - fs * 0.35, size: fs, font: f, color: grey }); }
        }
        const band = (horiz ? Hh : W) / n;
        c.cats.forEach((cat, i) => {   // Kategorien
          const s = clean(cat), tw = f.widthOfTextAtSize(s, fs);
          if (horiz) page.drawText(s, { x: left - tw - 4, y: H - (top + band * (i + 0.5)) - fs * 0.35, size: fs, font: f, color: grey });
          else if (tw < band * 1.6 || i % Math.ceil(tw / band) === 0) page.drawText(s, { x: left + band * (i + 0.5) - tw / 2, y: H - bottom - fs * 1.2, size: fs, font: f, color: grey });
        });
        const zero = Math.min(Math.max(0, lo), hi);
        if (c.type === 'bar') {
          const groups = stacked ? 1 : c.series.length, gap = band * 0.3, bw = (band - gap) / groups;
          c.cats.forEach((_, i) => {
            let pos = 0, neg = 0;
            c.series.forEach((s, si) => {
              const x = v(s, i); if (x == null) return;
              let a, b; if (stacked) { if (x >= 0) { a = pos; b = pos += x; } else { a = neg; b = neg += x; } } else { a = zero; b = x; }
              const off = band * i + gap / 2 + (stacked ? 0 : si * bw), col = rgb(c.vary && c.series.length === 1 ? (s.points.find(p => p.i === i)?.color || c.accents[i % c.accents.length]) : s.points.find(p => p.i === i)?.color || s.color);
              if (horiz) { const x0 = vx(Math.min(a, b)), x1 = vx(Math.max(a, b)); page.drawRectangle({ x: x0, y: H - (top + off + bw), width: Math.max(0.3, x1 - x0), height: bw, color: col }); }
              else { const y0 = vy(Math.max(a, b)), y1 = vy(Math.min(a, b)); page.drawRectangle({ x: left + off, y: H - y1, width: bw, height: Math.max(0.3, y1 - y0), color: col }); }
            });
          });
        } else {   // Linie bzw. Fläche
          const base = c.cats.map(() => 0);
          for (const s of c.series) {
            const ptsL = c.cats.map((_, i) => { const x = v(s, i); if (x == null) return null; const y = stacked ? (base[i] += x) : x; return [left + band * (i + 0.5), vy(y)]; });
            const ok = ptsL.filter(Boolean); if (!ok.length) continue;
            if (c.type === 'area') {
              const d = `M${ok[0][0]} ${H - vy(zero)} ` + ok.map(([x, y]) => `L${x.toFixed(2)} ${(H - y).toFixed(2)}`).join(' ') + ` L${ok[ok.length - 1][0]} ${H - vy(zero)} Z`;
              page.drawSvgPath(d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (m, x, y) => `${x} ${-y}`), { x: 0, y: 0, color: rgb(s.color), opacity: 0.85 });
            } else {
              for (let i = 1; i < ptsL.length; i++) if (ptsL[i] && ptsL[i - 1]) page.drawLine({ start: { x: ptsL[i - 1][0], y: H - ptsL[i - 1][1] }, end: { x: ptsL[i][0], y: H - ptsL[i][1] }, thickness: 2.25, color: rgb(s.color) });
              for (const p of ok) page.drawCircle({ x: p[0], y: H - p[1], size: 2.5, color: rgb(s.color) });
            }
          }
        }
        // Achsenlinie bei null
        if (horiz) page.drawLine({ start: { x: vx(zero), y: H - top }, end: { x: vx(zero), y: H - bottom }, thickness: 0.75, color: L.rgb(0.6, 0.6, 0.6) });
        else page.drawLine({ start: { x: left, y: H - vy(zero) }, end: { x: right, y: H - vy(zero) }, thickness: 0.75, color: L.rgb(0.6, 0.6, 0.6) });
      }

      async function drawTable(it) {
        const t = it.table, sumW = t.cols.reduce((a, b) => a + b, 0) || 1, kx = it.w / sumW;
        const sumH = t.rows.reduce((a, r) => a + r.h, 0) || 1, ky = Math.max(1, it.h / sumH);
        let y = it.y;
        const light = { r: 1 - (1 - t.accent.r) * 0.2, g: 1 - (1 - t.accent.g) * 0.2, b: 1 - (1 - t.accent.b) * 0.2 }, lighter = { r: 1 - (1 - t.accent.r) * 0.1, g: 1 - (1 - t.accent.g) * 0.1, b: 1 - (1 - t.accent.b) * 0.1 };
        t.rows.forEach((r, ri) => { r.y = y; r.hh = r.h * ky; y += r.hh; });
        for (const [ri, r] of t.rows.entries()) {
          let ci = 0, x = it.x;
          for (const c of r.cells) {
            const cw = t.cols.slice(ci, ci + c.span).reduce((a, b) => a + b, 0) * kx;
            const ch = t.rows.slice(ri, ri + c.rowSpan).reduce((a, q) => a + q.hh, 0);
            if (!c.merged) {
              const bandIdx = ri - (t.firstRow ? 1 : 0);
              const fill = c.fill !== undefined ? c.fill : c.header ? t.accent : t.bandRow ? (bandIdx % 2 === 0 ? light : lighter) : null;
              page.drawRectangle({ x, y: H - r.y - ch, width: cw, height: ch, color: fill ? rgb(fill) : undefined, borderColor: L.rgb(1, 1, 1), borderWidth: fill ? 1 : 0 });
              if (!fill) page.drawRectangle({ x, y: H - r.y - ch, width: cw, height: ch, borderColor: L.rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
              if (c.text) { const tx = { ...c.text, ins: c.ins, anchor: c.anchor }; if (c.header) tx.paras = tx.paras.map(p => ({ ...p, runs: p.runs.map(q => ({ ...q, bold: true })) })); await drawText(tx, x, r.y, cw, ch); }
            }
            x += cw; ci += c.span;
          }
        }
      }
    }
    const bytes = await doc.save();
    return { bytes, missing };
  }
  // Symbolschrift im privaten Bereich (U+F020 … U+F0FF) wie Wingdings
  const isPua = ch => { const c = ch.charCodeAt(0); return c >= 0xf000 && c <= 0xf0ff; };
  // Wingdings-Zeichen der üblichen Aufzählungen → Unicode
  const WING = { '§': '▪', n: '■', l: '●', 'Ø': '➢', 'ü': '✔', q: '❑', v: '❖', w: '◆', 'Ü': '✓', 'à': '→', 'è': '➔', '·': '•', o: '○' };
  function autoNum(type, n) {
    const roman = k => { let s = ''; for (const [v, r] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) while (k >= v) { s += r; k -= v; } return s; };
    const alpha = k => { let s = ''; while (k > 0) { k--; s = String.fromCharCode(97 + k % 26) + s; k = Math.floor(k / 26); } return s; };
    const m = /^(arabic|alphaLc|alphaUc|romanLc|romanUc)(Period|ParenR|ParenBoth|Plain)?/.exec(type) || [, 'arabic', 'Period'];
    let v = m[1] === 'arabic' ? String(n) : m[1] === 'alphaLc' ? alpha(n) : m[1] === 'alphaUc' ? alpha(n).toUpperCase() : m[1] === 'romanLc' ? roman(n) : roman(n).toUpperCase();
    return m[2] === 'ParenR' ? v + ')' : m[2] === 'ParenBoth' ? `(${v})` : m[2] === 'Plain' ? v : v + '.';
  }

  const api = { pptx, odp, render, family, shapePath, autoNum };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Slides = api;
})(typeof self !== 'undefined' ? self : this);
