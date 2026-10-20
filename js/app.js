// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Hauptanwendung (Branding/Edition aus js/config.js) */
'use strict';
const { setCharacterSqueeze, PDFDocument, PDFName, PDFString, PDFHexString, PDFNumber, PDFOperator, PDFOperatorNames, degrees, pushGraphicsState, popGraphicsState, setTextRenderingMode, TextRenderingMode,
  concatTransformationMatrix, drawObject } = PDFLib;
// Graustufen-Speichern (buildPdf gray): rgb() liefert dann Grauwerte nach ITU-R BT.601 (wie Schwarzweiß-Druck)
let GRAY = false;
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const rgb = (r, g, b) => GRAY ? PDFLib.grayscale(lum(r, g, b)) : PDFLib.rgb(r, g, b);
const setFillingRgbColor = (r, g, b) => GRAY ? PDFLib.setFillingGrayscaleColor(lum(r, g, b)) : PDFLib.setFillingRgbColor(r, g, b);
// Leinwand in Graustufen umrechnen (in place)
function grayCanvas(c) {
  const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const v = Math.round(0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]); a[i] = a[i + 1] = a[i + 2] = v; }
  x.putImageData(d, 0, 0); return c;
}
// Bild (Daten-URL) in Graustufen – Unterschriften, Stempel, Logos; Transparenz bleibt (PNG)
async function grayDataUrl(url) {
  const img = new Image(); img.src = url; await img.decode();
  const c = Imaging.canvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0);
  return grayCanvas(c).toDataURL(url.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png', 0.9);
}
const abs = p => new URL(p, location.href).href;
// pdf.js kommt als ES-Modul (vendor/pdfjs/loader.js) – vor der ersten Nutzung darauf warten
// erst beim ersten Öffnen einer PDF laden (bzw. im Leerlauf nach dem Seitenaufbau, siehe unten)
let pdfjsP = null;
const pdfjsReady = () => window.pdfjsLib ? Promise.resolve() : (pdfjsP ||= import(abs('vendor/pdfjs/loader.js')).then(() => {}, e => { pdfjsP = null; throw e; }));
// Selten oder erst später gebrauchte Bibliotheken nicht beim Start laden (schnellerer Seitenaufbau): fontkit (Schriften einbetten),
// jsQR (QR-Codes lesen), qrcode (QR-Codes erzeugen). Der Service Worker hält sie trotzdem offline bereit.
const scriptP = {};
const loadScript = src => scriptP[src] ||= new Promise((ok, no) => {
  const s = Object.assign(document.createElement('script'), { src, async: true });
  s.onload = () => ok(); s.onerror = () => { delete scriptP[src]; no(new Error(`${src} konnte nicht geladen werden`)); };
  document.head.append(s);
});
const loadFontkit = () => window.fontkit ? Promise.resolve(window.fontkit) : loadScript('vendor/fontkit.umd.min.js').then(() => window.fontkit);
const loadQrcode = () => typeof qrcode === 'function' ? Promise.resolve() : loadScript('vendor/qrcode.js');
const loadJsQR = () => typeof jsQR === 'function' ? Promise.resolve() : loadScript('vendor/jsqr.js');
window.loadFontkit = loadFontkit; window.loadQrcode = loadQrcode;
// Nach dem Seitenaufbau im Leerlauf vorladen – beim ersten Scan oder Speichern ist dann alles da
addEventListener('load', () => (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => { pdfjsReady().catch(() => {}); loadJsQR().catch(() => {}); loadQrcode().catch(() => {}); loadFontkit().catch(() => {}); }, { timeout: 4000 }));
// Eingebettete Dateien: pdf.js ≥ 5 liefert eine Map ohne Inhalt – den Inhalt je Datei nachladen (ältere Versionen: Objekt mit content)
async function pdfAttachments(js) {
  const att = await js.getAttachments(); if (!att) return [];
  if (att instanceof Map) {
    const out = [];
    for (const [key, v] of att) { let content = v.content; if (!content && js.getAttachmentContent) try { content = await js.getAttachmentContent(key); } catch {} out.push({ filename: v.filename || key, content }); }
    return out;
  }
  return Object.values(att);
}
async function openPdf(data, extra = {}) { await pdfjsReady(); return pdfjsLib.getDocument({ data, ...window.PDFJS_OPTS, ...extra }).promise; }

const $ = s => document.querySelector(s);
// Beschriftung eines Knopfs ändern, Symbol behalten
const setLbl = (s, text) => { const el = $(s), l = el.querySelector('.lbl'); (l || el).textContent = text; };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('mpdf.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mpdf.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('mpdf.' + k); } catch {} },
};

const DEFAULTS = { mode: 'auto', quality: 0.75, ownName: APP.ownName, autoOcr: true, autoDeskew: true, autoOrient: true,
  autoCrop: true, ocrLang: 'auto', hlColor: '#ffd400', hlStyle: 'hl', pdfa: true, byYear: false, byType: true, saveIcs: true, compact: true, scanPdf: true, author: '', autopilot: false, inStamp: false };
const S = Object.assign({}, DEFAULTS, LS.get('settings', {}));
if (APP.edition === 'local') document.title = APP.name;
if (APP.brandHtml) $('#brand').innerHTML = APP.brandHtml;
if (APP.homeTitleHtml) $('.home-title').innerHTML = APP.homeTitleHtml;
if (APP.homeSub) { const hs = $('.home-sub'); if (hs) hs.innerHTML = APP.homeSub; else $('.home-title').insertAdjacentHTML('afterend', `<span class="home-sub">${APP.homeSub}</span>`); }   // steht schon in index.html (kein Aufblitzen alter Texte)
// Touchscreen: „hierher ziehen“ ergibt keinen Sinn
if (matchMedia('(pointer:coarse)').matches) { const s = document.querySelector('.drop span'); if (s) s.textContent = 'PDF, JPG, PNG, E-Mails · auch mehrere'; }
const saveSettings = () => LS.set('settings', S);

const META_KEYS = ['date', 'type', 'sender', 'subject', 'deadline', 'amount', 'iban', 'invoiceNo', 'customerNo', 'reference'];
const emptyMeta = () => Object.fromEntries(META_KEYS.map(k => [k, '']));

const state = {
  files: [], filesDirty: false, pages: [], docs: [], sel: -1, tool: 'select', zoom: 1, annSel: null, editing: null, query: '', crop: null, undo: [],
  meta: emptyMeta(), touched: {}, signature: LS.get('signature', null),
  outDir: null, inDir: null, seen: new Set(), sizes: {}, dirty: false,
  picked: new Set(), anchor: null, view: 'page', intent: null, inputBytes: 0,
};
let uid = 0;
window.pdfmyHandles = new WeakMap();   // Datei → Verweis auf die Originaldatei (für „In Originaldatei speichern“)
const cur = () => state.pages[state.sel];

/* ---------- Status ---------- */
const appLog = [];   // letzte Meldungen und Programmfehler – für „Problem melden“
const logLine = t => { appLog.push(new Date().toLocaleTimeString('de-DE') + ' ' + t); if (appLog.length > 60) appLog.shift(); };
addEventListener('error', e => logLine('FEHLER ' + (e.message || e.error) + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));
addEventListener('unhandledrejection', e => logLine('FEHLER ' + (e.reason?.message || e.reason)));
function status(msg, pct) {
  if (pct == null && msg !== $('#msg').textContent) logLine(msg);
  $('#msg').textContent = msg;
  const bar = $('#bar');
  if (pct == null) bar.style.visibility = 'hidden';
  else { bar.style.visibility = 'visible'; bar.firstElementChild.style.width = Math.round(pct * 100) + '%'; }
}

/* ---------- Import ---------- */
// Handys (Android, iPhone/iPad): weniger Speicher – iOS bricht ab etwa 300 MB Canvas-Speicher ab
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_MOBILE = IS_IOS || /Android|Mobile/i.test(navigator.userAgent);
const IS_MAC = !IS_IOS && /Macintosh|Mac OS X/.test(navigator.userAgent);
const IS_LINUX = !IS_MAC && !IS_IOS && /Linux|X11/.test(navigator.userAgent) && !/Android|CrOS/.test(navigator.userAgent);   // Linux-PC: pdfmy Scan für Linux   // Mac: kein pdfmy Scan (Windows), Scannen über „Digitale Bilder“ + Scan-Ordner
const MAX_SIDE = IS_MOBILE ? 2600 : 3300;
document.documentElement.classList.toggle('mobile', IS_MOBILE);
// Bild laden, EXIF-Drehung beachten – mit Rückfall für ältere Safari-Versionen
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(file);
    try { const im = new Image(); im.src = url; await im.decode(); return im; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
// Canvas-Speicher sofort freigeben (iOS gibt ihn sonst erst spät zurück)
const freeCanvas = c => { if (c && c.width) { c.width = 0; c.height = 0; } };
// Aufgaben, bei denen PDF-Seiten ohne Textebene nicht automatisch erkannt werden müssen (schneller)
const NO_OCR_INTENTS = new Set(['merge', 'organize', 'compress', 'pdf2img', 'protect', 'unlock', 'stamp', 'form', 'sign', 'bates']);
async function importFiles(files, { fromCamera = false } = {}) {
  const before = state.pages.length;
  for (const f of files) {
    const n = f.name.toLowerCase();
    try {
      status(`Importiere ${f.name} …`);
      if (f.type === 'application/pdf' || n.endsWith('.pdf')) await importPdf(f);
      else if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|heic|heif|tiff?)$/.test(n)) await importImage(f, fromCamera);
      else if (/\.(txt|md|markdown|csv)$/.test(n) || /^text\/(plain|markdown|csv)/.test(f.type)) await importText(f);
      else if (/\.(docx|xlsx)$/.test(n)) await importOffice(f);
      else if (/\.(doc|xls|ppt|pptx|odt|ods)$/.test(n)) { status(`${f.name}: Dieses Format kann PDFMy noch nicht umwandeln – bitte in Word bzw. Excel als .docx/.xlsx speichern oder dort „Als PDF speichern“ wählen.`); continue; }
      else if (/\.xml$/.test(n) || /xml/.test(f.type)) await importXml(f);
      else if (/\.(eml|msg)$/.test(n) || f.type === 'message/rfc822' || f.type === 'application/vnd.ms-outlook') await importMail(f);
      else { status(`Format nicht unterstützt: ${f.name} (bitte PDF, Bild, Word, Excel, Text, Markdown, CSV oder E-Rechnung als XML)`); continue; }
      state.inputBytes += f.size;
    } catch (e) {
      console.error(e);
      status(e.name === 'AbortError' ? `${f.name}: Öffnen abgebrochen.` : unreadable(f.name, e));
    }
  }
  if (state.pages.length === before) return;
  state.dirty = true;
  if (state.sel < 0) state.sel = 0;
  const added = state.pages.length - before;
  refresh();
  status(`${added} Seite(n) importiert.`);
  applyIntent();
  if (S.autoOcr) runOcrAll(); else analyze();
}

/* E-Mail (.eml aus Outlook im Web/Thunderbird, .msg aus Outlook): PDF-, Bild- und E-Rechnungs-Anhänge übernehmen.
   Ohne passenden Anhang wird der E-Mail-Text als Seite übernommen. Alles lokal – die E-Mail verlässt den Rechner nicht. */
async function importMail(file) {
  const m = Email.parseMail(new Uint8Array(await file.arrayBuffer()), file.name);
  let n = 0;
  for (const a of m.files) {
    const f = new File([a.data], a.name, { type: a.type });
    try {
      if (a.type === 'application/pdf') await importPdf(f);
      else if (a.type === 'application/xml') await importXml(f);
      else await importImage(f, false);
      n++;
    } catch (e) { console.warn('Anhang', a.name, e); }
  }
  if (n) return status(`E-Mail „${m.subject || file.name}“: ${n > 1 ? `${n} Anhänge` : `${n} Anhang`} übernommen.`);
  // Keine Anhänge: E-Mail selbst als lesbare Seite (Von, Datum, Betreff, Text)
  const doc = await PDFDocument.create(); doc.registerFontkit(await loadFontkit());
  const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true }), cs = new Set(font.getCharacterSet());
  const safe = s => [...s].filter(ch => cs.has(ch.codePointAt(0))).join('');
  let page = doc.addPage([595.28, 841.89]), y = 790;
  const line = (t, size = 10.5, bold) => {
    for (const l of wrapLines(safe(t), 495, s => font.widthOfTextAtSize(s, size))) {
      if (y < 60) { page = doc.addPage([595.28, 841.89]); y = 790; }
      page.drawText(l, { x: 50, y, size, font, color: bold ? rgb(0.1, 0.1, 0.1) : rgb(0.2, 0.2, 0.2) }); y -= size * 1.45;
    }
  };
  line(m.subject || '(ohne Betreff)', 15, true); y -= 6;
  if (m.from) line('Von: ' + m.from, 9.5); if (m.date) line('Datum: ' + m.date, 9.5); y -= 10;
  for (const t of String(m.body || '(kein Text)').replace(/\r/g, '').split('\n').slice(0, 600)) t.trim() ? line(t) : (y -= 7);
  await importPdf(new File([await doc.save()], (m.subject || 'E-Mail').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) + '.pdf', { type: 'application/pdf' }));
  status(`E-Mail „${m.subject || file.name}“ ohne PDF-Anhang – der E-Mail-Text wurde als Seite übernommen.`);
}

/* E-Rechnung als reine XML-Datei (XRechnung): lesbare PDF-Seite erzeugen, Original-XML für die Ablage merken */
async function importXml(file) {
  const xml = await file.text(), d = EInvoice.parse(xml);
  if (!d) throw new Error('keine E-Rechnung (XRechnung/ZUGFeRD) erkannt');
  const doc = await PDFDocument.create(); doc.registerFontkit(await loadFontkit());
  const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true }), cs = new Set(font.getCharacterSet());
  const safe = s => [...s].filter(ch => cs.has(ch.codePointAt(0))).join('');
  let page = doc.addPage([595.28, 841.89]), y = 790;
  const line = (t, size = 10.5, bold) => {
    for (const l of wrapLines(safe(t), 500, s => font.widthOfTextAtSize(s, size))) {
      if (y < 60) { page = doc.addPage([595.28, 841.89]); y = 790; }
      page.drawText(l, { x: 50, y, size, font, color: bold ? rgb(0.1, 0.1, 0.1) : rgb(0.2, 0.2, 0.2) }); y -= size * 1.45;
    }
  };
  const [head, ...rest] = EInvoice.toText(d).split('\n');
  line(head, 15, true); y -= 8; rest.forEach(t => t ? line(t) : (y -= 8));
  y -= 10; line(`Erzeugt aus der elektronischen Rechnung „${file.name}“. Das XML ist das rechtlich maßgebliche Original und wird mit abgelegt.`, 8);
  const bytes = await doc.save();
  await importPdf(new File([bytes], file.name.replace(/\.xml$/i, '') + '.pdf', { type: 'application/pdf' }));
  state.einv = { data: d, xml, xmlName: file.name, original: null };
  status(`E-Rechnung gelesen (${d.format}): ${d.sender} · ${d.amount}`);
}
// Unverändert ablegen, wo möglich: Bei ZUGFeRD-PDFs ist die Originaldatei samt eingebettetem XML das Beleg-Original
function einvOriginal(pages, o = {}) {
  const e = state.einv; if (!e?.original || o.password || hasStamp(o)) return null;
  const n = state.docs[e.docIdx]?.js.numPages;
  const same = pages.length === n && pages.every((p, i) => p.kind === 'pdf' && p.docIdx === e.docIdx && p.pageIdx === i && !p.rotation && !p.annots.length);
  return same ? e.original : null;
}
// Digital signiertes PDF unverändert gespeichert (keine Anmerkungen, Drehungen, Umsortierungen, Stempel, Formulareingaben):
// Original-Bytes übernehmen – so bleiben vorhandene Signaturen gültig und eine weitere wird angehängt (Mitunterzeichnen)
// Unverändert geöffnete PDF (eine Datei, alle Seiten in Reihenfolge, keine Anmerkungen, Drehungen, Stempel, Formulareingaben, nicht repariert)
function untouchedOriginal(pages, o = {}) {
  const d = pages[0]?.kind === 'pdf' ? state.docs[pages[0].docIdx] : null;
  if (!d?.bytes || d.filled || d.repaired || d.unlocked || o.password || hasStamp(o)) return null;
  const same = pages.length === d.js?.numPages && pages.every((p, i) => p.kind === 'pdf' && state.docs[p.docIdx] === d && p.pageIdx === i && !p.rotation && !p.annots.length);
  return same ? d.bytes : null;
}
function signedOriginal(pages, o = {}) {
  const d = pages[0]?.kind === 'pdf' ? state.docs[pages[0].docIdx] : null;
  if (!d?.sigs?.some(r => !r.usageRights) || d.filled || o.password || hasStamp(o)) return null;
  const same = pages.length === d.js.numPages && pages.every((p, i) => p.kind === 'pdf' && state.docs[p.docIdx] === d && p.pageIdx === i && !p.rotation && !p.annots.length);
  return same ? d.bytes : null;
}
// iPhone-Fotos (HEIC/HEIF) und TIFF (Fax, Scanner, mehrseitig) kann nur Safari selbst anzeigen – in Chrome, Edge und Firefox
// dekodiert PDFMy sie lokal (libheif als WebAssembly bzw. UTIF.js), erst beim ersten Bedarf geladen. Nichts wird hochgeladen.
const isHeic = f => /\.(heic|heif)$/i.test(f.name) || /^image\/hei[cf]/i.test(f.type);
const isTiff = f => /\.tiff?$/i.test(f.name) || /^image\/tiff/i.test(f.type);
let heifLoading = null, tiffLoading = null;
const loadHeif = () => heifLoading ||= (async () => {
  await loadScript('vendor/libheif/libheif.js');
  const wasmBinary = new Uint8Array(await (await fetch(abs('vendor/libheif/libheif.wasm'))).arrayBuffer());
  return await new Promise((res, rej) => { let m = null; m = libheif({ wasmBinary, onRuntimeInitialized: () => setTimeout(() => res(m)), onAbort: rej }); });   // Rückruf kann noch während libheif() kommen
})().catch(e => { heifLoading = null; throw e; });
const loadTiff = () => tiffLoading ||= (async () => { if (!self.pako) await loadScript('vendor/utif/pako_inflate.min.js'); await loadScript('vendor/utif/UTIF.js'); return self.UTIF; })().catch(e => { tiffLoading = null; throw e; });
// RGBA-Pixel → Leinwand (verkleinert auf MAX_SIDE)
function rgbaCanvas(rgba, w, h, sy = 1) {   // sy: Höhenfaktor bei ungleicher Auflösung (Fax 204×98/196 dpi)
  const src = Imaging.canvas(w, h); src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, w * h * 4), w, h), 0, 0);
  const k = Math.min(1, MAX_SIDE / Math.max(w, h * sy)); if (k === 1 && sy === 1) return src;
  const c = Imaging.canvas(Math.round(w * k), Math.round(h * sy * k)); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); freeCanvas(src); return c;
}
async function heicCanvases(file) {
  const lib = await loadHeif(), dec = new lib.HeifDecoder(), imgs = dec.decode(new Uint8Array(await file.arrayBuffer()));
  if (!imgs?.length) throw new Error('HEIC-Bild konnte nicht gelesen werden');
  const out = [];
  for (const im of imgs.slice(0, 1)) {   // Hauptbild (Live-Photo-/Serienbilder: nur das erste)
    const w = im.get_width(), h = im.get_height(), buf = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    const d = await new Promise((res, rej) => im.display(buf, x => x ? res(x) : rej(new Error('HEIC-Bild konnte nicht dekodiert werden'))));
    out.push(rgbaCanvas(d.data, w, h)); im.free?.();
  }
  dec.decoder?.delete?.();
  return out;
}
async function tiffCanvases(file) {
  const U = await loadTiff(), buf = await file.arrayBuffer(), ifds = U.decode(buf), out = [];
  for (const ifd of ifds) {
    if (ifd.t254 && (ifd.t254[0] & 1)) continue;   // Vorschaubild (reduced-resolution image)
    U.decodeImage(buf, ifd, ifds);
    if (!ifd.width || !ifd.height) continue;
    const rx = ifd.t282?.[0], ry = ifd.t283?.[0], sy = rx > 0 && ry > 0 && Math.abs(rx / ry - 1) > 0.05 ? rx / ry : 1;
    out.push(rgbaCanvas(U.toRGBA8(ifd), ifd.width, ifd.height, sy));
  }
  if (!out.length) throw new Error('TIFF-Datei enthält kein lesbares Bild');
  return out;
}
// Word (.docx) und Excel (.xlsx) → PDF (js/office.js liest, js/textpdf.js setzt) – auf dem Gerät, ohne Upload
async function importOffice(file) {
  status(`${file.name} wird in PDF umgewandelt …`);
  const bytes = new Uint8Array(await file.arrayBuffer()), word = /\.docx$/i.test(file.name);
  const r = word ? await Office.docx(bytes) : await Office.xlsx(bytes, { locale: I18N.info.bcp || 'de-DE' });
  const [fk, regular, bold, mono] = await Promise.all([loadFontkit(), asset('font', 'vendor/DejaVuSans.ttf'), asset('font:vendor/dejavu/DejaVuSans-Bold.ttf', 'vendor/dejavu/DejaVuSans-Bold.ttf'), asset('font:vendor/dejavu/DejaVuSansMono.ttf', 'vendor/dejavu/DejaVuSansMono.ttf')]);
  const pdf = await TextPdf.build(PDFLib, { blocks: r.blocks, page: r.page, title: file.name.replace(/\.[^.]+$/, ''), fonts: { fontkit: fk, regular, bold, mono } });
  await importPdf(new File([pdf], file.name.replace(/\.[^.]+$/, '') + '.pdf', { type: 'application/pdf' }));
  if (word) status(`${file.name} umgewandelt. Kopf- und Fußzeilen, Textfelder und besondere Schriften übernimmt PDFMy nicht – für ein exaktes Abbild in Word „Als PDF speichern“.`);
}
// Text, Markdown und CSV → PDF (js/textpdf.js), dann wie eine PDF weiterverarbeiten. Kodierung: UTF-8, sonst Windows-1252 (ältere Excel-CSV)
async function importText(file) {
  const raw = new Uint8Array(await file.arrayBuffer());
  let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { text = new TextDecoder('windows-1252').decode(raw); }
  const n = file.name.toLowerCase(), kind = /\.csv$/.test(n) || /csv/.test(file.type) ? 'csv' : /\.(md|markdown)$/.test(n) || /markdown/.test(file.type) ? 'md' : 'txt';
  status(`${file.name} wird in PDF umgewandelt …`);
  const [fk, regular, bold, mono] = await Promise.all([loadFontkit(), asset('font', 'vendor/DejaVuSans.ttf'), asset('font:vendor/dejavu/DejaVuSans-Bold.ttf', 'vendor/dejavu/DejaVuSans-Bold.ttf'), asset('font:vendor/dejavu/DejaVuSansMono.ttf', 'vendor/dejavu/DejaVuSansMono.ttf')]);
  const bytes = await TextPdf.build(PDFLib, { text, kind, title: file.name.replace(/\.[^.]+$/, ''), fonts: { fontkit: fk, regular, bold, mono } });
  await importPdf(new File([bytes], file.name.replace(/\.[^.]+$/, '') + '.pdf', { type: 'application/pdf' }));
}
async function importImage(file, fromCamera) {
  if (isTiff(file) || isHeic(file)) {
    let bmp = null;
    if (isHeic(file)) try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}   // Safari kann HEIC selbst
    if (!bmp) {
      status(isHeic(file) ? `${file.name}: iPhone-Foto (HEIC) wird umgewandelt …` : `${file.name}: TIFF-Datei wird umgewandelt …`);
      const cs = isHeic(file) ? await heicCanvases(file) : await tiffCanvases(file);
      cs.forEach((c, i) => addScan(c, cs.length > 1 ? `${file.name} (${i + 1}/${cs.length})` : file.name, fromCamera));
      return;
    }
    bmp.close?.();
  }
  const bmp = await loadBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = Imaging.canvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  addScan(c, file.name, fromCamera);
}
/* Scan-Aufbereitung für Fotos, Bilddateien und gescannte PDF-Seiten: zuschneiden, gerade richten, aufbereiten */
function addScan(c, label, fromCamera = false) {
  let note = ''; const lowRes = !!c.lowRes || c.width < 1000;   // vor dem Zuschneiden merken
  if (S.autoCrop) {
    // Kamera: immer zuschneiden. Andere Bilder (Galerie, „Öffnen“, Ziehen): nur wenn das Blatt sichtbar vor einem
    // Untergrund liegt (Tisch o. Ä.) – echte Scans und Seiten mit Rahmen/Tabellen bleiben unverändert
    let det = Imaging.detectDocument(c);
    if (det.found && (fromCamera || (det.score > 0.6 && det.area < 0.93 && Imaging.hasBackground(c, det.corners)))) {
      det = Imaging.detectDocument(c, 1400, det.corners); c = Imaging.warp(c, det.corners); note = 'zugeschnitten';
    }
  }
  if (S.autoDeskew) { const r = Imaging.deskew(c); c = r.canvas; if (r.angle) note = (note ? note + ', ' : '') + `${I18N.fmtNum(r.angle)}° gerade gerichtet`; }
  const p = { id: ++uid, kind: 'image', orig: c, mode: S.mode, rotation: 0, annots: [], ocr: null, native: null, label: label + (note ? ` (${note})` : ''), lowRes };
  readQr(p, c);
  reprocess(p);
  state.pages.push(p);
}
// Gescannte PDF-Seite = kein Text, aber Bildinhalt (typisch für Multifunktionsgeräte)
const IMG_OPS = () => new Set([pdfjsLib.OPS.paintImageXObject, pdfjsLib.OPS.paintInlineImageXObject, pdfjsLib.OPS.paintJpegXObject].filter(x => x != null));
async function isScannedPage(pg) {
  const ops = await pg.getOperatorList({ intent: 'print' }), img = IMG_OPS();
  return ops.fnArray.some(f => img.has(f));
}

// PDF-Reparatur ohne Server: alle noch lesbaren Objekte einlesen (pdf-lib, fehlertolerant), Seiten einsammeln
// und mit neuem Seitenbaum, Katalog und Querverweistabelle neu schreiben.
async function repairPdf(bytes) {
  const { PDFParser, PDFWriter, PDFDict, PDFRef, PDFArray } = PDFLib;
  // Abgeschnittene Datei: nur bis zum letzten vollständigen Objekt („endobj“) lesen
  const end = [101, 110, 100, 111, 98, 106]; let cut = bytes.length;
  for (let i = bytes.length - end.length; i >= 0; i--) if (end.every((c, k) => bytes[i + k] === c)) { cut = i + end.length; break; }
  const src = cut < bytes.length ? Uint8Array.from([...bytes.subarray(0, cut), 10]) : bytes;
  const ctx = await PDFParser.forBytesWithOptions(src, Infinity, false, false).parseDocument();
  const T = PDFName.of('Type'), pages = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj?.dict;
    if (dict?.get(T) === PDFName.of('Page') && dict.get(PDFName.of('MediaBox'))) pages.push([ref, dict]);
  }
  // Reihenfolge wie im Original: vorhandener Seitenbaum zuerst, sonst nach Objektnummer
  const order = [];
  const walk = node => { const d = node instanceof PDFRef ? ctx.lookup(node) : node; const kids = d?.get?.(PDFName.of('Kids')); if (kids instanceof PDFArray) kids.asArray().forEach(k => { const kd = ctx.lookup(k); if (kd?.get?.(T) === PDFName.of('Page')) order.push(k.toString()); else walk(k); }); };
  try { walk(ctx.lookup(ctx.trailerInfo.Root)?.get(PDFName.of('Pages'))); } catch {}
  const pos = r => { const i = order.indexOf(r.toString()); return i < 0 ? 1e6 + r.objectNumber : i; };
  pages.sort((a, b) => pos(a[0]) - pos(b[0]));
  if (!pages.length) throw new Error('keine Seiten');
  const pagesRef = ctx.nextRef();
  for (const [, d] of pages) d.set(PDFName.of('Parent'), pagesRef);
  ctx.assign(pagesRef, ctx.obj({ Type: 'Pages', Kids: pages.map(p => p[0]), Count: pages.length }));
  const root = ctx.register(ctx.obj({ Type: 'Catalog', Pages: pagesRef }));
  ctx.trailerInfo = { Root: root };
  const out = await PDFWriter.forContext(ctx, 50).serializeToBuffer();
  return { bytes: out, pages: pages.length };
}

/* Markierungen aus anderen PDF-Programmen bearbeitbar übernehmen (Highlight, Underline, StrikeOut, Squiggly):
   aus der Arbeitskopie entfernen – sonst stünden sie doppelt im Seitenbild und in der gespeicherten Datei – und als PDFMy-Markierung
   anlegen (Farbe, Art, Kommentar und Autor bleiben). Digital signierte PDFs und ausgeblendete Markierungen bleiben unangetastet. */
const MARKUP = { Highlight: 'hl', Underline: 'ul', Squiggly: 'ul', StrikeOut: 'st' };
async function importMarkup(d) {
  const raw = d.bytes instanceof Uint8Array ? d.bytes : new Uint8Array(d.bytes), head = new TextDecoder('latin1').decode(raw);
  // Schnelltest: Markierung im Klartext – oder komprimierte Objekt-Streams (dann steht sie nicht lesbar in der Datei)
  if (!/\/(Highlight|Underline|StrikeOut|Squiggly)\b|\/ObjStm\b/.test(head) || /\/ByteRange\s*\[/.test(head)) return null;
  const lib = await PDFDocument.load(raw, { ignoreEncryption: true, updateMetadata: false });
  if (lib.isEncrypted) return null;
  const found = new Map(), num = x => (x && typeof x.asNumber === 'function') ? x.asNumber() : +String(x);
  let n = 0;
  lib.getPages().forEach((page, pi) => {
    const arr = page.node.Annots(); if (!arr) return;
    const drop = new Set();
    for (let k = 0; k < arr.size(); k++) {
      const ref = arr.get(k), dict = lib.context.lookup(ref);
      if (!(dict instanceof PDFLib.PDFDict)) continue;
      const style = MARKUP[String(dict.get(PDFName.of('Subtype')) || '').slice(1)]; if (!style) continue;
      if (num(dict.lookup(PDFName.of('F')) ?? 0) & 2) continue;   // ausgeblendet
      const q = dict.lookup(PDFName.of('QuadPoints')); if (!(q instanceof PDFLib.PDFArray) || q.size() < 8) continue;
      const col = dict.lookup(PDFName.of('C')), c = col instanceof PDFLib.PDFArray && col.size() === 3 ? col.asArray().map(num) : null;
      const txt = key => { try { return dict.lookup(PDFName.of(key))?.decodeText?.().trim() || ''; } catch { return ''; } };
      const list = found.get(pi) || []; found.set(pi, list);
      list.push({ quads: q.asArray().map(num), style, color: c ? '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('') : '#ffd400', comment: txt('Contents'), author: txt('T') });
      drop.add(String(ref)); const pop = dict.get(PDFName.of('Popup')); if (pop) drop.add(String(pop));   // zugehöriges Kommentarfenster
    }
    for (let k = arr.size() - 1; k >= 0; k--) if (drop.has(String(arr.get(k)))) { arr.remove(k); n++; }
  });
  if (!found.size) return null;
  d.base = d.filled = await lib.save(); d.lib = null; d.markup = found;
  d.js = await openPdf(d.filled.slice());
  status(`${[...found.values()].reduce((s, l) => s + l.length, 0)} Markierung(en) aus der Datei übernommen – lassen sich umfärben und löschen.`);
  return d.js;
}
// QuadPoints (PDF-Koordinaten) → PDFMy-Markierung (Seite normiert, ein Rechteck je Zeile)
function markupAnnot(m, vp) {
  const rs = [];
  for (let k = 0; k + 7 < m.quads.length; k += 8) {
    const pts = [0, 2, 4, 6].map(j => vp.convertToViewportPoint(m.quads[k + j], m.quads[k + j + 1]));
    const xs = pts.map(p => p[0] / vp.width), ys = pts.map(p => p[1] / vp.height);
    const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (r.w > 0.001 && r.h > 0.001) rs.push(r);
  }
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h));
  return { id: ++uid, type: 'hl', color: m.color, style: m.style, imp: true, comment: m.comment, author: m.author, text: '',
    x: x0, y: y0, w: x1 - x0, h: y1 - y0, rects: rs.map(r => ({ x: (r.x - x0) / (x1 - x0), y: (r.y - y0) / (y1 - y0), w: r.w / (x1 - x0), h: r.h / (y1 - y0) })) };
}
async function importPdf(file) {
  let bytes = new Uint8Array(await file.arrayBuffer()), password = null, js;
  // Passwortgeschützt? Passwort abfragen, Datei für die Weiterverarbeitung entschlüsseln
  for (;;) {
    try { js = await openPdf(bytes.slice(), { password: password ?? undefined }); break; }
    catch (e) {
      if (e.name !== 'PasswordException') {
        // Beschädigte PDF (z. B. abgebrochener Download, unvollständiger Anhang): lesbare Seiten retten, einmal versuchen
        if (file.repaired) throw new Error('Die Datei ist zu stark beschädigt – es ließen sich keine Seiten retten.');
        const fixed = await repairPdf(bytes).catch(() => null);
        if (!fixed) throw new Error('Die Datei ist beschädigt und ließ sich nicht reparieren.');
        bytes = fixed.bytes; file.repaired = fixed.pages;
        continue;
      }
      password = await askPassword(file.name, e.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD);
      if (password == null) { const err = new Error('abgebrochen'); err.name = 'AbortError'; throw err; }
    }
  }
  if (file.repaired) { toast(`„${file.name}“ war beschädigt und wurde repariert: ${file.repaired === 1 ? `${file.repaired} Seite` : `${file.repaired} Seiten`} gerettet. Bitte prüfen und neu speichern.`, 9000); logLine(`Reparatur: ${file.name}, ${file.repaired} Seite(n)`); }
  if (password != null) {
    status(`Entsperre ${file.name} …`);
    const C = await getCrypt();
    const doc = await C.PDFDocument.load(bytes, { ignoreEncryption: true, password, updateMetadata: false });
    bytes = await doc.save();
    js = await openPdf(bytes.slice());
  }
  const docIdx = state.docs.push({ bytes, js, lib: null, name: file.name, unlocked: password != null, repaired: file.repaired || 0, handle: window.pdfmyHandles?.get(file) || null }) - 1;
  try { js = (await importMarkup(state.docs[docIdx])) || js; } catch (e) { console.warn('Markierungen übernehmen:', e); }
  const formCheck = detectForm(docIdx);   // läuft parallel; Anzeige erst, wenn die Seiten da sind
  window.readOutline?.(docIdx);          // Lesezeichen für „Inhalt“ (js/pro.js)
  window.checkSignatures?.(docIdx, file);   // digitale Signaturen prüfen (js/pro.js, Original-Bytes der Datei)
  // ZUGFeRD/Factur-X/XRechnung im PDF eingebettet? Dann gelten die XML-Daten
  try {
    for (const a of await pdfAttachments(js)) {
      if (!/\.xml$/i.test(a.filename || '') || !a.content) continue;
      const xml = new TextDecoder().decode(a.content), d = EInvoice.parse(xml);
      if (d) { state.einv = { data: d, xml, xmlName: a.filename, original: password == null ? bytes.slice() : null, docIdx }; status(`E-Rechnung erkannt (${d.format}) – Daten aus dem eingebetteten XML übernommen.`); break; }
    }
  } catch (e) { console.warn('E-Rechnung:', e); }
  try { for (const a of await pdfAttachments(js)) if (a.filename === window.SigReq?.FILE && a.content) window.reqLoad?.(new TextDecoder().decode(a.content), docIdx, bytes); } catch (e) { console.warn('Unterschriftsanfrage:', e); }
  // Dateianhänge der Vorlage (Tabellen, Fotos, XML …) reisen beim Speichern mit – anzeigen, speichern, entfernen: Menü → Dateianhänge
  try {
    const own = (await pdfAttachments(js)).filter(a => a.content && a.filename && a.filename !== window.SigReq?.FILE);
    for (const a of own) state.files.push({ name: a.filename, data: new Uint8Array(a.content), desc: a.description || '', from: docIdx });
    if (own.length) setTimeout(() => status(own.length === 1 ? 'Die PDF enthält einen Dateianhang – Menü → Dateianhänge.' : `Die PDF enthält ${own.length} Dateianhänge – Menü → Dateianhänge.`), 1200);
    window.attRefresh?.();
  } catch (e) { console.warn('Dateianhänge:', e); }
  for (let i = 1; i <= js.numPages; i++) {
    const pg = await js.getPage(i);
    const tc = await pg.getTextContent();
    const text = tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').trim();
    const p = { id: ++uid, kind: 'pdf', docIdx, pageIdx: i - 1, rotation: pg.rotate || 0, annots: [], ocr: null,
      native: text.length > 20 ? text : null, hasText: /\S/.test(text), label: `${file.name} S. ${i}` };
    const mk = state.docs[docIdx].markup?.get(i - 1);
    if (mk) { const vp = pg.getViewport({ scale: 1, rotation: p.rotation }); for (const m of mk) { const an = markupAnnot(m, vp); if (an) p.annots.push(an); } }
    if (!p.native && S.scanPdf && await isScannedPage(pg)) {
      // Scan-PDF: Seite als Bild übernehmen und wie einen Scan aufbereiten (gerade richten, Ausrichtung, Kompakt-Speicherung)
      status(`Bereite Scan auf: ${file.name}, Seite ${i} von ${js.numPages} …`, (i - 1) / js.numPages);
      const vp = pg.getViewport({ scale: 1 });
      const dpi = Math.min(300, MAX_SIDE * 72 / Math.max(vp.width, vp.height));
      addScan(await renderPdf(p, dpi), `${file.name} S. ${i}`);
      continue;
    }
    // Große Dokumente: nur die ersten Seiten sofort zeichnen, die übrigen erst, wenn sie sichtbar werden (Maße aus dem Seitenformat)
    if (i <= PREVIEW_EAGER) await renderPdfPreview(p);
    else { const vp = pg.getViewport({ scale: 120 / 72, rotation: p.rotation }); p.w = Math.round(vp.width); p.h = Math.round(vp.height); if (p.native || p.hasText) p.blank = false; }
    if (i % 25 === 0) status(`Öffne ${file.name}: Seite ${i} von ${js.numPages} …`, i / js.numPages);
    if (i <= 2) try { readQr(p, await renderPdf(p, 200)); } catch (e) { console.warn('QR', e); }   // Zahl-QR steht auf den ersten Seiten
    state.pages.push(p);
  }
  await formCheck; renderForm();
  window.reqAfterImport?.(docIdx);
}

// "Automatisch": farbige Seiten behalten Farbe, alle anderen werden als Dokument (Graustufen, Papier weiß) aufbereitet
function effMode(p) {
  if (p.mode !== 'auto') return p.mode;
  return p.autoMode ||= Imaging.isColorful(p.orig) ? 'colordoc' : 'document';
}
function reprocess(p) {
  p.processed = Imaging.enhance(p.orig, effMode(p));
  p.w = p.processed.width; p.h = p.processed.height; p.thumb = null; p.thumbL = null; p.blank = p.separator ? true : undefined;
}

async function renderPdf(p, dpi) {
  const pg = await state.docs[p.docIdx].js.getPage(p.pageIdx + 1);
  const vp = pg.getViewport({ scale: dpi / 72, rotation: p.rotation });
  const c = Imaging.canvas(Math.round(vp.width), Math.round(vp.height));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  // intent 'print' rendert ohne requestAnimationFrame – läuft so auch in Hintergrund-Tabs weiter
  await pg.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
  return c;
}
const PREVIEW_EAGER = 6;   // so viele Seiten werden beim Öffnen sofort gezeichnet
// Vorschaubild einer PDF-Seite bei Bedarf zeichnen (einmal, auch bei gleichzeitigen Anfragen)
function ensurePreview(p) {
  if (!p || p.processed || p.kind !== 'pdf') return Promise.resolve();
  return p._pv ||= renderPdfPreview(p).catch(e => console.warn('Vorschau', e)).finally(() => { p._pv = null; });
}
// Vorschauen in der Seitenleiste und in der Übersicht erst zeichnen, wenn sie in Sichtweite kommen
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const lazyObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    const img = e.target; lazyObs.unobserve(img);
    const p = state.pages.find(x => x.id === +img.dataset.pid); if (!p) continue;
    ensurePreview(p).then(() => {
      if (!p.processed) return;
      if (img.dataset.large) { p.thumbL ||= makeThumbL(p.processed); img.src = p.thumbL; }
      else { p.thumb ||= makeThumb(p.processed); img.src = p.thumb; }
      if (p.blank === undefined) p.blank = Imaging.isBlank(p.processed);
    });
  }
}, { rootMargin: '600px 0px' }) : null;
function lazyImg(img, p, large) {
  img.src = BLANK_IMG; img.style.aspectRatio = `${p.w || 1} / ${p.h || 1.414}`; img.style.background = '#fff'; img.dataset.pid = p.id;
  if (large) img.dataset.large = '1';
  if (lazyObs) lazyObs.observe(img); else ensurePreview(p).then(() => { if (p.processed) img.src = large ? (p.thumbL ||= makeThumbL(p.processed)) : (p.thumb ||= makeThumb(p.processed)); });
}
const PREVIEW_KEEP = 60, previewLRU = [];
function previewUsed(p) {
  if (p.kind !== 'pdf') return;
  const k = previewLRU.indexOf(p); if (k >= 0) previewLRU.splice(k, 1); previewLRU.push(p);
  while (previewLRU.length > PREVIEW_KEEP) {
    const old = previewLRU.shift();
    if (old === cur() || old._pv) { previewLRU.push(old); if (previewLRU.length > PREVIEW_KEEP + 5) break; continue; }
    if (old.processed) { old.processed.width = 0; old.processed = null; }   // Bild freigeben – Vorschau (thumb) und Maße bleiben, neu zeichnen bei Bedarf
  }
}
// Seiten mit echtem Text (p.native, auch kurz: p.hasText) sind nie leer – auch wenn nur eine kurze Zeile darauf steht (sonst entfernte „Leerseiten weglassen“ sie)
async function renderPdfPreview(p) { p.processed = await renderPdf(p, 120); previewUsed(p); p.w = p.processed.width; p.h = p.processed.height; p.thumb = null; p.thumbL = null; p.blank = p.separator ? true : p.native || p.hasText ? false : undefined; }

const turn = (c, dir) => dir === 180 ? Imaging.rotate90(Imaging.rotate90(c, 90), 90) : Imaging.rotate90(c, dir);
function rotRect(r, dir) {
  const { x, y, w = 0, h = 0 } = r;
  if (dir === 90) { r.x = 1 - (y + h); r.y = x; } else { r.x = y; r.y = 1 - (x + w); }
  r.w = h; r.h = w;
}
async function rotatePage(p, dir) {
  const oldW = p.w;
  if (p.kind === 'image') { p.orig = turn(p.orig, dir); reprocess(p); }
  else { p.rotation = (p.rotation + dir + 360) % 360; await renderPdfPreview(p); }
  const steps = dir === 180 ? [90, 90] : [dir];
  for (const st of steps) {
    for (const a of p.annots) { rotRect(a, st); if (a.rects) a.rects.forEach(r => rotRect(r, st)); }
    if (p.ocr) { p.ocr.words.forEach(w => rotRect(w, st)); p.ocr.allWords?.forEach(w => rotRect(w, st)); }
  }
  for (const a of p.annots) if ((a.type === 'text' || a.type === 'note') && dir !== 180) a.fs *= oldW / p.w;
  for (const a of p.annots) if (a.type === 'note') { a.w = 0.26; a.x = clamp(a.x, 0, 0.74); }   // Notizen bleiben Notizzettel
  state.dirty = true;
}

/* ---------- Seitenleiste ---------- */
function makeThumb(c) {
  const t = Imaging.canvas(150, Math.round(c.height * 150 / c.width));
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}
const thumbBadge = p => p.blank ? 'leer' : p.native ? 'Text' : p.ocr ? 'OCR ✓' : p.busy ? 'OCR …' : p.failed ? 'OCR ✗' : (S.autoOcr && p.kind === 'image' && !p.ocr && !p.failed) ? 'OCR wartet' : '';
function renderThumbs() {
  const box = $('#thumbs');
  const key = state.pages.map(p => `${p.id}:${thumbBadge(p)}:${hitCount(p)}:${state.picked.has(p.id) ? 1 : 0}:${p.splitAfter ? 1 : 0}`).join('|') + '#' + state.query;
  if (key === renderThumbs.key && box.children.length === state.pages.length) {
    [...box.children].forEach((d, i) => { const on = i === state.sel; d.classList.toggle('sel', on); if (on) d.setAttribute('aria-current', 'page'); else d.removeAttribute('aria-current'); });
    return;
  }
  renderThumbs.key = key; box.innerHTML = '';
  state.pages.forEach((p, i) => {
    if (!p.thumb && p.processed && i < 24) p.thumb = makeThumb(p.processed);
    if (p.blank === undefined && p.processed) p.blank = Imaging.isBlank(p.processed);
    const d = document.createElement('div');
    d.className = 'thumb' + (i === state.sel ? ' sel' : '') + (state.picked.has(p.id) ? ' picked' : '') + (p.splitAfter ? ' split' : '');
    d.draggable = true; d.title = p.label + ' – Strg/Umschalt+Klick für Mehrfachauswahl';
    d.tabIndex = 0; d.setAttribute('role', 'group'); d.setAttribute('aria-label', `Seite ${i + 1} von ${state.pages.length}${p.blank ? ', leer' : ''}`);
    if (i === state.sel) d.setAttribute('aria-current', 'page');
    d.onkeydown = e => { if (e.target !== d) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickPage(i, e); refresh(); $('#thumbs').children[i]?.focus(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); d.nextElementSibling?.focus(); } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); d.previousElementSibling?.focus(); } };
    const waiting = S.autoOcr && p.kind === 'image' && !p.ocr && !p.failed;
    const badge = p.blank ? 'leer' : p.native ? 'Text' : p.ocr ? 'OCR ✓' : p.busy ? 'OCR …' : p.failed ? 'OCR ✗' : waiting ? 'OCR wartet' : '';
    const nHits = hitCount(p);
    if (nHits) d.classList.add('hit');
    d.innerHTML = `<img alt="Seite ${i + 1}"><div class="tmeta"><span>${i + 1}</span>${badge ? `<span class="badge">${badge}</span>` : ''}${nHits ? `<span class="hits" title="${nHits} Treffer für „${esc(state.query)}“">${nHits}×</span>` : ''}` +
      `<span><button class="tcut" title="Hier endet ein Brief (für „Stapel trennen“)">✂</button><button class="tdel" title="Seite löschen">×</button></span></div>`;
    if (p.thumb) d.querySelector('img').src = p.thumb; else lazyImg(d.querySelector('img'), p);
    d.onclick = e => { if (e.target.closest('button')) return; pickPage(i, e); state.annSel = null; state.crop = null; refresh(); };
    d.querySelector('.tdel').onclick = () => deletePages([p.id]);
    d.querySelector('.tcut').onclick = () => { p.splitAfter = !p.splitAfter; renderThumbs(); };
    d.ondragstart = e => { e.dataTransfer.setData('text/x-page', String(i)); e.dataTransfer.effectAllowed = 'move'; };
    d.ondragover = e => { if (e.dataTransfer.types.includes('text/x-page')) { e.preventDefault(); d.classList.add('over'); } };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => {
      if (!e.dataTransfer.types.includes('text/x-page')) return;
      e.preventDefault(); e.stopPropagation();
      const from = +e.dataTransfer.getData('text/x-page');
      const selId = cur()?.id, [m] = state.pages.splice(from, 1);
      state.pages.splice(i, 0, m); state.sel = state.pages.findIndex(x => x.id === selId); state.dirty = true; refresh(); analyze();
    };
    box.append(d);
  });
}

/* Auswahl: Klick = eine Seite, Strg = umschalten, Umschalt = Bereich */
function pickPage(i, e = {}) {
  const id = state.pages[i].id;
  if (e.shiftKey && state.anchor != null) {
    const a = state.pages.findIndex(x => x.id === state.anchor);
    const [lo, hi] = a < i ? [a, i] : [i, a];
    if (!(e.ctrlKey || e.metaKey)) state.picked.clear();
    for (let k = Math.max(0, lo); k <= hi; k++) state.picked.add(state.pages[k].id);
  } else if (e.ctrlKey || e.metaKey) {
    state.picked.has(id) ? state.picked.delete(id) : state.picked.add(id); state.anchor = id;
  } else { state.picked = new Set([id]); state.anchor = id; }
  state.sel = i;
}
// Ziel für Seitenaktionen: Mehrfachauswahl, sonst die aktuelle Seite
const targets = () => state.picked.size > 1 ? state.pages.filter(p => state.picked.has(p.id)) : (cur() ? [cur()] : []);

function deletePages(ids) {
  const set = new Set(ids);
  if (set.size > 1 && !confirm(`${set.size} Seiten löschen?`)) return;
  const selId = cur()?.id;
  state.pages = state.pages.filter(p => !set.has(p.id));
  ids.forEach(id => state.picked.delete(id));
  state.sel = set.has(selId) ? Math.min(state.sel, state.pages.length - 1) : state.pages.findIndex(p => p.id === selId);
  state.crop = null; state.dirty = true; refresh(); analyze();
  status(`${set.size} Seite(n) gelöscht.`);
}
function duplicatePages(list) {
  for (const p of [...list].reverse()) {
    const c = Object.assign({}, p, { id: ++uid, annots: JSON.parse(JSON.stringify(p.annots)), splitAfter: false, label: p.label + ' (Kopie)',
      ocr: p.ocr && { ...p.ocr, words: p.ocr.words.map(w => ({ ...w })), allWords: p.ocr.allWords?.map(w => ({ ...w })) } });
    state.pages.splice(state.pages.indexOf(p) + 1, 0, c);
  }
  state.dirty = true; refresh(); status(`${list.length} Seite(n) dupliziert.`);
}
function insertBlank() {
  const ref = cur(), c = Imaging.canvas(1240, 1754); // A4 bei 150 dpi
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (ref && ref.w > ref.h) { c.width = 1754; c.height = 1240; c.getContext('2d').fillStyle = '#fff'; c.getContext('2d').fillRect(0, 0, c.width, c.height); }
  const p = { id: ++uid, kind: 'image', orig: c, mode: 'original', rotation: 0, annots: [], ocr: null, native: null, label: 'Leerseite', keepBlank: true };
  reprocess(p); p.blank = false;
  const at = state.sel < 0 ? state.pages.length : state.sel + 1;
  state.pages.splice(at, 0, p); state.sel = at; state.picked = new Set([p.id]);
  state.dirty = true; refresh(); status('Leerseite eingefügt – z. B. für Notizen mit dem Text-Werkzeug.');
}
async function rotateTargets(dir) {
  const list = targets(); if (!list.length) return;
  for (const p of list) await rotatePage(p, dir);
  refresh();
}

/* ---------- Editor ---------- */
function refresh() {
  renderThumbs(); renderStage(); renderSide();
  const n = state.pages.length;
  $('#btnSave').disabled = $('#btnSaveAs').disabled = !n; $('#btnSplit').disabled = n < 2; $('#btnSplitAdv').disabled = n < 2; $('#btnHalve').disabled = $('#btnTranslate').disabled = $('#btnSummary').disabled = !n;
  $('#btnFile').hidden = !n;
  // Statuszeile: „Seite 2 von 11“ (wie in Word); Klick oder Strg+G springt zu einer Seite
  $('#pageNav').hidden = !n;
  if (n) $('#pageInd').textContent = state.view === 'grid' ? `${n === 1 ? `${n} Seite` : `${n} Seiten`}` : `Seite ${state.sel + 1} von ${n}`;
  $('#btnToc').hidden = !n;   // Inhalt/Lesezeichen: auch ohne vorhandene Lesezeichen, damit man welche anlegen kann
  document.body.classList.toggle('has-doc', n > 0);
  if (!n && !refresh.home) { refresh.home = true; window.renderRecent?.(); } else if (n) refresh.home = false;   // Startseite: „Zuletzt geöffnet“ auffrischen
  window.renderTabs?.();   // Reiter: Name und „ungespeichert“ aktuell halten
  window.renderSigBar?.();   // Signaturleiste
  window.rescueTick?.();   // Absturzschutz: Änderungen lokal sichern
  if (!n && $('#findBar')) { $('#findBar').hidden = true; state.findCur = null; }   // Suchleiste schließt mit dem Dokument
  $('#viewer').tabIndex = n ? 0 : -1;   // Seitenansicht nur mit Dokument per Tab erreichbar
  if (state.view === 'grid') renderGrid();
}

function renderStage() {
  const p = cur(), stage = $('#stage');
  $('#empty').hidden = !!p; stage.hidden = !p || state.view === 'grid';
  $('#grid').hidden = !p || state.view !== 'grid';
  $('#toolbar').classList.toggle('gridview', state.view === 'grid');
  const cropping = !!(p && state.crop && state.crop.id === p.id);
  $('#toolbar').classList.toggle('cropping', cropping);
  if (!p) { renderFlow(0); return; }
  updateToolbar();
  if (p.kind === 'image') $('#mode').value = p.mode;
  $('#mode').disabled = p.kind !== 'image';
  $('#btnCrop').disabled = p.kind !== 'image';
  let src = cropping ? p.orig : p.processed;
  if (!src) {   // Vorschau noch nicht gezeichnet (großes Dokument): weiße Seite im richtigen Format, gleich danach das Bild
    ensurePreview(p).then(() => { if (cur() === p && p.processed) renderStage(); });
    src = { width: p.w || 1000, height: p.h || 1414, pending: true };
  }
  const avail = Math.max(240, $('#viewer').clientWidth - 32);
  const w = Math.round(Math.min(avail, 900) * state.zoom), h = Math.round(w * src.height / src.width);
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  const cv = $('#cv'), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  if (src.pending) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); } else ctx.drawImage(src, 0, 0, cv.width, cv.height);
  cv.setAttribute('aria-label', `Seite ${state.sel + 1} von ${state.pages.length}` + (state.meta.type || state.meta.sender ? `: ${[state.meta.type, state.meta.sender].filter(Boolean).join(' von ')}` : '') + '. Der erkannte Text steht rechts unter „Erkannter Text“.');
  renderAnns();
  renderFlow(w);
}

/* ---------- Fortlaufende Ansicht: Mausrad scrollt durch das ganze Dokument (wie in Word) ----------
   Die übrigen Seiten stehen als Bilder über und unter der aktiven Seite; sie werden erst gezeichnet, wenn sie in die Nähe kommen.
   Wer weiterscrollt, macht die Seite in der Bildmitte zur aktiven – „Seite X von Y“ und die Vorschau laufen mit. */
let flowKey = '', flowSel = -1, flowSync = false, flowObs = null;
const pageRatio = p => { const s = p.processed || p.orig; return s && s.width ? s.height / s.width : p.w && p.h ? p.h / p.w : 1.4142; };
let flowTiles = [];
function renderFlow(w) {
  const before = $('#flowBefore'), after = $('#flowAfter'), p = cur();
  const off = !p || state.view === 'grid' || (state.crop && state.crop.id === p.id);
  // Aufbau (Seiten, Anmerkungen, Breite) und Auswahl getrennt: beim Blättern werden die Kacheln nur umgehängt –
  // schon gezeichnete Seiten bleiben erhalten (große Dokumente blättern so flüssig)
  const layout = off ? 'off' : state.pages.map(q => q.id + ':' + q.annots.length).join(',') + '|' + w;
  const key = layout + '|' + state.sel;
  if (key === flowKey) return;
  const rebuild = !flowKey || flowKey.slice(0, flowKey.lastIndexOf('|')) !== layout;
  flowKey = key;
  if (off) { before.innerHTML = after.innerHTML = ''; flowObs?.disconnect(); flowTiles = []; flowSel = -1; return; }
  if (rebuild) {
    flowObs?.disconnect();
    flowObs = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { drawFlowPage(e.target); flowObs.unobserve(e.target); } }, { root: $('#viewer'), rootMargin: '800px 0px' });
    flowTiles = state.pages.map((q, i) => {
      const d = document.createElement('div');
      d.className = 'flowpage'; d.dataset.i = i; d.style.width = w + 'px'; d.style.height = Math.round(w * pageRatio(q)) + 'px';
      d.setAttribute('role', 'img'); d.setAttribute('aria-label', `Seite ${i + 1} von ${state.pages.length}`);
      d.innerHTML = `<span class="pnum" aria-hidden="true">${i + 1}</span>`;
      d.onclick = () => flowActivate(i, true);
      flowObs.observe(d);
      return d;
    });
  }
  before.replaceChildren(...flowTiles.slice(0, state.sel));
  after.replaceChildren(...flowTiles.slice(state.sel + 1));
  // Seitenwechsel von außen (Vorschau, Bild ab, Strg+G): aktive Seite in den Blick holen
  if (!flowSync && flowSel !== state.sel && flowSel !== -1) $('#stage').scrollIntoView({ block: 'start' });
  flowSel = state.sel;
}
async function drawFlowPage(d) {
  const q = state.pages[+d.dataset.i]; if (q && !q.processed && q.kind === 'pdf') await ensurePreview(q);
  const src = q && (q.processed || q.orig); if (!src) return;
  const dpr = window.devicePixelRatio || 1, cw = Math.round(d.clientWidth * dpr), ch = Math.round(d.clientHeight * dpr);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, cw, ch);
  try { await drawAnnotsCanvas(x, q, cw, ch); } catch {}
  d.prepend(c);
}
// Seite i aktiv machen und dabei die Bildposition halten (kein Springen)
function flowActivate(i, toTop) {
  if (i === state.sel || i < 0 || i >= state.pages.length) return;
  const v = $('#viewer'), el = document.querySelector(`.flowpage[data-i="${i}"]`);
  const off = el ? el.getBoundingClientRect().top - v.getBoundingClientRect().top : 0;
  flowSync = true; state.sel = i; refresh(); flowSync = false;
  const st = $('#stage').getBoundingClientRect().top - v.getBoundingClientRect().top;
  v.scrollTop += toTop ? st - 16 : st - off;
  $('#thumbs').children[i]?.scrollIntoView({ block: 'nearest' });
}
let flowTick = 0;
$('#viewer').addEventListener('scroll', () => {
  if (flowTick || state.view !== 'page' || !cur()) return;
  flowTick = requestAnimationFrame(() => {
    flowTick = 0;
    const v = $('#viewer'), r = v.getBoundingClientRect(), line = r.top + r.height * 0.4;
    const st = $('#stage').getBoundingClientRect();
    if (st.top <= line && st.bottom > line) return;   // aktive Seite ist noch im Blick
    for (const d of document.querySelectorAll('.flowpage')) { const b = d.getBoundingClientRect(); if (b.top <= line && b.bottom > line) { flowActivate(+d.dataset.i, false); break; } }
  });
}, { passive: true });

function placeEl(el, a) {
  el.style.left = a.x * 100 + '%'; el.style.top = a.y * 100 + '%';
  if (a.type !== 'text') { el.style.width = a.w * 100 + '%'; if (a.type !== 'note') el.style.height = a.h * 100 + '%'; }
  else {
    if (a.w > 0) { el.style.width = a.w / (a.sx || 1) * 100 + '%'; el.style.whiteSpace = 'pre-wrap'; }   // Absatz: Umbruch an der Absatzbreite
    if (a.sx) { el.style.transform = `scaleX(${a.sx})`; el.style.transformOrigin = 'left top'; }        // Laufweite wie im Original
  }
}
/* ---------- Textmarker: Wörter treffen, Farben, Unterstreichen/Durchstreichen ---------- */
const HL_DARK = { '#ffd400': '#c99a00', '#7ee081': '#1f9d3a', '#7cc4ff': '#1d6fd6', '#ff8fc8': '#d6337f', '#ffad5c': '#e06a00' };   // Linienfarbe beim Unter-/Durchstreichen
const hlRgba = (hex, al) => { const n = parseInt((hex || '#ffd400').slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${al})`; };
const hlLine = a => HL_DARK[a.color] || a.color || '#c99a00';
// Wörter der Seite (Texterkennung oder Textebene der PDF); lädt die Textebene bei Bedarf nach
function hlWords(p) {
  if (p.ocr?.words?.length) return p.ocr.words;
  if (p.kind === 'pdf' && p.native && p.nwords === undefined) { p.nwords = null; nativeWords(p).then(w => { p.nwords = w || []; }).catch(() => { p.nwords = []; }); }
  return p.nwords || null;
}
// Zeilen in Lesereihenfolge mit fortlaufender Wortnummer
function hlIndex(items) {
  // PDF-Textebene liefert ganze Textstücke: anteilig nach Zeichen in Wörter teilen
  const words = items.flatMap(w => {
    const t = String(w.t); if (!/\s/.test(t.trim())) return [w];
    // Breiten mit der Schrift messen (Proportionalschrift: „m“ ist breiter als „i“); Serifenschrift, wenn die PDF eine nutzt
    const g = hlIndex.g || (hlIndex.g = document.createElement('canvas').getContext('2d'));
    g.font = `100px ${/serif|times|roman|georgia|garamond/i.test(w.f?.font || '') && !/sans/i.test(w.f?.font || '') ? 'Times New Roman, serif' : 'Arial, Helvetica, sans-serif'}`;
    const full = g.measureText(t).width || 1, out = []; let pre = '';
    for (const part of t.split(/(\s+)/)) {
      if (part.trim()) { const x0 = g.measureText(pre).width / full, pw = g.measureText(part).width / full; out.push({ ...w, t: part, x: w.x + x0 * w.w, w: pw * w.w }); }
      pre += part;
    }
    return out;
  });
  const lines = textLines(words).map(ws => ({ ws, top: Math.min(...ws.map(w => w.y)), bot: Math.max(...ws.map(w => w.y + w.h)) }));
  const seq = []; lines.forEach((l, li) => l.ws.forEach(w => seq.push({ w, li })));
  return { lines, seq };
}
// Wort unter dem Zeiger (mit etwas Spielraum) – sonst -1 (dann Rechteck wie bisher)
function hlWordAt(ix, q) {
  let best = -1, bd = Infinity;
  ix.seq.forEach(({ w }, i) => {
    const dx = Math.max(w.x - q.x, 0, q.x - (w.x + w.w)), dy = Math.max(w.y - q.y, 0, q.y - (w.y + w.h)), d = Math.hypot(dx, dy * 1.5);
    if (d < bd) { bd = d; best = i; }
  });
  return best >= 0 && bd < Math.max(ix.seq[best].w.h * 0.6, 0.004) ? best : -1;
}
// Nächstes Wort zum Zeiger: erst die Zeile, dann in der Zeile das Wort (rechts vom Zeilenende → letztes Wort)
function hlNearest(ix, q) {
  let li = 0, bd = Infinity;
  ix.lines.forEach((l, i) => { const d = q.y < l.top ? l.top - q.y : q.y > l.bot ? q.y - l.bot : 0; if (d < bd) { bd = d; li = i; } });
  let best = -1, bx = Infinity;
  ix.seq.forEach(({ w, li: l }, i) => { if (l !== li) return; const d = Math.max(w.x - q.x, 0, q.x - (w.x + w.w)); if (d < bx) { bx = d; best = i; } });
  return best;
}
// Markierung auf die Wörter i…j legen: ein Rechteck je Zeile, relativ zur Gesamtbox gespeichert
function hlSnap(a, ix, i, j) {
  const [m, n] = i <= j ? [i, j] : [j, i], sel = ix.seq.slice(m, n + 1), by = new Map();
  for (const { w, li } of sel) { const r = by.get(li); if (r) { r.x0 = Math.min(r.x0, w.x); r.x1 = Math.max(r.x1, w.x + w.w); r.y0 = Math.min(r.y0, w.y); r.y1 = Math.max(r.y1, w.y + w.h); } else by.set(li, { x0: w.x, x1: w.x + w.w, y0: w.y, y1: w.y + w.h }); }
  const rs = [...by.values()].map(r => { const pad = (r.y1 - r.y0) * 0.12; return { x: r.x0 - pad * 0.4, y: r.y0 - pad, w: r.x1 - r.x0 + pad * 0.8, h: r.y1 - r.y0 + pad * 2 }; });
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y)), x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h));
  Object.assign(a, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rects: rs.map(r => ({ x: (r.x - x0) / (x1 - x0), y: (r.y - y0) / (y1 - y0), w: r.w / (x1 - x0), h: r.h / (y1 - y0) })), text: sel.map(o => o.w.t).join(' ') });
}
// Darstellung in der Seitenansicht
function hlPaint(el, a) {
  el.innerHTML = ''; el.classList.toggle('rects', !!a.rects || a.style === 'ul' || a.style === 'st');
  el.title = (a.style === 'ul' ? 'Unterstrichen' : a.style === 'st' ? 'Durchgestrichen' : 'Markiert') + (a.text ? `: „${a.text.length > 80 ? a.text.slice(0, 80) + ' …' : a.text}“` : '') + (a.comment ? ` – ${a.author ? a.author + ': ' : ''}${a.comment}` : '');
  for (const r of a.rects || [{ x: 0, y: 0, w: 1, h: 1 }]) {
    const d = document.createElement('div'); d.className = 'hr';
    d.style.left = r.x * 100 + '%'; d.style.top = r.y * 100 + '%'; d.style.width = r.w * 100 + '%'; d.style.height = r.h * 100 + '%';
    if (a.style === 'ul') d.style.borderBottom = `2px solid ${hlLine(a)}`;
    else if (a.style === 'st') d.style.background = `linear-gradient(transparent calc(55% - 1px), ${hlLine(a)} calc(55% - 1px), ${hlLine(a)} calc(55% + 1px), transparent calc(55% + 1px))`;
    else d.style.background = hlRgba(a.color, 0.42);
    el.append(d);
  }
}
function renderAnns() {
  const ov = $('#overlay'), p = cur(); ov.innerHTML = ''; if (!p) return;
  if (state.crop && state.crop.id === p.id) { renderCrop(ov); return; }
  ov.className = 't-' + state.tool;
  const W = ov.clientWidth;
  // Treffer markieren – bei Scans aus der Texterkennung, bei normalen PDFs aus der vorhandenen Textebene
  if (state.query) {
    let words = p.ocr?.words;
    if (!words && p.kind === 'pdf' && p.native) {
      if (p.nwords === undefined) { p.nwords = null; nativeWords(p).then(w => { p.nwords = w || []; if (cur() === p) renderAnns(); }); }
      words = p.nwords;
    }
    const fc = state.findCur && state.findCur.id === p.id ? state.findCur.k : -1; let fi = 0;
    for (const w of words || []) if (w.t.toLowerCase().includes(state.query) && !coveredWord(p, w)) {
      const f = document.createElement('div'); f.className = fi++ === fc ? 'found cur' : 'found'; placeEl(f, w); ov.append(f);
    }
  }
  let editEl = null;
  for (const a of p.annots) {
    const el = document.createElement('div');
    el.className = `ann ${a.type}${a.id === state.annSel ? ' sel' : ''}`; el.dataset.id = a.id;
    el.setAttribute('translate', 'no');   // Inhalt des Dokuments (Stempel, Notiz, Text) – nicht in die Oberflächensprache übersetzen
    placeEl(el, a);
    if (a.type === 'sign' || a.type === 'img') el.style.backgroundImage = `url(${a.img})`;
    if (a.type === 'shape') el.innerHTML = shapeSvg(a, W, ov.clientHeight);
    if (a.type === 'wo' && a.fill) { el.style.background = a.fill; el.style.boxShadow = 'none'; }
    if (a.type === 'wo' && a.mark) el.classList.add('mark');
    if (a.type === 'link') { const l = document.createElement('span'); l.className = 'fl'; l.textContent = linkLabel(a); el.append(l); el.title = `Link: ${linkLabel(a)} – Doppelklick zum Ändern`; }
    if (a.type === 'field') { el.classList.add(a.ftype); const l = document.createElement('span'); l.className = 'fl'; l.textContent = fieldLabel(a); el.append(l); el.title = `Formularfeld „${a.name}“${a.req ? ' (Pflichtfeld)' : ''} – Doppelklick zum Ändern`; }
    if (a.type === 'ink') el.innerHTML = inkSvg(a, W);
    if (a.type === 'hl') hlPaint(el, a);
    if (a.type === 'stamp') { el.textContent = a.text; el.style.color = a.color; el.style.fontSize = a.h * ov.clientHeight * 0.3 + 'px'; el.style.borderWidth = Math.max(2, a.h * ov.clientHeight * 0.06) + 'px'; }
    if (a.type === 'text' || a.type === 'note') {
      el.textContent = a.text; el.style.fontSize = a.fs * W + 'px';
      if (a.type === 'text') { el.style.color = a.color; el.style.fontFamily = FONT_CSS[fontFam(a)]; if (a.lh) el.style.lineHeight = a.lh; if (a.bold) el.style.fontWeight = '700'; if (a.italic && fontFam(a) !== 'mono') el.style.fontStyle = 'italic'; }
      else el.dataset.head = noteHead(a);
      if (state.editing === a.id) { el.contentEditable = 'true'; editEl = el; el.addEventListener('focusout', () => finishEdit(p, a, el)); }
    } else if (a.id === state.annSel) { const h = document.createElement('div'); h.className = 'handle'; el.append(h); }
    ov.append(el);
  }
  window.renderSignSpots?.(ov, p);   // „Hier unterschreiben“-Schilder beim Werkzeug „Unterschrift“
  window.reqRender?.(ov, p);   // Felder einer Unterschriftsanfrage (js/pro.js)
  if (state.docs.some(d => d.sigs?.length)) window.renderSigBar?.();   // Signaturleiste: „unverändert“/„Mitunterzeichnen“ aktuell halten
  // Notizen wachsen mit dem Text – Höhe für Auswahl, Drehen und Export merken
  for (const a of p.annots) if (a.type === 'note') { const el = ov.querySelector(`[data-id="${a.id}"]`); if (el && ov.clientHeight) a.h = el.offsetHeight / ov.clientHeight; }
  if (editEl) {
    editEl.focus();
    const r = document.createRange(); r.selectNodeContents(editEl); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
}
const noteHead = a => 'Notiz · ' + a.at + (a.by ? ' · ' + a.by : '');
// Zeilenumbruch nach Breite (für Notizen in PDF und Bild)
function wrapLines(text, maxW, meas) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const t = line + word;
      if (line.trim() && word.trim() && meas(t.trimEnd()) > maxW) { out.push(line.trimEnd()); line = word; } else line = t;
    }
    out.push(line.trimEnd());
  }
  return out;
}
/* Formen (Rechteck, Ellipse, Linie, Pfeil): a.fx/a.fy = Linie beginnt rechts bzw. unten. Pfeilspitze am Ende. */
function shapeEnds(a) { return [[a.fx ? 1 : 0, a.fy ? 1 : 0], [a.fx ? 0 : 1, a.fy ? 0 : 1]]; }
function arrowHead(x0, y0, x1, y1, lw) {
  const L = Math.max(lw * 5, 10), ang = Math.atan2(y1 - y0, x1 - x0), sp = 0.42;
  return [[x1, y1], [x1 - L * Math.cos(ang - sp), y1 - L * Math.sin(ang - sp)], [x1 - L * Math.cos(ang + sp), y1 - L * Math.sin(ang + sp)]];
}
function shapeSvg(a, pw, ph) {
  const w = a.w * pw, h = a.h * ph, lw = Math.max(1, a.lw * pw), c = a.color, f = a.fill ? `fill="${c}" fill-opacity="0.2"` : 'fill="none"';
  let body;
  if (a.kind === 'rect') body = `<rect x="${lw / 2}" y="${lw / 2}" width="${Math.max(0, w - lw)}" height="${Math.max(0, h - lw)}" ${f} stroke="${c}" stroke-width="${lw}"/>`;
  else if (a.kind === 'ellipse') body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, (w - lw) / 2)}" ry="${Math.max(0, (h - lw) / 2)}" ${f} stroke="${c}" stroke-width="${lw}"/>`;
  else {
    const [[sx, sy], [ex, ey]] = shapeEnds(a), x0 = sx * w, y0 = sy * h, x1 = ex * w, y1 = ey * h;
    body = `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${c}" stroke-width="${lw}" stroke-linecap="round"/>`;
    if (a.kind === 'arrow') body += `<polygon points="${arrowHead(x0, y0, x1, y1, lw).map(q => q.join(',')).join(' ')}" fill="${c}"/>`;
  }
  return `<svg width="${Math.max(1, w)}" height="${Math.max(1, h)}" aria-hidden="true">${body}</svg>`;
}
function inkSvg(a, W) {
  const pts = a.pts.map(([x, y]) => `${(x * 1000).toFixed(1)},${(y * 1000).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${a.color}" stroke-width="${Math.max(1, a.lw * W)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
const STAMP_COLORS = { 'EINGEGANGEN': '#1d4ed8', 'BEZAHLT': '#15803d', 'ERLEDIGT': '#15803d', 'GEPRÜFT': '#15803d', 'GEBUCHT': '#1d4ed8' };
function finishEdit(p, a, el) {
  if (state.editing !== a.id) return;
  const text = el.innerText.replace(/\n$/, '');
  // „Text ändern“ ohne Änderung: Abdeckung und Ersatztext wieder entfernen
  if (a.cover && text === a.orig) {
    p.annots = p.annots.filter(x => x.id !== a.id && x.id !== a.cover); state.editing = null; state.annSel = null; renderAnns();
    return status('Text unverändert.');
  }
  if (text !== a.text) pushUndo(p);
  a.text = text; state.editing = null;
  if (!a.text.trim()) { p.annots.splice(p.annots.indexOf(a), 1); state.annSel = null; }
  state.dirty = true; renderAnns();
}

// Rückgängig: ein Eintrag je Seite – oder eine Gruppe { g: [...] }, wenn eine Aktion mehrere Seiten ändert (z. B. „Alle ersetzen“)
function pushUndo(p) {
  const snap = { id: p.id, a: JSON.stringify(p.annots) };
  if (state.undoBatch) { if (!state.undoBatch.some(x => x.id === p.id)) state.undoBatch.push(snap); return; }   // erster Stand je Seite zählt
  state.undo.push(snap); if (state.undo.length > 60) state.undo.shift(); state.redo = [];
}
// Mehrseitige Aktion als EIN Rückgängig-Schritt: undoGroup(async () => { … pushUndo(p) … })
async function undoGroup(fn) {
  const outer = state.undoBatch; state.undoBatch = outer || [];
  try { return await fn(); }
  finally {
    if (!outer) {
      const b = state.undoBatch; state.undoBatch = null;
      if (b.length) { state.undo.push(b.length === 1 ? b[0] : { g: b }); if (state.undo.length > 60) state.undo.shift(); state.redo = []; }
    }
  }
}
function restoreSnap(from, to, empty) {
  const u = from.pop(); if (!u) return status(empty);
  const items = (u.g || [u]).filter(s => state.pages.some(x => x.id === s.id));
  if (!items.length) return restoreSnap(from, to, empty);
  const back = items.map(s => ({ id: s.id, a: JSON.stringify(state.pages.find(x => x.id === s.id).annots) }));
  to.push(back.length === 1 ? back[0] : { g: back });
  for (const s of items) state.pages.find(x => x.id === s.id).annots = JSON.parse(s.a);
  state.sel = state.pages.findIndex(x => x.id === items[0].id); state.annSel = null; state.editing = null; state.dirty = true; refresh();
  if (items.length > 1) status(`${from === state.undo ? 'Rückgängig' : 'Wiederhergestellt'}: ${items.length} Seiten`);
}
const undo = () => restoreSnap(state.undo, state.redo ||= [], 'Nichts zum Rückgängigmachen.');
const redo = () => restoreSnap(state.redo ||= [], state.undo, 'Nichts zum Wiederherstellen.');

function drag(e, move, up) {
  e.preventDefault();
  const mv = ev => move(ev);
  const u = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', u); up && up(ev); };
  addEventListener('pointermove', mv); addEventListener('pointerup', u);
}

$('#overlay').addEventListener('pointerdown', e => {
  const p = cur(); if (!p || e.target.isContentEditable || e.button !== 0) return;
  if (e.target.closest('.signspot, .reqf')) return;   // „Hier unterschreiben“-Schild bzw. Feld einer Unterschriftsanfrage: eigener Klick (js/pro.js)
  const ov = $('#overlay'), r = ov.getBoundingClientRect();
  const pt = ev => ({ x: clamp((ev.clientX - r.left) / r.width), y: clamp((ev.clientY - r.top) / r.height) });
  const s = pt(e);
  if (window.reqPlaceClick?.(p, s)) { e.preventDefault(); return; }   // Unterschriftsanfrage: Feld für eine Person setzen (js/pro.js)
  if (state.crop) {
    const h = e.target.closest('.ch'); if (!h) return;
    const i = +h.dataset.i;
    drag(e, ev => { const q = pt(ev); state.crop.corners[i] = [q.x, q.y]; h.style.left = q.x * 100 + '%'; h.style.top = q.y * 100 + '%'; updateCropPoly(); });
    return;
  }
  const annEl = e.target.closest('.ann');
  if (state.tool === 'select') {
    if (!annEl) { if (state.annSel) { state.annSel = null; renderAnns(); } return; }
    const a = p.annots.find(x => x.id == annEl.dataset.id);
    if (state.annSel !== a.id) { state.annSel = a.id; renderAnns(); }
    const el = ov.querySelector(`[data-id="${a.id}"]`), resize = e.target.classList.contains('handle');
    const o = { x: a.x, y: a.y, w: a.w, h: a.h };
    let moved = false;
    drag(e, ev => {
      const q = pt(ev);
      if (!moved) { pushUndo(p); moved = true; }
      if (resize) {
        a.w = Math.max(0.01, o.w + q.x - s.x);
        a.h = a.type === 'sign' || a.type === 'img' ? a.w * a.ar * p.w / p.h : Math.max(a.type === 'shape' ? 0 : 0.005, o.h + q.y - s.y);
      } else { a.x = o.x + q.x - s.x; a.y = o.y + q.y - s.y; }
      placeEl(el, a); state.dirty = true;
      if (a.type === 'shape') { el.querySelector('svg')?.remove(); el.insertAdjacentHTML('afterbegin', shapeSvg(a, ov.clientWidth, ov.clientHeight)); }
    });
  } else if (state.tool === 'hl') {
    e.preventDefault();
    const words = hlWords(p), ix = words?.length ? hlIndex(words) : null, i0 = ix ? hlWordAt(ix, s) : -1;
    pushUndo(p);
    const a = { id: ++uid, type: 'hl', x: s.x, y: s.y, w: 0, h: 0, color: S.hlColor, style: S.hlStyle };
    if (i0 >= 0) hlSnap(a, ix, i0, i0);
    p.annots.push(a); renderAnns();
    const el = ov.querySelector(`[data-id="${a.id}"]`);
    drag(e, ev => {
      const q = pt(ev);
      if (i0 >= 0) { const j = hlNearest(ix, q); if (j >= 0) hlSnap(a, ix, i0, j); }
      else { a.x = Math.min(s.x, q.x); a.y = Math.min(s.y, q.y); a.w = Math.abs(q.x - s.x); a.h = Math.abs(q.y - s.y); }
      placeEl(el, a); hlPaint(el, a);
    }, () => {
      if (i0 < 0 && (a.w < 0.005 || a.h < 0.003)) { p.annots.splice(p.annots.indexOf(a), 1); state.undo.pop(); if (!ix && p.kind === 'image' && !p.ocr) status('Zum Markieren einzelner Wörter zuerst die Texterkennung abwarten – oder einen Bereich aufziehen.'); renderAnns(); return; }
      if (i0 < 0 && ix) {   // Rechteck aufgezogen: Text darunter merken (für Kommentarliste und PDF)
        a.text = ix.seq.filter(({ w }) => { const cx = w.x + w.w / 2, cy = w.y + w.h / 2; return cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h; }).map(o => o.w.t).join(' ');
      }
      state.dirty = true; state.annSel = a.id;
      status(`${a.style === 'ul' ? 'Unterstrichen' : a.style === 'st' ? 'Durchgestrichen' : 'Markiert'}${a.text ? `: „${a.text.length > 60 ? a.text.slice(0, 60) + ' …' : a.text}“` : ''} – Farbe und Art oben ändern, Entf löscht.`);
      renderAnns();
    });
  } else if (['rd', 'wo', 'field', 'link'].includes(state.tool)) {
    if (state.tool === 'wo' && pageProt(p) !== 'urkunde' && sigWarn(p, () => status('Jetzt den Bereich zum Abdecken aufziehen.'))) { e.preventDefault(); return; }
    pushUndo(p);
    const a = { id: ++uid, type: state.tool, x: s.x, y: s.y, w: 0, h: 0 };
    if (a.type === 'field') { a.ftype = $('#fieldType').value; a.name = $('#fieldName').value.trim(); a.req = $('#fieldReq').checked; }
    p.annots.push(a); renderAnns();
    const el = ov.querySelector(`[data-id="${a.id}"]`);
    drag(e, ev => {
      const q = pt(ev);
      a.x = Math.min(s.x, q.x); a.y = Math.min(s.y, q.y); a.w = Math.abs(q.x - s.x); a.h = Math.abs(q.y - s.y); placeEl(el, a);
    }, () => {
      if (a.type === 'field') { fieldDone(p, a); renderAnns(); return; }
      if (a.type === 'link') { if (a.w < 0.01 || a.h < 0.006 || !linkAsk(p, a)) { p.annots.splice(p.annots.indexOf(a), 1); state.undo.pop(); } renderAnns(); return; }
      const prot = a.type === 'wo' ? pageProt(p) : '';
      if (prot === 'urkunde') { p.annots.splice(p.annots.indexOf(a), 1); state.undo.pop(); status(PROT_MSG.urkunde); }
      else if (a.w < 0.005 || a.h < 0.003) { p.annots.splice(p.annots.indexOf(a), 1); state.undo.pop(); }
      else if (prot) { a.mark = true; state.dirty = true; status(PROT_MSG[prot]); }
      else {
        state.dirty = true;
        status(`${a.type === 'rd' ? 'Schwärzung' : 'Abdeckung'}: Die Seite wird beim Speichern als Bild übernommen, der verdeckte Text wird entfernt.`);
      }
      renderAnns();
    });
  } else if (state.tool === 'shape') {
    // Form aufziehen: Rechteck/Ellipse im Rahmen, Linie/Pfeil vom Startpunkt zum Endpunkt (Umschalt: waagerecht/senkrecht)
    e.preventDefault(); pushUndo(p);
    const a = { id: ++uid, type: 'shape', kind: $('#shapeKind').value, color: $('#shapeColor').value, lw: +$('#shapeLw').value, fill: $('#shapeFill').checked, x: s.x, y: s.y, w: 0, h: 0, fx: false, fy: false };
    p.annots.push(a); renderAnns();
    const el = ov.querySelector(`[data-id="${a.id}"]`);
    drag(e, ev => {
      let q = pt(ev);
      if (ev.shiftKey && (a.kind === 'line' || a.kind === 'arrow')) q = Math.abs(q.x - s.x) * r.width > Math.abs(q.y - s.y) * r.height ? { x: q.x, y: s.y } : { x: s.x, y: q.y };
      a.x = Math.min(s.x, q.x); a.y = Math.min(s.y, q.y); a.w = Math.abs(q.x - s.x); a.h = Math.abs(q.y - s.y); a.fx = q.x < s.x; a.fy = q.y < s.y;
      placeEl(el, a); el.innerHTML = shapeSvg(a, ov.clientWidth, ov.clientHeight);
    }, () => {
      if (a.w < 0.008 && a.h < 0.008) { p.annots.splice(p.annots.indexOf(a), 1); state.undo.pop(); status('Form aufziehen: Maustaste gedrückt halten und ziehen.'); return renderAnns(); }
      state.dirty = true; state.annSel = a.id; renderAnns();
      status('Form gesetzt – Art, Farbe und Strichstärke oben ändern, zum Verschieben ziehen, Entf löscht.');
    });
  } else if (state.tool === 'edit') {
    e.preventDefault();
    const hitEl = e.target.closest('.ann.text');
    if (hitEl) { state.editing = +hitEl.dataset.id; state.annSel = state.editing; renderAnns(); return; }
    editLineAt(p, s);
  } else if (state.tool === 'text') {
    e.preventDefault();
    const add = () => {
      pushUndo(p);
      const a = { id: ++uid, type: 'text', x: s.x, y: s.y, w: 0, h: 0, text: '', fs: +$('#fs').value, color: $('#color').value };
      p.annots.push(a); state.editing = a.id; state.annSel = a.id; setTool('select');
    };
    if (!sigWarn(p, add)) add();
  } else if (state.tool === 'note') {
    e.preventDefault(); pushUndo(p);
    const w = 0.26, a = { id: ++uid, type: 'note', x: clamp(s.x, 0, 1 - w), y: s.y, w, h: 0.05, text: '', fs: 0.0135, at: new Date().toLocaleDateString('de-DE'), by: S.author || '' };
    p.annots.push(a); state.editing = a.id; state.annSel = a.id; setTool('select');
    status('Notiz schreiben – sie wird beim Speichern gut lesbar auf die Seite gedruckt. Doppelklick bearbeitet, Entf löscht.');
  } else if (state.tool === 'ink') {
    // Freihand: Punkte sammeln, am Ende auf das umschließende Rechteck normieren (dann verschieb- und skalierbar)
    pushUndo(p);
    const a = { id: ++uid, type: 'ink', x: 0, y: 0, w: 1, h: 1, pts: [[s.x, s.y]], color: $('#color').value, lw: 0.0035 };
    p.annots.push(a); renderAnns();
    let el = ov.querySelector(`[data-id="${a.id}"]`);
    drag(e, ev => { const q = pt(ev); a.pts.push([q.x, q.y]); el.innerHTML = inkSvg(a, ov.clientWidth); }, () => {
      if (a.pts.length < 2) { p.annots.splice(p.annots.indexOf(a), 1); state.undo.pop(); return renderAnns(); }
      const xs = a.pts.map(q => q[0]), ys = a.pts.map(q => q[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(0.004, Math.max(...xs) - x0), h = Math.max(0.004, Math.max(...ys) - y0);
      a.pts = a.pts.map(([x, y]) => [(x - x0) / w, (y - y0) / h]); Object.assign(a, { x: x0, y: y0, w, h });
      state.dirty = true; renderAnns();
    });
  } else if (state.tool === 'stamp') {
    e.preventDefault(); pushUndo(p);
    const word = $('#stampText').value, today = new Date().toLocaleDateString('de-DE');
    const w = 0.26, h = w * 0.36 * p.w / p.h;
    const a = { id: ++uid, type: 'stamp', text: word + ($('#stampDate').checked ? '\n' + today : ''), color: STAMP_COLORS[word] || '#c8102e',
      x: clamp(s.x - w / 2, 0, 1 - w), y: clamp(s.y - h / 2, 0, 1 - h), w, h };
    p.annots.push(a); state.annSel = a.id; state.dirty = true; renderAnns();
    status(`Stempel „${word}“ gesetzt. Weitere Klicks setzen weitere Stempel, Esc beendet.`);
  } else if (state.tool === 'sign') {
    e.preventDefault();
    const place = kind => {
      $('#signKind').value = kind;
      const src = state.sigs[kind], im = new Image();
      im.onload = () => {
        pushUndo(p);
        const ar = im.height / im.width, w = kind === 'initials' ? 0.1 : kind === 'stamp' ? 0.24 : 0.28, h = w * ar * p.w / p.h;
        const a = { id: ++uid, type: 'sign', kind, img: src, ar, x: clamp(s.x - w / 2, 0, 1 - w), y: clamp(s.y - h / 2, 0, 1 - h), w, h };
        p.annots.push(a); state.annSel = a.id; state.dirty = true;
        const od = kind === 'sign' && sigDateMode() ? addPlaceDate(p, a) : '';
        setTool('select');
        status(`${SIG_KINDS[kind]} gesetzt${od ? ` mit „${od}“` : ''} – zum Verschieben ziehen, Größe am Anfasser unten rechts.`);
      };
      im.src = src;
    };
    const kind = $('#signKind').value;
    if (state.sigs[kind]) place(kind); else openSign(place, kind);
  }
});
// Werkzeug „Unterschrift“: halbdurchsichtige Vorschau folgt dem Mauszeiger, damit klar ist, wo sie landet
$('#overlay').addEventListener('pointermove', e => {
  const ov = $('#overlay'); let g = ov.querySelector('.sigghost');
  const kind = $('#signKind').value, src = state.tool === 'sign' && e.pointerType !== 'touch' && state.sigs[kind], p = cur();
  if (!src || !p) { g?.remove(); return; }
  if (!g || g.dataset.src !== kind + src.length) { g?.remove(); g = document.createElement('img'); g.className = 'sigghost'; g.alt = ''; g.src = src; g.dataset.src = kind + src.length; ov.append(g); }
  const r = ov.getBoundingClientRect(), w = (kind === 'initials' ? 0.1 : kind === 'stamp' ? 0.24 : 0.28) * r.width;
  g.style.width = w + 'px'; g.style.left = (e.clientX - r.left - w / 2) + 'px'; g.style.top = (e.clientY - r.top - (g.naturalHeight ? w * g.naturalHeight / g.naturalWidth : 0) / 2) + 'px';
});
$('#overlay').addEventListener('pointerleave', () => $('#overlay .sigghost')?.remove());
// „Pflichtfeld“ wirkt auch auf das gerade markierte Formularfeld (bei Optionsfeldern auf die ganze Gruppe)
$('#fieldReq').addEventListener('change', e => {
  const p = cur(), a = p?.annots.find(x => x.id === state.annSel && x.type === 'field'); if (!a) return;
  pushUndo(p); for (const x of p.annots) if (x === a || (a.ftype === 'radio' && x.type === 'field' && x.ftype === 'radio' && x.name === a.name)) x.req = e.target.checked;
  state.dirty = true; renderAnns();
});
$('#overlay').addEventListener('dblclick', e => {
  const le = e.target.closest('.ann.link');
  if (le) { const p = cur(), a = p?.annots.find(x => x.id === +le.dataset.id); if (a) { pushUndo(p); if (!linkAsk(p, a)) state.undo.pop(); renderAnns(); } return; }
  const fe = e.target.closest('.ann.field');
  if (fe) {   // Formularfeld umbenennen
    const p = cur(), a = p?.annots.find(x => x.id === +fe.dataset.id); if (!a) return;
    if (a.ftype === 'radio') {
      const g = prompt('Gruppe des Optionsfelds (gleiche Gruppe = nur eine Auswahl möglich):', a.name); if (g == null || !g.trim()) return;
      const v = prompt('Wert dieser Option:', a.val); if (v == null || !v.trim()) return;
      pushUndo(p); a.name = g.trim().slice(0, 60); a.val = v.trim().slice(0, 40); state.dirty = true; renderAnns(); return;
    }
    if (a.ftype === 'select') {
      const n = prompt('Name des Formularfelds:', a.name); if (n == null || !n.trim()) return;
      const o = { opts: a.opts }; if (!fieldOpts(o)) return;
      pushUndo(p); a.name = n.trim().slice(0, 60); a.opts = o.opts; state.dirty = true; renderAnns(); return;
    }
    const n = prompt('Name des Formularfelds:', a.name); if (n == null || !n.trim() || n.trim() === a.name) return;
    pushUndo(p); a.name = n.trim().slice(0, 60); state.dirty = true; renderAnns(); return;
  }
  const el = e.target.closest('.ann.text, .ann.note');
  if (el) { state.editing = +el.dataset.id; state.annSel = state.editing; renderAnns(); return; }
  // Doppelklick auf vorhandenen Seitentext (Werkzeug „Auswählen“) = „Text ändern“ – wie in Word/Acrobat; neben dem Text passiert nichts
  if (state.tool === 'select' && !e.target.closest('.ann')) dblEditText(e);
});
async function dblEditText(e) {
  const p = cur(); if (!p) return;
  const r = $('#overlay').getBoundingClientRect(), s = { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  const words = await pageWords(p); if (!words?.length) return;
  const pad = 0.004, hit = words.find(w => s.x >= w.x - pad && s.x <= w.x + w.w + pad && s.y >= w.y - pad && s.y <= w.y + w.h + pad);
  if (!hit || coveredWord(p, hit)) return;
  getSelection()?.removeAllRanges();   // Doppelklick markiert sonst ein Wort im Browser
  await editLineAt(p, s);
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!$('#expDlg').open) openExport({ saveAs: e.shiftKey }); return; }
  if (e.target.matches('input,textarea,select,[contenteditable="true"]')) return;
  const p = cur();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && state.pages.length) { e.preventDefault(); printDoc(); }
  else if (e.key === '?') $('#helpDlg').showModal();
  else if ((e.key === 'Delete' || e.key === 'Backspace') && state.annSel && p) {
    pushUndo(p); const del = p.annots.find(a => a.id === state.annSel); p.annots = p.annots.filter(a => a.id !== state.annSel && a.id !== del?.cover); state.annSel = null; state.dirty = true; renderAnns(); e.preventDefault();
  } else if (e.key === 'Escape') { state.annSel = null; if (state.crop) { state.crop = null; renderStage(); } else setTool('select'); }
  else if (e.key === 'PageDown' || e.key === 'ArrowDown' && e.altKey) { if (state.sel < state.pages.length - 1) { state.sel++; refresh(); } }
  else if (e.key === 'PageUp' || e.key === 'ArrowUp' && e.altKey) { if (state.sel > 0) { state.sel--; refresh(); } }
});

function setTool(t) {
  state.tool = t;
  if (t === 'sign') window.findSignSpots?.();   // Unterschriftsstellen im Dokument suchen
  if (t === 'edit') status('Text ändern: in eine Zeile oder einen Absatz klicken, dann tippen – Schrift, Farbe, Hintergrund und Zeilenumbruch werden übernommen. Leeren entfernt die Zeile. Der alte Text wird beim Speichern entfernt.');
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  renderAnns(); updateToolbar();
}
// Nur zeigen, was gerade gebraucht wird
function updateToolbar() {
  const p = cur(), a = p?.annots.find(x => x.id === state.annSel);
  $('#textOpts').hidden = !(['text', 'ink'].includes(state.tool) || ['text', 'ink'].includes(a?.type));
  $('#stampOpts').hidden = state.tool !== 'stamp';
  $('#shapeOpts').hidden = !(state.tool === 'shape' || a?.type === 'shape');
  if (a?.type === 'shape') { $('#shapeKind').value = a.kind; $('#shapeColor').value = a.color; $('#shapeLw').value = String(a.lw); $('#shapeFill').checked = !!a.fill; }
  $('#fieldOpts').hidden = state.tool !== 'field';
  $('#signOpts').hidden = state.tool !== 'sign';
  $('#hlOpts').hidden = !(state.tool === 'hl' || a?.type === 'hl');
  if (!$('#hlOpts').hidden) hlSync(a?.type === 'hl' ? a : null);
  // Optionen des gewählten Werkzeugs sichtbar machen (die Leiste ist breiter als schmale Fenster)
  const og = ['#signOpts', '#fieldOpts', '#stampOpts', '#shapeOpts', '#rdOpts', '#hlOpts', '#textOpts'].map(id => $(id)).find(g => g && !g.hidden);
  if (og && state.tool !== updateToolbar.last) requestAnimationFrame(() => og.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  updateToolbar.last = state.tool;
  $('#rdOpts').hidden = state.tool !== 'rd';
  $('#scanOpts').hidden = !p || p.kind !== 'image';
}
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { setTool(b.dataset.tool); if (b.dataset.tool === 'sign') { if ($('#signMenu').hidden) openSignMenu(); else closeSignMenu(); } else closeSignMenu(); });
// Textmarker: Farbe und Art – gilt für neue Markierungen und für die gewählte
function hlSync(a) {
  const c = a?.color || S.hlColor, st = a?.style || S.hlStyle;
  document.querySelectorAll('.hlsw button').forEach(b => { b.style.background = b.dataset.c; b.setAttribute('aria-checked', String(b.dataset.c === c)); b.tabIndex = b.dataset.c === c ? 0 : -1; });
  $('#hlStyle').value = st;
}
function hlSet(k, v) {
  S[k] = v; saveSettings();
  const p = cur(), a = p?.annots.find(x => x.id === state.annSel && x.type === 'hl');
  if (a) { pushUndo(p); a[k === 'hlColor' ? 'color' : 'style'] = v; state.dirty = true; renderAnns(); }
  hlSync(a);
}
document.querySelectorAll('.hlsw button').forEach(b => {
  b.onclick = () => hlSet('hlColor', b.dataset.c);
  b.onkeydown = e => {   // Pfeiltasten wie bei einer Radiogruppe
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); const all = [...document.querySelectorAll('.hlsw button')], i = all.indexOf(b), n = all[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? all.length - 1 : 1)) % all.length];
    hlSet('hlColor', n.dataset.c); n.focus();
  };
});
$('#hlStyle').onchange = e => hlSet('hlStyle', e.target.value);
// Formen: Änderungen gelten für neue Formen und für die gewählte
['shapeKind', 'shapeColor', 'shapeLw', 'shapeFill'].forEach(id => $('#' + id).onchange = () => {
  const p = cur(), a = p?.annots.find(x => x.id === state.annSel && x.type === 'shape'); if (!a) return;
  pushUndo(p); Object.assign(a, { kind: $('#shapeKind').value, color: $('#shapeColor').value, lw: +$('#shapeLw').value, fill: $('#shapeFill').checked }); state.dirty = true; renderAnns();
});
// Bild oder Logo einfügen (PNG mit Transparenz bleibt PNG, Fotos als JPEG) – mittig auf die aktuelle Seite, dann verschieben/skalieren
$('#btnImgIns').onclick = () => { if (cur()) $('#imgIn').click(); };
$('#imgIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; const p = cur(); if (!f || !p) return;
  try {
    const url = URL.createObjectURL(f), im = new Image(); im.src = url; await im.decode(); URL.revokeObjectURL(url);
    const k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight)), c = Imaging.canvas(Math.max(1, Math.round(im.naturalWidth * k)), Math.max(1, Math.round(im.naturalHeight * k)));
    const jpg = /jpe?g/i.test(f.type), x = c.getContext('2d'); if (jpg) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(im, 0, 0, c.width, c.height);
    const img = await new Promise(res => { const fr = new FileReader(); c.toBlob(b => { fr.onload = () => res(fr.result); fr.readAsDataURL(b); }, jpg ? 'image/jpeg' : 'image/png', 0.9); });
    pushUndo(p);
    const ar = c.height / c.width, w = Math.min(0.4, 0.4 / Math.max(1, ar * p.h / p.w * 0.9)), h = w * ar * p.w / p.h;
    const a = { id: ++uid, type: 'img', img, ar, x: (1 - w) / 2, y: clamp(0.35 - h / 2, 0, 1 - h), w, h, alt: f.name.replace(/\.[a-z0-9]+$/i, '') };
    p.annots.push(a); state.annSel = a.id; state.dirty = true; setTool('select');
    status('Bild eingefügt – zum Verschieben ziehen, Größe am Anfasser unten rechts, Entf löscht.');
  } catch (err) { console.warn(err); status('Das Bild konnte nicht gelesen werden – bitte PNG oder JPG wählen.'); }
};
['fs', 'color'].forEach(id => $('#' + id).onchange = () => {
  const p = cur(), a = p?.annots.find(x => x.id === state.annSel && (x.type === 'text' || x.type === 'ink'));
  if (a) { pushUndo(p); if (a.type === 'text') a.fs = +$('#fs').value; a.color = $('#color').value; renderAnns(); }
});
$('#mode').onchange = () => {
  const p = cur(); S.mode = $('#mode').value; saveSettings();
  if (p?.kind === 'image') { p.mode = S.mode; reprocess(p); state.dirty = true; refresh(); }
};
/* Schwärzen-Vorschläge: IBAN, E-Mail, Telefon, Steuer-ID, Geburtsdatum … auf allen Seiten finden und als Schwärzung setzen */
async function suggestRedactions() {
  const { n, kinds } = await redactWhere(Letter.findSensitive);
  status(n ? `${n} Stelle(n) zum Schwärzen vorgeschlagen (${[...kinds].join(', ')}). Bitte prüfen – Unpassendes anklicken und mit Entf löschen. Beim Speichern wird der Inhalt entfernt.`
    : 'Keine persönlichen Daten gefunden (IBAN, E-Mail, Telefon, Steuer-ID, Geburtsdatum, SV-Nummer).');
}
// Suchen & Schwärzen: jedes Vorkommen eines Begriffs (ohne Groß-/Kleinschreibung, Leerzeichen flexibel)
function findTerm(term) {
  const parts = term.trim().split(/\s+/).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!parts.length) return () => [];
  const re = new RegExp(parts.join('\\s*'), 'gi');
  return text => [...text.matchAll(re)].map(m => ({ start: m.index, end: m.index + m[0].length, kind: `„${term.trim()}“` }));
}
async function redactSearch() {
  const term = $('#q').value.trim(); if (term.length < 2) return;
  const { n } = await redactWhere(findTerm(term));
  status(n ? `${n} Fundstelle(n) von „${term}“ geschwärzt – bitte prüfen. Beim Speichern wird der Inhalt entfernt (auch aus der Textebene).` : `„${term}“ kommt im Dokument nicht vor.`);
}
// Schwärzungen für alle Fundstellen setzen: find(text) → [{ start, end, kind }]
async function redactWhere(find) {
  await waitForOcr(state.pages);
  let n = 0; const kinds = new Set();
  for (const p of state.pages) {
    const words = p.ocr?.allWords || p.ocr?.words || (p.kind === 'pdf' && p.native ? await nativeWords(p) : null);
    if (!words?.length) continue;
    let text = '', map = [];
    words.forEach((w, i) => { if (text) text += ' '; map.push([text.length, text.length + w.t.length, i]); text += w.t; });
    const hits = find(text); if (!hits.length) continue;
    pushUndo(p);
    for (const h of hits) {
      const ws = map.filter(([s, e]) => e > h.start && s < h.end).map(([, , i]) => words[i]);
      // je Zeile ein Rechteck
      const lines = [];
      for (const w of ws) { const l = lines.find(l => Math.abs(l.y + l.h / 2 - (w.y + w.h / 2)) < Math.max(l.h, w.h) * 0.6); if (l) { const x2 = Math.max(l.x + l.w, w.x + w.w), y2 = Math.max(l.y + l.h, w.y + w.h); l.x = Math.min(l.x, w.x); l.y = Math.min(l.y, w.y); l.w = x2 - l.x; l.h = y2 - l.y; } else lines.push({ x: w.x, y: w.y, w: w.w, h: w.h }); }
      for (const l of lines) {
        if (p.annots.some(a => a.type === 'rd' && overlaps(a, l))) continue;
        p.annots.push({ id: ++uid, type: 'rd', x: l.x - 0.003, y: l.y - 0.003, w: l.w + 0.006, h: l.h + 0.006, kind: h.kind }); n++;
      }
      kinds.add(h.kind);
    }
  }
  state.dirty = state.dirty || n > 0; refresh();
  return { n, kinds };
}
$('#rdAuto').onclick = suggestRedactions;
$('#qRedact').onclick = redactSearch;
$('#rotL').onclick = () => rotateTargets(-90);
$('#rotR').onclick = () => rotateTargets(90);
$('#zoomIn').onclick = () => { state.zoom = Math.min(3, state.zoom * 1.25); renderStage(); };
$('#zoomOut').onclick = () => { state.zoom = Math.max(0.4, state.zoom / 1.25); renderStage(); };
$('#undo').onclick = undo;
$('#reOcr').onclick = () => {
  const list = targets(); if (!list.length) return;
  for (const p of list) Object.assign(p, { ocr: null, native: null, failed: false, ocrRetried: false, orientChecked: false, forceOcr: true, blank: false });
  status(`Texterkennung für ${list.length} Seite(n) …`, 0); runOcrAll().then(() => status(`Texterkennung fertig: ${list.length} Seite(n). Der Text ist durchsuchbar und wird beim Speichern eingebettet.`));
};
$('#btnOcrAll').onclick = () => {
  // Alle Seiten ohne Text erkennen; Seiten mit vorhandener Textebene behalten ihren (genaueren) Originaltext
  const todo = state.pages.filter(p => !p.native && !p.ocr && !(p.blank && !p.keepBlank));
  todo.forEach(p => Object.assign(p, { failed: false, forceOcr: true }));
  if (!todo.length) return status('Alle Seiten haben bereits Text (erkannt oder im PDF vorhanden).');
  status(`Texterkennung für ${todo.length} Seite(n) …`, 0); runOcrAll().then(() => status(`Texterkennung fertig: ${todo.length} Seite(n).`));
};
addEventListener('resize', () => renderStage());

/* ---------- Zuschneiden / Entzerren ---------- */
function renderCrop(ov) {
  ov.className = 't-crop';
  ov.innerHTML = '<svg class="cropsvg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon/></svg>';
  state.crop.corners.forEach(([x, y], i) => {
    const h = document.createElement('div'); h.className = 'ch'; h.dataset.i = i;
    h.style.left = x * 100 + '%'; h.style.top = y * 100 + '%'; ov.append(h);
  });
  updateCropPoly();
}
function updateCropPoly() {
  const poly = $('#overlay polygon'); if (poly) poly.setAttribute('points', state.crop.corners.map(([x, y]) => `${x * 100},${y * 100}`).join(' '));
}
$('#btnCrop').onclick = () => {
  const p = cur(); if (!p || p.kind !== 'image') return;
  const det = Imaging.detectDocument(p.orig);
  state.crop = { id: p.id, corners: det.found ? det.corners : [[0.03, 0.03], [0.97, 0.03], [0.97, 0.97], [0.03, 0.97]] };
  status(det.found ? 'Blattkanten erkannt – Ecken bei Bedarf verschieben, dann „Übernehmen“.' : 'Ecken auf die Blattkanten ziehen, dann „Übernehmen“.');
  renderStage();
};
$('#cropCancel').onclick = () => { state.crop = null; renderStage(); };
$('#cropFull').onclick = () => { state.crop.corners = [[0, 0], [1, 0], [1, 1], [0, 1]]; renderAnns(); };
$('#cropApply').onclick = () => {
  const p = cur(); if (!p || !state.crop) return;
  status('Entzerre Seite …');
  let c = Imaging.warp(p.orig, state.crop.corners);
  if (S.autoDeskew) c = Imaging.deskew(c).canvas;
  p.orig = c; p.autoMode = null; p.annots = []; p.ocr = null; p.failed = false; p.orientChecked = false;
  reprocess(p); state.crop = null; state.dirty = true; refresh();
  status('Seite zugeschnitten.');
  if (S.autoOcr) runOcrAll();
};

/* ---------- Unterschrift, Kürzel, Firmenstempel: zeichnen, tippen oder Bild hochladen – alles lokal ---------- */
const SIG_KINDS = { sign: 'Unterschrift', initials: 'Kürzel', stamp: 'Firmenstempel' };
const SIG_FONTS = [['Sig Dancing', 'Schwungvoll'], ['Sig Vibes', 'Elegant'], ['Sig Allura', 'Klassisch'], ['Sig Caveat', 'Locker'], ['Sig Apple', 'Handschrift']];
state.sigs = LS.get('signatures', null) || { sign: LS.get('signature', null) };   // frühere einzelne Unterschrift übernehmen
let signCb = null, sigMode = 'draw', strokes = [], upImg = null, sigFont = SIG_FONTS[0][0];
const sigKindSel = () => document.querySelector('[name=sigKind]:checked').value;
const sigColorSel = () => document.querySelector('[name=sigColor]:checked').value;
// Gespeicherte Unterschriften (je Art getrennt) – frühere Einzel-Unterschrift wird übernommen; Speicher als dauerhaft anfordern
function sigStore(kind, data) {
  const st = LS.get('signatures', null) || {};
  if (data) st[kind] = data; else delete st[kind];
  for (const k of Object.keys(st)) if (!st[k]) delete st[k];
  if (Object.keys(st).length) LS.set('signatures', st); else LS.del('signatures');
  LS.del('signature');
  try { navigator.storage?.persist?.(); } catch {}
}
if (LS.get('signature', null) && !LS.get('signatures', null)) sigStore('sign', LS.get('signature', null));
function showSaved() {
  const k = sigKindSel(), src = state.sigs[k], box = $('#sgSaved');
  box.hidden = !src; if (src) { $('#sgSavedImg').src = src; $('#sgSavedImg').alt = `Gespeicherte ${SIG_KINDS[k]}`; }
}
// Nach dem Anlegen: Vorschau folgt dem Mauszeiger, Klick (oder Tippen) setzt sie – wie bei Adobe
function armSign(kind) {
  $('#signKind').value = kind;
  if (!state.pages.length) { status(`${SIG_KINDS[kind]} gespeichert. Dokument öffnen, dann Werkzeug „Unterschrift“ wählen und auf die Stelle klicken.`); return; }
  setTool('sign');
  status(`${SIG_KINDS[kind]} bereit – jetzt auf die Stelle im Dokument klicken bzw. tippen, an der sie stehen soll (Esc bricht ab).`);
  toast(`Jetzt auf die Stelle klicken, an der die ${SIG_KINDS[kind]} stehen soll.`, 6000);
}
const initialsOf = n => { n = (n || '').trim(); if (n.length <= 4) return n; return n.split(/[\s-]+/).filter(Boolean).map(w => w[0].toUpperCase()).join('').slice(0, 3); };
function openSign(cb, kind = 'sign') {
  signCb = cb;
  document.querySelector(`[name=sigKind][value="${kind}"]`).checked = true;
  strokes = []; upImg = null; drawPad(); $('#sgErr').textContent = '';
  const pv = $('#sgUpPrev'); pv.width = pv.height = 10; pv.hidden = true; $('#sgDropHint').hidden = false;
  $('#sgRemember').checked = LS.get('keepSign', true);   // ab Werk merken – sonst ist die Unterschrift nach dem Neuladen weg
  showSaved();
  $('#sgName').value = kind === 'initials' ? initialsOf(S.author || '') : (S.author && S.author.length > 4 ? S.author : '');
  $('#sgKeepColor').checked = kind === 'stamp';
  setSigMode(kind === 'stamp' ? 'upload' : 'draw');
  $('#signDlg').showModal();
}
function setSigMode(m) {
  sigMode = m;
  document.querySelectorAll('.sgtabs [data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  $('#sgDraw').hidden = m !== 'draw'; $('#sgType').hidden = m !== 'type'; $('#sgUp').hidden = m !== 'upload';
  $('#sgColors').hidden = m === 'upload' && $('#sgKeepColor').checked;
  if (m === 'type') { renderFonts(); setTimeout(() => $('#sgName').focus(), 30); }
}
document.querySelectorAll('.sgtabs [data-mode]').forEach(b => b.onclick = () => setSigMode(b.dataset.mode));
$('.sgtabs').addEventListener('keydown', e => {   // Pfeiltasten wechseln zwischen den Reitern
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tabs = [...document.querySelectorAll('.sgtabs [data-mode]')], i = tabs.findIndex(t => t.dataset.mode === sigMode);
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setSigMode(n.dataset.mode); n.focus();
});
document.querySelectorAll('[name=sigKind]').forEach(r => r.onchange = () => {
  const k = sigKindSel(); showSaved();
  if (k === 'initials' && (!$('#sgName').value || $('#sgName').value.length > 4)) $('#sgName').value = initialsOf($('#sgName').value || S.author || '');
  if (k === 'stamp') { $('#sgKeepColor').checked = true; setSigMode('upload'); } else if (sigMode === 'type') renderFonts();
});
document.querySelectorAll('[name=sigColor]').forEach(r => r.onchange = () => { drawPad(); if (sigMode === 'type') renderFonts(); if (upImg) previewUpload(); });
// Zeichnen: Striche merken (für „zurück“ und Farbwechsel), geglättet als Kurven durch die Mittelpunkte
function drawPad() {
  const c = $('#signPad'), x = c.getContext('2d'), col = sigColorSel();
  x.clearRect(0, 0, c.width, c.height); x.strokeStyle = x.fillStyle = col; x.lineCap = x.lineJoin = 'round'; x.lineWidth = 5;
  for (const st of strokes) {
    if (st.length < 3) { x.beginPath(); x.arc(st[0][0], st[0][1], 2.8, 0, 7); x.fill(); if (st.length < 2) continue; }
    x.beginPath(); x.moveTo(st[0][0], st[0][1]);
    for (let i = 1; i < st.length - 1; i++) x.quadraticCurveTo(st[i][0], st[i][1], (st[i][0] + st[i + 1][0]) / 2, (st[i][1] + st[i + 1][1]) / 2);
    x.lineTo(st[st.length - 1][0], st[st.length - 1][1]); x.stroke();
  }
  c.dataset.empty = strokes.length ? '' : '1';
}
$('#signPad').addEventListener('pointerdown', e => {
  const c = $('#signPad'), r = c.getBoundingClientRect(), sx = c.width / r.width, sy = c.height / r.height;
  const pt = ev => [(ev.clientX - r.left) * sx, (ev.clientY - r.top) * sy];
  const st = [pt(e)]; strokes.push(st); drawPad();
  drag(e, ev => { st.push(pt(ev)); drawPad(); });
});
$('#signClear').onclick = () => { strokes = []; drawPad(); };
$('#signUndo').onclick = () => { strokes.pop(); drawPad(); };
$('#signCancel').onclick = () => $('#signDlg').close();
$('#sgSavedDel').onclick = () => {
  const k = sigKindSel(); if (!confirm(`Gespeicherte ${SIG_KINDS[k]} löschen? Bereits gesetzte bleiben im Dokument.`)) return;
  state.sigs[k] = null; if (k === 'sign') state.signature = null; sigStore(k, null); showSaved(); status(`${SIG_KINDS[k]} gelöscht.`);
};
// Tippen: Name in fünf Handschrift-Stilen zur Auswahl (Schriften liegen lokal in vendor/fonts/sign, freie Lizenzen)
function renderFonts() {
  const box = $('#sgFonts'), name = $('#sgName').value.trim() || (sigKindSel() === 'initials' ? 'EM' : 'Ihr Name'), col = sigColorSel();
  box.replaceChildren(...SIG_FONTS.map(([f, label]) => {
    const l = document.createElement('label'); l.style.fontFamily = `"${f}", cursive`; l.style.color = col; l.title = label;
    const i = document.createElement('input'); i.type = 'radio'; i.name = 'sigFont'; i.value = f; i.checked = f === sigFont; i.setAttribute('aria-label', `Schriftstil ${label}`);
    i.onchange = () => { sigFont = f; };
    l.append(i, document.createTextNode(name)); return l;
  }));
}
$('#sgName').addEventListener('input', renderFonts);
async function typedCanvas() {
  const name = $('#sgName').value.trim(); if (!name) return null;
  try { await document.fonts.load(`80px "${sigFont}"`); } catch {}
  const c = Imaging.canvas(1600, 420), x = c.getContext('2d');
  let size = 170; x.font = `${size}px "${sigFont}"`; size = Math.min(size, size * 1480 / Math.max(1, x.measureText(name).width));
  x.font = `${size}px "${sigFont}"`; x.fillStyle = sigColorSel(); x.textBaseline = 'middle'; x.fillText(name, 50, 220);
  return c;
}
// Hochladen: Papier wird durchsichtig, Tinte bleibt (Farbe wählbar oder Originalfarben), zugeschnitten
function sigFromImage(img, color, keepColor) {
  const k = Math.min(1, 1800 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = Imaging.canvas(Math.round((img.naturalWidth || img.width) * k), Math.round((img.naturalHeight || img.height) * k)), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height), px = d.data, n = c.width * c.height;
  let transparent = 0; const lum = new Uint8Array(n);
  for (let i = 0; i < n; i++) { lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) | 0; if (px[i * 4 + 3] < 200) transparent++; }
  const [cr, cg, cb] = [1, 3, 5].map(j => parseInt(color.slice(j, j + 2), 16));
  if (transparent > n * 0.05) {   // PNG mit Transparenz: so übernehmen (auf Wunsch einfärben)
    if (!keepColor) for (let i = 0; i < n; i++) { px[i * 4] = cr; px[i * 4 + 1] = cg; px[i * 4 + 2] = cb; }
  } else {
    const hist = new Uint32Array(256); for (let i = 0; i < n; i++) hist[lum[i]]++;
    const pct = q => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * q) return v; } return 255; };
    const paper = pct(0.7), ink = Math.min(pct(0.01), paper - 40), lo = ink + (paper - ink) * 0.15, hi = paper - Math.max(10, (paper - ink) * 0.22);
    for (let i = 0; i < n; i++) {
      const a = lum[i] >= hi ? 0 : lum[i] <= lo ? 1 : (hi - lum[i]) / (hi - lo);
      px[i * 4 + 3] = a < 0.06 ? 0 : Math.round(a * 255);
      if (!keepColor) { px[i * 4] = cr; px[i * 4 + 1] = cg; px[i * 4 + 2] = cb; }
    }
  }
  x.putImageData(d, 0, 0);
  return c;
}
// Rand abschneiden (Pixel mit Deckkraft), auf höchstens 900 px Breite verkleinern
function trimSig(c) {
  const x = c.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const pad = 6, w = x1 - x0 + 1 + pad * 2, h = y1 - y0 + 1 + pad * 2, k = Math.min(1, 900 / w);
  const t = Imaging.canvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
  t.getContext('2d').drawImage(c, x0 - pad, y0 - pad, w, h, 0, 0, t.width, t.height);
  return t;
}
function previewUpload() {
  const t = trimSig(sigFromImage(upImg, sigColorSel(), $('#sgKeepColor').checked)), pv = $('#sgUpPrev');
  if (!t) { pv.width = pv.height = 10; pv.hidden = true; $('#sgDropHint').hidden = false; $('#sgErr').textContent = 'Auf dem Bild wurde keine Unterschrift gefunden – bitte ein Foto mit dunkler Schrift auf hellem Papier verwenden.'; return; }
  $('#sgErr').textContent = ''; pv.width = t.width; pv.height = t.height; pv.getContext('2d').drawImage(t, 0, 0); pv.hidden = false; $('#sgDropHint').hidden = true;
}
const loadSigFile = async f => {
  if (!f) return;
  if (!/^image\//.test(f.type)) { $('#sgErr').textContent = 'Bitte ein Bild (JPG oder PNG) wählen.'; return; }
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => { upImg = im; previewUpload(); URL.revokeObjectURL(url); };
  im.onerror = () => { $('#sgErr').textContent = 'Das Bild konnte nicht gelesen werden.'; URL.revokeObjectURL(url); };
  im.src = url;
};
$('#sgFile').onchange = e => { loadSigFile(e.target.files[0]); e.target.value = ''; };
// Am Desktop bequem: Bild ins Fenster ziehen oder mit Strg+V einfügen (z. B. Ausschnitt aus dem Snipping-Tool)
const sigImageFile = list => [...(list || [])].find(f => /^image\//.test(f.type));
const sgDlg = $('#signDlg');
sgDlg.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.kind === 'file')) { e.preventDefault(); e.stopPropagation(); document.body.classList.remove('dropping'); sgDlg.classList.add('drag'); } });
sgDlg.addEventListener('dragleave', e => { if (!sgDlg.contains(e.relatedTarget)) sgDlg.classList.remove('drag'); });
sgDlg.addEventListener('drop', e => {
  e.preventDefault(); e.stopPropagation(); sgDlg.classList.remove('drag'); document.body.classList.remove('dropping');
  const f = sigImageFile(e.dataTransfer.files);
  if (!f) { $('#sgErr').textContent = 'Bitte ein Bild (JPG oder PNG) hierher ziehen.'; return; }
  setSigMode('upload'); loadSigFile(f);
});
sgDlg.addEventListener('paste', e => {
  const f = sigImageFile(e.clipboardData?.files); if (!f) return;
  e.preventDefault(); setSigMode('upload'); loadSigFile(f);
});
$('#signUpload').onclick = () => { openSign(null, $('#signKind').value); setSigMode('upload'); $('#sgFile').click(); };
$('#sgCam').onchange = e => { loadSigFile(e.target.files[0]); e.target.value = ''; };
$('#sgKeepColor').onchange = () => { $('#sgColors').hidden = sigMode === 'upload' && $('#sgKeepColor').checked; if (upImg) previewUpload(); };
$('#signOk').onclick = async () => {
  let c = null;
  if (sigMode === 'draw') { if (!strokes.length) return void ($('#sgErr').textContent = 'Bitte zuerst ins Feld schreiben.'); c = $('#signPad'); }
  else if (sigMode === 'type') { c = await typedCanvas(); if (!c) return void ($('#sgErr').textContent = 'Bitte einen Namen eingeben.'); }
  else { if (!upImg) return void ($('#sgErr').textContent = 'Bitte zuerst ein Bild wählen.'); c = sigFromImage(upImg, sigColorSel(), $('#sgKeepColor').checked); }
  const t = trimSig(c); if (!t) return void ($('#sgErr').textContent = 'Nichts zu übernehmen.');
  const kind = sigKindSel(); state.sigs[kind] = t.toDataURL('image/png');
  state.signature = state.sigs.sign || null;
  const keep = $('#sgRemember').checked; LS.set('keepSign', keep);
  sigStore(kind, keep ? state.sigs[kind] : null);   // nur diese Art speichern bzw. entfernen – die anderen bleiben
  $('#keepSign').checked = keep;
  $('#signDlg').close();
  if (signCb) signCb(kind); else armSign(kind);   // ohne Ziel: Unterschrift hängt am Mauszeiger, Klick setzt sie
};
// Kürzel unten rechts auf jede Seite (wie bei Verträgen üblich) – Seiten, die schon ein Kürzel haben, bleiben unverändert
function initialsAllPages() {
  const go = () => {
    const src = state.sigs.initials, im = new Image();
    im.onload = () => {
      const ar = im.height / im.width; let n = 0;
      for (const p of state.pages) {
        if (p.annots.some(a => a.type === 'sign' && a.kind === 'initials')) continue;
        pushUndo(p);
        const w = 0.09, h = w * ar * (p.w || 1) / (p.h || 1.414);
        p.annots.push({ id: ++uid, type: 'sign', kind: 'initials', img: src, ar, x: 1 - w - 0.05, y: 1 - h - 0.03, w, h }); n++;
      }
      state.dirty = true; refresh();
      status(n ? `Kürzel auf ${n} Seite(n) gesetzt – unten rechts. Einzeln verschieben oder mit Entf löschen.` : 'Alle Seiten haben schon ein Kürzel.');
    };
    im.src = src;
  };
  if (state.sigs.initials) go(); else openSign(k => { if (k === 'initials') go(); }, 'initials');
}

/* ---------- OCR ---------- */
let ocrRunning = false;
const OCR_RECYCLE = 40, ocrTimeout = () => self.__ocrTimeoutMs || 120000;   // Zeitlimit pro Seite (für Tests einstellbar)
// Mehrere Rechenkerne parallel: mehrseitige Scans werden deutlich schneller erkannt (je Kern ca. 150 MB Speicher)
const OCR_PARALLEL = self.__ocrParallel || (IS_MOBILE ? 1 : Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 2) / 2), navigator.deviceMemory && navigator.deviceMemory < 4 ? 1 : 3)));
const pool = Array.from({ length: OCR_PARALLEL }, () => ({ w: null, jobs: 0, busy: false }));
const waiting = [];
let ocrBusyJobs = 0;
// Rechenkern verwerfen (hängt, abgestürzt oder nach vielen Seiten vorsorglich) – der nächste Aufruf startet einen frischen
function resetWorker(reason, slot) {
  for (const sl of slot ? [slot] : pool) {
    const w = sl.w; sl.w = null; sl.jobs = 0;
    if (w) Promise.resolve(w).then(x => x.terminate()).catch(() => {});
  }
  if (reason) console.warn('Texterkennung neu gestartet:', reason);
}
function startWorker(sl) {
  if (!pool.some(x => x.w)) status('Starte Texterkennung …', 0);
  sl.w = Tesseract.createWorker(ocrPrimary(), 1, {
    workerPath: abs('vendor/tesseract/worker.min.js'), corePath: abs('vendor/tesseract/core'), langPath: abs('vendor/tesseract/lang'),
    logger: m => { if (m.status === 'recognizing text' && state.ocrLabel && ocrBusyJobs === 1) status(`Texterkennung ${state.ocrLabel}: ${Math.round(m.progress * 100)} %`, m.progress); },
  });
  sl.w.catch(() => { sl.w = null; });   // Start fehlgeschlagen → beim nächsten Mal neu versuchen
}
// Freien Rechenkern holen (oder warten, bis einer frei wird)
async function acquire() {
  let sl = pool.find(x => !x.busy && x.w) || pool.find(x => !x.busy);
  if (!sl) { await new Promise(res => waiting.push(res)); return acquire(); }
  sl.busy = true;
  if (sl.w && sl.jobs >= OCR_RECYCLE) resetWorker('Vorsorge nach ' + OCR_RECYCLE + ' Seiten', sl);
  if (!sl.w) startWorker(sl);
  return sl;
}
function release(sl) { sl.busy = false; const next = waiting.shift(); if (next) next(); }
// Erkennung mit Zeitlimit: hängt der Rechenkern, wird er verworfen und der Aufruf schlägt sauber fehl (statt ewig zu warten)
async function recognize(img) {
  const sl = await acquire();
  ocrBusyJobs++; sl.jobs++;
  let timer;
  try {
    const w = await sl.w;
    const job = w.recognize(img, {}, { text: true, blocks: true });
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Zeitüberschreitung der Texterkennung')), ocrTimeout()); });
    var { data } = await Promise.race([job, timeout]);
  } catch (e) { resetWorker(e.message, sl); throw e; }
  finally { clearTimeout(timer); ocrBusyJobs--; release(sl); }
  return ocrResult(data, img);
}
// Ergebnis der Texterkennung in das PDFMy-Format (Text, Wörter mit Position) umwandeln
function ocrResult(data, img) {
  let words = data.words;
  if (!words || !words.length) words = (data.blocks || []).flatMap(b => b.paragraphs.flatMap(pa => pa.lines.flatMap(l => l.words)));
  const box = x => ({ t: x.text.trim(), x: x.bbox.x0 / img.width, y: x.bbox.y0 / img.height, w: (x.bbox.x1 - x.bbox.x0) / img.width, h: (x.bbox.y1 - x.bbox.y0) / img.height });
  return {
    text: data.text || '', conf: data.confidence || 0,
    words: words.filter(x => x.confidence > 25 && x.text.trim()).map(box),
    // auch unsichere Wörter (für Schwärzen-Vorschläge: lieber eine Stelle zu viel finden als eine IBAN übersehen)
    allWords: words.filter(x => x.text.trim()).map(box),
  };
}
async function ocrPage(p) {
  p.busy = true; renderThumbs();
  if (!ocrRunning) state.ocrLabel = `Seite ${state.pages.indexOf(p) + 1}`;
  try {
    let img = p.kind === 'image' ? p.processed : await renderPdf(p, 220);
    let res = await recognize(img);
    // Auf dem Kopf oder quer eingescannt? Bei schlechter Erkennung die drei anderen Lagen probieren
    if (p.kind === 'image' && S.autoOrient && res.conf < 60 && !p.orientChecked) {
      p.orientChecked = true;
      const small = Imaging.scaled(img, 1400), lbl = state.ocrLabel;
      state.ocrLabel = '';
      let best = { dir: 0, conf: res.conf };
      for (const dir of [180, 90, -90]) {
        status(`Prüfe Ausrichtung ${lbl} (${dir}°) …`);
        const r = await recognize(turn(small, dir));
        if (r.conf > best.conf) best = { dir, conf: r.conf };
      }
      state.ocrLabel = lbl;
      if (best.dir && best.conf > res.conf + 15 && best.conf >= 60) {   // nur bei wirklich lesbarem Ergebnis – Zeichensalat (z. B. chinesische Seite im lateinischen Modell) nicht drehen
        await rotatePage(p, best.dir); img = p.processed; res = await recognize(img);
        p.label += ` (${best.dir === 180 ? 'auf dem Kopf' : 'quer'} → gedreht)`;
      }
    }
    // Andere Sprache oder Schrift? Mit der passenden Sprache noch einmal erkennen
    const prim = ocrPrimary();
    let lang = Letter.detectLang(res.text, prim);
    // Kyrillisch oder Griechisch: Die erste Erkennung (lateinische Schrift) liefert dann nur Zeichensalat mit geringer Sicherheit
    if (res.conf < 62 && (!(Letter.detectLang(res.text, 'xxx') === prim) || res.conf < 45)) {   // sehr unsicher: auch wenn der Zeichensalat „deutsch“ aussieht
      const small = Imaging.scaled(img, 1400), lbl = state.ocrLabel; let best = null;
      state.ocrLabel = '';
      for (const c of scriptProbes(prim)) {
        try {
          status(`${lbl || 'Seite'}: prüfe ${I18N.ocrName(c)} …`);
          const r = await recognizeLangs(small, c === 'rus' ? ['rus', 'ukr'] : [c]);   // zusammen, damit і/є/ї (Ukrainisch) und ы/э (Russisch) erhalten bleiben
          if (r.conf > res.conf + 12 && (!best || r.conf > best.conf)) best = { c, conf: r.conf, text: r.text };
          if (best && (c === ocrHint || (c === 'rus' && NONLATIN_OCR.has(ocrHint) && ocrHint !== 'ell'))) break;
        } catch (e) { console.warn('Schrift', c, e); }
      }
      state.ocrLabel = lbl;
      // Immer noch unsicher (auch Kyrillisch/Griechisch passt kaum): Arabisch und Chinesisch probieren, die sicherste Schrift gewinnt
      if ((!best || best.conf < 70) && res.conf < 45 && res.text.replace(/\s/g, '').length > 15) {
        for (const c of ocrHint && EXTRA_SCRIPTS.includes(ocrHint) ? [ocrHint, ...EXTRA_SCRIPTS.filter(x => x !== ocrHint)] : EXTRA_SCRIPTS) {
          try {
            status(`${lbl || 'Seite'}: prüfe ${I18N.ocrName(c)} …`);
            const r = await recognizeLangs(small, [c]);
            if (r.conf > res.conf + 15 && r.conf > 60 && (!best || r.conf > best.conf)) best = { c, conf: r.conf, text: r.text };
            if (best?.c === c && best.conf >= 80) break;
          } catch (e) { console.warn('Schrift', c, e); }
        }
      }
      if (best) lang = Letter.scriptOf(best.text) === 'cyrl' ? (Letter.cyrLang(best.text) || best.c) : best.c;
      else if (lang && res.conf < 45) lang = null;   // Zeichensalat: lieber keine Sprache raten
    }
    if (lang) {
      try {
        status(`${state.ocrLabel || 'Seite'}: ${I18N.ocrName(lang)} erkannt – Texterkennung in dieser Sprache …`);
        const r2 = await recognizeLangs(img, LATIN_OCR.has(lang) === LATIN_OCR.has(prim) ? [prim, lang] : [lang, LATIN_OCR.has(lang) ? 'rus' : 'deu']);
        if (r2.conf >= res.conf - 3 || !LATIN_OCR.has(lang)) { res = r2; p.lang = lang; if (!LATIN_OCR.has(lang)) ocrHint = lang; }
      } catch (e) { console.warn('Sprache', lang, e); }
    } else if (prim !== 'deu') p.lang = prim;
    // Chinesisch/Japanisch: Tesseract liefert jedes Zeichen als Wort – im Text ohne Leerzeichen dazwischen
    if (/^(chi|jpn)/.test(p.lang || ocrPrimary())) res = { ...res, text: res.text.replace(new RegExp(`(${CJK_RE.source}) (?=${CJK_RE.source})`, 'g'), '$1') };
    p.ocr = res;
  } finally { p.busy = false; }
}
// Sprache der Texterkennung: Einstellung „Dokumentsprache“ (automatisch = Deutsch, weitere Sprachen werden erkannt)
const NONLATIN_OCR = new Set(['rus', 'ukr', 'bel', 'bul', 'srp', 'mkd', 'ell', 'ara', 'fas', 'heb', 'chi_sim', 'chi_tra', 'jpn', 'kor']);
// Chinesisch und Japanisch: Wörter ohne Leerzeichen dazwischen (Koreanisch trennt Wörter mit Leerzeichen)
const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const LATIN_OCR = { has: l => !NONLATIN_OCR.has(l) };
const EXTRA_SCRIPTS = ['ara', 'chi_sim'];   // automatisch geprüft; weitere (Persisch, Hebräisch, Japanisch, Koreanisch …) über die Einstellung „Dokumentsprache“
const ocrPrimary = () => S.ocrLang && S.ocrLang !== 'auto' && I18N.byOcr(S.ocrLang) ? S.ocrLang : 'deu';
// Zuletzt gefundene nichtlateinische Sprache – die nächsten Seiten probieren sie zuerst (sonst die Sprache der Oberfläche)
let ocrHint = NONLATIN_OCR.has(I18N.info.ocr) ? I18N.info.ocr : null;
const scriptProbes = prim => NONLATIN_OCR.has(prim) ? ['deu'] : [...new Set([ocrHint === 'ell' ? 'ell' : ocrHint ? 'rus' : null, 'rus', 'ell'].filter(Boolean))];
// Weitere Sprachen: eigener Rechenkern, Sprachdatei wird erst bei Bedarf geladen (je 1–4 MB)
let langWorker = null, langCombo = '', langQueue = Promise.resolve();
const recognizeLang = (img, lang) => recognizeLangs(img, [ocrPrimary(), lang]);
function recognizeLangs(img, langs) {
  const run = langQueue.then(async () => {
    const combo = langs.join('+');
    if (langCombo !== combo) {
      if (langWorker) (await langWorker.catch(() => null))?.terminate().catch(() => {});
      langCombo = combo;
      langWorker = Tesseract.createWorker(langs, 1, { workerPath: abs('vendor/tesseract/worker.min.js'), corePath: abs('vendor/tesseract/core'), langPath: abs('vendor/tesseract/lang') });
      langWorker.catch(() => { langWorker = null; langCombo = ''; });
    }
    const w = await langWorker; let timer;
    try {
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Zeitüberschreitung der Texterkennung')), ocrTimeout() * 1.5); });
      const { data } = await Promise.race([w.recognize(img, {}, { text: true, blocks: true }), timeout]);
      return ocrResult(data, img);
    } catch (e) { (await langWorker.catch(() => null))?.terminate().catch(() => {}); langWorker = null; langCombo = ''; throw e; }
    finally { clearTimeout(timer); }
  });
  langQueue = run.catch(() => {});
  return run;
}
// Sprache eines Dokuments (häufigste erkannte Seitensprache) als BCP-47 für PDF und Vorlesen
function docLang(pages) {
  const n = {}; for (const p of pages || []) { const l = p.lang || (p.ocr ? ocrPrimary() : null); if (l) n[l] = (n[l] || 0) + 1; }
  const top = Object.entries(n).sort((x, y) => y[1] - x[1])[0];
  return (top && I18N.byOcr(top[0])?.bcp) || 'de-DE';
}
let ocrPromise = null;
function runOcrAll() {
  // Läuft schon ein Durchgang, danach erneut prüfen – sonst gingen neue Aufträge verloren, wenn der alte gerade endet
  if (ocrPromise) return ocrPromise.then(() => runOcrAll());
  // Achtung: Hat die Erkennung nichts zu tun, endet sie sofort. Darum den Merker erst NACH dem Anlegen setzen
  // und nur zurücksetzen, wenn er noch auf diesen Lauf zeigt – sonst bliebe ein erledigter Lauf "hängen".
  const run = (async () => {
    await null;
    ocrRunning = true;
    if (!state.meta.sender && !state.einv) $('#anaHint').textContent = '· werden gerade aus dem Brief gelesen …';
    try {
      const next = () => state.pages.find(x => !x.ocr && !x.native && !x.failed && !x.blank && !x.busy && (x.kind === 'image' || x.forceOcr || !NO_OCR_INTENTS.has(state.intent)));
      const one = async p => {
        const todo = state.pages.filter(x => !x.ocr && !x.native && !x.failed && !x.blank).length, done = state.pages.filter(x => x.ocr).length;
        state.ocrLabel = `Seite ${state.pages.indexOf(p) + 1} (${done + 1} von ${done + todo})`;
        if (ocrBusyJobs) status(`Texterkennung: ${done} von ${done + todo} Seiten fertig …`, done / (done + todo));
        try { await ocrPage(p); }
        catch (e) {
          console.error(e);
          // Einmal mit frischem Rechenkern wiederholen, erst dann als fehlgeschlagen markieren
          if (!p.ocrRetried) { p.ocrRetried = true; status('Texterkennung wird neu gestartet …'); return; }
          p.failed = true; status('Texterkennung fehlgeschlagen: ' + e.message + ' – mit „Text erkennen (OCR)“ erneut versuchen.');
        }
        refresh(); analyze();
      };
      // bis zu OCR_PARALLEL Seiten gleichzeitig; die Ausrichtungsprüfung einer Seite nutzt freie Kerne mit
      const active = new Set();
      for (;;) {
        let p;
        while (active.size < OCR_PARALLEL && (p = next())) { p.busy = true; const t = one(p).finally(() => active.delete(t)); active.add(t); }
        if (!active.size) break;
        await Promise.race(active);
      }
      if (state.pages.some(x => x.ocr)) status('Texterkennung abgeschlossen.');
    } finally { ocrRunning = false; state.ocrLabel = ''; if (/werden gerade/.test($('#anaHint').textContent)) $('#anaHint').textContent = state.meta.sender ? '· automatisch erkannt, bitte prüfen' : '· keine Briefdaten erkannt (z. B. kein Brief)'; window.renderTodo?.(); }   // Aktionszeile/Autopilot nach der Erkennung auswerten
  })();
  ocrPromise = run;
  run.finally(() => { if (ocrPromise === run) ocrPromise = null; });
  return run;
}
const pageText = p => p?.native || p?.ocr?.text || '';
/* Fälschungsschutz (Betrügern die Arbeit nicht erleichtern): 'urkunde' (Urkunde, Zeugnis, Ausweis, Steuer-/Rentenbescheid, Urteil …: Inhalt nicht änderbar) |
   'konto' / 'nachweis' (Kontoauszug, Einkommen, Bescheid, Auskunft, Rechnung: Änderungen sichtbar markiert + Vermerk) | ''
   Bei PDFs zählt das ganze Dokument (Folgeseiten eines Kontoauszugs nennen das Wort oft nicht mehr). */
function pageProt(p) {
  if (!p || typeof Letter === 'undefined' || !Letter.protectedKind) return '';
  const own = Letter.protectedKind(pageText(p));
  if (own === 'urkunde' || p.kind !== 'pdf') return own;
  const doc = state.pages.filter(q => q.kind === 'pdf' && q.docIdx === p.docIdx && q !== p).map(q => Letter.protectedKind(pageText(q)));
  return doc.includes('urkunde') && !own ? 'urkunde' : own || (doc.includes('konto') ? 'konto' : doc.includes('nachweis') ? 'nachweis' : '');
}
const PROT_MSG = {
  urkunde: 'Urkunden, Zeugnisse, Ausweise, amtliche Bescheide (z. B. Steuerbescheid) und Gerichtsentscheidungen können in PDFMy nicht inhaltlich geändert werden (Schutz vor Fälschung). Möglich sind Schwärzen, Markieren, Notizen und Unterschrift.',
  konto: 'Kontoauszug: Änderungen werden sichtbar rot markiert, und die Seite erhält den Vermerk „nachträglich geändert“ (Schutz vor Fälschung).',
  nachweis: 'Nachweis/Beleg (z. B. Gehaltsabrechnung, Bescheid, Rechnung): Änderungen werden sichtbar rot markiert, und die Seite erhält den Vermerk „nachträglich geändert“ (Schutz vor Fälschung).',
};
/* Digital signierte PDFs (F3 in docs/Faelschungsschutz.md): vor der ersten inhaltlichen Änderung („Text ändern“, „Abdecken“, „Text“)
   einmal je Dokument deutlich warnen, dass die Signatur ungültig wird. true = Warnung offen, Aktion erst nach „trotzdem ändern“ (go). */
function sigWarn(p, go) {
  const d = p?.kind === 'pdf' ? state.docs[p.docIdx] : null;
  if (!d || !(d.sigs ? d.sigs.some(r => !r.usageRights) : d.signed) || d.sigWarned) return false;   // Nutzungsrechte-Signaturen: keine Warnung
  const dlg = $('#sigWarnDlg'), r = d.sigs?.[d.sigs.length - 1], who = r && [r.signer?.cn || r.name, r.signer?.o].filter(Boolean).join(', ');
  $('#sigWarnWho').textContent = `Diese Seite stammt aus einem digital signierten PDF${who ? ` (signiert von ${who})` : ''}.`;
  dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue === 'go') { d.sigWarned = true; window.renderSigBar?.(); go?.(); }
    else status('Nicht geändert – die digitale Signatur bleibt gültig.');
  };
  dlg.showModal(); $('#sigWarnNo').focus();
  return true;
}
// Vermerk unten auf geschützten Seiten mit Änderungen – im PDF, im Bild und beim Drucken
const protChanged = p => p.annots.some(a => a.type === 'wo' || a.type === 'text');
const protNote = k => `Seite nachträglich geändert (PDFMy, ${new Date().toLocaleDateString('de-DE')}) – ${k === 'konto' ? 'kein Originalbeleg der Bank' : 'kein Originaldokument des Ausstellers'}`;
const PROT_RED = '#C00000';
function protMarkCanvas(x, p, W, H, ptScale) {
  const k = pageProt(p); if (!k || !protChanged(p)) return;
  x.save(); x.strokeStyle = PROT_RED; x.lineWidth = Math.max(1.5, W * 0.0015); x.setLineDash([x.lineWidth * 3, x.lineWidth * 2]);
  for (const a of p.annots) if (a.type === 'wo') x.strokeRect(a.x * W - 2, a.y * H - 2, a.w * W + 4, a.h * H + 4);
  x.setLineDash([]); x.fillStyle = PROT_RED; x.font = `bold ${8 * ptScale}px "DejaVu Sans"`; x.textBaseline = 'alphabetic';
  x.fillText(protNote(k), 28 * ptScale, H - 7 * ptScale);
  x.restore();
}

/* ---------- Briefdaten ---------- */
const metaFor = pages => Letter.analyzeLetter(pageText(pages[0]), pages.map(pageText).join('\n'), S.ownName);
function analyze() {
  if (state.pages.some(p => pageText(p).trim())) {
    const r = metaFor(state.pages.filter(p => !p.blank));
    let hint = '· automatisch erkannt, bitte prüfen';
    if (state.einv) {
      const d = state.einv.data;
      Object.assign(r, Object.fromEntries(Object.entries({ date: d.date, type: d.type, sender: d.sender, deadline: d.deadline, amount: d.amount, iban: d.iban,
        invoiceNo: d.invoiceNo, customerNo: d.reference !== d.invoiceNo ? d.reference : '', subject: `${d.type} ${d.invoiceNo}`.trim() }).filter(([, v]) => v)));
      hint = `· E-Rechnung: ${d.format} – Daten verbindlich aus dem XML`;
      window.einvChkShow?.();
    } else {
      window.einvChkShow?.(true);
      const pay = state.pages.find(p => p.payQr)?.payQr;
      if (pay) {
        r.iban = pay.iban; if (pay.amount) r.amount = pay.amount; if (!r.sender && pay.name) r.sender = pay.name;
        if (!r.type || r.type === 'Brief') r.type = 'Rechnung';
        hint = `· Zahldaten exakt aus dem ${pay.kind}`;
      }
      const learned = ruleFor(r.sender);       // js/pro.js: früher korrigierter Typ für diesen Absender
      if (learned && learned !== r.type) { r.type = learned; hint = '· erkannt, Typ wie zuletzt bei diesem Absender'; }
    }
    for (const k of META_KEYS) if (!state.touched[k]) state.meta[k] = r[k] || '';
    state.meta.appealRule = r.appealRule || '';   // Rechtsbehelfsbelehrung erkannt → Einspruchsfrist aus dem Bescheiddatum
    window.routeForLetter?.();
    window.suggestAkte?.();   // Akte vorschlagen (gleiches Aktenzeichen bzw. letzter Absender)
    window.suggestFields?.();   // eigene Felder (Mandant, Projekt …) ebenso
    $('#anaHint').textContent = hint;
    if ($('#expDlg').open && !$('#x-name').dataset.touched) $('#x-name').value = baseName();
  }
  renderSide();
}
function filename() {
  if (state.touched.fname) { const v = $('#fname').value.trim() || 'Scan'; return /\.pdf$/i.test(v) ? v : v + '.pdf'; }
  return Letter.buildFilename(state.meta);
}
function targetPath(meta) {
  return [S.byYear && (meta.date || '').slice(0, 4), S.byType && Letter.folderName(meta.type || 'Sonstiges')].filter(Boolean).join('\\');
}
function renderSide() {
  window.renderTodo?.();
  for (const k of META_KEYS) { const el = $('#m-' + k); if (el && document.activeElement !== el) el.value = state.meta[k] || ''; }
  if (document.activeElement !== $('#fname')) $('#fname').value = filename();
  $('#ptext').value = pageText(cur());
  const sub = targetPath(state.meta);
  $('#outHint').textContent = state.outDir ? `Ablage: ${state.outDir.name}${sub ? '\\' + sub : ''} (ohne Dialog)` : 'Ablage: Speichern-Dialog (Ablageordner wählen für automatische Ablage)';
  $('#btnIcs').disabled = !state.meta.deadline;
  renderGiro();
  renderResults();
}
// GiroCode: Rechnung mit der Banking-App scannen statt IBAN abtippen
let giroLast = '';
function renderGiro() {
  const pl = state.pages.length ? Letter.epcPayload(state.meta) : null;
  $('#giro').hidden = !pl || /gutschrift/i.test(state.meta.type);
  if (!pl || pl === giroLast) return;
  if (typeof qrcode !== 'function') { loadQrcode().then(() => { if (typeof qrcode === 'function') renderGiro(); }, () => { $('#giro').hidden = true; }); return; }   // erst laden, dann zeichnen
  giroLast = pl;
  try {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const q = qrcode(0, 'M'); q.addData(pl, 'Byte'); q.make();
    $('#giroQr').innerHTML = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  } catch (e) { console.warn('GiroCode:', e); $('#giro').hidden = true; }
}
for (const k of META_KEYS) {
  $('#m-' + k).addEventListener('input', e => {
    state.meta[k] = e.target.value; state.touched[k] = true;
    if (document.activeElement !== $('#fname')) $('#fname').value = filename();
    $('#btnIcs').disabled = !state.meta.deadline;
    renderGiro(); window.renderTodo?.();
  });
}
document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
  const v = $('#m-' + b.dataset.copy).value; if (!v) return;
  try { await navigator.clipboard.writeText(v); status(`Kopiert: ${v}`); } catch { status('Kopieren nicht möglich.'); }
});
$('#fname').addEventListener('input', () => { state.touched.fname = true; });
$('#copyText').onclick = async () => { try { await navigator.clipboard.writeText($('#ptext').value); status('Text kopiert.'); } catch { $('#ptext').select(); document.execCommand('copy'); } };
const MIMES = { pdf: 'application/pdf', xml: 'text/xml', txt: 'text/plain', csv: 'text/csv', json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip', eml: 'message/rfc822', msg: 'application/vnd.ms-outlook' };
const mimeOf = name => MIMES[(/\.([a-z0-9]+)$/i.exec(name || '') || [])[1]?.toLowerCase()] || 'application/octet-stream';
// PDF/A-Datei? (Kennung pdfaid:part in den XMP-Metadaten)
const isPdfA = b => { if (!b || b[0] !== 0x25 || b[1] !== 0x50) return false; const s = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 4 << 20))); return /pdfaid:part\s*(>|=)\s*["']?[1-4]/.test(s); };
function download(data, name, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$('#btnIcs').onclick = () => {
  const ics = Letter.buildIcs(state.meta, filename()); if (!ics) return;
  download(ics, filename().replace(/\.pdf$/i, '') + '_Frist.ics', 'text/calendar');
  status('Kalendereintrag erstellt – Datei öffnen, um ihn in Outlook zu übernehmen.');
};

/* ---------- Suche ---------- */
$('#q').addEventListener('input', e => { state.query = e.target.value.trim().toLowerCase(); $('#qRedact').hidden = state.query.length < 2; renderResults(); renderAnns(); renderThumbs(); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nextHit(e.shiftKey ? -1 : 1); } });
// Suchtreffer je Seite (für Seitenvorschauen und „nächster Treffer“)
function hitCount(p) { const q = state.query; if (!q || q.length < 2) return 0; const lo = pageText(p).replace(/\s+/g, ' ').toLowerCase(); let n = 0, at = lo.indexOf(q); while (at >= 0 && n < 99) { n++; at = lo.indexOf(q, at + q.length); } return n; }
function nextHit(dir = 1) {
  const n = state.pages.length; if (!n || !state.query) return;
  for (let k = 1; k <= n; k++) { const i = (state.sel + dir * k + n * k) % n; if (hitCount(state.pages[i])) { state.sel = i; refresh(); return; } }
}
function renderResults() {
  const box = $('#results'); box.innerHTML = ''; const q = state.query; if (!q) return;
  let hits = 0;
  const pagesHit = state.pages.filter(hitCount).length, total = state.pages.reduce((s, p) => s + hitCount(p), 0);
  if (total) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = `${total} Treffer auf ${pagesHit} Seite(n) – Enter springt zur nächsten Seite mit Treffer.`; box.append(h); }
  state.pages.forEach((p, i) => {
    const t = pageText(p).replace(/\s+/g, ' '), lo = t.toLowerCase(); let at = lo.indexOf(q);
    while (at >= 0 && hits < 30) {
      const b = document.createElement('button');
      b.textContent = `S. ${i + 1}: …${t.slice(Math.max(0, at - 30), at + q.length + 40)}…`;
      b.onclick = () => { state.sel = i; refresh(); };
      box.append(b); hits++; at = lo.indexOf(q, at + q.length);
    }
  });
  if (!hits) box.innerHTML = '<div class="hint">Keine Treffer.</div>';
}

/* ---------- PDF erzeugen ---------- */
const canvasToJpeg = (c, q) => new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/jpeg', q));
// Bild ins PDF: JPEG, wenn der Browser es erzeugen kann – sonst (manche WebKit-Varianten) verlustfrei als PNG
const isJpeg = b => b && b[0] === 0xFF && b[1] === 0xD8;
async function embedCanvas(out, c, q) {
  const j = await canvasToJpeg(c, q);
  if (isJpeg(j)) return out.embedJpg(j);
  return out.embedPng(await new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/png')));
}
const hexRgb = c => rgb(...[1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16) / 255));
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const assets = {};
const asset = (k, path) => assets[k] ||= fetch(abs(path)).then(r => { if (!r.ok) throw new Error(path + ' fehlt'); return r.arrayBuffer(); });
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Größenstufen: Qualität, Auflösung, ob auch Vektor-Seiten als Bild neu aufgebaut werden
const SIZES = {
  original: { q: 0.92, dpi: 300, rasterAll: false, label: 'Original' },
  balanced: { q: 0.75, dpi: 200, rasterAll: false, label: 'Ausgewogen' },
  small: { q: 0.55, dpi: 120, rasterAll: true, label: 'Klein' },
};
const A4W_IN = 8.27;
function scaleToDpi(c, dpi) {
  const target = Math.round(A4W_IN * dpi);
  if (c.width <= target * 1.05) return c;
  const k = Imaging.canvas(target, Math.round(c.height * target / c.width));
  const x = k.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, k.width, k.height);
  return k;
}

/* Schriften für Text: DejaVu Sans / Serif / Mono, je mit fett und kursiv – im Browser, im Bild und eingebettet im PDF identisch */
const TEXT_FONTS = {
  sans: ['DejaVuSans.ttf', 'dejavu/DejaVuSans-Bold.ttf', 'dejavu/DejaVuSans-Oblique.ttf', 'dejavu/DejaVuSans-BoldOblique.ttf'],
  serif: ['dejavu/DejaVuSerif.ttf', 'dejavu/DejaVuSerif-Bold.ttf', 'dejavu/DejaVuSerif-Italic.ttf', 'dejavu/DejaVuSerif-BoldItalic.ttf'],
  mono: ['dejavu/DejaVuSansMono.ttf', 'dejavu/DejaVuSansMono.ttf', 'dejavu/DejaVuSansMono.ttf', 'dejavu/DejaVuSansMono.ttf'],
};
const FONT_CSS = { sans: '"DejaVu Sans"', serif: '"DejaVu Serif"', mono: '"DejaVu Sans Mono"' };
const fontFam = a => TEXT_FONTS[a.font] ? a.font : 'sans';
const fontPath = a => 'vendor/' + TEXT_FONTS[fontFam(a)][(a.bold ? 1 : 0) + (a.italic && fontFam(a) !== 'mono' ? 2 : 0)];
const cssFont = (a, px) => `${a.italic && fontFam(a) !== 'mono' ? 'italic ' : ''}${a.bold ? 'bold ' : ''}${px}px ${FONT_CSS[fontFam(a)]}`;
// Schrift aus dem PDF deuten: Familie (pdf.js), fett/kursiv aus Schriftobjekt oder Name (z. B. „ABCDEF+Times-BoldItalic“)
function fontInfo(pg, styles, name) {
  let o = null; try { o = pg.commonObjs.get(name); } catch {}
  const n = String(o?.name || o?.loadedName || '') + ' ' + String(styles[name]?.fontFamily || '');
  const fam = /mono|courier|consol|menlo/i.test(n) ? 'mono' : /serif/i.test(styles[name]?.fontFamily || '') && !/sans-serif/i.test(styles[name]?.fontFamily || '') || /times|roman|georgia|garamond|cambria|book|minion|palatino/i.test(n) ? 'serif' : 'sans';
  return { font: fam, bold: !!(o?.bold || o?.black) || /bold|black|heavy|semibold|demi/i.test(n), italic: !!o?.italic || /italic|oblique/i.test(n) };
}
// Farben der Zeile aus dem Seitenbild: Hintergrund (häufigste helle Farbe) und Schriftfarbe (dunkelste Pixel)
async function lineColors(p, r) {
  let c = p.processed;
  if (!c && p.kind === 'pdf') c = await renderPdf(p, 100);
  if (!c?.getContext) return null;
  const x = Math.max(0, Math.floor(r.x * c.width)), y = Math.max(0, Math.floor(r.y * c.height));
  const w = Math.min(c.width - x, Math.ceil(r.w * c.width)), h = Math.min(c.height - y, Math.ceil(r.h * c.height));
  if (w < 2 || h < 2) return null;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2], 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]]);
  px.sort((a, b) => a[3] - b[3]);
  const avg = arr => [0, 1, 2].map(k => Math.round(arr.reduce((s, q) => s + q[k], 0) / arr.length));
  const hex = v => '#' + v.map(n => n.toString(16).padStart(2, '0')).join('');
  const bg = avg(px.slice(Math.floor(px.length * 0.6))), ink = avg(px.slice(0, Math.max(1, Math.floor(px.length * 0.06))));
  const lum = v => 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
  // kein erkennbarer Kontrast (leere Stelle): Standard behalten
  // Strichstärke (für „fett“ bei Scans): mittlere waagerechte Lauflänge der Schrift-Pixel im Verhältnis zur Zeilenhöhe
  const thr = (lum(bg) + lum(ink)) / 2, runs = [];
  for (let yy = 0; yy < h; yy++) {
    let run = 0;
    for (let xx = 0; xx <= w; xx++) {
      const i = (yy * w + xx) * 4, dark = xx < w && 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < thr;
      if (dark) run++; else if (run) { runs.push(run); run = 0; }
    }
  }
  runs.sort((a, b) => a - b);
  const stroke = runs.length > 20 ? runs[Math.floor(runs.length / 2)] / (h / 1.24) : 0;
  return { fill: hex(bg), color: lum(bg) - lum(ink) > 60 ? hex(ink) : null, stroke, px: h / 1.24 };
}
/* Serifen im Seitenbild erkennen (für Scans ohne Schriftdaten): Für jeden senkrechten Stamm in halber x-Höhe wird der Strich
   an der Grundlinie darunter betrachtet – ist er nach beiden Seiten breiter, ist es ein Serifenfuß, ist er gleich breit, ein
   serifenloser Stamm (einseitige Bodenstriche wie bei E, L, 2 zählen nicht). Ergebnis: [Füße, gerade Stämme] oder null.
   Kalibriert an Times, Georgia, Cambria, DejaVu Serif gegen Arial, Calibri, Verdana, Segoe UI, DejaVu Sans; Zeile vorher vergrößert. */
function serifVotes(src, x, y, w, h) {
  if (h / 1.24 < 18) return null;   // zu klein für eine verlässliche Aussage (Erkennungsfeld ≈ Versalhöhe; 18 px ≈ 25 px Schrift)
  const k = Math.max(1, Math.ceil(100 / h)), c = Imaging.canvas(w * k, h * k), cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  const W = c.width, H = c.height, d = cx.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const srt = Float32Array.from(L).sort(), thr = (srt[Math.floor(srt.length * 0.03)] + srt[Math.floor(srt.length * 0.7)]) / 2;
  const runsAt = yy => { const out = []; let s0 = -1; for (let xx = 0; xx <= W; xx++) { const dark = xx < W && L[yy * W + xx] < thr; if (dark && s0 < 0) s0 = xx; else if (!dark && s0 >= 0) { out.push([s0, xx]); s0 = -1; } } return out; };
  const rows = []; for (let yy = 0; yy < H; yy++) rows.push(runsAt(yy).reduce((s2, r) => s2 + r[1] - r[0], 0));
  const mx = Math.max(...rows); let base = -1, top = -1;
  for (let yy = 0; yy < H; yy++) if (rows[yy] > mx * 0.35) { if (top < 0) top = yy; base = yy; }   // x-Höhe: oberste/unterste volle Zeile
  if (base - top < 8) return null;
  const mid = runsAt(Math.round((top + base) / 2)), sv = mid.map(r => r[1] - r[0]).sort((m, n) => m - n)[mid.length >> 1] || 1;
  let foot = 0, plain = 0;
  for (const yy of [base - 1, base]) for (const [b0, b1] of runsAt(yy)) {
    const stems = mid.filter(([m0, m1]) => m0 >= b0 - sv * 0.2 && m1 <= b1 + sv * 0.2 && m1 - m0 < sv * 1.8);
    if (stems.length !== 1) continue;
    const [m0, m1] = stems[0], l = m0 - b0, r = b1 - m1;
    if (l > sv * 0.35 && r > sv * 0.35) foot++; else if (l < sv * 0.25 && r < sv * 0.25) plain++;
  }
  return [foot, plain];
}
// Serifen über mehrere Zeilen (Absatz/Block) zählen – Anteil der Füße 0–1, -1 = keine sichere Aussage
async function serifOfLines(p, lines) {
  let c = p.processed; if (!c && p.kind === 'pdf') c = await renderPdf(p, 100);
  if (!c?.getContext) return -1;
  let foot = 0, plain = 0;
  for (const l of lines.slice(0, 6)) {
    const x0 = Math.min(...l.map(w => w.x)), x1 = Math.max(...l.map(w => w.x + w.w)), y0 = Math.min(...l.map(w => w.y)), y1 = Math.max(...l.map(w => w.y + w.h)), h = y1 - y0;
    const X = Math.max(0, Math.floor((x0 - h * 0.1) * c.width)), Y = Math.max(0, Math.floor((y0 - h * 0.12) * c.height));
    const W = Math.min(c.width - X, Math.ceil((x1 - x0 + h * 0.2) * c.width)), H = Math.min(c.height - Y, Math.ceil(h * 1.24 * c.height));
    if (W < 4 || H < 4) continue;
    const v = serifVotes(c, X, Y, W, H); if (v) { foot += v[0]; plain += v[1]; }
  }
  return foot + plain >= 6 ? foot / (foot + plain) : -1;
}

/* „Text ändern“: Zeile unter dem Klick finden, in Hintergrundfarbe abdecken und als bearbeitbaren Text darüberlegen –
   mit gleicher Schrift (mit/ohne Serifen, Festbreite, fett, kursiv), Farbe und Breite wie das Original */
async function editLineAt(p, s) {
  let words = p.ocr?.words || null;
  if (!words && p.kind === 'pdf' && p.native) words = p.nwords || (p.nwords = await nativeWords(p));
  if (!words || !words.length) return status(p.busy ? 'Texterkennung läuft noch – gleich noch einmal klicken.' : 'Auf dieser Seite ist kein Text erkannt. Zuerst „Text erkennen (OCR)“ – oder mit „Abdecken“ und „Text“ arbeiten.');
  const prot = pageProt(p);
  if (prot === 'urkunde') return status(PROT_MSG.urkunde);
  const pad = 0.004, hit = words.find(w => s.x >= w.x - pad && s.x <= w.x + w.w + pad && s.y >= w.y - pad && s.y <= w.y + w.h + pad);
  if (!hit) return status('Bitte direkt auf eine Textzeile klicken.');
  if (sigWarn(p, () => editLineAt(p, s))) return;
  // ganzer Absatz (mehrere Zeilen fließen beim Ändern neu); eine einzelne Zeile wie bisher
  const para = Letter.paragraphAround(words, hit, (p.h || 1.414) / (p.w || 1));
  const { cover, a } = await buildEdit(p, para, prot);
  pushUndo(p);
  p.annots.push(cover, a);
  if (prot) status(PROT_MSG[prot]); state.editing = a.id; state.annSel = a.id; state.dirty = true;
  renderAnns();
}
/* Abdeckung + originalgetreuer Ersatztext für einen Absatz/eine Zeile (Schrift, Farbe, Hintergrund, Breite, Zeilenabstand) –
   gemeinsam für „Text ändern“ und „Suchen & Ersetzen“. para: { lines, text, spacing, right, flow } wie Letter.paragraphAround */
async function buildEdit(p, para, prot) {
  const line = para.lines.flat(), first = para.lines[0], multi = para.lines.length > 1;
  const x0 = Math.min(...line.map(w => w.x)), x1 = Math.max(...line.map(w => w.x + w.w)), Y1 = Math.max(...line.map(w => w.y + w.h));
  const y0 = Math.min(...first.map(w => w.y)), h = Math.max(...first.map(w => w.y + w.h)) - y0, H = p.h || 1, W = p.w || 1;
  const y1 = multi ? Y1 : y0 + h;
  const cover = { id: ++uid, type: 'wo', x: x0 - h * 0.12, y: y0 - h * 0.12, w: x1 - x0 + h * 0.24, h: y1 - y0 + h * 0.24 };
  const text = para.text;
  // Schrift: häufigste in der Zeile (PDF-Text); bei OCR ohne Serifen
  const fi = line.map(w => w.f).filter(Boolean), key = f => `${f.font}${+f.bold}${+f.italic}`;
  const f = fi.sort((a, b) => fi.filter(x => key(x) === key(b)).length - fi.filter(x => key(x) === key(a)).length)[0] || { font: 'sans', bold: false, italic: false };
  const col = await lineColors(p, multi ? { x: cover.x, y: cover.y, w: cover.w, h: h * 1.24 } : cover).catch(() => null);   // erste Zeile (Strichstärke je Zeilenhöhe)
  if (col) cover.fill = col.fill;
  // Scan/OCR ohne Schriftdaten: fett an der Strichstärke erkennen (normal ≈ 0,09–0,10, fett ≈ 0,2 der Zeilenhöhe; erst ab ~24 px Zeilenhöhe verlässlich)
  if (!fi.length && col?.px >= 24 && col.stroke > 0.145) f.bold = true;
  if (!fi.length && await serifOfLines(p, para.lines).catch(() => -1) >= 0.5) f.font = 'serif';   // Scan: Serifenfüße an der Grundlinie erkannt
  let sz = h * H / W * 0.95;   // Schriftgröße relativ zur Seitenbreite (wie beim Text-Werkzeug)
  const a = { id: ++uid, type: 'text', x: x0, y: 0, w: 0, h: 0, text, fs: sz, color: col?.color || '#111111', font: f.font, bold: f.bold, italic: f.italic, orig: text, cover: cover.id };
  // Breite angleichen: Ersatztext so groß, dass er so breit läuft wie das Original (in Grenzen, damit die Höhe passt)
  try {
    await document.fonts.load(cssFont(a, 40));
    const m = document.createElement('canvas').getContext('2d'); m.font = cssFont(a, 100);
    // Bezug: breiteste Zeile (bei Absätzen ohne die kurze letzte Zeile) – Ersatztext läuft so breit wie das Original
    const ref = (multi ? para.lines.slice(0, -1) : para.lines).map(l => ({ t: l.map(w => w.t).join(' '), w: Math.max(...l.map(w => w.x + w.w)) - Math.min(...l.map(w => w.x)) })).sort((m1, m2) => m2.w - m1.w)[0];
    const tw = m.measureText(ref.t).width / 100;   // Breite bei Schriftgröße 1 (in Seitenbreiten je fs)
    // Höhe wie im Original behalten, Breite über die Laufweite angleichen (DejaVu läuft z. B. breiter als Times); erst darüber hinaus die Größe
    if (tw > 0) { const k = ref.w / (tw * sz); a.sx = +clamp(k, 0.75, 1.2).toFixed(3); sz = clamp(sz * k / a.sx, sz * 0.8, sz * 1.2); if (Math.abs(a.sx - 1) < 0.01) delete a.sx; }
  } catch {}
  a.fs = sz; a.y = y0 + 0.8 * h - 0.95 * sz * W / H;
  if (multi) {
    // Block (Anschrift, Liste): Zeilen bleiben, kein Umbruch nötig – breit genug, damit nichts unerwartet umbricht
    a.w = para.flow ? para.right - x0 + sz * 0.15 * (a.sx || 1) : 0;                              // Umbruchbreite = rechter Rand des Absatzes
    a.lh = +(para.spacing * H / (sz * W)).toFixed(3) || 1.2;        // Zeilenabstand wie im Original
  }
  if (prot) cover.mark = true;
  return { cover, a };
}
// Wort liegt unter einer Abdeckung (schon ersetzt/abgedeckt) – zählt bei der Suche nicht mehr
const coveredWord = (p, w) => p.annots.some(a => a.type === 'wo' && overlaps(a, w));
async function pageWords(p) {
  if (p.ocr?.words) return p.ocr.words;
  if (p.kind === 'pdf' && p.native) return p.nwords || (p.nwords = await nativeWords(p) || []);
  return null;
}
/* Suchen & Ersetzen auf einer Seite: jede betroffene Zeile wird wie bei „Text ändern“ originalgetreu ersetzt.
   only = Nummer des Treffers auf der Seite (nur diesen), sonst alle. Urkunden/Bescheide: gesperrt; Kontoauszüge/Nachweise: markiert. */
async function replaceOnPage(p, q, repl, only = null) {
  const words = await pageWords(p);
  if (!words || !words.length) return { n: 0 };
  const prot = pageProt(p);
  if (prot === 'urkunde') return { n: 0, blocked: true };
  const ql = q.toLowerCase();
  let hits = words.filter(w => w.t.toLowerCase().includes(ql) && !coveredWord(p, w));
  if (only != null) hits = hits[only] ? [hits[only]] : [];
  const seen = new Set(), lines = [];
  for (const h of hits) {
    const l = Letter.lineAround(words, h), key = l.map(w => words.indexOf(w)).join(',');
    if (!seen.has(key)) { seen.add(key); lines.push(l); }
  }
  if (!lines.length) return { n: 0 };
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  pushUndo(p);
  let n = 0;
  for (const l of lines) {
    const orig = l.map(w => w.t).join(' '), text = orig.replace(re, () => repl);
    if (text === orig) continue;
    const { cover, a } = await buildEdit(p, { lines: [l], text, spacing: 0, right: Math.max(...l.map(w => w.x + w.w)), flow: false }, prot);
    a.orig = orig;
    p.annots.push(cover);
    if (text.trim()) p.annots.push(a);
    n += (orig.match(re) || []).length;
  }
  if (n) state.dirty = true;
  else if (state.undoBatch) state.undoBatch = state.undoBatch.filter(x => x.id !== p.id);   // nichts geändert: Seite nicht im Rückgängig-Schritt
  else state.undo.pop();
  return { n, prot };
}

/* QR-Codes einer Seite: PDFMy-Trennblatt (Seite wird zur Trennstelle) oder GiroCode/QR-Rechnung (exakte Zahldaten) */
function readQr(p, img) {
  if (typeof QR === 'undefined') return;
  // jsQR noch nicht geladen (Datei direkt beim Start geöffnet): nachladen, dann diese Seite prüfen und die Briefdaten aktualisieren
  if (typeof jsQR !== 'function') { loadJsQR().then(() => { if (typeof jsQR !== 'function') return; const had = !!(p.payQr || p.separator); readQr(p, img); if (!had && (p.payQr || p.separator)) { analyze(); refresh(); } }).catch(() => {}); return; }
  for (const t of QR.scan(img)) {
    if (t === QR.SEPARATOR) { p.blank = true; p.separator = true; p.label += ' (Trennblatt)'; }
    else { const pay = Letter.parsePaymentQr(t); if (pay && !p.payQr) p.payQr = pay; }
  }
}

/* Textebene aus vorhandenem PDF-Text (schneller und genauer als OCR), nur für ungedrehte Seiten */
async function nativeWords(p) {
  if (p.rotation % 180 !== 0) return null;
  const pg = await state.docs[p.docIdx].js.getPage(p.pageIdx + 1);
  const vp = pg.getViewport({ scale: 1, rotation: p.rotation }), tc = await pg.getTextContent(), out = [], fonts = {};
  try { await pg.getOperatorList(); } catch {}   // lädt die Schriftobjekte (fett/kursiv)
  for (const it of tc.items) {
    const t = it.str.trim(); if (!t || !it.width) continue;
    const fs = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10, tx = it.transform[4], ty = it.transform[5];
    const [x1, y1] = vp.convertToViewportPoint(tx, ty - fs * 0.2), [x2, y2] = vp.convertToViewportPoint(tx + it.width, ty + fs * 0.8);
    out.push({ t, x: Math.min(x1, x2) / vp.width, y: Math.min(y1, y2) / vp.height, w: Math.abs(x2 - x1) / vp.width, h: Math.abs(y2 - y1) / vp.height,
      f: fonts[it.fontName] ||= fontInfo(pg, tc.styles || {}, it.fontName) });
  }
  return out;
}

/* Quelldokument für pdf-lib: ausgefülltes Formular bevorzugen, Rechte-Schutz (nur Besitzer-Passwort) entfernen */
async function libFor(d) {
  if (d.lib) return d.lib;
  let lib = await PDFDocument.load(d.filled || d.bytes, { ignoreEncryption: true, updateMetadata: false });
  if (lib.isEncrypted) {
    const C = await getCrypt();
    const plain = await (await C.PDFDocument.load(d.filled || d.bytes, { ignoreEncryption: true, password: '', updateMetadata: false })).save();
    lib = await PDFDocument.load(plain, { updateMetadata: false });
  }
  return d.lib = lib;
}

// Kopfzeile oben mittig, Fußzeile unten links, Bates-Nummer unten rechts – mit Platzhaltern {seite} {seiten} {datum} {datei} {bates}
function stampTexts(i, n, o) {
  const v = { seite: i + 1, seiten: n, datum: o.date || new Date().toLocaleDateString('de-DE'), datei: o.docName || '', bates: o.bates ? Tools.bates(o.bates.prefix, o.bates.start + i) : '' };
  return { head: Tools.fillStamp(o.header, v).trim(), foot: Tools.fillStamp(o.footer, v).trim(), bates: v.bates };
}
const hasStamp = o => !!o.filesDirty || (o.pageNumbers && o.pageNumbers !== 'none') || !!o.watermark || !!o.header || !!o.footer || !!o.bates || !!o.letterhead || !!o.clean || !!o.trim || !!o.a4 || !!o.gray || (!!o.sheet && o.sheet !== '1');
// Bereich mit Inhalt je Seite (PDF-Koordinaten) für „Weiße Ränder entfernen“: die fertige PDF grob zeichnen und dunkle Pixel suchen.
// Einzelne Staubkörner (Scans) zählen nicht – eine Zeile/Spalte gilt erst ab einigen dunklen Pixeln als Inhalt.
async function inkBoxes(bytes) {
  const js = await openPdf(bytes.slice()), res = [];
  try {
    for (let i = 1; i <= js.numPages; i++) {
      const pg = await js.getPage(i), sc = 0.6, vp = pg.getViewport({ scale: sc, rotation: 0 });
      const c = Imaging.canvas(Math.max(1, Math.round(vp.width)), Math.max(1, Math.round(vp.height))), x = c.getContext('2d', { willReadFrequently: true });
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: x, viewport: vp, intent: 'print' }).promise;
      const { data } = x.getImageData(0, 0, c.width, c.height), W = c.width, H = c.height, rows = new Uint32Array(H), cols = new Uint32Array(W);
      for (let y = 0; y < H; y++) for (let k = 0; k < W; k++) { const o = (y * W + k) * 4; if (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114 < 225) { rows[y]++; cols[k]++; } }
      c.width = 0;
      const minR = Math.max(1, W * 0.004), minC = Math.max(1, H * 0.004);
      let y0 = rows.findIndex(v => v >= minR), x0 = cols.findIndex(v => v >= minC);
      const y1 = H - 1 - [...rows].reverse().findIndex(v => v >= minR), x1 = W - 1 - [...cols].reverse().findIndex(v => v >= minC);
      if (y0 < 0 || x0 < 0) { res.push(null); continue; }
      const v = pg.view;   // [x0, y0, x1, y1] des sichtbaren Bereichs
      res.push([v[0] + x0 / sc, v[3] - (y1 + 1) / sc, v[0] + (x1 + 1) / sc, v[3] - y0 / sc]);
    }
  } finally { js.destroy?.(); }
  return res;
}
// Briefbogen unter jede Seite (wie „PDF Overlay“ bei PDF24): Seite 1 des Briefbogens unter die erste Seite, Seite 2 (falls vorhanden)
// unter alle weiteren. Als eigener Inhaltsstrom VOR dem Seiteninhalt und als Artefakt markiert (PDF/UA: kein Inhalt fürs Vorlesen).
async function underlay(out, lhBytes) {
  const L = PDFLib, N = n => L.PDFName.of(n), ctx = out.context;
  const n = (await L.PDFDocument.load(lhBytes, { ignoreEncryption: true })).getPageCount();
  const [first, rest] = await out.embedPdf(lhBytes, n > 1 ? [0, 1] : [0]);
  for (const [i, page] of out.getPages().entries()) {
    const e = i === 0 || !rest ? first : rest, mb = page.getMediaBox();
    const name = page.node.newXObject('Lh', e.ref), sx = mb.width / e.width, sy = mb.height / e.height;
    const ref = ctx.register(ctx.flateStream(`q\n/Artifact BMC\n${sx} 0 0 ${sy} ${mb.x} ${mb.y} cm\n/${name.asString().slice(1)} Do\nEMC\nQ\n`));
    const raw = page.node.get(N('Contents')), cur = page.node.lookup(N('Contents'));
    if (cur instanceof L.PDFArray) cur.insert(0, ref);
    else page.node.set(N('Contents'), ctx.obj(raw ? [ref, raw] : [ref]));
  }
}

function stampPdf(page, font, W, H, ox, oy, i, n, o) {
  const T = stampTexts(i, n, o), sf = o.safe || (t => t), size = 9, grey = rgb(0.3, 0.3, 0.3);
  if (T.head) { const t = sf(T.head), tw = font.widthOfTextAtSize(t, size); page.drawText(t, { x: ox + (W - tw) / 2, y: oy + H - 24, size, font, color: grey }); }
  if (T.foot) page.drawText(sf(T.foot), { x: ox + 28, y: oy + 18, size, font, color: grey });
  if (T.bates) { const t = sf(T.bates), sz = 10, tw = font.widthOfTextAtSize(t, sz); page.drawText(t, { x: ox + W - 28 - tw, y: oy + (o.pageNumbers === 'right' ? 32 : 18), size: sz, font, color: rgb(0, 0, 0) }); }
  if (o.pageNumbers && o.pageNumbers !== 'none') {
    const t = `${i + 1} / ${n}`, size = 9, tw = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: ox + (o.pageNumbers === 'right' ? W - 28 - tw : (W - tw) / 2), y: oy + 18, size, font, color: rgb(0.35, 0.35, 0.35) });
  }
  if (o.watermark) {
    const t = o.watermark, ang = Math.atan2(H, W);
    const size = Math.min(Math.hypot(W, H) * 0.7 / font.widthOfTextAtSize(t, 1), H * 0.2), tw = font.widthOfTextAtSize(t, size);
    const x = ox + W / 2 - Math.cos(ang) * tw / 2 + Math.sin(ang) * size * 0.35, y = oy + H / 2 - Math.sin(ang) * tw / 2 - Math.cos(ang) * size * 0.35;
    page.drawText(t, { x, y, size, font, color: rgb(0.75, 0.1, 0.1), opacity: 0.18, rotate: degrees(ang * 180 / Math.PI) });
  }
}

/* PDF/UA-1 (ISO 14289-1): Strukturbaum und Kennzeichnung der Inhalte.
   Echter Inhalt (Text, Unterschrift, Notiz, Stempel) wird getaggt, alles Übrige (Scanbild, Markierung, Seitenzahlen …) ist Artefakt. */
function makeTagger(out) {
  const ctx = out.context, rootRef = ctx.nextRef(), docRef = ctx.nextRef(), kids = [], nums = [], objs = [];
  let pageNo = -1, mcid = 0, elems = null, pg = null;
  const op = (name, args = []) => pg.pushOperators(PDFOperator.of(name, args));
  return {
    page(page) { pageNo++; mcid = 0; elems = []; pg = page; page.node.set(PDFName.of('StructParents'), PDFNumber.of(pageNo)); nums.push([pageNo, elems]); },
    open(tag, extra = {}) {
      const id = mcid++, ref = ctx.register(ctx.obj({ Type: 'StructElem', S: tag, P: docRef, Pg: pg.ref, K: id, ...extra }));
      kids.push(ref); elems.push(ref);
      op(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of(tag), ctx.obj({ MCID: id })]);
    },
    artifact() { op(PDFOperatorNames.BeginMarkedContent, [PDFName.of('Artifact')]); },
    // Formularfeld (Widget) in die Struktur: StructElem „Form“ mit Objektverweis, Widget bekommt StructParent (PDF/UA-1 7.18)
    widget(wdict, page, tag = 'Form', extra = {}) {
      const key = pageNo + 1 + objs.length, wref = ctx.getObjectRef(wdict);
      const se = ctx.register(ctx.obj({ Type: 'StructElem', S: tag, P: docRef, Pg: page.ref, K: ctx.obj({ Type: 'OBJR', Obj: wref, Pg: page.ref }), ...extra }));
      kids.push(se); wdict.set(PDFName.of('StructParent'), PDFNumber.of(key)); objs.push([key, se]);
    },
    close() { op(PDFOperatorNames.EndMarkedContent); },
    finish() {
      ctx.assign(docRef, ctx.obj({ Type: 'StructElem', S: 'Document', P: rootRef, K: kids }));
      const flat = []; for (const [n, list] of nums) flat.push(n, ctx.obj(list));
      for (const [n, se] of objs) flat.push(n, se);
      ctx.assign(rootRef, ctx.obj({ Type: 'StructTreeRoot', K: docRef, ParentTree: ctx.obj({ Nums: flat }), ParentTreeNextKey: pageNo + 1 + objs.length }));
      out.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
      out.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));
      out.catalog.set(PDFName.of('ViewerPreferences'), ctx.obj({ DisplayDocTitle: true }));
    },
  };
}
// Formularfelder anlegen (Werkzeug „Formularfeld“): Textfeld, mehrzeilig, Datum, Kontrollkästchen – mit Tooltip (TU) für Screenreader,
// eingebetteter Schrift in den Erscheinungsbildern (PDF/A) und Struktur-Tags (PDF/UA). Kein JavaScript (in PDF/A verboten).
function addFormFields(out, list, T, font) {
  const form = out.getForm(), used = new Map(), tabbed = new Set();
  const uniq = n => { n = String(n || 'Feld').replace(/[.]/g, ' ').trim().slice(0, 60) || 'Feld'; const k = (used.get(n) || 0) + 1; used.set(n, k); return k > 1 ? `${n} ${k}` : n; };
  const radios = new Map(), pgs = out.getPages();   // Optionsfelder: eine Gruppe je Name und Seite
  for (const { page, x, y, w, h, a } of list) {
    if (a.ftype === 'radio') {
      const s = Math.min(w, h), key = a.name + '|' + pgs.indexOf(page);
      let g = radios.get(key);
      if (!g) {
        g = form.createRadioGroup(uniq(a.name)); radios.set(key, g);
        g.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(a.name + (a.req ? ' (Pflichtfeld)' : '')));
        if (a.req) g.enableRequired();
      }
      g.addOptionToPage(a.val || 'Option', page, { x, y, width: s, height: s, borderWidth: 0.75, borderColor: rgb(0.45, 0.48, 0.6), backgroundColor: rgb(0.95, 0.96, 1) });
      const wds = g.acroField.getWidgets(), wd = wds[wds.length - 1];
      wd.dict.set(PDFName.of('F'), PDFNumber.of(4));   // drucken
      if (T) T.widget(wd.dict, page);
      if (!tabbed.has(page)) { page.node.set(PDFName.of('Tabs'), PDFName.of('S')); tabbed.add(page); }
      continue;
    }
    const name = uniq(a.name), box = { x, y, width: w, height: h, borderWidth: 0.75, borderColor: rgb(0.45, 0.48, 0.6), backgroundColor: rgb(0.95, 0.96, 1) };
    let f;
    if (a.ftype === 'check') { const s = Math.min(w, h); f = form.createCheckBox(name); f.addToPage(page, { ...box, width: s, height: s }); }
    else if (a.ftype === 'select') { f = form.createDropdown(name); f.setOptions(a.opts?.length ? a.opts : ['Ja', 'Nein']); f.addToPage(page, { ...box, font }); f.updateAppearances(font); }
    else {
      f = form.createTextField(name);
      if (a.ftype === 'multi') f.enableMultiline();
      if (a.ftype === 'date') f.setMaxLength(10);
      f.addToPage(page, { ...box, font });   // eingebettete Schrift im Erscheinungsbild (PDF/A)
      f.updateAppearances(font);
    }
    if (a.req) f.enableRequired();
    const tip = (a.ftype === 'date' ? `${name} (Datum, TT.MM.JJJJ)` : a.ftype === 'select' ? `${name} (Auswahl: ${(a.opts || []).join(', ')})` : name) + (a.req ? ' (Pflichtfeld)' : '');
    f.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tip));
    for (const wd of f.acroField.getWidgets()) {
      wd.dict.set(PDFName.of('F'), PDFNumber.of(4));   // drucken
      if (T) T.widget(wd.dict, page);
    }
    if (!tabbed.has(page)) { page.node.set(PDFName.of('Tabs'), PDFName.of('S')); tabbed.add(page); }   // Tab-Reihenfolge nach Struktur
  }
  form.updateFieldAppearances(font);
  // PDF/A: nur das normale Erscheinungsbild (N) – „gedrückt“ (D) entfernen, auch nach dem Neuaufbau oben
  for (const fld of form.getFields()) for (const wd of fld.acroField.getWidgets()) { const ap = wd.dict.lookup(PDFName.of('AP')); if (ap instanceof PDFLib.PDFDict) ap.delete(PDFName.of('D')); }
}
// Links (Werkzeug „Link“): Webadresse, E-Mail oder Seite im Dokument. Nur http(s) und mailto – keine anderen Aktionen (Sicherheit, PDF/A).
function linkTarget(v) {
  v = String(v || '').trim(); if (!v) return null;
  const pg = v.match(/^(?:s(?:eite)?\.?\s*)?(\d{1,4})$/i);
  if (pg) { const i = +pg[1] - 1; return i >= 0 && i < state.pages.length ? { pid: state.pages[i].id } : { error: `Seite ${pg[1]} gibt es nicht (Dokument hat ${state.pages.length} Seiten).` }; }
  if (/^mailto:/i.test(v) || /^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(v)) return { url: /^mailto:/i.test(v) ? v : 'mailto:' + v };
  if (!/^https?:\/\//i.test(v)) { if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) v = 'https://' + v; else return { error: 'Bitte eine Webadresse (z. B. pdfmy.de), eine E-Mail-Adresse oder eine Seitenzahl eingeben.' }; }
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? { url: u.href } : { error: 'Nur Web- und E-Mail-Links sind erlaubt.' }; } catch { return { error: 'Diese Adresse ist ungültig.' }; }
}
function linkLabel(a) {
  if (a.pid != null) { const i = state.pages.findIndex(p => p.id === a.pid); return i < 0 ? '→ Seite fehlt' : `→ Seite ${i + 1}`; }
  return a.url ? a.url.replace(/^mailto:/i, '✉ ').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : '?';
}
function linkAsk(p, a) {
  const cur0 = a.pid != null ? String(state.pages.findIndex(x => x.id === a.pid) + 1) : (a.url || '').replace(/^mailto:/i, '');
  for (;;) {
    const v = prompt('Ziel des Links – Webadresse, E-Mail-Adresse oder Seitenzahl:', cur0); if (v == null) return false;
    const t = linkTarget(v); if (!t) return false;
    if (t.error) { alert(t.error); continue; }
    delete a.url; delete a.pid; Object.assign(a, t);
    state.dirty = true; state.annSel = a.id; status(`Link angelegt: ${linkLabel(a)} – in der gespeicherten PDF anklickbar. Doppelklick ändert das Ziel.`);
    return true;
  }
}
function addLinks(out, list, pages, T) {
  const ctx = out.context, outPages = out.getPages(), tabbed = new Set();
  for (const { page, x, y, w, h, a } of list) {
    let target, desc;
    if (a.pid != null) { const i = pages.findIndex(p => p.id === a.pid); if (i < 0) continue; target = { Dest: ctx.obj([outPages[i].ref, 'Fit']) }; desc = `Gehe zu Seite ${i + 1}`; }
    else if (a.url) { target = { A: ctx.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(a.url) }) }; desc = a.url.startsWith('mailto:') ? `E-Mail an ${a.url.slice(7)}` : `Link zu ${a.url}`; }
    else continue;
    const dict = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h], Border: [0, 0, 0], F: 4, Contents: PDFHexString.fromText(desc), ...target });
    const ref = ctx.register(dict);
    page.node.addAnnot(ref);
    if (T) T.widget(dict, page, 'Link', { Alt: PDFHexString.fromText(desc) });   // PDF/UA: Link-Struktur mit Beschreibung
    if (!tabbed.has(page)) { page.node.set(PDFName.of('Tabs'), PDFName.of('S')); tabbed.add(page); }
  }
}
// Markierungen als echte PDF-Anmerkungen (Highlight/Underline/StrikeOut mit QuadPoints und Erscheinungsbild):
// andere PDF-Programme zeigen sie als Kommentar und können sie entfernen; PDF/A: Erscheinungsbild /N, Druck-Flag; PDF/UA: Annot-Struktur mit Text
function addHighlights(out, list, T) {
  const ctx = out.context, tabbed = new Set(), f = n => +n.toFixed(2);
  for (const { page, x, y, w, h, a } of list) {
    const rs = (a.rects || [{ x: 0, y: 0, w: 1, h: 1 }]).map(r => ({ x: x + r.x * w, y: y + (1 - r.y - r.h) * h, w: r.w * w, h: r.h * h }));
    const col = hexRgb(a.style === 'ul' || a.style === 'st' ? hlLine(a) : (a.color || '#ffd400')), c = [col.red, col.green, col.blue].map(f);
    const quads = rs.flatMap(r => [r.x, r.y + r.h, r.x + r.w, r.y + r.h, r.x, r.y, r.x + r.w, r.y].map(f));
    const rect = [f(x), f(y), f(x + w), f(y + h)];
    let ops;
    if (a.style === 'ul' || a.style === 'st') {
      ops = `${c.join(' ')} RG ` + rs.map(r => { const lw = Math.max(0.8, r.h * 0.07), ly = a.style === 'ul' ? r.y + r.h * 0.1 : r.y + r.h * 0.45; return `${f(lw)} w ${f(r.x)} ${f(ly)} m ${f(r.x + r.w)} ${f(ly)} l S`; }).join(' ');
    } else ops = `/GS0 gs ${c.join(' ')} rg ` + rs.map(r => `${f(r.x)} ${f(r.y)} ${f(r.w)} ${f(r.h)} re f`).join(' ');
    const res = a.style === 'ul' || a.style === 'st' ? ctx.obj({}) : ctx.obj({ ExtGState: ctx.obj({ GS0: ctx.obj({ Type: 'ExtGState', BM: 'Multiply', ca: 0.45 }) }) });
    const ap = ctx.register(ctx.stream(ops, { Type: 'XObject', Subtype: 'Form', BBox: rect, Resources: res }));
    const what = a.style === 'ul' ? 'Unterstrichen' : a.style === 'st' ? 'Durchgestrichen' : 'Markiert', text = (a.text || '').slice(0, 2000);
    const dict = ctx.obj({ Type: 'Annot', Subtype: a.style === 'ul' ? 'Underline' : a.style === 'st' ? 'StrikeOut' : 'Highlight', Rect: rect, QuadPoints: quads, C: c, F: 4,
      Contents: PDFHexString.fromText(a.comment || (text ? `${what}: ${text}` : what)), AP: ctx.obj({ N: ap }), ...((a.author || S.author) ? { T: PDFHexString.fromText(a.author || S.author) } : {}) });
    const ref = ctx.register(dict);
    page.node.addAnnot(ref);
    if (T) T.widget(dict, page, 'Annot', { Alt: PDFHexString.fromText(a.comment || (text ? `${what}: ${text}` : what)) });
    if (!tabbed.has(page)) { page.node.set(PDFName.of('Tabs'), PDFName.of('S')); tabbed.add(page); }
  }
}
// beA (ERVB 2025): aus übernommenen Seiten Anhänge, Medien, JavaScript- und Startbefehle entfernen (Links und Formularfelder bleiben)
function beaClean(out, page) {
  const ctx = out.context, N = PDFName.of, arr = page.node.Annots(); page.node.delete(N('AA'));
  if (!arr) return;
  const bad = new Set(['FileAttachment', 'RichMedia', 'Sound', 'Movie', 'Screen', '3D']), badAct = /^\/(JavaScript|Launch|ImportData|Rendition|Movie|Sound)$/;
  for (let k = arr.size() - 1; k >= 0; k--) {
    const dict = ctx.lookup(arr.get(k)); if (!(dict instanceof PDFLib.PDFDict)) continue;
    if (bad.has(String(dict.get(N('Subtype')) || '').slice(1))) { arr.remove(k); continue; }
    dict.delete(N('AA'));
    const act = dict.lookup(N('A')); if (act instanceof PDFLib.PDFDict && badAct.test(String(act.get(N('S'))))) dict.delete(N('A'));
  }
}
// „Dokument bereinigen“ (wie „Bereinigen“ in Acrobat Pro): zusätzlich zu beaClean alle Anmerkungen der Vorlage außer Links
// (Kommentare, Notizen, Markierungen, Formular-Widgets) sowie Seiten-Metadaten, Programmdaten (PieceInfo) und Vorschaubilder entfernen
function deepClean(out, page) {
  beaClean(out, page);
  const ctx = out.context, N = PDFName.of;
  for (const k of ['Metadata', 'PieceInfo', 'Thumb', 'LastModified']) page.node.delete(N(k));
  const arr = page.node.Annots(); if (!arr) return;
  for (let k = arr.size() - 1; k >= 0; k--) { const d = ctx.lookup(arr.get(k)); if (!(d instanceof PDFLib.PDFDict) || String(d.get(N('Subtype'))) !== '/Link') arr.remove(k); }
}
// Beschriftung des Felds in der Bearbeitungsansicht: Art, Name, Auswahlwerte, Pflichtfeld
function fieldLabel(a) {
  const ico = { date: '📅 ', multi: '¶ ', select: '▾ ' }[a.ftype] || '';
  const tail = a.ftype === 'select' && a.opts?.length ? ` (${a.opts.join(' | ')})` : a.ftype === 'radio' ? `: ${a.val}` : '';
  return ico + a.name + tail + (a.req ? ' *' : '');
}
// Auswahlliste: Einträge abfragen (durch Komma oder Semikolon getrennt)
function fieldOpts(a) {
  const v = prompt('Einträge der Auswahlliste, durch Komma getrennt (z. B. Herr, Frau, Divers):', (a.opts || []).join(', '));
  if (v == null) return false;
  const o = [...new Set(v.split(/[,;]/).map(s => s.trim().slice(0, 80)).filter(Boolean))];
  if (!o.length) return false;
  a.opts = o; return true;
}
// Neues Formularfeld fertigstellen: Klick ohne Ziehen → Standardgröße; Name aus der Beschriftung links daneben
function fieldDone(p, a) {
  const ar = (p.w && p.h) ? p.w / p.h : 0.707;
  if (a.ftype === 'radio') return radioDone(p, a, ar);
  if (a.ftype === 'check') { const s = Math.max(a.w, a.h * (1 / ar), 0.022); a.w = s; a.h = s * ar; }
  else if (a.w < 0.02 || a.h < 0.008) { a.w = a.ftype === 'date' ? 0.16 : 0.32; a.h = a.ftype === 'multi' ? 0.08 : 0.026; a.y = Math.max(0, a.y - a.h / 2); }
  a.x = Math.min(a.x, 1 - a.w); a.y = Math.min(a.y, 1 - a.h);
  if (!a.name) {
    const words = p.ocr?.words || p.nwords || [], cy = a.y + a.h / 2;
    const left = words.filter(w => Math.abs(w.y + w.h / 2 - cy) < Math.max(a.h, w.h) * 0.7 && w.x + w.w <= a.x + 0.01 && a.x - (w.x + w.w) < 0.3).sort((m, n) => m.x - n.x);
    const above = words.filter(w => w.y + w.h <= a.y + 0.005 && a.y - (w.y + w.h) < 0.03 && w.x < a.x + a.w && w.x + w.w > a.x).sort((m, n) => m.x - n.x);
    const right = words.filter(w => Math.abs(w.y + w.h / 2 - cy) < Math.max(a.h, w.h) * 0.7 && w.x >= a.x + a.w - 0.01 && w.x - (a.x + a.w) < 0.05).sort((m, n) => m.x - n.x);
    const pick = a.ftype === 'check' ? (right.length ? right.slice(0, 4) : left.slice(-4)) : (left.length ? left.slice(-4) : above.slice(0, 4));   // Ankreuzfeld: Beschriftung meist rechts
    const label = pick.map(w => w.t).join(' ').replace(/[:_.…]+$/, '').trim();
    const n = p.annots.filter(x => x.type === 'field').length;
    a.name = label.slice(0, 40) || ({ text: 'Textfeld', multi: 'Text', date: 'Datum', check: 'Ankreuzfeld', select: 'Auswahl' }[a.ftype] + ' ' + n);
  }
  if (a.ftype === 'select' && !a.opts?.length && !fieldOpts(a)) a.opts = ['Ja', 'Nein'];
  state.dirty = true; state.annSel = a.id;
  status(`Formularfeld „${a.name}“ angelegt – Doppelklick zum Umbenennen. Beim Speichern wird es ein ausfüllbares Feld.`);
}
// Optionsfeld (Radiobutton): Felder mit gleichem Namen bilden eine Gruppe, von der nur eine Option gewählt werden kann.
// Gruppenname: Eingabefeld „Name“ oder die letzte Gruppe auf dieser Seite; Wert der Option: Beschriftung rechts daneben.
function radioDone(p, a, ar) {
  const s = Math.max(a.w, a.h * (1 / ar), 0.022); a.w = s; a.h = s * ar;
  a.x = Math.min(a.x, 1 - a.w); a.y = Math.min(a.y, 1 - a.h);
  const others = p.annots.filter(x => x.type === 'field' && x.ftype === 'radio' && x !== a), prev = others[others.length - 1];
  if (!a.name) a.name = prev?.name || 'Auswahl ' + (others.length + 1);
  const words = p.ocr?.words || p.nwords || [], cy = a.y + a.h / 2;
  const right = words.filter(w => Math.abs(w.y + w.h / 2 - cy) < Math.max(a.h, w.h) * 0.7 && w.x >= a.x + a.w - 0.01 && w.x - (a.x + a.w) < 0.05).sort((m, n) => m.x - n.x);
  const same = others.filter(x => x.name === a.name).map(x => x.val);
  let v = right.slice(0, 3).map(w => w.t).join(' ').replace(/[:_.…]+$/, '').trim().slice(0, 40) || 'Option ' + (same.length + 1);
  while (same.includes(v)) v += ' 2';
  a.val = v; if (prev?.name === a.name && prev.req) a.req = true;
  state.dirty = true; state.annSel = a.id;
  status(`Option „${a.val}“ der Gruppe „${a.name}“ angelegt – weitere Optionen daneben setzen. Doppelklick ändert Wert und Gruppe.`);
}
// Erkannte Wörter zu Zeilen in Lesereihenfolge gruppieren (Reihenfolge der Texterkennung beibehalten)
function textLines(words) {
  const lines = []; let cur = null;
  for (const w of words) {
    const cy = w.y + w.h / 2;
    if (cur && w.x >= cur.right - 0.015 && Math.abs(cy - cur.cy) < Math.max(cur.h, w.h) * 0.6) { cur.words.push(w); cur.right = w.x + w.w; }
    else lines.push(cur = { words: [w], cy, h: w.h, right: w.x + w.w });
  }
  return lines.map(l => l.words);
}

async function buildPdf(pages, meta, { pdfa = false, bea = false, onPage, size = 'balanced', pageNumbers = 'none', watermark = '', noOcr = false,
  header = '', footer = '', bates = null, docName = '', date = '', bookmarks = true, letterhead: lhBytes = null, clean = false, trim = false, a4 = false, files = null, gray = false } = {}) {
  GRAY = gray;
  try { return await buildPdfInner(...arguments); } finally { GRAY = false; }
}
async function buildPdfInner(pages, meta, { pdfa = false, bea = false, onPage, size = 'balanced', pageNumbers = 'none', watermark = '', noOcr = false,
  header = '', footer = '', bates = null, docName = '', date = '', bookmarks = true, letterhead: lhBytes = null, clean = false, trim = false, a4 = false, files = null, gray = false } = {}) {
  const preset = SIZES[size] || SIZES.balanced, stamps = { pageNumbers, watermark: (watermark || '').trim(), header, footer, bates, docName, date };
  const hasStamps = hasStamp(stamps);
  const out = await PDFDocument.create({ updateMetadata: false });
  out.registerFontkit(await loadFontkit());
  const font = await out.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true });
  const charset = new Set(font.getCharacterSet());
  let glf = null;   // Platzhalterschrift für Zeichen ohne Glyphe (einmal je Dokument)
  const safe = s => [...s].filter(ch => charset.has(ch.codePointAt(0))).join('');
  stamps.watermark = safe(stamps.watermark); stamps.safe = safe;
  const T = pdfa ? makeTagger(out) : null;   // barrierefrei (PDF/UA-1) zusammen mit PDF/A
  const fieldQ = [], linkQ = [], hlQ = [];   // Formularfelder und Links: nach den Seiten als echte PDF-Objekte anlegen
  const tagged = async (kind, fn, extra) => { if (T) kind === 'Artifact' ? T.artifact() : T.open(kind, extra); await fn(); if (T) T.close(); };
  // weitere Schriftschnitte (Serif, fett, kursiv …) nur bei Bedarf einbetten
  const fontsUsed = {};
  const fontFor = async a => {
    const path = fontPath(a); if (path === 'vendor/DejaVuSans.ttf') return { f: font, safe };
    if (!fontsUsed[path]) { const f = await out.embedFont(await asset('font:' + path, path), { subset: true }), cs = new Set(f.getCharacterSet()); fontsUsed[path] = { f, safe: t => [...t].filter(ch => cs.has(ch.codePointAt(0))).join('') }; }
    return fontsUsed[path];
  };

  for (const [i, p] of pages.entries()) {
    onPage ? onPage(i) : status(`Erzeuge Seite ${i + 1} von ${pages.length} …`, i / pages.length);
    const cover = p.annots.filter(a => a.type === 'rd' || a.type === 'wo');
    const raster = p.kind === 'image' || cover.length > 0 || pdfa || preset.rasterAll || gray ||
      (p.rotation !== 0 && (p.annots.length > 0 || !!p.ocr || hasStamps));
    let page, W, H, ox = 0, oy = 0, words = null;
    if (raster) {
      // Als Bild übernommene PDF-Seiten brauchen eine Textebene: vorhandenen Text übernehmen, sonst OCR
      if (p.kind === 'pdf' && !p.ocr) {
        if (p.native !== false) { const nw = await nativeWords(p); if (nw?.length) words = nw; }   // auch noch nicht angezeigte Seiten (Stapel)
        if (!words && !noOcr) { try { await ocrPage(p); } catch (e) { console.warn(e); } }
      }
      // Abdeckung ohne Text: immer erkennen – sonst greift der Fälschungsschutz (Urkunde/Kontoauszug/Nachweis) bei Scans nicht
      if (!words && !p.ocr && cover.some(a => a.type === 'wo')) { try { await ocrPage(p); } catch (e) { console.warn(e); } }
      // Scans kompakt (MRC): Schrift als scharfe 1-Bit-Ebene, Hintergrund nur bei Bedarf – sonst klassisch als JPEG
      // Kompakt (1-Bit-Schrift) nur bei ausreichender Auflösung – sehr kleine Fotos würden klumpig
      const compact = p.kind === 'image' && S.compact && size !== 'original' && effMode(p) !== 'original' && !p.lowRes;
      let c = p.kind === 'image' ? (compact ? p.processed : scaleToDpi(p.processed, preset.dpi)) : await renderPdf(p, preset.dpi);
      if (gray) { const k = Imaging.canvas(c.width, c.height); k.getContext('2d').drawImage(c, 0, 0); c = grayCanvas(k); }
      if (cover.length) {
        const k = Imaging.canvas(c.width, c.height), x = k.getContext('2d');
        x.drawImage(c, 0, 0);
        for (const a of cover) { x.fillStyle = a.type === 'rd' ? '#000' : a.fill || '#fff'; x.fillRect(a.x * c.width - 1, a.y * c.height - 1, a.w * c.width + 2, a.h * c.height + 2); }
        protMarkCanvas(x, p, c.width, c.height, c.width / 595);   // Kontoauszug/Urkunde: Änderungen rot markiert + Vermerk
        c = k;
      }
      if (p.kind === 'image') {
        W = 595.28; H = W * c.height / c.width;
        if (Math.abs(H / 841.89 - 1) < 0.04) H = 841.89; // A4 glätten
      } else { W = c.width * 72 / preset.dpi; H = c.height * 72 / preset.dpi; }
      page = out.addPage([W, H]);
      T?.page(page);
      T?.artifact();   // das Scanbild selbst ist Artefakt – der Inhalt steckt in der getaggten Textebene
      if (compact) {
        const small = size === 'small', pxPerIn = c.width / A4W_IN;
        // Maske mindestens in Druckauflösung: kleine Handyfotos werden weich hochgerechnet, dann erst in Schwarz/Weiß – glatte statt klumpiger Buchstaben
        const L = Imaging.compactLayers(c, Math.min(2.5, (small ? 240 : 300) / pxPerIn), Math.min(1, (small ? 72 : 100) / pxPerIn));
        if (L.bg) page.drawImage(await embedCanvas(out, L.bg, small ? 0.4 : 0.5), { x: 0, y: 0, width: W, height: H });
        if (L.inkShare > 0) {
          const ctx = out.context;
          const xo = ctx.register(ctx.flateStream(L.bits, { Type: 'XObject', Subtype: 'Image', Width: L.w, Height: L.h, ImageMask: true, BitsPerComponent: 1, Decode: [1, 0] }));
          const name = page.node.newXObject('Ink', xo);
          page.pushOperators(pushGraphicsState(), setFillingRgbColor(...L.color), concatTransformationMatrix(W, 0, 0, H, 0, 0), drawObject(name), popGraphicsState());
        }
      } else {
        page.drawImage(await embedCanvas(out, c, preset.q), { x: 0, y: 0, width: W, height: H });
      }
      T?.close();
      words = (p.ocr?.words || words || []).filter(w => !cover.some(a => overlaps(a, w)));
    } else {
      const d = state.docs[p.docIdx];
      [page] = await out.copyPages(await libFor(d), [p.pageIdx]);
      out.addPage(page);
      if (clean) deepClean(out, page); else if (bea) beaClean(out, page);
      T?.page(page);
      page.setRotation(degrees(p.rotation));
      const mb = page.getMediaBox(); W = mb.width; H = mb.height; ox = mb.x; oy = mb.y;
      if (!p.native) words = p.ocr?.words;
    }
    // Unsichtbare Textebene (Render-Modus 3) → durchsuchbar und kopierbar
    if (words?.length) {
      page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
      let glfName = null;
      for (const line of textLines(words)) {
        // Wörter mit Zeichen außerhalb der eingebetteten Schrift (Chinesisch, Japanisch, Koreanisch …) über die Platzhalterschrift (js/glyphless.js)
        const items = line.map(w => { const t = safe(w.t); return t === w.t ? { w, t } : { w, t: w.t, g: true }; }).filter(o => o.t && (o.g ? Glyphless.hex(o.t) : font.widthOfTextAtSize(o.t, 1)))
          // aufeinanderfolgende chinesische/japanische Zeichen (je ein „Wort“ von Tesseract) zu einem Textstück – sonst Leerzeichen beim Kopieren
          .reduce((acc, o) => {
            const prev = acc[acc.length - 1];
            if (prev?.g && o.g && CJK_RE.test(prev.t.slice(-1)) && CJK_RE.test(o.t[0])) {
              const x1 = Math.max(prev.w.x + prev.w.w, o.w.x + o.w.w), y0 = Math.min(prev.w.y, o.w.y), y1 = Math.max(prev.w.y + prev.w.h, o.w.y + o.w.h);
              prev.w = { ...prev.w, w: x1 - prev.w.x, y: y0, h: y1 - y0 }; prev.t += o.t;
            } else acc.push({ ...o });
            return acc;
          }, []);
        if (!items.length) continue;
        T?.open('P');
        items.forEach(({ w, t, g }, k) => {
          const last = k === items.length - 1, cjkPair = !last && CJK_RE.test(t.slice(-1)) && CJK_RE.test(items[k + 1].t[0]);   // CJK: keine Leerzeichen zwischen Wörtern
          if (g) {
            const hx = Glyphless.hex(last || cjkPair ? t : t + ' '), n = hx.length / 4, size = w.h * H; if (!n || !(size > 0.5)) return;
            if (!glfName) { glf ||= Glyphless.embed(PDFLib, out); glfName = page.node.newFontDictionary('GLF', glf); }
            page.pushOperators(PDFLib.beginText(), PDFLib.setFontAndSize(glfName, size), setCharacterSqueeze(Math.max(1, 100 * (w.w * W) / (n * 0.5 * size))),
              PDFLib.moveText(ox + w.x * W, oy + H - (w.y + w.h) * H + w.h * H * 0.18), PDFLib.showText(PDFHexString.of(hx)), PDFLib.endText(), setCharacterSqueeze(100));
            return;
          }
          const unit = font.widthOfTextAtSize(t, 1), sz = Math.min((w.w * W) / unit, w.h * H * 1.6); if (!(sz > 0.5)) return;
          page.drawText(last || cjkPair ? t : t + ' ', { x: ox + w.x * W, y: oy + H - (w.y + w.h) * H + w.h * H * 0.18, size: sz, font });
        });
        T?.close();
      }
      page.pushOperators(popGraphicsState());
    }
    for (const a of p.annots) {
      const x = ox + a.x * W, y = oy + H - (a.y + a.h) * H, w = a.w * W, h = a.h * H;
      if (a.type === 'field') fieldQ.push({ page, x, y, w, h, a });
      else if (a.type === 'link') linkQ.push({ page, x, y, w, h, a });
      else if (a.type === 'hl') hlQ.push({ page, x, y, w, h, a });
      else if (a.type === 'sign') { const img = await out.embedPng(gray ? await grayDataUrl(a.img) : a.img); await tagged('Figure', () => page.drawImage(img, { x, y, width: w, height: h }), { Alt: PDFHexString.fromText({ initials: 'Kürzel', stamp: 'Firmenstempel' }[a.kind] || 'Unterschrift') }); }
      else if (a.type === 'img') { const src = gray ? await grayDataUrl(a.img) : a.img, img = src.startsWith('data:image/jpeg') ? await out.embedJpg(src) : await out.embedPng(src); await tagged('Figure', () => page.drawImage(img, { x, y, width: w, height: h }), { Alt: PDFHexString.fromText(a.alt || 'Bild') }); }
      else if (a.type === 'shape') await tagged('Artifact', () => {
        const col = hexRgb(a.color), lw = Math.max(0.5, a.lw * W), fill = a.fill ? { color: col, opacity: 0.2 } : {};
        if (a.kind === 'rect') page.drawRectangle({ x: x + lw / 2, y: y + lw / 2, width: Math.max(0, w - lw), height: Math.max(0, h - lw), borderColor: col, borderWidth: lw, ...fill });
        else if (a.kind === 'ellipse') page.drawEllipse({ x: x + w / 2, y: y + h / 2, xScale: Math.max(0.1, (w - lw) / 2), yScale: Math.max(0.1, (h - lw) / 2), borderColor: col, borderWidth: lw, ...fill });
        else {
          const [[sx, sy], [ex, ey]] = shapeEnds(a), P = (u, v) => ({ x: x + u * w, y: y + h - v * h }), s0 = P(sx, sy), e0 = P(ex, ey);
          page.drawLine({ start: s0, end: e0, thickness: lw, color: col, lineCap: PDFLib.LineCapStyle?.Round });
          if (a.kind === 'arrow') { const t = arrowHead(s0.x, s0.y, e0.x, e0.y, lw); page.drawSvgPath(`M${t[0][0]} ${-t[0][1]} L${t[1][0]} ${-t[1][1]} L${t[2][0]} ${-t[2][1]} Z`, { x: 0, y: 0, color: col, borderWidth: 0 }); }
        }
      });
      else if (a.type === 'ink') {
        const d = a.pts.map(([px, py], k) => `${k ? 'L' : 'M'}${((a.x + px * a.w) * W).toFixed(2)} ${((a.y + py * a.h) * H).toFixed(2)}`).join(' ');
        await tagged('Artifact', () => page.drawSvgPath(d, { x: ox, y: oy + H, borderColor: hexRgb(a.color), borderWidth: a.lw * W, borderLineCap: PDFLib.LineCapStyle?.Round }));
      } else if (a.type === 'stamp') { T?.open('P');
        const col = hexRgb(a.color), lines = a.text.split('\n').map(safe).filter(Boolean);
        page.drawRectangle({ x, y, width: w, height: h, borderColor: col, borderWidth: Math.max(1, h * 0.06), opacity: 0 , borderOpacity: 0.9 });
        lines.forEach((t, li) => {
          let sz = h * (li ? 0.24 : 0.3); const unit = font.widthOfTextAtSize(t, 1); sz = Math.min(sz, (w * 0.88) / unit);
          const total = lines.length, lineY = y + h / 2 + (total - 1) * h * 0.17 - li * h * 0.34 - sz * 0.35;
          page.drawText(t, { x: x + (w - unit * sz) / 2, y: lineY, size: sz, font, color: col, opacity: 0.9 });
        });
        T?.close();
      }
      else if (a.type === 'note') {
        T?.open('P');
        const sz = a.fs * W, pad = sz * 0.45, lh = sz * 1.25, meas = t => font.widthOfTextAtSize(t, sz);
        const lines = wrapLines(safe(a.text), w - 2 * pad, meas), head = safe(noteHead(a)), top = oy + H - a.y * H;
        const bh = pad * 2 + lh * (lines.length + 1);
        page.drawRectangle({ x, y: top - bh, width: w, height: bh, color: rgb(1, 0.953, 0.64), borderColor: rgb(0.88, 0.71, 0), borderWidth: 0.6 });
        page.drawText(head, { x: x + pad, y: top - pad - sz * 0.85, size: sz * 0.8, font, color: rgb(0.54, 0.43, 0) });
        lines.forEach((t, li) => { if (t) page.drawText(t, { x: x + pad, y: top - pad - lh * (li + 1) - sz * 0.9, size: sz, font, color: rgb(0.23, 0.18, 0) }); });
        T?.close();
      }
      else if (a.type === 'text') {
        const sz = a.fs * W, [r, g, b] = [1, 3, 5].map(k => parseInt(a.color.slice(k, k + 2), 16) / 255), tf = await fontFor(a);
        T?.open('P');
        const sx = a.sx || 1, lines = a.w > 0 ? wrapLines(tf.safe(a.text), a.w * W, t => tf.f.widthOfTextAtSize(t, sz) * sx) : a.text.split('\n');
        if (sx !== 1) page.pushOperators(setCharacterSqueeze(sx * 100));   // Laufweite (Tz) wie im Original
        lines.forEach((line, li) => {
          const t = tf.safe(line); if (t) page.drawText(t, { x, y: oy + H - (a.y * H + sz * (0.95 + (a.lh || 1.2) * li)), size: sz, font: tf.f, color: rgb(r, g, b) });
        });
        if (sx !== 1) page.pushOperators(setCharacterSqueeze(100));
        T?.close();
      }
    }
    // Kontoauszug/Urkunde mit hinzugefügtem Text, aber ohne Abdeckung (Seite nicht als Bild): Vermerk als Text
    const protK = pageProt(p);
    if (protK && protChanged(p) && !cover.length) await tagged('P', () => page.drawText(safe(protNote(protK)), { x: ox + 28, y: oy + 7, size: 8, font, color: rgb(0.753, 0, 0) }));
    if (hasStamps) await tagged('Artifact', () => stampPdf(page, font, W, H, ox, oy, i, pages.length, stamps));   // Seitenzahlen, Kopf-/Fußzeile, Bates, Wasserzeichen
  }

  if (lhBytes) await underlay(out, lhBytes);   // Briefbogen unter alle Seiten
  if (fieldQ.length) addFormFields(out, fieldQ, T, font);
  if (linkQ.length) addLinks(out, linkQ, pages, T);
  if (hlQ.length) addHighlights(out, hlQ, T);
  // Seitenformat: weiße Ränder entfernen und/oder alles auf A4 (js/layout.js) – nach Links, Markierungen, Feldern, damit alles mitwandert
  if (trim || a4) Layout.fit(out, { trim, a4, boxes: trim ? await inkBoxes(await out.save()) : [] });
  // Dateianhänge (Menü → Dateianhänge): nicht beim Bereinigen; PDF/A-2b erlaubt nur PDF/A-Dateien als Anhang (ISO 19005-2, 6.8)
  for (const f of clean ? [] : (files ?? state.files ?? []).filter(f => !pdfa || isPdfA(f.data))) {
    await out.attach(f.data, f.name, { mimeType: mimeOf(f.name), description: f.desc || undefined, modificationDate: f.date || undefined });
  }
  if (bookmarks) { const marks = outlineFor(pages); if (marks.length > 1 || marks[0]?.children.length || (state.marks && marks.length)) addOutline(out, marks); }
  // Metadaten (Info und XMP identisch, sekundengenau)
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const { title, author, subject, keywords } = await docProps(pages, meta);
  // Nachvollziehbarkeit: wurde vorhandener Text ersetzt oder abgedeckt, steht das in den Stichwörtern (Info und XMP)
  if (pages.some(p => p.annots.some(a => a.type === 'wo')) && !keywords.includes('nachträglich geändert (PDFMy)')) keywords.push('nachträglich geändert (PDFMy)');
  const lang = docLang(pages);
  out.setTitle(title); out.setLanguage(lang);
  if (author && !clean) out.setAuthor(author);   // bereinigt: keine Personen- und Inhaltsangaben in den Dokumenteigenschaften
  if (subject && !clean) out.setSubject(subject);
  out.setKeywords(clean ? [] : [keywords.join('; ')]);   // „;“ – Windows zeigt die Stichwörter so als einzelne Markierungen
  out.setCreator(APP.name); out.setProducer(APP.name + ' (pdf-lib)');
  out.setCreationDate(now); out.setModificationDate(now);
  if (!pdfa && !clean) await window.reqInfo?.(out, pages, now);   // Unterschriftsanfrage reist in der PDF mit (js/pro.js, js/sigreq.js); nicht bei PDF/A-2b (keine solche Anlage erlaubt)
  if (T) T.finish();
  if (pdfa) await makePdfA(out, { title, author, subject, keywords: keywords.join('; '), now, ua: !!T, lang });
  return out.save();
}

/* Dokumenteigenschaften (Titel, Autor, Thema, Stichwörter):
   1. vom Nutzer im Dialog „Dokumenteigenschaften“ gesetzt (meta.docProps),
   2. sonst aus der Briefanalyse, 3. sonst aus der geöffneten PDF (bleiben wie in anderen PDF-Programmen erhalten). */
async function sourceInfo(pages) {
  const ids = new Set(pages.map(p => p.kind === 'pdf' ? p.docIdx : -1));
  if (ids.size !== 1 || ids.has(-1)) return {};
  const d = state.docs[[...ids][0]];
  if (!d) return {};
  d.meta ||= await d.js.getMetadata().catch(() => null);
  return d.meta?.info || {};
}
async function docProps(pages, meta) {
  const pr = meta.docProps || {}, src = await sourceInfo(pages), s = v => typeof v === 'string' ? v.trim() : '';
  const kwSplit = v => s(v).split(/\s*[,;]\s*/).filter(Boolean);
  const letterKw = [meta.type, meta.sender, meta.date, meta.deadline && 'Frist ' + meta.deadline, meta.invoiceNo, meta.customerNo, meta.reference].filter(Boolean);
  return {
    title: pr.title ?? (meta.subject || s(src.Title) || Letter.buildFilename(meta).replace(/\.pdf$/i, '')),
    author: pr.author ?? (meta.sender || s(src.Author)),
    subject: pr.subject ?? (meta.type || s(src.Subject)),
    // Schlagwörter des aktuellen Dokuments kommen in die Stichwörter der PDF (Windows-Suche, andere Programme finden sie)
    keywords: [...(pr.keywords != null ? kwSplit(pr.keywords) : letterKw.length ? letterKw : kwSplit(src.Keywords)), ...(meta === state.meta ? [...Journal.tagList(state.tags), ...Object.entries(state.cf || {}).filter(([, v]) => String(v).trim()).map(([k, v]) => `${k}: ${String(v).trim()}`)] : [])].filter((v, i, a) => a.indexOf(v) === i),
  };
}

/* Lesezeichen: je Quelldatei bzw. je Brief (✂-Markierung) ein Eintrag – wie in Acrobat Pro beim Zusammenfügen.
   Vorhandene Lesezeichen der Quell-PDFs bleiben erhalten (bei einer Datei als Gliederung, bei mehreren unter dem Dateinamen). */
function outlineFor(pages) {
  // Vom Nutzer bearbeitete Lesezeichen (Inhalt-Dialog) haben Vorrang – als Baum aus Ebene 0–2, nur Seiten, die mitgespeichert werden
  if (state.marks) {
    const at = new Map(pages.map((p, i) => [p.id, i])), root = [], stack = [];
    for (const m of state.marks) {
      const i = at.get(m.pid); if (i == null) continue;
      const node = { title: m.title.slice(0, 120), pageIndex: i, children: [] };
      while (stack.length && stack[stack.length - 1].level >= m.level) stack.pop();
      (stack.length ? stack[stack.length - 1].node.children : root).push(node); stack.push({ level: m.level, node });
    }
    return root;
  }
  const groups = []; let g = null;
  pages.forEach((p, i) => {
    const doc = p.kind === 'pdf' ? p.docIdx : -1;
    if (!g || g.doc !== doc || pages[i - 1].splitAfter) groups.push(g = { start: i, doc, pages: [] });
    g.pages.push(p);
  });
  const at = new Map(); pages.forEach((p, i) => { const k = p.kind === 'pdf' ? p.docIdx + ':' + p.pageIdx : null; if (k && !at.has(k)) at.set(k, i); });
  const own = (doc, from, to) => {   // Lesezeichen der Quelldatei, die auf Seiten dieser Gruppe zeigen, als Baum
    const root = [], stack = [];
    for (const e of state.docs[doc]?.outline || []) {
      const i = at.get(doc + ':' + e.pageIdx); if (i == null || i < from || i > to) continue;
      const node = { title: e.title.slice(0, 120), pageIndex: i, children: [] };
      while (stack.length && stack[stack.length - 1].level >= e.level) stack.pop();
      (stack.length ? stack[stack.length - 1].node.children : root).push(node); stack.push({ level: e.level, node });
    }
    return root;
  };
  const items = groups.map((g, k) => {
    let title = g.doc >= 0 ? state.docs[g.doc].name.replace(/\.pdf$/i, '') : '';
    if (!title || g.pages.some(pageText)) {
      const m = metaFor(g.pages), t = [m.type, m.sender, m.subject].filter(Boolean).join(' – ');
      if (t && (!title || g.doc < 0)) title = t;
    }
    return { title: (title || `Teil ${k + 1}`).slice(0, 120), pageIndex: g.start, children: g.doc >= 0 ? own(g.doc, g.start, g.start + g.pages.length - 1) : [] };
  });
  if (items.length === 1) return items[0].children;   // eine Datei: deren eigene Gliederung (oder keine)
  return items;
}
function addOutline(out, items) {
  const ctx = out.context, pages = out.getPages(), root = ctx.nextRef();
  const level = (list, parent) => {
    const refs = list.map(() => ctx.nextRef());
    list.forEach((it, i) => {
      const d = { Title: PDFHexString.fromText(it.title), Parent: parent, Dest: [pages[it.pageIndex].ref, 'Fit'] };
      if (i) d.Prev = refs[i - 1];
      if (i < list.length - 1) d.Next = refs[i + 1];
      if (it.children?.length) { const sub = level(it.children, refs[i]); Object.assign(d, { First: sub.first, Last: sub.last, Count: -sub.n }); }   // Unterpunkte zugeklappt
      ctx.assign(refs[i], ctx.obj(d));
    });
    return { first: refs[0], last: refs[refs.length - 1], n: list.length };
  };
  const top = level(items, root);
  ctx.assign(root, ctx.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: top.n }));
  out.catalog.set(PDFName.of('Outlines'), root);
  out.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

/* PDF/A-2b: sRGB-Output-Intent, XMP-Metadaten, Dokument-ID; Inhalte sind gerastert, Schrift eingebettet */
async function makePdfA(out, m) {
  const ctx = out.context;
  const icc = ctx.register(ctx.flateStream(new Uint8Array(await asset('icc', 'vendor/sRGB.icc')), { N: 3 }));
  const intent = ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'), RegistryName: PDFString.of('http://www.color.org'), DestOutputProfile: icc });
  out.catalog.set(PDFName.of('OutputIntents'), ctx.obj([intent]));
  const iso = m.now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const alt = v => `<rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(v)}</rdf:li></rdf:Alt>`;
  // PDF/A-Erweiterungsschemata für eigene XMP-Eigenschaften (PDF/UA-Kennung, Factur-X/ZUGFeRD)
  const prop = (name, type, cat, desc) => `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>${type}</pdfaProperty:valueType><pdfaProperty:category>${cat}</pdfaProperty:category><pdfaProperty:description>${desc}</pdfaProperty:description></rdf:li>`;
  const schemas = [];
  if (m.ua) schemas.push(`<rdf:li rdf:parseType="Resource"><pdfaSchema:schema>PDF/UA Universal Accessibility Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>http://www.aiim.org/pdfua/ns/id/</pdfaSchema:namespaceURI><pdfaSchema:prefix>pdfuaid</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq>${prop('part', 'Integer', 'internal', 'Teil von ISO 14289, dem das Dokument entspricht')}</rdf:Seq></pdfaSchema:property></rdf:li>`);
  if (m.facturx) schemas.push(`<rdf:li rdf:parseType="Resource"><pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI><pdfaSchema:prefix>fx</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq>${prop('DocumentFileName', 'Text', 'external', 'Name of the embedded XML invoice file')}${prop('DocumentType', 'Text', 'external', 'INVOICE')}${prop('Version', 'Text', 'external', 'The actual version of the Factur-X XML schema')}${prop('ConformanceLevel', 'Text', 'external', 'The conformance level of the embedded Factur-X data')}</rdf:Seq></pdfaSchema:property></rdf:li>`);
  const extBlock = schemas.length ? `
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas><rdf:Bag>${schemas.join('')}</rdf:Bag></pdfaExtension:schemas>
  </rdf:Description>` : '';
  const fxDesc = m.facturx ? `
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>${m.facturx.level || 'EN 16931'}</fx:ConformanceLevel>
  </rdf:Description>` : '';
  // ZUGFeRD/Factur-X: XML als zugeordnete Datei (PDF/A-3, AFRelationship /Alternative)
  if (m.facturx) {
    const ef = ctx.register(ctx.flateStream(m.facturx.xml, { Type: 'EmbeddedFile', Subtype: PDFName.of('text/xml'), Params: ctx.obj({ ModDate: PDFString.fromDate(m.now), Size: m.facturx.xml.length }) }));
    const fspec = ctx.register(ctx.obj({ Type: 'Filespec', F: PDFString.of('factur-x.xml'), UF: PDFHexString.fromText('factur-x.xml'), Desc: PDFString.of('Factur-X/ZUGFeRD-Rechnung (EN 16931)'), AFRelationship: PDFName.of('Alternative'), EF: ctx.obj({ F: ef, UF: ef }) }));
    out.catalog.set(PDFName.of('AF'), ctx.obj([fspec]));
    out.catalog.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: ctx.obj({ Names: ctx.obj([PDFString.of('factur-x.xml'), fspec]) }) }));
  }
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdfaid:part>${m.part || 2}</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>${m.ua ? `
   <pdfuaid:part>1</pdfuaid:part>` : ''}
   <dc:format>application/pdf</dc:format>
   <dc:title>${alt(m.title)}</dc:title>${m.author ? `
   <dc:creator><rdf:Seq><rdf:li>${xmlEsc(m.author)}</rdf:li></rdf:Seq></dc:creator>` : ''}${m.subject ? `
   <dc:description>${alt(m.subject)}</dc:description>` : ''}
   <dc:language><rdf:Bag><rdf:li>${m.lang || 'de-DE'}</rdf:li></rdf:Bag></dc:language>
   <pdf:Keywords>${xmlEsc(m.keywords)}</pdf:Keywords>
   <pdf:Producer>${xmlEsc(APP.name)} (pdf-lib)</pdf:Producer>
   <xmp:CreatorTool>${xmlEsc(APP.name)}</xmp:CreatorTool>
   <xmp:CreateDate>${iso}</xmp:CreateDate>
   <xmp:ModifyDate>${iso}</xmp:ModifyDate>
   <xmp:MetadataDate>${iso}</xmp:MetadataDate>
  </rdf:Description>${fxDesc}${extBlock}
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  const ms = ctx.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' });
  out.catalog.set(PDFName.of('Metadata'), ctx.register(ms));
  const id = PDFHexString.of([...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''));
  ctx.trailerInfo.ID = ctx.obj([id, id]);
}

/* ---------- Speichern & Ablage ---------- */
const sha256 = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
async function exists(dir, name) { try { await dir.getFileHandle(name); return true; } catch { return false; } }
async function writeUnique(dir, name, data) {
  let fn = name, k = 2;
  while (await exists(dir, fn)) fn = name.replace(/(\.[^.]+)$/, ` (${k++})$1`);
  const fh = await dir.getFileHandle(fn, { create: true }), w = await fh.createWritable();
  await w.write(data); await w.close();
  return fn;
}
// Aus der Ablage geöffnetes Dokument erneut speichern: an derselben Stelle ersetzen, bisherige Fassung unverändert nach „_Versionen“
async function saveVersion(bytes, rel) {
  try {
    const parts = rel.split('\\'), fn = parts.pop(); let dir = state.outDir;
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    const fh = await dir.getFileHandle(fn), old = new Uint8Array(await (await fh.getFile()).arrayBuffer());
    let vdir = await state.outDir.getDirectoryHandle('_Versionen', { create: true });
    for (const p of parts) vdir = await vdir.getDirectoryHandle(p, { create: true });
    const d = new Date(), z = n => String(n).padStart(2, '0'), ts = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`;
    const vname = await writeUnique(vdir, fn.replace(/(\.[^.]+)$/, `_${ts}$1`), old);
    const w = await fh.createWritable(); await w.write(bytes); await w.close();
    (state.hashes ||= {})[rel] = await sha256(bytes);
    state.fromArchive.saved = { prev: ['_Versionen', ...parts, vname].join('\\') };
    return rel;
  } catch (e) { console.warn('Version:', e); return null; }   // Original nicht mehr da → normal neu ablegen
}
async function saveToOutDir(bytes, name, meta) {
  if (state.fromArchive?.file && state.docs.length === 1 && /\.pdf$/i.test(name)) { const rel = await saveVersion(bytes, state.fromArchive.file); if (rel) return rel; }
  let dir = state.outDir;
  for (const part of targetPath(meta).split('\\').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create: true });
  const fn = await writeUnique(dir, name, bytes);
  if (S.saveIcs && meta.deadline) await writeUnique(dir, fn.replace(/\.pdf$/i, '') + '_Frist.ics', Letter.buildIcs(meta, fn));
  if (state.einv?.xml) await writeUnique(dir, fn.replace(/\.pdf$/i, '') + '.xml', state.einv.xml);   // E-Rechnung: Original-XML (GoBD)
  const rel = [targetPath(meta), fn].filter(Boolean).join('\\');
  (state.hashes ||= {})[rel] = await sha256(bytes);
  return rel;
}
$('#btnSave').onclick = () => openExport();

/* ---------- Export: PDF, PDF/A, Bilder, Text ---------- */
let cryptLib = null;
// pdf-lib-Variante mit Verschlüsselung erst bei Bedarf laden (überschreibt sonst das globale PDFLib)
async function getCrypt() {
  if (cryptLib) return cryptLib;
  const orig = window.PDFLib;
  await new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/pdf-lib-crypt.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Verschlüsselungsmodul fehlt')); document.head.append(s);
  });
  cryptLib = window.PDFLib; window.PDFLib = orig;
  return cryptLib;
}
const randomPw = () => [...crypto.getRandomValues(new Uint8Array(18))].map(b => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
async function encryptPdf(bytes, o) {
  const C = await getCrypt();
  const doc = await C.PDFDocument.load(bytes, { updateMetadata: false }), ownerPw = randomPw();
  // AES-256 (AESV3): pdf-lib wählt es nur bei Kopfzeile „1.7ext3“ – danach PDF 1.7 mit Adobe-Erweiterungsstufe 8 (wie Acrobat)
  doc.context.header = C.PDFHeader.forVersion(1, '7ext3');
  doc.encrypt({ userPassword: o.password, ownerPassword: ownerPw, permissions: {
    printing: o.allowPrint ? 'highResolution' : undefined, copying: !!o.allowCopy, modifying: false, annotating: false,
    fillingForms: true, contentAccessibility: true, documentAssembly: false } });
  doc.context.header = C.PDFHeader.forVersion(1, 7);
  doc.catalog.set(C.PDFName.of('Extensions'), doc.context.obj({ ADBE: { BaseVersion: C.PDFName.of('1.7'), ExtensionLevel: 8 } }));
  // Passwort-Einträge nach ISO 32000-2 Revision 6 (Hash 2.B) statt Revision 5
  const fk = doc.context.security.encryptionKey, fileKey = Uint8Array.from({ length: fk.sigBytes }, (_, i) => fk.words[i >> 2] >>> (24 - 8 * (i & 3)) & 255);
  const r6 = await PdfCrypt.entries(o.password, ownerPw, fileKey), ed = doc.context.lookup(doc.context.trailerInfo.Encrypt);
  const hex = b => C.PDFHexString.of([...b].map(x => x.toString(16).padStart(2, '0')).join(''));
  ed.set(C.PDFName.of('R'), C.PDFNumber.of(6));
  for (const k of ['U', 'UE', 'O', 'OE']) ed.set(C.PDFName.of(k), hex(r6[k]));
  return doc.save();
}

function askPassword(name, wrong) {
  return new Promise(res => {
    const dlg = $('#pwDlg'), inp = $('#pwIn');
    $('#pwTitle').textContent = `„${name}“ ist passwortgeschützt`;
    $('#pwHint').textContent = wrong ? 'Das Passwort war falsch. Bitte erneut versuchen.' : 'Passwort eingeben, um die Datei zu öffnen. Es wird nur in diesem Browser verwendet.';
    inp.value = '';
    const form = dlg.querySelector('form');
    const done = v => { form.onsubmit = dlg.oncancel = null; res(v); };
    form.onsubmit = e => done(e.submitter?.value === 'ok' || !e.submitter ? inp.value : null);
    dlg.oncancel = () => done(null);
    dlg.showModal(); inp.focus();
  });
}

async function drawAnnotsCanvas(x, p, W, H) {
  try { await drawAnnotsInner(x, p, W, H); } finally { protMarkCanvas(x, p, W, H, W / 595); }
}
async function drawAnnotsInner(x, p, W, H) {
  for (const a of p.annots) {
    const ax = a.x * W, ay = a.y * H, aw = a.w * W, ah = a.h * H;
    if (a.type === 'hl') { x.save(); x.globalCompositeOperation = a.style === 'ul' || a.style === 'st' ? 'source-over' : 'multiply';
      for (const r of a.rects || [{ x: 0, y: 0, w: 1, h: 1 }]) { const rx = ax + r.x * aw, ry = ay + r.y * ah, rw = r.w * aw, rh = r.h * ah;
        if (a.style === 'ul' || a.style === 'st') { x.fillStyle = hlLine(a); const lw = Math.max(1.5, rh * 0.07); x.fillRect(rx, a.style === 'ul' ? ry + rh * 0.9 - lw / 2 : ry + rh * 0.55 - lw / 2, rw, lw); }
        else { x.fillStyle = hlRgba(a.color, 0.42); x.fillRect(rx, ry, rw, rh); } }
      x.restore(); }
    else if (a.type === 'rd' || a.type === 'wo') { x.fillStyle = a.type === 'rd' ? '#000' : a.fill || '#fff'; x.fillRect(ax - 1, ay - 1, aw + 2, ah + 2); }
    else if (a.type === 'sign' || a.type === 'img') { const im = new Image(); im.src = a.img; await im.decode(); x.drawImage(im, ax, ay, aw, ah); }
    else if (a.type === 'shape') {
      const lw = Math.max(1, a.lw * W); x.save(); x.strokeStyle = x.fillStyle = a.color; x.lineWidth = lw; x.lineCap = 'round'; x.beginPath();
      if (a.kind === 'rect') x.rect(ax + lw / 2, ay + lw / 2, Math.max(0, aw - lw), Math.max(0, ah - lw));
      else if (a.kind === 'ellipse') x.ellipse(ax + aw / 2, ay + ah / 2, Math.max(0.1, (aw - lw) / 2), Math.max(0.1, (ah - lw) / 2), 0, 0, Math.PI * 2);
      else { const [[sx, sy], [ex, ey]] = shapeEnds(a); x.moveTo(ax + sx * aw, ay + sy * ah); x.lineTo(ax + ex * aw, ay + ey * ah); }
      if (a.fill && (a.kind === 'rect' || a.kind === 'ellipse')) { x.globalAlpha = 0.2; x.fill(); x.globalAlpha = 1; }
      x.stroke();
      if (a.kind === 'arrow') { const [[sx, sy], [ex, ey]] = shapeEnds(a), t = arrowHead(ax + sx * aw, ay + sy * ah, ax + ex * aw, ay + ey * ah, lw); x.beginPath(); x.moveTo(...t[0]); x.lineTo(...t[1]); x.lineTo(...t[2]); x.closePath(); x.fill(); }
      x.restore();
    }
    else if (a.type === 'ink') {
      x.save(); x.strokeStyle = a.color; x.lineWidth = Math.max(1, a.lw * W); x.lineCap = x.lineJoin = 'round'; x.beginPath();
      a.pts.forEach(([px, py], k) => (k ? x.lineTo : x.moveTo).call(x, ax + px * aw, ay + py * ah)); x.stroke(); x.restore();
    } else if (a.type === 'stamp') {
      x.save(); x.globalAlpha = 0.9; x.strokeStyle = x.fillStyle = a.color; x.lineWidth = Math.max(2, ah * 0.06); x.strokeRect(ax, ay, aw, ah);
      const lines = a.text.split('\n'); x.textAlign = 'center'; x.textBaseline = 'middle';
      lines.forEach((t, li) => { x.font = `${ah * (li ? 0.24 : 0.3)}px "DejaVu Sans"`; x.fillText(t, ax + aw / 2, ay + ah / 2 + (li - (lines.length - 1) / 2) * ah * 0.34, aw * 0.9); });
      x.restore();
    }
    else if (a.type === 'note') {
      const sz = a.fs * W, pad = sz * 0.45, lh = sz * 1.25;
      x.save(); x.font = `${sz}px "DejaVu Sans"`;
      const lines = wrapLines(a.text, aw - 2 * pad, t => x.measureText(t).width), bh = pad * 2 + lh * (lines.length + 1);
      x.fillStyle = '#fff3a3'; x.fillRect(ax, ay, aw, bh); x.strokeStyle = '#e0b400'; x.lineWidth = Math.max(1, sz * 0.06); x.strokeRect(ax, ay, aw, bh);
      x.textBaseline = 'alphabetic'; x.fillStyle = '#8a6d00'; x.font = `bold ${sz * 0.8}px "DejaVu Sans"`; x.fillText(noteHead(a), ax + pad, ay + pad + sz * 0.85);
      x.fillStyle = '#3a2f00'; x.font = `${sz}px "DejaVu Sans"`; lines.forEach((t, li) => x.fillText(t, ax + pad, ay + pad + lh * (li + 1) + sz * 0.9));
      x.restore();
    }
    else if (a.type === 'text') {
      const sz = a.fs * W; x.fillStyle = a.color; try { await document.fonts.load(cssFont(a, 20)); } catch {} x.font = cssFont(a, sz); x.textBaseline = 'alphabetic';
      const sx = a.sx || 1, lines = a.w > 0 ? wrapLines(a.text, aw, t => x.measureText(t).width * sx) : a.text.split('\n');
      x.save(); x.translate(ax, 0); x.scale(sx, 1);
      lines.forEach((l, li) => x.fillText(l, 0, ay + sz * (0.95 + (a.lh || 1.2) * li)));
      x.restore();
    }
  }
}
function stampCanvas(x, W, H, i, n, o, ptScale) {
  const T = stampTexts(i, n, o);
  x.save(); x.textBaseline = 'alphabetic'; x.fillStyle = '#4d4d4d'; x.font = `${9 * ptScale}px "DejaVu Sans"`;
  if (T.head) x.fillText(T.head, (W - x.measureText(T.head).width) / 2, 24 * ptScale);
  if (T.foot) x.fillText(T.foot, 28 * ptScale, H - 18 * ptScale);
  if (T.bates) { x.fillStyle = '#000'; x.font = `${10 * ptScale}px "DejaVu Sans"`; x.fillText(T.bates, W - 28 * ptScale - x.measureText(T.bates).width, H - (o.pageNumbers === 'right' ? 32 : 18) * ptScale); }
  x.restore();
  if (o.pageNumbers && o.pageNumbers !== 'none') {
    const t = `${i + 1} / ${n}`; x.font = `${9 * ptScale}px "DejaVu Sans"`; x.fillStyle = '#595959'; x.textBaseline = 'alphabetic';
    const tw = x.measureText(t).width;
    x.fillText(t, o.pageNumbers === 'right' ? W - 28 * ptScale - tw : (W - tw) / 2, H - 18 * ptScale);
  }
  if (o.watermark) {
    x.save(); x.translate(W / 2, H / 2); x.rotate(-Math.atan2(H, W));
    x.font = '100px "DejaVu Sans"'; const unit = x.measureText(o.watermark).width / 100;
    const sz = Math.min(Math.hypot(W, H) * 0.7 / unit, H * 0.2);
    x.font = `${sz}px "DejaVu Sans"`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.globalAlpha = 0.18; x.fillStyle = '#bf1a1a';
    x.fillText(o.watermark, 0, 0); x.restore();
  }
}

const baseName = () => filename().replace(/\.pdf$/i, '');
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Stempel-Optionen aus dem Export-Dialog für PDF und Bilder
const stampOpts = (o, base) => ({ pageNumbers: o.pageNumbers, watermark: o.watermark, header: o.header, footer: o.footer,
  bates: o.batesOn ? { prefix: o.batesPrefix, start: o.batesStart } : null, docName: base, date: new Date().toLocaleDateString('de-DE'),
  clean: !!o.clean, gray: !!o.gray && (o.format === 'pdf' || o.format === 'pdfa'), filesDirty: !!state.filesDirty, trim: !!o.trim, a4: !!o.a4, letterhead: o.letterhead && o.format === 'pdf' && typeof letterhead !== 'undefined' && letterhead?.bytes ? letterhead.bytes : null });
// Kleiner Dialog „fertig – jetzt speichern“: Der Klick darauf darf das Speichern-Fenster öffnen
function readyToSave(name, pick) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'readydlg'; d.setAttribute('aria-labelledby', 'readyT');
    d.innerHTML = `<h3 id="readyT">Fertig zum Speichern</h3><p></p><div class="row"><button type="button" class="ghost">Abbrechen</button><button type="button" class="primary">Speichern …</button></div>`;
    d.querySelector('p').textContent = `„${name}“ ist erstellt. Wählen Sie jetzt, wo es gespeichert werden soll.`;
    const done = v => { d.close(); d.remove(); resolve(v); };
    d.querySelector('.ghost').onclick = () => done(null);
    d.addEventListener('cancel', e => { e.preventDefault(); done(null); });
    d.querySelector('.primary').onclick = async () => { try { done(await pick()); } catch (e) { if (e.name === 'AbortError') done(null); else { done(null); status('Speichern nicht möglich: ' + e.message); } } };
    document.body.append(d); d.showModal(); d.querySelector('.primary').focus();
  });
}
// saveAs: immer nach Ort und Namen fragen (auch wenn ein Ablageordner eingestellt ist)
async function deliver(data, name, mime, meta, saveAs = false) {
  const kind = { [DOCX]: ['Word-Dokument', '.docx'], 'application/xml': ['XRechnung (XML)', '.xml'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['Excel-Tabelle', '.xlsx'], 'text/csv': ['CSV-Tabelle (Excel)', '.csv'], 'application/pdf': ['PDF-Dokument', '.pdf'], 'application/zip': ['ZIP-Archiv', '.zip'], 'image/jpeg': ['JPG-Bild', '.jpg'], 'image/png': ['PNG-Bild', '.png'], 'text/plain': ['Textdatei', '.txt'], 'text/markdown': ['Markdown', '.md'], 'text/html': ['Webseite (HTML)', '.html'] }[mime];
  if (state.outDir && !saveAs) {
    const path = mime === 'application/pdf' && meta ? await saveToOutDir(data, name, meta) : await writeUnique(state.outDir, name, data);
    return `${state.outDir.name}\\${path}`;
  }
  if (window.showSaveFilePicker) {
    let fh;
    const pick = () => showSaveFilePicker({ suggestedName: name, id: 'mpdf-save', types: [{ description: kind[0], accept: { [mime]: [kind[1]] } }] });
    try { fh = await pick(); }
    catch (e) {
      if (e.name === 'AbortError') return null;
      // Der Browser erlaubt das Speichern-Fenster nur kurz nach einem Klick – dauerte das Erstellen länger, einmal bestätigen lassen
      if (e.name !== 'SecurityError' && e.name !== 'NotAllowedError') throw e;
      fh = await readyToSave(name, pick); if (!fh) return null;
    }
    const w = await fh.createWritable(); await w.write(data); await w.close();
    return fh.name;
  }
  if (IS_MOBILE && navigator.canShare) {
    const file = new File([data], name, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name.replace(/\.[^.]+$/, '') }); return name + ' (geteilt/gesichert)'; }
      catch (e) { if (e.name === 'AbortError') return null; /* NotAllowedError (keine Nutzeraktion mehr) → Download */ }
    }
  }
  download(data, name, mime);
  return name + (IS_IOS ? ' (Dateien → Downloads)' : ' (Downloads)');
}

/* Export-Optionen aus dem Dialog → Datei(en) */
async function waitForOcr(pages) {
  for (const p of pages) if (!p.ocr && !p.native && !p.blank) p.forceOcr = true;
  await runOcrAll();
}
async function doExport(o) {
  let pages = o.pages;
  if (o.dropBlank) pages = pages.filter(p => !(p.blank && !p.keepBlank));
  if (!pages.length) { status('Keine Seiten zum Speichern.'); return; }
  const meta = state.meta, t0 = performance.now(), base = (o.name || baseName()).replace(/\.pdf$/i, '');
  let data, name, mime, keptOrig = false;
  const st = stampOpts(o, base);
  if (o.format === 'docx') {
    await waitForOcr(pages);
    data = Tools.docx(pages.map(p => pageText(p).trim()), { title: meta.subject || base, author: meta.sender });
    name = base + '.docx'; mime = DOCX;
  } else if (o.format === 'xlsx') {
    await waitForOcr(pages);
    const sheets = [];
    for (const [i, p] of pages.entries()) {
      const words = p.ocr?.words || (p.kind === 'pdf' && p.native ? await nativeWords(p) : null) || [];
      sheets.push({ name: `Seite ${i + 1}`, rows: Tools.tableRows(words) });
    }
    data = Tools.xlsx(sheets); name = base + '.xlsx'; mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (o.format === 'md' || o.format === 'html') {
    // Markdown/HTML mit Gliederung (Überschriften, Absätze, Aufzählungen, Tabellen) – z. B. für KI-Werkzeuge oder Webseiten
    await waitForOcr(pages);
    const words = [];
    for (const p of pages) words.push(p.ocr?.words || (p.kind === 'pdf' && p.native ? await nativeWords(p) : null) || []);
    const blocks = Tools.docBlocks(words), title = meta.subject || '';
    data = new TextEncoder().encode(o.format === 'md' ? Tools.toMarkdown(blocks, { title }) : Tools.toHtml(blocks, { title: title || base, lang: docLang(pages) }));
    name = base + (o.format === 'md' ? '.md' : '.html'); mime = o.format === 'md' ? 'text/markdown' : 'text/html';
  } else if (o.format === 'txt') {
    await waitForOcr(pages);
    data = new TextEncoder().encode(pages.map((p, i) => `--- Seite ${i + 1} ---\n${pageText(p).trim()}\n`).join('\n').replace(/\n/g, '\r\n'));
    name = base + '.txt'; mime = 'text/plain';
  } else if (o.format === 'img') {
    await document.fonts.load('16px "DejaVu Sans"');
    const preset = SIZES[o.size] || SIZES.balanced, files = [];
    for (const [i, p] of pages.entries()) {
      status(`Erzeuge Bild ${i + 1} von ${pages.length} …`, i / pages.length);
      const src = p.kind === 'image' ? scaleToDpi(p.processed, preset.dpi) : await renderPdf(p, preset.dpi);
      const k = Imaging.canvas(src.width, src.height), x = k.getContext('2d');
      x.drawImage(src, 0, 0);
      await drawAnnotsCanvas(x, p, k.width, k.height);
      stampCanvas(x, k.width, k.height, i, pages.length, st, p.kind === 'image' ? k.width / 595.28 : preset.dpi / 72);
      files.push({ name: `${base}_Seite_${String(i + 1).padStart(3, '0')}.jpg`, data: await canvasToJpeg(k, preset.q) });
    }
    if (files.length === 1) { data = files[0].data; name = files[0].name; mime = 'image/jpeg'; }
    else { data = Tools.zip(files); name = base + '_Bilder.zip'; mime = 'application/zip'; }
  } else {
    if (o.format === 'pdfa' && pages.some(p => p.kind === 'pdf' && !p.native)) await waitForOcr(pages);
    else if (pages.some(p => p.kind === 'image' && !p.ocr && !p.blank)) await waitForOcr(pages.filter(p => p.kind === 'image'));
    const opts = { pdfa: o.format === 'pdfa', size: o.size, ...st };
    const orig = einvOriginal(pages, { ...st, password: o.password });
    const sOrig = !orig && signedOriginal(pages, { ...st, password: o.password });
    if (orig) { data = orig; status('E-Rechnung: Original unverändert gespeichert (mit eingebettetem XML).'); }
    else if (sOrig) { data = sOrig.slice(); status(o.sign ? 'Signiertes Original unverändert übernommen – Ihre Signatur wird angehängt.' : 'Signiertes Original unverändert gespeichert – die Signaturen bleiben gültig.'); }
    else data = await buildPdf(pages, meta, opts);
    if (o.size === 'small' && !orig && !sOrig) {
      // "Klein" darf nie größer werden als "Ausgewogen" (z. B. bei reinen Text-PDFs)
      const alt = await buildPdf(pages, meta, { ...opts, size: 'balanced' });
      if (alt.length < data.length) data = alt;
      // Schon optimal (z. B. schlanke Text-PDF): wird nichts kleiner und wurde nichts geändert, das Original unverändert behalten
      const u = !o.password && !o.sign ? untouchedOriginal(pages, st) : null;
      if (u && u.length <= data.length) { data = u.slice(); keptOrig = true; }
    }
    if (o.format === 'pdf' && o.sheet && o.sheet !== '1' && !keptOrig) { status('Seiten auf Bögen verteilen …'); data = await sheetLayout(data, o.sheet); }
    if (o.password) { status('Verschlüsseln …'); data = await encryptPdf(data, o); }
    if (o.sign) { const sd = await signFlow(data); if (!sd) { status('Nicht gespeichert – Signieren abgebrochen.'); return; } data = sd; }
    name = o.name || filename(); mime = 'application/pdf';
  }
  if (mime === 'application/pdf' && !/\.pdf$/i.test(name)) name += '.pdf';
  const od = o.orig && !o.saveAs && mime === 'application/pdf' ? origDoc() : null;
  if (od) {
    try {
      let perm = await od.handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await od.handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') { status('Nicht gespeichert – ohne Ihre Erlaubnis kann PDFMy die Originaldatei nicht überschreiben.'); return; }
      const w = await od.handle.createWritable(); await w.write(data); await w.close();
    } catch (err) { console.error(err); status('Die Originaldatei konnte nicht überschrieben werden: ' + err.message + ' – bitte „Speichern unter …“ verwenden.'); return; }
    state.dirty = false; refresh();
    status(`Gespeichert in die Originaldatei: ${od.name} (${Tools.formatBytes(data.length)})` + (o.sign ? ` · digital signiert (${state.signer?.name || ''})` : ''));
    return;
  }
  if (state.outDir && !o.saveAs && mime === 'application/pdf' && !await confirmNotDuplicate(meta)) { status('Nicht gespeichert (Dublette).'); return; }
  const where = await deliver(data, name, mime, mime === 'application/pdf' && !o.password ? meta : null, o.saveAs);
  if (!where) { status('Speichern abgebrochen.'); return; }
  state.dirty = false;
  if (o.batesOn && !['txt', 'docx', 'md', 'html'].includes(o.format)) LS.set('batesNext', o.batesStart + pages.length);   // nächstes Dokument zählt weiter
  if (mime === 'application/pdf' && !o.password) journalAdd(meta, where, pages.length);
  $('#btnNew').classList.add('next'); setTimeout(() => $('#btnNew').classList.remove('next'), 8000);
  const secs = I18N.fmtNum((performance.now() - t0) / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const before = state.inputBytes ? ` · vorher ${Tools.formatBytes(state.inputBytes)}` : '';
  status(`Gespeichert: ${where} (${Tools.formatBytes(data.length)}${before}, ${secs} s)` +
    (o.password ? ' · passwortgeschützt' : '') + (o.sign ? ` · digital signiert (${state.signer?.name || ''})` : '') + (state.outDir && S.saveIcs && meta.deadline && mime === 'application/pdf' ? ' + Fristtermin' : '') +
    (keptOrig ? ' · Die Datei war bereits optimal komprimiert – das Original wurde unverändert gespeichert.' : ''));
}

/* ---------- Export-Dialog ---------- */
// Die geöffnete PDF, in die zurückgespeichert werden kann: alle Seiten stammen aus genau einem Dokument mit Datei-Verweis
function origDoc() {
  const ids = new Set(state.pages.map(p => p.kind === 'pdf' ? p.docIdx : -1));
  if (ids.size !== 1 || ids.has(-1)) return null;
  const d = state.docs[[...ids][0]];
  return d && d.handle && d.handle.createWritable ? d : null;
}
const xv = name => document.querySelector(`#expForm [name="${name}"]:checked`)?.value;
const allScans = () => state.pages.every(p => p.kind === 'image' || !p.native);
function exportPages() {
  const which = xv('x-pages');
  if (which === 'picked') return state.pages.filter(p => state.picked.has(p.id));
  if (which === 'range') { const idx = Tools.parseRange($('#x-range').value, state.pages.length); return idx ? idx.map(i => state.pages[i]) : null; }
  return state.pages;
}
function readExport() {
  return {
    format: xv('x-format'), size: xv('x-size'), pages: exportPages(), name: $('#x-name').value.trim(),
    pageNumbers: $('#x-pnum').value, watermark: $('#x-wm').value.trim(), dropBlank: $('#x-blank').checked,
    header: $('#x-head').value.trim(), footer: $('#x-foot').value.trim(), batesOn: $('#x-bates').checked,
    batesPrefix: $('#x-bpre').value.trim(), batesStart: Math.max(1, parseInt($('#x-bstart').value, 10) || 1),
    password: $('#x-pw').value, allowPrint: $('#x-print').checked, allowCopy: $('#x-copy').checked, sign: $('#x-sign').checked,
    orig: !$('#x-orig-row').hidden && $('#x-orig').checked, letterhead: $('#x-lh').checked, clean: $('#x-clean').checked,
    trim: $('#x-trim').checked, a4: $('#x-a4').checked, gray: $('#x-gray').checked, sheet: $('#x-sheet').value,
  };
}
// Abläufe (wie „Workflows“ bei iLovePDF und Sejda): Speichern-Einstellungen unter einem Namen merken und mit einem Klick
// wieder anwenden – im Speichern-Dialog und in der Stapelverarbeitung. Passwort und Signatur werden bewusst nicht gespeichert.
const FLOW_KEYS = ['format', 'size', 'pageNumbers', 'watermark', 'dropBlank', 'header', 'footer', 'batesOn', 'batesPrefix', 'letterhead', 'clean', 'trim', 'a4', 'gray', 'sheet'];
const flows = () => { const l = LS.get('flows', []); return Array.isArray(l) ? l.filter(f => f && f.name && f.o) : []; };
const flowFrom = o => Object.fromEntries(FLOW_KEYS.map(k => [k, o[k]]));
function flowApply(f) {
  setRadio('x-format', f.format || 'pdf'); setRadio('x-size', f.size || 'balanced');
  $('#x-pnum').value = f.pageNumbers || 'none'; $('#x-wm').value = f.watermark || ''; $('#x-head').value = f.header || ''; $('#x-foot').value = f.footer || '';
  if (!$('#x-blank-row').hidden) $('#x-blank').checked = !!f.dropBlank;
  $('#x-bates').checked = !!f.batesOn; $('#x-bpre').value = f.batesPrefix || '';
  $('#x-lh').checked = !!f.letterhead && !$('#x-lh').disabled; $('#x-clean').checked = !!f.clean; $('#x-trim').checked = !!f.trim; $('#x-a4').checked = !!f.a4; $('#x-gray').checked = !!f.gray;
  $('#x-sheet').value = f.sheet || '1';
  $('#x-more').open = !!(f.pageNumbers && f.pageNumbers !== 'none') || !!f.header || !!f.footer || !!f.watermark || !!f.batesOn || !!f.letterhead || !!f.clean || !!f.trim || !!f.a4 || !!f.gray || (f.sheet && f.sheet !== '1');
  updateExportUi();
}
function flowList(sel = '') {
  const l = flows(), s = $('#x-flow');
  s.replaceChildren(new Option('– keiner –', ''), ...l.map((f, i) => { const o = new Option(f.name, String(i)); o.setAttribute('translate', 'no'); return o; }));
  s.value = sel; $('#x-flow-del').hidden = sel === '';
}
$('#x-flow').addEventListener('change', e => {
  const f = flows()[e.target.value]; $('#x-flow-del').hidden = !f;
  if (f) { flowApply(f.o); status(`Ablauf „${f.name}“ übernommen.`); }
});
$('#x-flow-save').onclick = () => {
  const cur = flows()[$('#x-flow').value]?.name || '';
  const n = prompt('Name des Ablaufs (z. B. „Rechnung an Kunden“ oder „Archiv“):', cur); if (!n?.trim()) return;
  const name = n.trim().slice(0, 60), l = flows().filter(f => f.name !== name);
  l.push({ name, o: flowFrom(readExport()) }); LS.set('flows', l); flowList(String(l.length - 1));
  status(`Ablauf „${name}“ gespeichert – auch in der Stapelverarbeitung wählbar. Passwort und Signatur werden nicht gespeichert.`);
};
$('#x-flow-del').onclick = () => {
  const i = +$('#x-flow').value, l = flows(), f = l[i];
  if (!f || !confirm(`Ablauf „${f.name}“ löschen?`)) return;
  l.splice(i, 1); LS.set('flows', l); flowList(); status(`Ablauf „${f.name}“ gelöscht.`);
};
function setRadio(name, v) { const r = document.querySelector(`#expForm [name="${name}"][value="${v}"]`); if (r) r.checked = true; }
function openExport(pre = {}) {
  if (!state.pages.length) return;
  const last = LS.get('export', {});
  setRadio('x-format', pre.format || (allScans() && S.pdfa ? 'pdfa' : 'pdf'));
  setRadio('x-size', pre.size || last.size || 'balanced');
  const nPicked = state.pages.filter(p => state.picked.has(p.id)).length;
  setRadio('x-pages', pre.pages || (nPicked > 1 ? 'picked' : 'all'));
  $('#x-all-n').textContent = state.pages.length; $('#x-picked-n').textContent = nPicked;
  $('#x-picked').disabled = nPicked < 1;
  $('#x-name').value = filename().replace(/\.pdf$/i, ''); delete $('#x-name').dataset.touched;
  $('#x-pnum').value = last.pageNumbers || 'none'; $('#x-wm').value = '';
  $('#x-head').value = last.header || ''; $('#x-foot').value = last.footer || ''; $('#x-bates').checked = !!pre.bates;
  $('#x-bpre').value = last.batesPrefix ?? ''; $('#x-bstart').value = LS.get('batesNext', 1);
  $('#x-trim').checked = $('#x-a4').checked = $('#x-gray').checked = false; $('#x-sheet').value = '1';
  $('#x-pw').value = ''; $('#x-pw2').value = ''; $('#x-print').checked = true; $('#x-copy').checked = false;
  const blanks = state.pages.filter(p => p.blank && !p.keepBlank).length;
  $('#x-blank').checked = blanks > 0; $('#x-blank-n').textContent = blanks; $('#x-blank-row').hidden = !blanks;
  // In Originaldatei speichern: nur wenn alles aus einer geöffneten PDF mit Datei-Verweis stammt (Chrome/Edge)
  const od = origDoc();
  $('#x-orig-row').hidden = !od; if (od) { $('#x-orig-n').textContent = od.name; $('#x-orig').checked = !state.outDir; }
  $('#x-dest').textContent = state.outDir ? `Ziel: ${state.outDir.name}${targetPath(state.meta) ? '\\' + targetPath(state.meta) : ''}` : '';
  $('#x-more').open = pre.focus === 'password' || pre.focus === 'stamp' || !!pre.bates || (!!last.pageNumbers && last.pageNumbers !== 'none') || !!last.header || !!last.footer;
  $('#x-go').textContent = state.outDir ? 'In Ablage speichern' : 'Speichern';
  flowList();
  updateExportUi();
  $('#expDlg').showModal();
  if (pre.focus === 'password') $('#x-pw').focus(); else if (pre.focus === 'stamp') $('#x-pnum').focus();
  else (pre.saveAs ? $('#x-saveas') : $('#x-go')).focus();
}
$('#btnSaveAs').onclick = () => openExport({ saveAs: true });
let estTimer = null, estSeq = 0;
function updateExportUi() {
  const o = readExport(), isPdf = o.format === 'pdf' || o.format === 'pdfa', textOnly = ['txt', 'docx', 'xlsx', 'md', 'html'].includes(o.format);
  $('#x-size-row').hidden = textOnly;
  $('#x-sec-pdf').hidden = !isPdf;
  $('#x-lh-row').hidden = o.format !== 'pdf';
  $('#x-sheet-wrap').hidden = o.format !== 'pdf';   // Bögen (2/4 pro Blatt, Broschüre) nur für normale PDF – zum Drucken gedacht   // Briefbogen nur für normale PDF (bei PDF/A wird die Seite als Bild neu aufgebaut)
  if (origDoc()) $('#x-orig-row').hidden = !isPdf;
  for (const id of ['#x-stamp-row', '#x-hf-row', '#x-bates-row', '#x-ph']) $(id).hidden = textOnly;
  $('#x-fmt-row').hidden = !isPdf;   // Ränder, A4 und Bögen nur für PDF
  $('#x-range').disabled = false;
  let err = '';
  if (!o.pages) err = 'Seitenbereich ungültig – z. B. „1-3, 5“.';
  else if (!o.pages.length) err = 'Keine Seiten ausgewählt.';
  else if (o.password && o.password !== $('#x-pw2').value) err = 'Die Passwörter stimmen nicht überein.';
  else if (o.password && o.format === 'pdfa') err = 'PDF/A erlaubt keine Verschlüsselung – bitte Format „PDF“ wählen.';
  else if (o.sign && o.password) err = 'Signieren und Passwortschutz gleichzeitig geht nicht – bitte eines von beiden wählen.';
  else if (o.sign && !window.signCertName?.()) err = 'Zum Signieren zuerst „Zertifikat wählen …“ (.p12/.pfx).';
  $('#x-err').textContent = err; $('#x-go').disabled = $('#x-saveas').disabled = !!err;
  $('#x-ext').textContent = { pdf: '.pdf', pdfa: '.pdf', img: o.pages?.length > 1 ? '_Bilder.zip' : '.jpg', txt: '.txt', docx: '.docx', xlsx: '.xlsx', md: '.md', html: '.html' }[o.format];
  clearTimeout(estTimer); $('#x-est').textContent = '';
  if (err || !isPdf || o.pages.length > 40) return;
  const seq = ++estSeq;
  $('#x-est').textContent = 'Größe wird berechnet …';
  estTimer = setTimeout(async () => {
    try {
      const opts = { pdfa: o.format === 'pdfa', size: o.size, ...stampOpts(o, o.name), noOcr: true, onPage: () => {} };
      let b = await buildPdf(o.pages, state.meta, opts);
      if (o.format === 'pdf' && o.sheet && o.sheet !== '1') b = await sheetLayout(b, o.sheet);
      if (o.size === 'small') { const alt = await buildPdf(o.pages, state.meta, { ...opts, size: 'balanced' }); if (alt.length < b.length) b = alt; }
      if (seq === estSeq) $('#x-est').textContent = `≈ ${Tools.formatBytes(b.length)}` + (state.inputBytes ? ` (Original: ${Tools.formatBytes(state.inputBytes)})` : '');
    } catch (e) { if (seq === estSeq) $('#x-est').textContent = ''; console.warn(e); }
  }, 350);
}
$('#expForm').addEventListener('input', updateExportUi);
$('#x-name').addEventListener('input', () => { $('#x-name').dataset.touched = '1'; });
$('#expForm').addEventListener('change', updateExportUi);
$('#x-range').addEventListener('focus', () => { setRadio('x-pages', 'range'); updateExportUi(); });
$('#expDlg').addEventListener('cancel', () => { estSeq++; });
$('#expForm').addEventListener('submit', async e => {
  estSeq++;
  const how = e.submitter?.value || 'ok';
  if (how !== 'ok' && how !== 'saveas') return;
  if ($('#x-go').disabled) { e.preventDefault(); return; }
  const o = readExport();
  o.saveAs = how === 'saveas';
  LS.set('export', { size: o.size, pageNumbers: o.pageNumbers, header: o.header, footer: o.footer, batesPrefix: o.batesPrefix });
  if (o.name && o.name + '.pdf' !== filename()) { state.touched.fname = true; $('#fname').value = o.name + '.pdf'; }
  try { await doExport(o); } catch (e) { console.error(e); status('Fehler beim Speichern: ' + e.message); }
});

/* Jede Seite (bzw. jede ausgewählte Seite) als eigene PDF – als ZIP oder in den Ablageordner */
async function exportEach() {
  const pages = targets().length > 1 ? targets() : state.pages;
  const files = [];
  for (const [i, p] of pages.entries()) {
    status(`Seite ${i + 1} von ${pages.length} …`, i / pages.length);
    files.push({ name: `${baseName()}_Seite_${String(state.pages.indexOf(p) + 1).padStart(3, '0')}.pdf`, data: await buildPdf([p], state.meta, { onPage: () => {}, noOcr: true }) });
  }
  let where;
  if (state.outDir) { for (const f of files) await writeUnique(state.outDir, f.name, f.data); where = state.outDir.name; }
  else where = await deliver(Tools.zip(files), baseName() + '_Einzelseiten.zip', 'application/zip');
  status(where ? `${files.length} Einzel-PDFs gespeichert: ${where}` : 'Speichern abgebrochen.');
}

/* PDF aufteilen (wie bei Sejda, PDF24, iLovePDF): alle N Seiten, an den Lesezeichen, nach Dateigröße oder nach Seitenbereichen –
   Ausgabe als ZIP bzw. einzeln in den Ablageordner */
const spMode = () => document.querySelector('[name=sp-mode]:checked')?.value || 'n';
const spLimit = () => Math.max(0.5, +$('#sp-mb').value || 5) * 1024 * 1024;
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+\s*/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
function splitGroups2(mode) {
  const P = state.pages, n = P.length;
  if (mode === 'n') { const k = Math.max(1, Math.floor(+$('#sp-n').value) || 1), g = []; for (let i = 0; i < n; i += k) g.push({ pages: P.slice(i, i + k) }); return g; }
  if (mode === 'marks') {
    const marks = outlineFor(P).filter(m => m.pageIndex >= 0);
    if (!marks.length) return null;
    const starts = [...new Map([[0, null], ...marks.map(m => [m.pageIndex, m.title])]).entries()].sort((x, y) => x[0] - y[0]);
    return starts.map(([s, title], i) => ({ pages: P.slice(s, i + 1 < starts.length ? starts[i + 1][0] : n), title }));
  }
  if (mode === 'ranges') {
    const parts = $('#sp-ranges').value.split(/[;,]/).map(x => x.trim()).filter(Boolean), g = [];
    for (const part of parts) { const idx = Tools.parseRange(part, n); if (!idx || !idx.length) return null; g.push({ pages: idx.map(i => P[i]) }); }
    return g.length ? g : null;
  }
  return null;   // Größe: erst beim Aufteilen (dafür werden die Seiten einzeln gemessen)
}
function splitInfo() {
  const mode = spMode(), g = splitGroups2(mode);
  $('#sp-info').textContent = mode === 'size' ? 'PDFMy misst die Seiten und füllt jede Datei bis zur gewählten Größe.'
    : !g ? (mode === 'marks' ? 'Dieses Dokument hat keine Lesezeichen – „Inhalt“ im Menü legt welche an.' : 'Bitte Seitenbereiche angeben, z. B. 1-3, 4-7, 8-.')
    : `Ergibt ${g.length} Datei(en).`;
  $('#spGo').disabled = mode !== 'size' && !g;
}
function openSplit() {
  if (state.pages.length < 2) return status('Zum Aufteilen braucht das Dokument mindestens zwei Seiten.');
  splitInfo(); $('#splitDlg').showModal();
}
$('#splitForm').addEventListener('input', splitInfo);
$('#splitForm').addEventListener('change', splitInfo);
$('#spCancel').onclick = () => $('#splitDlg').close();
$('#btnSplitAdv').onclick = () => { closeMenu(); openSplit(); };
// Seiten halbieren (js/layout.js halve): aktuelles Dokument als PDF erzeugen, Seiten teilen und neu laden – Briefdaten bleiben
$('#btnHalve').onclick = () => { closeMenu(); if (state.pages.length) $('#halveDlg').showModal(); };
$('#hvCancel').onclick = () => $('#halveDlg').close();
$('#halveForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#halveDlg').close();
  const o = { dir: document.querySelector('[name=hv-dir]:checked').value, only: document.querySelector('[name=hv-only]:checked').value, rtl: $('#hv-rtl').checked };
  try {
    status('Seiten werden halbiert …', 0.1);
    const name = filename(), meta = state.meta, files = state.files;
    const doc = await PDFDocument.load(await buildPdf(state.pages, meta, { noOcr: true, onPage: () => {}, bookmarks: false }));
    const n = await Layout.halve(doc, o);
    if (!n) { status(o.only === 'landscape' ? 'Keine Seite im Querformat gefunden – für Hochformat-Seiten „Alle Seiten“ wählen.' : 'Keine Seiten zum Halbieren.'); return; }
    const total = doc.getPageCount(), bytes = await doc.save();
    resetDoc(); state.meta = meta; state.files = files;
    await importFiles([new File([bytes], /\.pdf$/i.test(name) ? name : name + '.pdf', { type: 'application/pdf' })]);
    state.dirty = true; renderForm?.();
    status(`${n} Seite(n) halbiert – das Dokument hat jetzt ${total} Seiten.`);
  } catch (err) { console.error(err); status('Halbieren nicht möglich: ' + err.message); }
});
$('#splitForm').addEventListener('submit', async ev => {
  ev.preventDefault(); $('#splitDlg').close();
  try {
    const mode = spMode(), base = baseName(), build = pages => buildPdf(pages, state.meta, { onPage: () => {}, noOcr: true });
    let groups = splitGroups2(mode);
    if (mode === 'size') {
      const sizes = [];
      for (const [i, p] of state.pages.entries()) { status(`Messe Seite ${i + 1} von ${state.pages.length} …`, i / state.pages.length); sizes.push((await build([p])).length); }
      groups = []; let cur = [], sum = 0;
      state.pages.forEach((p, i) => { if (cur.length && sum + sizes[i] > spLimit()) { groups.push({ pages: cur }); cur = []; sum = 0; } cur.push(p); sum += sizes[i]; });
      if (cur.length) groups.push({ pages: cur });
    }
    if (!groups?.length) return status('Nichts aufzuteilen.');
    const files = [], w = Math.max(2, String(groups.length).length);
    for (const [i, g] of groups.entries()) {
      status(`Erzeuge Datei ${i + 1} von ${groups.length} …`, i / groups.length);
      files.push({ name: `${base}_Teil_${String(i + 1).padStart(w, '0')}${g.title ? '_' + safeName(g.title) : ''}.pdf`, data: await build(g.pages) });
    }
    let where;
    if (state.outDir) { for (const f of files) await writeUnique(state.outDir, f.name, f.data); where = state.outDir.name; }
    else where = await deliver(Tools.zip(files), base + '_aufgeteilt.zip', 'application/zip');
    const big = mode === 'size' ? files.filter(f => f.data.length > spLimit()).length : 0;
    status(where ? `${files.length} PDF-Dateien gespeichert: ${where}` + (big ? ` – ${big} davon größer als gewünscht (eine einzelne Seite ist zu groß; vorher „Verkleinern“ hilft).` : '') : 'Speichern abgebrochen.');
  } catch (e) { console.error(e); status('Aufteilen nicht möglich: ' + e.message); }
});

/* Stapel trennen: Leerseiten oder ✂-Markierungen teilen den Scan in einzelne Briefe */
function splitGroups() {
  const groups = []; let g = [];
  for (const p of state.pages) if (p.blank === undefined && p.processed) p.blank = Imaging.isBlank(p.processed);
  const sheetBlank = s => state.pages.filter(x => x.sheet === s).every(x => x.blank);
  for (const p of state.pages) {
    if (p.blank) {
      // leere Rückseite eines beschriebenen Blatts: nur weglassen, nicht trennen
      if (p.sheet && !sheetBlank(p.sheet)) continue;
      // Trennblatt beidseitig: nur einmal trennen (bei der Vorderseite)
      if (p.sheet && p.side === 'Rückseite') continue;
      if (g.length) groups.push(g); g = []; continue;
    }
    g.push(p);
    if (p.splitAfter) { groups.push(g); g = []; }
  }
  if (g.length) groups.push(g);
  return groups;
}
$('#btnSplit').onclick = async () => {
  let groups = splitGroups(), auto = false;
  if (groups.length < 2 && state.pages.length > 1) {
    // Ohne Trennblatt: am Inhalt erkennen, wo ein neuer Brief beginnt (Anrede, Datum, neuer Absender, „Seite 1 von“)
    status('Suche Briefanfänge …'); await runOcrAll();
    const pages = state.pages.filter(p => !p.blank), starts = Letter.splitPoints(pages.map(pageText), S.ownName);
    if (starts.length) { starts.forEach(i => { pages[i - 1].splitAfter = true; }); auto = true; groups = splitGroups(); refresh(); }
  }
  if (groups.length < 2) return status('Keine Trennung gefunden. Ein leeres Blatt zwischen die Briefe legen oder mit ✂ markieren, wo ein Brief endet.');
  if (!confirm(`${groups.length} Briefe erkannt (${groups.map(g => g.length).join(' + ')} Seiten)${auto ? ' – automatisch am Inhalt erkannt, die Trennstellen sind in der Seitenleiste mit ✂ markiert' : ''}. Jeden Brief einzeln erkennen und ablegen?`)) return;
  if (!state.outDir) { await chooseOutDir(); if (!state.outDir) return status('Für „Stapel trennen“ wird ein Ablageordner benötigt.'); }
  await runOcrAll();
  const saved = [];
  try {
    for (const [i, grp] of groups.entries()) {
      const meta = Object.assign(emptyMeta(), metaFor(grp));
      const bytes = await buildPdf(grp, meta, { onPage: k => status(`Brief ${i + 1}/${groups.length}: Seite ${k + 1} …`, (i + k / grp.length) / groups.length) });
      const rel = await saveToOutDir(bytes, Letter.buildFilename(meta), meta);
      saved.push(rel); await journalAdd(meta, `${state.outDir.name}\\${rel}`, grp.length, grp.map(pageText).join('\n'));
    }
    state.dirty = false;
    status(`${saved.length} Briefe abgelegt in „${state.outDir.name}“: ${saved.join(' · ')}`);
  } catch (e) { console.error(e); status('Fehler beim Trennen: ' + e.message); }
};

/* ---------- Ordner ---------- */
// Ordner-Freigaben im Browser merken (IndexedDB), damit nach dem Neustart ein Klick zum Wiederverbinden reicht
const idb = {
  db() {
    return this._db ||= new Promise((res, rej) => {
      const r = indexedDB.open('mpdf', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    try { const db = await this.db(); return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
    catch { return null; }
  },
  async set(k, v) {
    try { const db = await this.db(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
    catch {}
  },
};
async function permitted(h, mode, ask) {
  const o = { mode };
  if (await h.queryPermission(o) === 'granted') return true;
  return ask && await h.requestPermission(o) === 'granted';
}

function useOutDir(dir) {
  state.outDir = dir; idb.set('outDir', dir);
  $('#btnOut').classList.add('on'); setLbl('#btnOut', `Ablage: ${dir.name}`);
  renderSide(); status(`Ablageordner: ${dir.name}`);
}
async function chooseOutDir() {
  if (!window.showDirectoryPicker) return status('Ablageordner benötigt Edge oder Chrome.');
  try { useOutDir(await showDirectoryPicker({ id: 'mpdf-out', mode: 'readwrite' })); }
  catch (e) { if (e.name !== 'AbortError') status(e.message); }
}
$('#btnOut').onclick = async () => {
  const saved = !state.outDir && await idb.get('outDir');
  if (saved && await permitted(saved, 'readwrite', true)) return useOutDir(saved);
  chooseOutDir();
};

/* Scan-Ordner: neue Dateien automatisch übernehmen. Was eintraf, während die App geschlossen war, wird beim Wiederverbinden nachgeholt. */
async function useInbox(dir, catchUp) {
  state.inDir = dir; state.seen.clear(); state.sizes = {};
  const since = catchUp ? LS.get('inboxSince', 0) : Infinity;
  let missed = 0;
  for await (const [name, h] of dir.entries()) {
    if (h.kind !== 'file') continue;
    const f = await h.getFile();
    if (f.lastModified > since && /\.(pdf|jpe?g|png|webp|bmp)$/i.test(name)) missed++;
    else state.seen.add(name + '|' + f.lastModified);
  }
  idb.set('inDir', dir); LS.set('inboxSince', Date.now());
  clearInterval(state.poll); state.poll = setInterval(pollInbox, 2000);
  $('#btnInbox').classList.add('on'); setLbl('#btnInbox', `Scanner ✓ (${dir.name})`); $('#btnInbox').title = `Neue Scans aus „${dir.name}“ erscheinen automatisch. Klicken, um einen anderen Ordner zu wählen.`;
  status(`Scanner verbunden (Ordner „${dir.name}“). Neue Scans erscheinen automatisch.` + (missed ? ` ${missed} neue Scan(s) seit dem letzten Mal werden geladen …` : ''));
  if (missed) pollInbox();
}
/* ---------- Scannen: über das Programm "pdfmy Scan" (lokal, 127.0.0.1:52880) ---------- */
const SCAN_API = 'http://127.0.0.1:52880';
const scanApi = async (path, opts = {}, ms = 30000) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(SCAN_API + path, { ...opts, signal: ctl.signal, headers: { 'X-Pdfmy': '1', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    return r;
  } finally { clearTimeout(t); }
};
// Aktuelle Version von pdfmy Scan – muss zu tools/pdfmy-scan/Program.cs passen (der Web-Build prüft das)
const SCAN_LATEST = '1.9.0';
const SCAN_MAC_LATEST = '1.1.9';   // pdfmy Scan für Mac und Linux (tools/pdfmy-scan-mac, gemeinsames Programm)
const scanLatest = () => state.scanMac ? SCAN_MAC_LATEST : SCAN_LATEST;   // scanMac: Mac oder Linux (gemeinsames Programm)
const SCAN_FILE_UNIX = () => state.scanLinux ? 'pdfmy-scan-linux.sh' : 'pdfmy-Scan-Mac.zip';
const scanOutdated = () => !!state.scanVersion && verLess(state.scanVersion, scanLatest());
const SCAN_FILE = `pdfmy-Scan-${SCAN_LATEST}.exe`;
const verLess = (a, b) => { const x = String(a).split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== y[i]) return (x[i] || 0) < y[i]; return false; };
async function scanHelperRunning() {
  try {
    const r = await fetch(SCAN_API + '/status', { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    const d = r.ok && await r.json(); if (!d || d.app !== 'pdfmy-scan') return false;
    const changed = state.scanVersion !== d.version;
    state.scanVersion = d.version; state.scanPades = d.pades === true; state.scanTsa = d.tsa === true; state.pdfDefault = d.pdfDefault; state.pdfBrowserApp = d.pdfBrowserApp === true; state.scanMac = d.platform === 'mac' || d.platform === 'linux'; state.scanLinux = d.platform === 'linux';
    // Ab 1.5.0: pdfmy Scan merkt sich, welche PDFMy-Version (pdfmy.de oder /mentor) PDFs per Doppelklick öffnen soll
    if (changed && !verLess(d.version, '1.5.0')) fetch(SCAN_API + '/status?app=' + encodeURIComponent(location.origin + location.pathname), { cache: 'no-store' }).catch(() => {});
    if (changed && typeof renderVerBar === 'function') setTimeout(renderVerBar, 0);   // Statuszeile sofort nachziehen (z. B. nach einem Update)
    return true;
  } catch { return false; }
}
function showScan(view) {
  $('#scanReady').hidden = view !== 'ready'; $('#scanSetup').hidden = view !== 'setup'; $('#scanWait').hidden = view !== 'wait';
}
async function loadScanners(refresh) {
  showScan('wait'); $('#scanWait').textContent = 'Suche Scanner … (bis zu 20 Sekunden)';
  try {
    const r = await scanApi('/scanners' + (refresh ? '?refresh=1' : ''), {}, 40000), d = await r.json().catch(() => ({}));
    if (!Array.isArray(d.scanners)) throw new Error(d.error || `Antwort ${r.status}`);   // Fehlermeldung von pdfmy Scan anzeigen statt „Failed to fetch“
    if (d.error) status(d.error);
    const box = $('#scanList'); box.innerHTML = '';
    const last = LS.get('scanner', null);
    d.scanners.forEach((sc, i) => {
      const l = document.createElement('label');
      l.innerHTML = `<input type="radio" name="scanner"><span><b></b><small></small></span>`;
      const inp = l.querySelector('input'); inp.value = sc.id; inp.checked = sc.id === last || (!last && i === 0);
      l.querySelector('b').textContent = sc.name;
      l.querySelector('small').textContent = (sc.kind === 'escl' ? 'Netzwerk, ohne Treiber' : sc.kind === 'wsd' ? 'Netzwerk (WSD), ohne Treiber' : 'Windows-Treiber') + (sc.feeder ? ' · Einzug' : '') + (sc.duplex ? ' · beidseitig möglich' : '');
      inp.dataset.duplex = sc.duplex; inp.dataset.feeder = sc.feeder;
      box.append(l);
    });
    if (!d.scanners.length) box.innerHTML = '<p class="hint">Kein Scanner gefunden. Ist das Gerät eingeschaltet und im selben Netzwerk? Sie können es auch per IP-Adresse hinzufügen (steht am Gerätedisplay unter Netzwerk/TCP-IP).</p><p class="hint">Ihr Gerät ist nicht dabei? <a href="https://pdfmy.de/scanner.html#geraet-fehlt" target="_blank" rel="noopener">Kurz melden – wir machen den Rest</a>.</p>';
    if (!box.querySelector('input:checked') && box.querySelector('input')) box.querySelector('input').checked = true;
    updateScanOpts(); showScan('ready');
  } catch (e) { $('#scanWait').textContent = 'pdfmy Scan antwortet nicht: ' + e.message; }
}
function updateScanOpts() {
  const sel = document.querySelector('#scanList input:checked');
  $('#scanDuplexRow').hidden = !(sel && sel.dataset.duplex === 'true');
  $('#scanDuplex').checked = LS.get('scanDuplex', false);
  // Einzug ohne Duplex (z. B. Epson L5290, viele Brother-DCP, Dell-Einstiegsgeräte): beidseitig durch Wenden des Stapels
  $('#scanFlipRow').hidden = !(sel && sel.dataset.feeder === 'true' && sel.dataset.duplex !== 'true');
  $('#scanFlip').checked = LS.get('scanFlip', false);
  $('#scanGo').disabled = !sel;
}
$('#scanList').addEventListener('change', updateScanOpts);
$('#scanColor').value = LS.get('scanColor', 'gray');

// "Scanner verbinden": mit pdfmy Scan → Scanner wählen und scannen; ohne → Programm anbieten (oder gemerkten Scan-Ordner)
async function openScanDialog() {
  // Beide Systeme anbieten: das erkannte als Hauptknopf, das andere daneben
  const dlBase = (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'download/';
  $('#scanDownload').href = dlBase + SCAN_FILE; $('#scanMacDownload').href = dlBase + 'pdfmy-Scan-Mac.zip';
  document.querySelectorAll('.scanAltMac').forEach(a => a.href = dlBase + 'pdfmy-Scan-Mac.zip');
  document.querySelectorAll('.scanAltWin').forEach(a => a.href = dlBase + SCAN_FILE);
  document.querySelectorAll('.scanAltLinux').forEach(a => a.href = dlBase + 'pdfmy-scan-linux.sh');
  $('#scanLinuxDownload').href = dlBase + 'pdfmy-scan-linux.sh';
  document.querySelectorAll('.linuxGuide').forEach(a => a.href = (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'scanner.html#linux');
  document.querySelectorAll('.devList').forEach(a => a.href = (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'scanner-geraete.html');
  document.querySelectorAll('.scanVerNew').forEach(e => e.textContent = IS_MAC || IS_LINUX ? SCAN_MAC_LATEST : SCAN_LATEST);
  $('#guideLink').href = APP.edition === 'web' ? 'scanner.html' : 'https://pdfmy.de/scanner.html';
  document.querySelectorAll('#scanDlg [data-connect]').forEach(b => b.disabled = !window.showDirectoryPicker);
  $('#scanSetupMac').hidden = !IS_MAC; $('#scanSetupLinux').hidden = !IS_LINUX; $('#scanSetupWin').hidden = IS_MAC || IS_LINUX; $('#scanMacSafari').hidden = !!window.showDirectoryPicker;
  showScan('wait'); $('#scanWait').textContent = 'Verbinde …';
  if (!$('#scanDlg').open) $('#scanDlg').showModal();
  if (await scanHelperRunning()) {
    // Ältere Programmversion? Update anbieten (die neue ersetzt die alte beim Öffnen automatisch)
    $('#scanUpdate').hidden = !scanOutdated(); $('#scanUpdateLink').href = $('#scanDownload').href;
    $('#scanVerOld').textContent = state.scanVersion; $('#scanVerInfo').textContent = `pdfmy Scan ${state.scanVersion}`;
    setScanReady(true); loadScanners(false); return;
  }
  setScanReady(false);
  // Früher verbundener Scan-Ordner? Dann mit einem Klick wieder verbinden
  const saved = window.showDirectoryPicker && !state.inDir && await idb.get('inDir');
  if (saved && await permitted(saved, 'read', true).catch(() => false)) { $('#scanDlg').close(); return useInbox(saved, true); }
  showScan('setup');
}
function setScanReady(ok) {
  state.scanHelper = ok;
  setLbl('#btnInbox', ok ? 'Scannen' : (state.inDir ? `Scanner ✓ (${state.inDir.name})` : 'Scanner verbinden'));
  $('#btnInbox').classList.toggle('on', ok || !!state.inDir);
}
$('#btnInbox').onclick = openScanDialog;
$('#scanRecheck').onclick = $('#scanRecheckMac').onclick = $('#scanRecheckLinux').onclick = openScanDialog;
$('#scanRefresh').onclick = () => loadScanners(true);
// Scanner im Energiesparmodus: pdfmy Scan weckt die bekannten Geräte und sucht neu (ab Windows 1.8.6, Mac/Linux 1.1.6)
$('#scanWake').onclick = async () => {
  showScan('wait'); $('#scanWait').textContent = 'Wecke die Scanner … (bis zu 30 Sekunden)';
  try {
    const r = await scanApi('/wake', { method: 'POST' }, 60000), d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Antwort ${r.status} – bitte pdfmy Scan aktualisieren`);
    status(d.woken ? `${d.woken} Gerät(e) angesprochen – ${d.devices} Scanner gefunden.` : 'Noch kein Gerät bekannt – bitte „Neu suchen“ oder das Gerät per IP-Adresse hinzufügen.');
  } catch (e) { status('Aufwecken nicht möglich: ' + e.message); }
  loadScanners(false);
};
$('#scanAddIp').onclick = async () => {
  const ip = prompt('IP-Adresse des Scanners (z. B. 192.168.1.50):'); if (!ip) return;
  showScan('wait'); $('#scanWait').textContent = `Prüfe ${ip} …`;
  try {
    const r = await scanApi('/scanners/add', { method: 'POST', body: JSON.stringify({ ip }) }), d = await r.json();
    if (!r.ok) { alert(d.error); } else LS.set('scanner', d.id);
  } catch (e) { alert('Fehler: ' + e.message); }
  loadScanners(false);
};
$('#scanCancel').onclick = $('#scanClose').onclick = () => $('#scanDlg').close();
$('#scanPhone').onclick = $('#scanPhoneMac').onclick = () => { $('#scanDlg').close(); $('#camIn').click(); };
document.querySelectorAll('#scanDlg [data-connect]').forEach(b => b.onclick = async () => {
  try {
    const dir = await showDirectoryPicker({ id: 'mpdf-in', mode: 'read' });
    $('#scanDlg').close();
    await useInbox(dir, false);
  } catch (e) { if (e.name !== 'AbortError') status(e.message); }
});

// Scannen: Auftrag starten, Seiten abholen, sobald sie fertig sind – sie erscheinen sofort im Dokument
$('#scanGo').onclick = async () => {
  const sel = document.querySelector('#scanList input:checked'); if (!sel) return;
  LS.set('scanner', sel.value); LS.set('scanColor', $('#scanColor').value);
  LS.set('scanSource', $('#scanSource').value);
  if (!$('#scanDuplexRow').hidden) LS.set('scanDuplex', $('#scanDuplex').checked);
  const flip = !$('#scanFlipRow').hidden && $('#scanFlip').checked;
  if (!$('#scanFlipRow').hidden) LS.set('scanFlip', flip);
  const req = { id: sel.value, duplex: $('#scanDuplex').checked && !$('#scanDuplexRow').hidden, color: $('#scanColor').value, dpi: 300, source: flip ? 'feeder' : $('#scanSource').value };
  $('#scanDlg').close();
  try {
    const fronts = await scanRun(req, flip ? 'Vorderseite' : 'Seite');
    if (!flip || !fronts.length) return;
    if (!await askFlip(fronts.length)) { status(`${fronts.length} Vorderseite(n) gescannt – ohne Rückseiten.`); return; }
    const backs = await scanRun(req, 'Rückseite');
    flipMerge(fronts, backs);
  } catch (e) { showScanError(e); }
};
// Ein Scanauftrag: Seiten abholen, sobald sie fertig sind (sie erscheinen sofort im Dokument); liefert die neuen Seiten
async function scanRun(req, word) {
  status('Scanne … bitte warten', 0.05);
  const added = [];
  {
    const r = await scanApi('/scan', { method: 'POST', body: JSON.stringify(req) }), d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Scan nicht möglich');
    let got = 0, st;
    for (;;) {
      st = await (await scanApi('/scan/' + d.job)).json();
      while (got < st.pages) {
        const blob = await (await scanApi(`/scan/${d.job}/page/${got}`, {}, 60000)).blob();
        got++;
        status(`${word} ${got} gescannt …`, 0.5);
        const ext = st.mime === 'application/pdf' ? 'pdf' : 'jpg';
        const n0 = state.pages.length;
        state.fromScanner = true; state.scanDone = false;   // Autopilot: erst nach dem letzten Blatt
        await importFiles([new File([blob], `Scan_${new Date().toISOString().slice(0, 19).replace(/\D/g, '')}_${got}.${ext}`, { type: st.mime })]);
        if (req.duplex) state.pages.slice(n0).forEach(p => { p.sheet = d.job + ':' + Math.floor((got - 1) / 2); p.side = (got - 1) % 2 ? 'Rückseite' : 'Vorderseite'; });
        added.push(...state.pages.slice(n0));
      }
      if (st.state !== 'running') break;
      await new Promise(res => setTimeout(res, 600));
    }
    state.scanDone = true; window.renderTodo?.();
    if (st.state === 'error') { const err = new Error(st.error); err.detail = st.detail; throw err; }
    status(got ? `${got} Seite(n) gescannt.` + (st.note ? ' ' + st.note : '') : 'Keine Seiten gescannt – liegt Papier im Einzug?');
    if (st.note) toast(st.note, 9000);
    else if (req.duplex && got % 2 === 1) toast(`Beidseitig angefordert, aber ${got} Seite(n) erhalten. Falls Rückseiten fehlen: im Scan-Fenster auf „Protokoll“ klicken und es uns schicken.`, 12000);
  }
  return added;
}
// Beidseitig durch Wenden: nach den Vorderseiten um das Wenden des Stapels bitten
function askFlip(n) {
  return new Promise(res => {
    const d = $('#flipDlg');
    $('#flipWhat').textContent = `${n === 1 ? `${n} Vorderseite` : `${n} Vorderseiten`} gescannt.`;
    d.onclick = e => { const b = e.target.closest('[data-flip]'); if (!b) return; d.close(); res(b.dataset.flip === 'go'); };
    d.oncancel = () => res(false);
    d.showModal(); d.querySelector('[data-flip="go"]').focus();
  });
}
// Vorder- und Rückseiten verzahnen. Ein gewendeter Stapel liefert die Rückseiten meist in umgekehrter Reihenfolge (letztes Blatt zuerst).
function flipMerge(fronts, backs, reversed = true) {
  const set = new Set([...fronts, ...backs]), at = state.pages.findIndex(p => set.has(p));
  if (at < 0) return;
  const b = reversed ? backs.slice().reverse() : backs.slice(), id = 'flip' + Date.now(), out = [];
  fronts.forEach((f, i) => { f.sheet = id + ':' + i; f.side = 'Vorderseite'; out.push(f); if (b[i]) { b[i].sheet = id + ':' + i; b[i].side = 'Rückseite'; out.push(b[i]); } });
  out.push(...b.slice(fronts.length));
  state.pages = state.pages.filter(p => !set.has(p)); state.pages.splice(at, 0, ...out);
  state.sel = at; state.dirty = true; refresh();
  if (backs.length !== fronts.length) toast(`${fronts.length} Vorderseiten, aber ${backs.length} Rückseiten – bitte die Reihenfolge prüfen (Seitenübersicht, Taste G).`, 10000);
  status(`Beidseitig: ${fronts.length} Blatt sortiert (Vorderseite, Rückseite, …).`);
  const c = $('#flipCheck');
  $('#flipCheckN').textContent = `${fronts.length} Blatt, ${out.length} Seiten.`;
  c.onclick = e => {
    const btn = e.target.closest('[data-fc]'); if (!btn) return; c.close();
    if (btn.dataset.fc === 'swap') { flipMerge(fronts, backs, !reversed); c.close(); status('Rückseiten andersherum einsortiert.'); }
  };
  if (!c.open) c.show();
}
// Verständliches Fehlerfenster statt nur einer Statuszeile – mit Tipps, Details und "Erneut versuchen"
async function showScanError(e) {
  status('Scannen fehlgeschlagen: ' + e.message);
  const others = [...document.querySelectorAll('#scanList label')].filter(l => !l.querySelector('input').checked).map(l => l.querySelector('b').textContent);
  const otherHint = others.length ? ` Tipp: Es gibt noch ${others.length === 1 ? 'einen weiteren Eintrag' : 'weitere Einträge'} in der Scannerliste (${others.join(', ')}) – oft ist es dasselbe Gerät über einen anderen Weg. Bitte damit versuchen.` : '';
  $('#scanErrMsg').textContent = (/falscher parameter/i.test(e.message)
    ? 'Ihr Scanner-Treiber hat die Einstellungen abgelehnt. Bitte pdfmy Scan aktualisieren (neu herunterladen und öffnen) – die neue Version weicht automatisch auf passende Einstellungen aus.'
    : e.message) + otherHint;
  let detail = e.detail || '';
  try { const l = await (await scanApi('/log', {}, 3000)).json(); detail += (detail ? '\n\n' : '') + `pdfmy Scan ${l.version}\n` + l.lines.slice(-8).join('\n'); }
  catch { detail += `\npdfmy Scan ${state.scanVersion || '?'}`; }
  $('#scanErrDetail').textContent = detail;
  $('#scanErrDlg').showModal();
}
$('#scanErrClose').onclick = () => $('#scanErrDlg').close();
// Protokoll von pdfmy Scan ansehen und kopieren (auch ohne Fehler – z. B. wenn beidseitig nur Vorderseiten kamen)
$('#scanLog').onclick = async () => {
  let text = '';
  try { const l = await (await scanApi('/log', {}, 3000)).json(); text = `pdfmy Scan ${l.version}\n` + l.lines.slice(-25).join('\n'); }
  catch (e) { text = 'Protokoll nicht abrufbar: ' + e.message; }
  try { await navigator.clipboard.writeText(text); status('Protokoll von pdfmy Scan in die Zwischenablage kopiert.'); } catch {}
  $('#scanErrMsg').textContent = 'Das Protokoll ist bereits in die Zwischenablage kopiert und kann z. B. per E-Mail an den Support geschickt werden.';
  $('#scanErrDetail').textContent = text;
  $('#scanErrDlg').querySelector('h3, .dlgtitle').textContent = 'Protokoll von pdfmy Scan';
  $('#scanErrDlg').querySelector('details').open = true;
  $('#scanErrDlg').classList.add('logmode');
  $('#scanErrDlg').showModal();
};
$('#scanErrDlg').addEventListener('close', () => { $('#scanErrDlg').classList.remove('logmode'); $('#scanErrDlg').querySelector('h3, .dlgtitle').textContent = 'Scannen hat nicht geklappt'; });
$('#scanErrRetry').onclick = () => { $('#scanErrDlg').close(); openScanDialog(); };
$('#scanSource').value = LS.get('scanSource', 'auto');
// Beim Start: läuft pdfmy Scan schon? Dann heißt der Knopf direkt "Scannen"
scanHelperRunning().then(ok => { if (ok) setScanReady(true); });
// Beim Start: gemerkte Ordner anzeigen und – falls der Browser die Freigabe noch hat – sofort verbinden
(async () => {
  if (!window.showDirectoryPicker) return;
  const [inDir, outDir] = [await idb.get('inDir'), await idb.get('outDir')];
  if (inDir) {
    // Ordner inzwischen gelöscht/umbenannt? Dann nicht abstürzen, sondern zum Neu-Verbinden auffordern
    const gone = () => { setLbl('#btnInbox', 'Scanner verbinden'); status(`Der Scan-Ordner „${inDir.name}“ wurde nicht gefunden – bitte über „Scanner verbinden“ neu wählen.`); };
    if (await permitted(inDir, 'read', false).catch(() => false)) useInbox(inDir, true).catch(gone);
    else { setLbl('#btnInbox', `Scanner verbinden (${inDir.name})`); $('#btnInbox').title = 'Ein Klick genügt – der Browser fragt nach der Freigabe.'; }
  }
  if (outDir) {
    if (await permitted(outDir, 'readwrite', false).catch(() => false)) useOutDir(outDir);
    else setLbl('#btnOut', `Ablage „${outDir.name}“ verbinden`);
  }
})();
async function pollInbox() {
  if (state.polling || !state.inDir) return;
  state.polling = true;
  try {
    const fresh = [];
    for await (const [name, h] of state.inDir.entries()) {
      if (h.kind !== 'file' || !/\.(pdf|jpe?g|png|webp|bmp)$/i.test(name)) continue;
      const f = await h.getFile(), key = name + '|' + f.lastModified;
      if (state.seen.has(key)) continue;
      if (state.sizes[key] !== f.size) { state.sizes[key] = f.size; continue; } // Scanner schreibt noch
      state.seen.add(key); fresh.push(f);
    }
    if (fresh.length) { fresh.sort((a, b) => a.lastModified - b.lastModified); state.fromScanner = true; state.scanDone = false; await importFiles(fresh); state.scanDone = true; window.renderTodo?.(); }
    if (!Object.keys(state.sizes).some(k => !state.seen.has(k))) LS.set('inboxSince', Date.now() - 5000);
  } catch (e) { console.warn(e); } finally { state.polling = false; }
}

/* ---------- Import-Wege, Neu ---------- */
$('#fileIn').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (!state.pages.length) state.intent = null; if (window.pdfmyAdd) { window.pdfmyAdd = false; importFiles(f); } else (window.openWithChoice || importFiles)(f); };
$('#camIn').onchange = e => { importFiles([...e.target.files], { fromCamera: true }); e.target.value = ''; };
addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
addEventListener('drop', e => {
  document.body.classList.remove('dropping');
  if (!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  // Verweise für „Zuletzt geöffnet“ (nur Chrome/Edge; muss noch während des Ereignisses abgefragt werden)
  const hs = [...e.dataTransfer.items].filter(i => i.kind === 'file' && i.getAsFileSystemHandle).map(i => i.getAsFileSystemHandle().catch(() => null));
  const files = [...e.dataTransfer.files];
  Promise.all(hs).then(l => {
    const fh = l.filter(h => h && h.kind === 'file');
    files.forEach(f => { const h = fh.find(x => x.name === f.name); if (h) window.pdfmyHandles?.set(f, h); });
    (window.openWithChoice || importFiles)(files);
    window.rememberRecent?.(fh);
  });
});
function resetDoc() {
  $('#assignee').value = ''; $('#akte').value = ''; state.akteTouched = false; $('#tags').value = '';
  $('#formHint').hidden = true;
  Object.assign(state, { files: [], filesDirty: false, marks: null, einv: null, assignee: '', akte: '', fromArchive: null, tags: '', cf: {}, cfTouched: false, pages: [], docs: [], sel: -1, annSel: null, editing: null, crop: null, undo: [], touched: {}, dirty: false, meta: emptyMeta(),
    picked: new Set(), anchor: null, view: 'page', intent: null, inputBytes: 0, fromScanner: false, scanDone: false, autoArmed: null, wv: '' });
  if ($('#m-wv')) $('#m-wv').value = '';
  window.cfRender?.(); window.reqReset?.();
  setLbl('#btnGrid', 'Seitenübersicht'); renderForm();
  $('#anaHint').textContent = ''; refresh();
}
$('.brand').title = 'Zur Startseite';
$('.brand').addEventListener('click', () => { if (state.pages.length) $('#btnNew').click(); else window.scrollTo(0, 0); });
$('#btnNew').onclick = () => {
  if (state.dirty && state.pages.length && !confirm('Aktuellen Brief verwerfen? Er wurde noch nicht gespeichert.')) return;
  resetDoc(); status('Bereit.');
};
addEventListener('beforeunload', e => { if (state.dirty && state.pages.length) { e.preventDefault(); e.returnValue = ''; } });
// "Öffnen mit" für die installierte App
// Doppelklick im Explorer/Finder (installierte App): neue Datei ersetzt das offene Dokument – nach Rückfrage, wenn ungespeichert
// Übergebene Datei sofort vollständig einlesen: Outlook (v. a. am Mac) legt Anhänge nur als kurzlebige Kopie ab und entfernt
// oder sperrt sie wieder – ein späteres Lesen (z. B. nach der Auswahl „Wie öffnen?“) scheitert dann mit „NotReadableError“.
async function readNow(h) {
  for (let i = 0; ; i++) {
    try { const f = await h.getFile(), buf = await f.arrayBuffer(); return new File([buf], f.name, { type: f.type, lastModified: f.lastModified }); }
    catch (e) { if (i >= 4 || e.name === 'NotFoundError') throw e; await new Promise(r => setTimeout(r, 250 * (i + 1))); }   // Datei wird evtl. noch geschrieben
  }
}
window.readNow = readNow;
const noRead = e => ['NotReadableError', 'NotFoundError', 'SecurityError'].includes(e?.name);
// Darf der Browser die übergebene Datei nicht lesen (Outlook-Anhang im geschützten Ordner am Mac, neues Outlook unter Windows,
// Thunderbird-Anhang in /tmp bei Chromium als Snap): pdfmy Scan sucht die frisch abgelegte Datei gleichen Namens
// und reicht sie über 127.0.0.1 nach (ab Windows 1.8.7, Mac/Linux 1.1.7). Die Datei verlässt das Gerät nicht.
async function readLaunched(h) {
  try { return await readNow(h); }
  catch (e) {
    if (!noRead(e)) throw e;
    try {
      const r = await scanApi('/attachment?name=' + encodeURIComponent(h.name), {}, 20000);
      const ext = (h.name.match(/\.(\w+)$/) || [])[1]?.toLowerCase(), type = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff' }[ext] || '';
      if (r.ok) { const b = await r.blob(); if (b.size) return new File([b], h.name, { type }); }
    } catch {}
    throw e;
  }
}
window.readLaunched = readLaunched;
const unreadable = (name, e) => noRead(e)
  ? `„${name}“ konnte nicht gelesen werden – Outlook legt Anhänge in einem geschützten Ordner ab, den der Browser nicht lesen darf. Mit pdfmy Scan (Windows ab 1.8.7, Mac und Linux ab 1.1.7) öffnet PDFMy solche Anhänge automatisch. Sonst den Anhang in Outlook sichern („Speichern unter“) und dann öffnen.`
  : `Fehler bei ${name}: ${e?.message || e}`;
window.unreadable = unreadable;
if ('launchQueue' in window) launchQueue.setConsumer(async params => {
  if (!params.files?.length) return;
  let files;
  try { files = await Promise.all(params.files.map(readLaunched)); }
  catch (e) {
    console.warn('Datei übernehmen', e); status(unreadable(params.files[0]?.name || 'Datei', e));
    // Dauerhafte Lösung anbieten: Ist nicht „PDFMy (pdfmy Scan)“ Standard (sondern z. B. die Chrome-App), gibt Outlook die Datei
    // direkt an den Browser – ohne den Umweg über pdfmy Scan, der sie sichern könnte
    if (noRead(e) && !state.pdfDefault && typeof scanHelperRunning === 'function' && await scanHelperRunning() && !state.pdfDefault &&
      confirm('Damit sich Anhänge aus Outlook künftig zuverlässig öffnen, sollte „PDFMy (pdfmy Scan)“ das Standardprogramm für PDF-Dateien sein.\n\nJetzt einstellen?')) $('#btnDefaultPdf')?.click();
    return;
  }
  files.forEach((f, i) => window.pdfmyHandles?.set(f, params.files[i]));
  window.rememberRecent?.(params.files);
  if (window.openWithChoice) return window.openWithChoice(files);
  await importFiles(files);
});
// Import-Schnittstelle für die Browser-Erweiterung „PDFMy öffnen“ (tools/pdfmy-extension): Deren Content-Script reicht
// die im Browser geladene PDF per postMessage aus demselben Fenster herein – die Datei verlässt das Gerät nicht.
// Nur Nachrichten aus diesem Fenster und dieser Herkunft; fremde Frames und Fenster werden ignoriert.
addEventListener('message', e => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data;
  if (d?.type === 'pdfmy:ping') return postMessage({ type: 'pdfmy:ready' }, location.origin);
  if (d?.type !== 'pdfmy:open-file') return;
  if (d.error) return status(`PDF konnte nicht übernommen werden: ${d.error}`);
  if (!(d.bytes instanceof ArrayBuffer) || !d.bytes.byteLength) return status('PDF konnte nicht übernommen werden: Datei ist leer.');
  const name = String(d.name || 'Dokument.pdf').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180);
  if (state.dirty && state.pages.length && !confirm(`„${name}“ öffnen? Der aktuelle Brief wurde noch nicht gespeichert und wird verworfen.`)) return;
  resetDoc(); state.intent = null;
  // Das Original liegt weiter auf der Webseite: erst eigene Änderungen gelten als „nicht gespeichert“ (kein Rückfrage-Dialog bei „Zurück“)
  importFiles([new File([d.bytes], /\.pdf$/i.test(name) ? name : name + '.pdf', { type: 'application/pdf' })]).then(() => { state.dirty = false; });
});
document.documentElement.dataset.pdfmyImport = '1';
postMessage({ type: 'pdfmy:ready' }, location.origin);

/* ---------- Startseite: Aufgaben ---------- */
const INTENTS = {
  scan: 'image/*,application/pdf,.pdf,.xml,.eml,.msg', merge: 'application/pdf,.pdf', organize: 'application/pdf,.pdf,image/*',
  compress: 'application/pdf,.pdf', img2pdf: 'image/*', pdf2img: 'application/pdf,.pdf', redact: 'application/pdf,.pdf,image/*',
  sign: 'application/pdf,.pdf,image/*', form: 'application/pdf,.pdf', protect: 'application/pdf,.pdf', unlock: 'application/pdf,.pdf',
  stamp: 'application/pdf,.pdf', pdfa: 'application/pdf,.pdf,image/*', text: 'application/pdf,.pdf,image/*',
  docx: 'application/pdf,.pdf,image/*', bates: 'application/pdf,.pdf,image/*',
  compare: 'application/pdf,.pdf,image/*', split: 'application/pdf,.pdf', batch: 'application/pdf,.pdf,image/*', imgout: 'application/pdf,.pdf', repair: 'application/pdf,.pdf',
};
document.querySelectorAll('[data-intent]').forEach(b => b.onclick = () => {
  state.intent = b.dataset.intent;
  const inp = $('#intentIn'); inp.accept = INTENTS[state.intent]; inp.multiple = true; inp.click();
});
$('#intentIn').onchange = e => {
  const files = [...e.target.files]; e.target.value = '';
  if (state.intent === 'compare') return compareFiles(files);      // js/pro.js
  if (state.intent === 'batch') return batchFiles(files);
  importFiles(files);
};
$('#dropIn').onchange = e => { state.intent = null; importFiles([...e.target.files]); e.target.value = ''; };

function applyIntent() {
  switch (state.intent) {
    case 'merge': setView('grid'); status(`${state.docs.length} Datei(en), ${state.pages.length} Seiten. Reihenfolge per Ziehen ändern, dann „Speichern“.`); break;
    case 'organize': setView('grid'); status('Seiten anklicken (Strg/Umschalt für mehrere), ziehen, drehen, löschen – dann „Speichern“.'); break;
    case 'img2pdf': setView('grid'); status('Reihenfolge prüfen, dann „Speichern“.'); break;
    case 'compress': openExport({ size: 'small' }); break;
    case 'pdf2img': openExport({ format: 'img' }); break;
    case 'imgout': window.extractImages?.(); break;
    case 'repair': status(state.docs.some(d => d.repaired) ? 'Reparierte Seiten prüfen, dann speichern.' : 'Die Datei ist in Ordnung – keine Reparatur nötig. Beim Speichern wird sie sauber neu geschrieben.'); openExport({ format: 'pdf' }); break;
    case 'redact': setTool('rd'); status('Bereiche aufziehen – oder „Persönliche Daten finden“ für Vorschläge. Der Inhalt darunter wird beim Speichern entfernt.'); break;
    case 'sign': setTool('sign'); status('Auf die Stelle klicken, an der die Unterschrift stehen soll.'); break;
    case 'form': {
      const d = state.docs[state.pages[0]?.docIdx];
      if (d?.fields?.length) { status(`Formular mit ${d.fields.length} Feldern erkannt – rechts ausfüllen, dann speichern.`); $('#formSec')?.scrollIntoView({ behavior: 'smooth' }); }
      else { status('Keine ausfüllbaren Felder – PDFMy sucht Schreiblinien und Kästchen …'); window.autoForm?.(true); }
      break;
    }
    case 'protect': openExport({ format: 'pdf', focus: 'password' }); break;
    case 'unlock':
      status(state.docs.some(d => d.unlocked) ? 'Entsperrt. Jetzt ohne Passwort speichern.' : 'Diese Datei war nicht passwortgeschützt.');
      openExport({ format: 'pdf' }); break;
    case 'stamp': openExport({ format: 'pdf', focus: 'stamp' }); break;
    case 'pdfa': openExport({ format: 'pdfa' }); break;
    case 'text': openExport({ format: 'txt' }); break;
    case 'docx': openExport({ format: 'docx' }); break;
    case 'bates': setView('grid'); openExport({ format: 'pdf', bates: true }); break;
    case 'split': openSplit(); break;
  }
}

/* ---------- Seitenübersicht ---------- */
function setView(v) { state.view = v; setLbl('#btnGrid', v === 'grid' ? 'Einzelseite' : 'Seitenübersicht'); refresh(); }
$('#btnGrid').onclick = () => setView(state.view === 'grid' ? 'page' : 'grid');
function makeThumbL(c) {
  const t = Imaging.canvas(320, Math.round(c.height * 320 / c.width));
  const x = t.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.75);
}
function renderGrid() {
  const g = $('#grid'); if (g.hidden) return;
  const n = state.pages.length, k = state.picked.size;
  g.innerHTML = `<div class="gridbar"><span class="count">${k > 1 ? `${k} von ${n} Seiten ausgewählt` : `${n === 1 ? `${n} Seite` : `${n} Seiten`}`}</span>
    <button data-a="all">${k === n ? 'Auswahl aufheben' : 'Alle auswählen'}</button>
    <button data-a="rotl" title="Links drehen">⟲</button><button data-a="rotr" title="Rechts drehen">⟳</button>
    <button data-a="dup">Duplizieren</button><button data-a="blank">Leerseite einfügen</button><button data-a="del">Löschen</button>
    <button data-a="add">Dateien hinzufügen</button><button data-a="extract">Auswahl speichern …</button><button data-a="each">Einzelseiten speichern</button></div>
    <div class="cards"></div>`;
  const cards = g.querySelector('.cards');
  state.pages.forEach((p, i) => {
    if (p.processed && i < 24) p.thumbL ||= makeThumbL(p.processed);
    const c = document.createElement('div');
    c.className = 'card' + (state.picked.has(p.id) ? ' picked' : ''); c.draggable = true; c.tabIndex = 0;
    c.innerHTML = `<img alt="Seite ${i + 1}"><span class="chk">${state.picked.has(p.id) ? '✓' : ''}</span>
      <div class="acts"><button data-r="-90" title="Links drehen">⟲</button><button data-r="90" title="Rechts drehen">⟳</button><button data-d title="Löschen">×</button></div>
      <div class="no"><span>${i + 1}</span><span>${p.blank && !p.keepBlank ? 'leer' : ''}</span></div>`;
    if (p.thumbL) c.querySelector('img').src = p.thumbL; else lazyImg(c.querySelector('img'), p, true);
    c.onclick = e => {
      const b = e.target.closest('button');
      if (b?.dataset.r) { rotatePage(p, +b.dataset.r).then(() => { p.thumbL = null; refresh(); }); return; }
      if (b?.hasAttribute('data-d')) { deletePages([p.id]); return; }
      if (e.target.classList.contains('chk')) e = { ctrlKey: true };
      pickPage(i, e); refresh();
    };
    c.ondblclick = e => { if (!e.target.closest('button')) { state.sel = i; setView('page'); } };
    c.onkeydown = e => { if (e.key === 'Enter') { state.sel = i; setView('page'); } else if (e.key === ' ') { e.preventDefault(); pickPage(i, { ctrlKey: true }); refresh(); } };
    c.ondragstart = e => {
      if (!state.picked.has(p.id)) { state.picked = new Set([p.id]); state.anchor = p.id; }
      e.dataTransfer.setData('text/x-page', String(i)); e.dataTransfer.effectAllowed = 'move';
    };
    c.ondragover = e => { if (e.dataTransfer.types.includes('text/x-page')) { e.preventDefault(); c.classList.add('over'); } };
    c.ondragleave = () => c.classList.remove('over');
    c.ondrop = e => {
      if (!e.dataTransfer.types.includes('text/x-page')) return;
      e.preventDefault(); e.stopPropagation();
      // Alle ausgewählten Seiten gemeinsam vor die Zielseite verschieben
      const moving = state.pages.filter(x => state.picked.has(x.id));
      if (moving.includes(p)) return refresh();
      const rest = state.pages.filter(x => !state.picked.has(x.id));
      const at = rest.indexOf(p) + (i > state.pages.indexOf(moving[0]) ? 1 : 0);
      rest.splice(at, 0, ...moving);
      const selId = cur()?.id; state.pages = rest; state.sel = state.pages.findIndex(x => x.id === selId);
      state.dirty = true; refresh(); analyze();
    };
    cards.append(c);
  });
  g.querySelector('.gridbar').onclick = async e => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'all') { state.picked = k === n ? new Set() : new Set(state.pages.map(p => p.id)); refresh(); }
    else if (a === 'rotl' || a === 'rotr') { for (const p of targets()) p.thumbL = null; await rotateTargets(a === 'rotl' ? -90 : 90); }
    else if (a === 'dup') duplicatePages(targets());
    else if (a === 'blank') insertBlank();
    else if (a === 'del') deletePages(targets().map(p => p.id));
    else if (a === 'add') $('#fileIn').click();
    else if (a === 'extract') openExport({ pages: k > 0 ? 'picked' : 'all' });
    else if (a === 'each') exportEach();
  };
}

/* ---------- Formulare ---------- */
async function detectForm(docIdx) {
  const d = state.docs[docIdx];
  try {
    const lib = await PDFDocument.load(d.bytes, { ignoreEncryption: true, updateMetadata: false });
    const L = PDFLib, fields = [];
    for (const f of lib.getForm().getFields()) {
      const name = f.getName(), ro = f.isReadOnly();
      if (/^pdfmy_[a-z0-9]+_\d+$/.test(name)) continue;   // Felder einer Unterschriftsanfrage (js/pro.js) – nicht als eigenes Formular zeigen
      if (f instanceof L.PDFTextField) fields.push({ name, kind: 'text', value: f.getText() || '', multi: f.isMultiline(), max: f.getMaxLength(), ro });
      else if (f instanceof L.PDFCheckBox) fields.push({ name, kind: 'check', value: f.isChecked(), ro });
      else if (f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) fields.push({ name, kind: 'select', options: f.getOptions(), value: f.getSelected()[0] || '', ro });
      else if (f instanceof L.PDFRadioGroup) fields.push({ name, kind: 'select', options: f.getOptions(), value: f.getSelected() || '', ro });
    }
    d.fields = fields; d.values = {};
  } catch (e) { console.warn('Formular:', e); d.fields = []; }
  renderForm();
  if (d.fields.length) {
    status(`Formular mit ${d.fields.length} Feldern erkannt – rechts ausfüllen, dann speichern.`);
    if (state.intent === 'form') $('#formSec').scrollIntoView({ behavior: 'smooth' });
  } else if (state.intent !== 'form') formHint(docIdx);   // Kachel „Formular“: Suche nach Schreiblinien startet in applyIntent, wenn die Seiten da sind
}
/* Nicht ausfüllbares Formular (nur gedruckte Linien): typische Feld-Beschriftungen auf den ersten Seiten → Angebot „Felder erkennen“ */
const FORM_LABEL = /^(firma|firmenname|name|nachname|vorname|straße|strasse|straße,\s*hausnummer|hausnummer|postleitzahl|plz|ort|wohnort|e-?mail(\s*adresse)?|telefon|telefax|fax|mobil|geburtsdatum|geburtsort|kundennummer|vertragsnummer|iban|bic|kontoinhaber|steuernummer|anschrift)\b/i;
async function formHint(docIdx, tries = 0) {
  const pages = state.pages.filter(p => p.kind === 'pdf' && p.docIdx === docIdx).slice(0, 3), found = new Set();
  if (!pages.length) { if (tries < 10) setTimeout(() => formHint(docIdx, tries + 1), 400); return; }   // Seiten werden gerade angelegt
  for (const p of pages) for (const w of (await pageWords(p).catch(() => null)) || []) {
    const t = (w.t || '').trim(); if (t.length <= 40 && FORM_LABEL.test(t)) found.add(t.toLowerCase().replace(/[^a-zäöüß]/g, '').slice(0, 8));
  }
  if (found.size < 3 || state.docs[docIdx]?.fields?.length) return;
  $('#formHintText').textContent = 'Dieses Formular ist nicht ausfüllbar. PDFMy kann die Felder (z. B. Name, Straße, Telefon) erkennen und daraus ein ausfüllbares Formular machen.';
  $('#formHint').hidden = false;
}
$('#formHintGo').onclick = () => { $('#formHint').hidden = true; window.autoForm?.(false); };
$('#formHintNo').onclick = () => { $('#formHint').hidden = true; };
const formTimers = {};
function renderForm() {
  const box = $('#formFields'); box.innerHTML = '';
  const docs = state.docs.filter(d => d.fields?.length && state.pages.some(p => p.kind === 'pdf' && state.docs[p.docIdx] === d));
  $('#formSec').hidden = !docs.length;
  for (const d of docs) {
    if (docs.length > 1) { const h = document.createElement('div'); h.className = 'formdoc'; h.textContent = d.name; box.append(h); }
    for (const f of d.fields) {
      const wrap = document.createElement('div'); wrap.className = 'field';
      const id = 'f-' + Math.random().toString(36).slice(2, 9), v = d.values[f.name] ?? f.value;
      const label = `<label for="${id}">${f.name.replace(/[<>&]/g, '')}</label>`;
      if (f.kind === 'check') wrap.innerHTML = `<label class="cb"><input id="${id}" type="checkbox" ${v ? 'checked' : ''} ${f.ro ? 'disabled' : ''}> ${f.name.replace(/[<>&]/g, '')}</label>`;
      else if (f.kind === 'select') {
        wrap.innerHTML = label + `<select id="${id}" ${f.ro ? 'disabled' : ''}><option value=""></option></select>`;
        for (const o of f.options) { const op = new Option(o, o, false, o === v); wrap.querySelector('select').append(op); }
      } else {
        wrap.innerHTML = label + (f.multi ? `<textarea id="${id}" rows="3"></textarea>` : `<input id="${id}">`);
        const el = wrap.querySelector('input,textarea'); el.value = v; el.disabled = f.ro; if (f.max) el.maxLength = f.max;
      }
      const el = wrap.querySelector('input,select,textarea');
      el.addEventListener(f.kind === 'text' ? 'input' : 'change', () => {
        d.values[f.name] = f.kind === 'check' ? el.checked : el.value;
        state.dirty = true;
        clearTimeout(formTimers[d.name]); formTimers[d.name] = setTimeout(() => applyForm(d), 600);
      });
      box.append(wrap);
    }
  }
}
async function applyForm(d) {
  try {
    const lib = await PDFDocument.load(d.base || d.bytes, { ignoreEncryption: true, updateMetadata: false });   // base: ohne übernommene Markierungen
    lib.registerFontkit(await loadFontkit());
    const font = await lib.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true });
    const form = lib.getForm(), L = PDFLib;
    for (const [name, v] of Object.entries(d.values)) {
      const f = form.getField(name);
      if (f instanceof L.PDFTextField) f.setText(String(v));
      else if (f instanceof L.PDFCheckBox) v ? f.check() : f.uncheck();
      else if ((f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) && v) f.select(v);
      else if (f instanceof L.PDFRadioGroup && v) f.select(v);
    }
    form.updateFieldAppearances(font);
    form.flatten();
    d.filled = await lib.save(); d.lib = null;
    d.js = await openPdf(d.filled.slice());
    for (const p of state.pages) if (p.kind === 'pdf' && state.docs[p.docIdx] === d) { await renderPdfPreview(p); p.thumbL = null; }
    renderThumbs(); renderStage(); if (state.view === 'grid') renderGrid();
  } catch (e) { console.error(e); status('Formular konnte nicht übernommen werden: ' + e.message); }
}

document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea,select,[contenteditable="true"]') || !state.pages.length || $('#expDlg').open) return;
  if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) setView(state.view === 'grid' ? 'page' : 'grid');
  else if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey && !$('#btnToc').hidden && !document.querySelector('dialog[open]')) window.openToc?.();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && state.view === 'grid') { e.preventDefault(); state.picked = new Set(state.pages.map(p => p.id)); refresh(); }
  else if (e.key === 'Delete' && state.view === 'grid' && state.picked.size) deletePages([...state.picked]);
});
$('#viewer').addEventListener('wheel', e => {
  if (!e.ctrlKey || state.view !== 'page' || !cur()) return;
  e.preventDefault(); state.zoom = clamp(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.4, 3); renderStage();
}, { passive: false });

/* ---------- Mehr-Menü: Drucken, Teilen, Einstellungen, Hilfe ---------- */
const docPages = () => state.pages.filter(p => !(p.blank && !p.keepBlank));
async function quickPdf(pages = docPages()) {
  status('Bereite Dokument vor …');
  return buildPdf(pages, state.meta, { noOcr: true, onPage: () => {}, bookmarks: false, files: [] });
}
// Drucken: erst fragen, welche Seiten (alle, diese, bestimmte), dann den Druckdialog des Browsers öffnen
function printDoc() {
  if (!state.pages.length) return;
  closeMenu?.();
  const n = state.pages.length;
  $('#prAllN').textContent = `(${n})`; $('#prCurN').textContent = `(Seite ${state.sel + 1})`;
  $('#prErr').hidden = true; $('#prRange').value = '';
  document.querySelector('input[name=prWhat][value=all]').checked = true;
  $('#printDlg').showModal();
}
// 2 oder 4 Seiten pro Blatt bzw. Broschüre (js/layout.js)
const sheetLayout = (bytes, sheet) => sheet === 'booklet' ? Layout.booklet(bytes) : Layout.nup(bytes, +sheet);
async function printPages(pages, sheet = '1') {
  try {
    let bytes = await quickPdf(pages);
    if (sheet !== '1') bytes = await sheetLayout(bytes, sheet);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    let f = $('#printFrame');
    if (!f) { f = document.createElement('iframe'); f.id = 'printFrame'; f.title = 'Druckvorschau'; f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0'; document.body.append(f); }
    f.onload = () => {
      setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); status('Druckdialog geöffnet.'); }
        catch { window.open(url, '_blank'); status('PDF in neuem Tab geöffnet – dort drucken.'); }
      }, 300);
    };
    f.src = url;
  } catch (e) { console.error(e); status('Drucken nicht möglich: ' + e.message); }
}
async function shareDoc() {
  if (!state.pages.length) return;
  try {
    status('Bereite PDF zum Teilen vor …');
    if (ocrRunning) await runOcrAll();   // Text mitgeben, damit das PDF beim Empfänger durchsuchbar ist
    const bytes = await buildPdf(docPages(), state.meta, { noOcr: true, onPage: () => {} });
    sharePdf(bytes, filename(), { ...state.meta });   // js/pro.js
  } catch (e) { console.error(e); status('Teilen nicht möglich: ' + e.message); }
}
const closeMenu = () => { $('#moreMenu').open = false; };
$('#moreMenu').addEventListener('click', e => { if (e.target.closest('.mi') && !e.target.closest('label')) closeMenu(); });
$('#camIn').addEventListener('change', closeMenu);
document.addEventListener('click', e => { if (!e.target.closest('#moreMenu')) closeMenu(); });
$('#btnPrint').onclick = $('#btnPrintTb').onclick = printDoc;
$('#prRange').addEventListener('focus', () => { document.querySelector('input[name=prWhat][value=range]').checked = true; });
$('#prCancel').onclick = () => $('#printDlg').close();
$('#printForm').addEventListener('submit', e => {
  e.preventDefault();
  const what = document.querySelector('input[name=prWhat]:checked').value, n = state.pages.length;
  let idx;
  if (what === 'cur') idx = [state.sel];
  else if (what === 'range') {
    idx = Tools.parseRange($('#prRange').value, n);
    if (!idx) { $('#prErr').textContent = `Bitte Seiten von 1 bis ${n} angeben, z. B. „1-3, 5“.`; $('#prErr').hidden = false; $('#prRange').focus(); return; }
  }
  $('#printDlg').close();
  printPages(idx ? idx.map(i => state.pages[i]) : docPages(), $('#prSheet').value);
});
$('#btnShare').onclick = shareDoc;
$('#btnHelp').onclick = () => $('#helpDlg').showModal();
$('#btnSettings').onclick = () => { const d = $('#settings'); d.open = true; document.body.classList.add('has-doc-tmp'); d.scrollIntoView({ behavior: 'smooth' }); };
$('#redo').onclick = () => redo();

/* ---------- Einstellungen ---------- */
$('#mode').value = S.mode;
$('#ownName').value = S.ownName;
$('#ownName').oninput = e => { S.ownName = e.target.value; saveSettings(); analyze(); };
$('#author').value = S.author || '';
$('#author').oninput = e => { S.author = e.target.value.trim(); saveSettings(); };
$('#quality').value = S.quality; $('#qv').textContent = Math.round(S.quality * 100) + ' %';
$('#quality').oninput = e => { S.quality = +e.target.value; saveSettings(); $('#qv').textContent = Math.round(S.quality * 100) + ' %'; };
// Sprachen: Oberfläche (lädt die Seite in der gewählten Sprache neu) und Texterkennung
{
  const opt = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${t}</option>`;
  const byName = l => [...l].sort((x, y) => x.name.localeCompare(y.name, 'de'));
  $('#uiLang').innerHTML = byName(I18N.LANGS).map(l => opt(l.code, l.name, l.code === I18N.lang)).join('');
  $('#uiLang').onchange = e => I18N.setLang(e.target.value);
  $('#uiLang').onclick = e => e.stopPropagation();
  const ocrL = [...I18N.LANGS.filter(l => !l.code.startsWith('en-')), { ocr: 'eng', name: 'English' }, ...I18N.OCR_EXTRA];
  $('#ocrLang').innerHTML = opt('auto', I18N.t('Automatisch (Deutsch + Erkennung)'), S.ocrLang === 'auto') + byName(ocrL).map(l => opt(l.ocr, l.name, S.ocrLang === l.ocr)).join('');
  $('#ocrLang').onchange = e => { S.ocrLang = e.target.value; saveSettings(); resetWorker('Dokumentsprache geändert'); };
}
for (const k of ['autoOcr', 'autoDeskew', 'autoOrient', 'autoCrop', 'pdfa', 'byYear', 'byType', 'saveIcs', 'compact', 'scanPdf', 'autopilot', 'inStamp']) {
  const el = $('#s-' + k); el.checked = !!S[k];
  el.onchange = () => { S[k] = el.checked; saveSettings(); renderSide(); };
}
$('#keepSign').checked = LS.get('keepSign', true);
$('#keepSign').onchange = e => {
  LS.set('keepSign', e.target.checked);
  if (e.target.checked) { for (const k of Object.keys(SIG_KINDS)) if (state.sigs[k]) sigStore(k, state.sigs[k]); }
  else if (confirm('Gespeicherte Unterschrift, Kürzel und Stempel von diesem Gerät löschen?')) { for (const k of Object.keys(SIG_KINDS)) sigStore(k, null); }
  else e.target.checked = true;
};
$('#signEdit').onclick = () => openSign(null, $('#signKind').value);
$('#signAllPages').onclick = initialsAllPages;
// Auswahl beim Werkzeug „Unterschrift“ (wie bei Adobe): gespeicherte Unterschrift, Kürzel, Stempel als Bild – Klick wählt, dann auf die Seite klicken
// „Ort, Datum“ unter die Unterschrift (passt es nicht mehr auf die Seite, darüber) – normaler Text, verschieb- und änderbar
// „Dazusetzen“: '' = nichts, 'date' = nur Datum, 'placedate' = Ort und Datum (frühere Einstellung true = Ort und Datum)
const sigDateMode = () => { const v = LS.get('signDate', ''); return v === true ? 'placedate' : v || ''; };
function addPlaceDate(p, a) {
  const place = sigDateMode() === 'placedate' ? (LS.get('signPlace', '') || '').trim() : '', today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const text = place ? `${place}, ${today}` : today, fs = 0.016;
  let y = a.y + a.h + 0.006; if (y > 0.965) y = Math.max(0, a.y - fs * (p.w || 1) / (p.h || 1.414) * 1.6);
  p.annots.push({ id: ++uid, type: 'text', x: a.x, y, w: 0, h: 0, text, fs, color: '#1B1D23' });
  return text;
}
function openSignMenu() {
  const m = $('#signMenu'), list = $('#smList'), btn = document.querySelector('[data-tool="sign"]');
  list.replaceChildren(...Object.entries(SIG_KINDS).map(([k, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.kind = k;
    if (state.sigs[k]) {
      b.className = 'smitem'; const im = document.createElement('img'); im.src = state.sigs[k]; im.alt = '';
      const t = document.createElement('span'); t.innerHTML = `<b></b><small>Auswählen, dann auf die Stelle im Dokument klicken bzw. tippen</small>`; t.querySelector('b').textContent = label;
      b.append(im, t); b.setAttribute('aria-label', `${label} auswählen und auf die Seite setzen`);
    } else { b.className = 'smitem add'; b.innerHTML = `<span><b></b><small>noch nicht angelegt – zeichnen, tippen oder Bild hochladen</small></span>`; b.querySelector('b').textContent = `＋ ${label} anlegen`; }
    return b;
  }));
  window.spotsSummary?.();
  $('#smDate').value = sigDateMode(); $('#smPlace').value = LS.get('signPlace', ''); $('#smPlace').hidden = sigDateMode() !== 'placedate';
  m.hidden = false;
  // unter dem Knopf ausrichten – erst nachdem die Werkzeugleiste zu den Optionen gescrollt hat
  const place = () => { const r = btn?.getBoundingClientRect(); if (r && innerWidth > 700) { m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px'; m.style.top = (r.bottom + 6) + 'px'; } };
  place(); requestAnimationFrame(() => requestAnimationFrame(place)); setTimeout(place, 350);
  (list.querySelector('.smitem') || $('#smNew')).focus();
}
const closeSignMenu = () => { $('#signMenu').hidden = true; };
$('#smList').addEventListener('click', e => {
  const b = e.target.closest('[data-kind]'); if (!b) return;
  const k = b.dataset.kind; closeSignMenu();
  if (state.sigs[k]) armSign(k); else openSign(null, k);
});
$('#smNew').onclick = () => { closeSignMenu(); openSign(null, $('#signKind').value); };
$('#smAll').onclick = () => { closeSignMenu(); initialsAllPages(); };
$('#smClose').onclick = () => closeSignMenu();
$('#smDate').onchange = e => { LS.set('signDate', e.target.value); $('#smPlace').hidden = e.target.value !== 'placedate'; if (e.target.value === 'placedate' && !$('#smPlace').value) $('#smPlace').focus(); };
$('#smPlace').oninput = e => LS.set('signPlace', e.target.value.trim().slice(0, 60));
$('#signMenu').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSignMenu(); document.querySelector('[data-tool="sign"]')?.focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); const items = [...$('#signMenu').querySelectorAll('#smList button, .smfoot button')], i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  }
});
document.addEventListener('pointerdown', e => { if (!$('#signMenu').hidden && !e.target.closest('#signMenu,[data-tool="sign"]')) closeSignMenu(); });
$('#signNew').onclick = () => openSign(null, 'sign');

// Offline-Speicher + Update-Hinweis: Ein offener Tab läuft mit dem Stand weiter, mit dem er geladen wurde.
// Kommt eine neue Version, bieten wir das Neuladen an (nie automatisch – ungespeicherte Arbeit bleibt erhalten).
/* ---------- Updates: automatisch erkennen, ohne offenes Dokument sofort anwenden; „Updates suchen“ im Menü ---------- */
// Versionsstand = Name des Offline-Speichers (Build-Zeitstempel, z. B. pdfmy-202610150012 → „Stand 15.10.2026, 02:12 Uhr“)
async function versionLabel(report) {   // report: für Fehlerberichte immer deutsch, sonst im Format der Oberfläche
  try {
    const k = (await caches.keys()).find(x => /^(pdfmy|mentor|app)-/.test(x)) || '';
    const m = k.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!m) return k ? `Version ${k.replace(/^app-/, '')}` : '';
    const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]));
    if (report) return `Stand ${d.toLocaleDateString('de-DE')}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    return `Stand ${I18N.fmtDate(d)}, ${I18N.fmtTime(d)} Uhr`;
  } catch { return ''; }
}
function toast(msg, ms = 6000) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._h); t._h = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 250); }, ms);
}
const upd = { reg: null, ready: false, manual: false };
const busyNow = () => (state.dirty && state.pages.length > 0) || !!document.querySelector('dialog[open]') || ocrRunning;
function newVersionActive() {
  upd.ready = true;
  // Nichts in Arbeit? Dann gleich auf die neue Version wechseln – sonst nur anbieten (ungespeicherte Arbeit bleibt erhalten)
  if (!state.pages.length && !busyNow()) { try { sessionStorage.setItem('mpdf.updated', '1'); } catch {} location.reload(); return; }
  $('#updBtn').hidden = false;
  status('Eine neue Version von ' + APP.name + ' ist bereit – unten rechts „jetzt neu laden“ (nach dem Speichern).');
  if (upd.manual) toast('Update geladen – unten rechts „Neue Version: jetzt neu laden“.');
}
async function checkUpdates(manual) {
  upd.manual = manual;
  if (!upd.reg) { if (manual) toast('Updates können nur online geprüft werden.'); return; }
  if (upd.ready) { newVersionActive(); return; }
  if (manual) status('Suche nach Updates …');
  try { await upd.reg.update(); } catch { if (manual) toast('Keine Verbindung zum Server – bitte später erneut versuchen.'); return; }
  if (!manual) return;
  const scanOld = scanOutdated() ? ` · pdfmy Scan ${scanLatest()} ist verfügbar (installiert: ${state.scanVersion}) – unter „Scannen“ aktualisieren` : '';
  if (upd.reg.installing || upd.reg.waiting) { status('Update gefunden – wird geladen …' + scanOld); toast('Update gefunden – wird geladen …'); }
  else {
    const v = await versionLabel(), msg = `Sie haben die neueste Version${v ? ` (${v})` : ''}.`;
    status(msg + scanOld); toast(msg + (scanOld ? ' pdfmy Scan kann aktualisiert werden.' : ''));
  }
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    upd.reg = reg;
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'activated' && hadController) newVersionActive(); });
    });
    const check = () => checkUpdates(false);
    setInterval(check, 10 * 60 * 1000);                                                                 // alle 10 Minuten
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });   // beim Zurückkehren zum Tab
    addEventListener('online', check);                                                                   // wenn die Verbindung wieder da ist
    setTimeout(check, 30 * 1000);                                                                        // und kurz nach dem Start
  }).catch(e => console.warn('Service Worker:', e));
  $('#updBtn').onclick = () => {
    if (state.dirty && state.pages.length && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem neu laden?')) return;
    state.dirty = false; location.reload();
  };
  // Nach einem automatischen Wechsel kurz Bescheid geben
  try {
    if (sessionStorage.getItem('mpdf.updated')) {
      sessionStorage.removeItem('mpdf.updated');
      versionLabel().then(v => { status(`${APP.name} wurde aktualisiert${v ? ` (${v})` : ''}.`); toast(`${APP.name} wurde auf die neue Version aktualisiert${v ? ` (${v})` : ''}.`); });
    }
  } catch {}
}
$('#btnUpdate').onclick = () => checkUpdates(true);
I18N.ready().then(versionLabel).then(v => { if (v) { $('#verInfo').textContent = `${APP.name} · ${I18N.t(v)}`; $('#btnUpdate').title = `Nach einer neuen Version suchen – installiert: ${v}`; } });
refresh();
