// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* OCR-Messung: erkennt die Bilder in tests/ocr-korpus mit demselben Tesseract-Kern wie die App (vendor/tesseract/core,
   in Node ohne Browser) nach derselben Bildaufbereitung und mit denselben Tesseract-Einstellungen wie die App („Dokument“, Imaging.ocrCopy, Imaging.OCR_PARAMS) und vergleicht mit der Grundwahrheit (*.txt): Zeichenfehlerrate (CER) und Wortfehlerrate (WER).
   Aufruf: node tools/ocr-mess.js [Ordner mit Sprachdaten, Standard vendor/tesseract/lang]; OCR_ROH=1 ohne Aufbereitung, OCR_DIFF=1 mit Text,
   OCR_VARS='{"thresholding_method":2}' mit Tesseract-Einstellungen */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..'), KORPUS = path.join(ROOT, 'tests', 'ocr-korpus');

// Levenshtein über Zeichen oder Wörter (zwei Zeilen Speicher)
function dist(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// Vergleich unabhängig von Zeilenumbrüchen und Leerraum; typografische Zeichen wie die App vereinheitlicht
const norm = s => s.normalize('NFC').replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
function rates(truth, got) {
  const t = norm(truth), g = norm(got), tw = t.split(' '), gw = g.split(' ');
  return { cer: dist([...t], [...g]) / [...t].length, wer: dist(tw, gw) / tw.length, chars: [...t].length, words: tw.length };
}

/* PNG lesen (8 Bit, Graustufen/Palette/RGB/RGBA, ohne Zeilensprung) → RGBA – reicht für den Korpus, kein Fremdpaket */
function readPng(buf) {
  let p = 8, W, H, type, plte, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len); p += 12 + len;
    if (kind === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); type = d[9]; if (d[8] !== 8 || d[12]) throw new Error('PNG-Format nicht unterstützt'); }
    else if (kind === 'PLTE') plte = d; else if (kind === 'IDAT') idat.push(d); else if (kind === 'IEND') break;
  }
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], raw = zlib.inflateSync(Buffer.concat(idat)), row = W * bpp, px = Buffer.alloc(row * H);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (row + 1)], src = y * (row + 1) + 1, o = y * row;
    for (let x = 0; x < row; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - row + x] : 0, c = x >= bpp && y ? px[o - row + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v;
    }
  }
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    let r, g, b, al = 255;
    if (type === 3) { const k = px[i] * 3; r = plte[k]; g = plte[k + 1]; b = plte[k + 2]; }
    else if (type === 0 || type === 4) { r = g = b = px[i * bpp]; if (type === 4) al = px[i * 2 + 1]; }
    else { r = px[i * bpp]; g = px[i * bpp + 1]; b = px[i * bpp + 2]; if (type === 6) al = px[i * 4 + 3]; }
    rgba.set([r, g, b, al], i * 4);
  }
  return { width: W, height: H, data: rgba };
}
// 24-Bit-BMP für Tesseract (Leptonica liest es ohne weitere Bibliothek)
function bmp({ width: W, height: H, data }) {
  const row = (W * 3 + 3) & ~3, out = Buffer.alloc(54 + row * H);
  out.write('BM'); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10); out.writeUInt32LE(40, 14); out.writeInt32LE(W, 18); out.writeInt32LE(H, 22);
  out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28); out.writeUInt32LE(row * H, 34); out.writeInt32LE(11811, 38); out.writeInt32LE(11811, 42);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + x) * 4, d = 54 + (H - 1 - y) * row + x * 3; out[d] = data[s + 2]; out[d + 1] = data[s + 1]; out[d + 2] = data[s]; }
  return out;
}
/* Die Bildaufbereitung der App (js/imaging.js, „Dokument“) in Node: Leinwand-Ersatz, der nur Pixel hält */
let imaging = null;
function appPrep(img) {
  if (!imaging) {
    class Canvas {
      constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4).fill(255); }
      getContext() {
        const c = this;
        return {
          drawImage(src) { if (src.width !== c.width || src.height !== c.height) throw new Error('Skalieren nicht nachgebildet'); c.data.set(src.data); },
          getImageData() { return { width: c.width, height: c.height, data: new Uint8ClampedArray(c.data) }; },
          putImageData(d) { c.data.set(d.data); },
        };
      }
    }
    globalThis.self = globalThis; globalThis.OffscreenCanvas = Canvas;
    globalThis.DocDetect = require(path.join(ROOT, 'js', 'docdetect.js'));
    require(path.join(ROOT, 'js', 'imaging.js'));
    imaging = globalThis.Imaging;
  }
  return imaging.ocrCopy(imaging.enhance(img, 'document'));
}

let corePromise = null;
function core() {
  if (!corePromise) {
    const factory = require(path.join(ROOT, 'vendor', 'tesseract', 'core', 'tesseract-core-simd-lstm.wasm.js'));
    corePromise = factory({ print: () => {}, printErr: () => {} });
  }
  return corePromise;
}
// Sprachdaten (.traineddata oder .traineddata.gz) in das virtuelle Dateisystem, Rechenkern starten
async function engine(langDir, langs, vars = {}, dir = '/td-' + path.basename(langDir)) {
  const M = await core();
  try { M.FS.mkdir(dir); } catch { /* schon da */ }
  for (const l of langs.split('+')) {
    if (fs.existsSync(path.join(langDir, l + '.traineddata.gz'))) M.FS.writeFile(`${dir}/${l}.traineddata`, zlib.gunzipSync(fs.readFileSync(path.join(langDir, l + '.traineddata.gz'))));
    else M.FS.writeFile(`${dir}/${l}.traineddata`, fs.readFileSync(path.join(langDir, l + '.traineddata')));
  }
  const api = new M.TessBaseAPI();
  if (api.Init(dir, langs) !== 0) throw new Error('Tesseract-Start fehlgeschlagen: ' + langs);
  for (const [k, v] of Object.entries(vars)) api.SetVariable(k, String(v));
  return {
    read(file, prep = true) {
      const img = readPng(fs.readFileSync(file));
      M.FS.writeFile('/input', bmp(prep ? appPrep(img) : img));
      api.SetImageFile();
      const t0 = Date.now(), text = api.GetUTF8Text();
      return { text, conf: api.MeanTextConf(), ms: Date.now() - t0 };
    },
    end() { api.End(); M.destroy?.(api); },
  };
}
// Ganzer Korpus: deutsche Texte mit deu, englische (…-en) mit eng
// dir: anderer Bildordner (z. B. tests/ocr-korpus/fax-gestoert) – Grundwahrheit bleibt die .txt im Korpus (Endung -fein/-normal entfällt)
async function measure(langDir = path.join(ROOT, 'vendor', 'tesseract', 'lang'), only, prep = true, vars, dir = KORPUS) {
  if (!vars) { appPrep({ width: 1, height: 1, data: new Uint8ClampedArray(4) }); vars = imaging.OCR_PARAMS; }   // wie die App
  const files = fs.readdirSync(dir).filter(f => /\.png$/.test(f) && (!only || only.test(f))).sort();
  const eng = {}, out = [];
  for (const f of files) {
    const lang = /-en[.-]/.test(f) ? 'eng' : 'deu';
    eng[lang] ||= await engine(langDir, lang, vars);
    const r = eng[lang].read(path.join(dir, f), prep);
    out.push({ file: f, lang, ms: r.ms, conf: r.conf, text: r.text, ...rates(fs.readFileSync(path.join(KORPUS, f.replace(/(-fein|-normal)?\.\w+$/, '.txt')), 'utf8'), r.text) });
  }
  Object.values(eng).forEach(e => e.end());
  const sum = k => out.reduce((s, r) => s + r[k], 0);
  return { pages: out, cer: out.reduce((s, r) => s + r.cer * r.chars, 0) / sum('chars'), wer: out.reduce((s, r) => s + r.wer * r.words, 0) / sum('words'), ms: sum('ms') };
}
module.exports = { measure, rates, dist, norm, engine, readPng };

if (require.main === module) (async () => {
  const res = await measure(process.argv[2] ? path.resolve(process.argv[2]) : undefined, undefined, !process.env.OCR_ROH, process.env.OCR_VARS ? JSON.parse(process.env.OCR_VARS) : undefined);
  for (const p of res.pages) console.log(`${p.file.padEnd(22)} ${p.lang}  CER ${(p.cer * 100).toFixed(2).padStart(6)} %  WER ${(p.wer * 100).toFixed(2).padStart(6)} %  ${String(p.ms).padStart(6)} ms`);
  console.log(`${'gesamt'.padEnd(26)}  CER ${(res.cer * 100).toFixed(2).padStart(6)} %  WER ${(res.wer * 100).toFixed(2).padStart(6)} %  ${String(res.ms).padStart(6)} ms`);
  if (process.env.OCR_DIFF) for (const p of res.pages) console.log('\n== ' + p.file + '\n' + p.text);
})().catch(e => { console.error(e); process.exit(1); });
