// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sammelt die deutschen Texte der Oberfläche für die Übersetzung (Schlüssel = deutscher Text, Platzhalter {0}, {1} …).
//   1. Statische Texte (index.html): im Browser `I18N.collect()` ausführen und als i18n/_html.json speichern
//      (gleiches Verfahren wie die Übersetzung zur Laufzeit – siehe js/i18n.js).
//   2. Meldungen aus dem Programmcode: Zeichenketten und Vorlagen (`…${x}…`) aus js/*.js – dieses Skript.
//   3. Texte der Web-Version aus i18n/_web.json (Tab-Titel, Meta-Beschreibung, Fußzeile von pdfmy.de).
// Ergebnis: i18n/_keys.json (alle Schlüssel) und Liste der Schlüssel, die in einem Wörterbuch noch fehlen.
// Aufruf: node tools/i18n-extract.js [--missing]
// Webseiten (Hilfe, Scanner – tools/site, tools/build-web.js): node tools/i18n-extract.js --site
//   1. Web-Version bauen (node tools/build-web.js) und starten, auf hilfe.html und scanner.html im Browser je
//      `copy(JSON.stringify(I18N.collect()))` ausführen und beide Listen zusammen als i18n/site/_html.json speichern.
//   2. Dieses Skript ergänzt die Meldungen aus tools/site/hilfe.js und die Suchbegriffe der „Oft gesucht“-Knöpfe (data-q)
//      und ersetzt wechselnde Werte (Versionsnummern, Prüfsummen, Dateigrößen) durch Platzhalter → i18n/site/_keys.json.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'i18n');
const FILES = ['app.js', 'bea.js', 'pro.js', 'camera.js', 'journal.js', 'a11ycheck.js', 'pdfsign.js', 'pdfverify.js', 'einvoice.js', 'einvoice-out.js', 'email.js', 'bank.js', 'docdetect.js', 'formdetect.js', 'imaging.js', 'tools.js', 'qr.js', 'letter.js', 'sigreq.js', 'pdfinc.js', 'layout.js', 'pdfcrypt.js', 'pdfacheck.js', 'office.js', 'textpdf.js', 'pptx.js', 'formcalc.js', 'formprofile.js', 'reflow.js', 'preflight.js', 'hotfolder.js'];

// Kleiner JS-Scanner: liefert alle Zeichenketten; Vorlagen als Text mit {n} für jeden ${…}-Ausdruck (Ausdrücke werden selbst gescannt)
function scan(src) {
  const out = []; let i = 0;
  const regexOk = prev => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|in|of|void|delete|throw|new|else|do)$/.test(prev);
  let prev = '';
  function str(q) { let s = ''; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') { s += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; } if (src[i] === '\n') break; s += src[i++]; } i++; return s; }
  function tpl() {
    let s = '', n = 0; i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; code(1); s += `{${n++}}`; continue; }
      s += src[i++];
    }
    i++; return s;
  }
  function code(stopDepth) {   // stopDepth: in ${…}, endet an der passenden }
    let depth = stopDepth ? 1 : 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
      // Argumente technischer Aufrufe (PDF-Namen, Medienabfragen, Selektoren) sind keine Oberflächentexte
      if (c === "'" || c === '"') { const t = str(c); if (!/(Name\.of|matchMedia|closest|matches|Selector|SelectorAll)\($/.test(prev)) out.push(t); prev = 'x'; continue; }
      if (c === '`') { out.push(tpl()); prev = 'x'; continue; }
      if (c === '/' && regexOk(prev.trimEnd())) {   // Regex überspringen
        i++; let cls = false; while (i < src.length) { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; else if (d === '\n') break; i++; }
        i++; while (/[a-z]/.test(src[i] || '')) i++; prev = 'x'; continue;
      }
      if (c === '{') depth++;
      if (c === '}') { depth--; if (stopDepth && depth === 0) { i++; return; } }
      if (!/\s/.test(c)) prev = (prev + c).slice(-12);
      else if (prev && !/\s$/.test(prev)) prev += ' ';
      i++;
    }
  }
  code(0);
  return out;
}

const norm = s => String(s).replace(/\s+/g, ' ').trim();
const plain = s => s.replace(/<[^>]+>/g, ' ').replace(/\{\d+\}/g, ' ').replace(/&[a-z]+;/g, ' ');
function german(s) {
  const p = norm(plain(s)); if (!p || p.length < 2) return false;
  if (!/[A-Za-zÄÖÜäöüß]{2}/.test(p)) return false;
  if (/^(https?:|mailto:|data:|blob:|#|\.|\/)/.test(p) || /=>|function\s*\(|var\(--|;\s*$|^\w+\(|\bpx\b.*\bpx\b|rgba?\(/.test(s)) return false;
  if (/^[\w.$-]+$/.test(p) && !/^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(p)) return false;   // Bezeichner, CSS-Klassen, Schlüssel
  if (/^[A-Z0-9_]+$/.test(p) && p.length < 6) return false;
  if (/^[\w-]+(\s+[\w-]+)*$/.test(p) && !/[A-ZÄÖÜäöüß]/.test(p) && !/\b(und|oder|der|die|das|mit|für|von|bei|nicht|ist|zu|im|auf)\b/.test(p)) return false;   // CSS-Klassenlisten, Ereignisnamen
  if (/^[a-z-]+:|^[a-z]+\/[a-z0-9.+-]+$/i.test(p) && !/\s/.test(p)) return false;   // MIME-Typen, Präfixe
  if (/^\[|\[[\w-]+[\^$*]?=|:checked|:not\(|\?=|^[\w-]+\[|^[\w.#-]+(,[\w.#-]+)+$/.test(s)) return false;   // Selektoren, MIME-Kodierung
  if (!/\s/.test(p) && (/^[A-Z][a-z]+[A-Z]/.test(p) || /[_.\\]/.test(p))) return false;   // XML-/PDF-Namen (CreditNoteLine), Dateinamen
  if (/^(Enter|Escape|Esc|Tab|Home|End|PageUp|PageDown|Arrow\w+|Delete|Backspace|Shift|Control|Alt|Meta|Space|Sig \w+)$/.test(p)) return false;   // Tasten
  if (/^[a-zäöüßàâçéèêëîïôûùñąćęłńóśźżğışăîâșțđčšž ]+$/.test(p) && p.split(' ').length > 10) return false;   // Wortlisten (Spracherkennung)
  if (/^[A-Za-z]+(?: [A-Za-z]+)?$/.test(p) && !/[a-zäöü]{2}/.test(p.slice(1))) return false;
  return true;
}
function keysOf(lit) {
  const k = new Set(), whole = norm(lit);
  if (!german(whole)) return k;
  if (whole.length <= 1500) k.add(whole);
  if (/<[a-z][^>]*>/i.test(whole)) {   // HTML-Vorlage: Element-Inhalte einzeln (falls das Ganze nicht als Einheit übersetzt wird)
    for (const part of whole.split(/<\/?(?:div|p|li|ul|ol|h\d|section|label|button|td|th|tr|table|summary|details|option|select|dialog|header|footer|nav|figure|figcaption)\b[^>]*>/i)) {
      const t = norm(part); if (t && t !== whole && german(t)) k.add(t);
      for (const frag of t.split(/<[^>]+>/)) { const f = norm(frag); if (f && f !== t && german(f) && !/^\{\d+\}$/.test(f)) k.add(f); }
    }
  }
  return k;
}

// Wechselnde Werte der Webseiten (Versionen, SHA-256, „ca. 37 KB“) → {n}, damit ein neuer Build das Wörterbuch nicht entwertet
function volatile(k) {
  if (/\{\d+\}/.test(k)) return k;
  let n = 0; const ph = () => `{${n++}}`;
  // Prüfsummen und Versionen (nicht IP-Adressen wie 127.0.0.1 oder Datumsangaben wie 18.10.2026)
  return k.replace(/\b[0-9a-f]{64}\b|(?<![\d.])\d{1,2}\.\d{1,2}\.\d{1,3}(?!\.?\d)/g, ph).replace(/\bca\. \d+ KB\b/g, () => `ca. ${ph()} KB`);
}
function extractSite() {
  const SDIR = path.join(DIR, 'site'), keys = new Set();
  const html = path.join(SDIR, '_html.json');
  if (!fs.existsSync(html)) { console.error('i18n/site/_html.json fehlt (Texte im Browser mit I18N.collect() sammeln, siehe oben).'); process.exit(1); }
  for (const k of JSON.parse(fs.readFileSync(html, 'utf8'))) keys.add(volatile(norm(k)));
  const help = fs.readFileSync(path.join(ROOT, 'tools', 'site', 'hilfe.html'), 'utf8');
  for (const m of help.matchAll(/data-q="([^"]+)"/g)) keys.add(norm(m[1]));
  for (const lit of scan(fs.readFileSync(path.join(ROOT, 'tools', 'site', 'hilfe.js'), 'utf8'))) for (const k of keysOf(lit)) if (/^[A-ZÄÖÜ{\d]/.test(k) && !/^Frage zu PDFMy/.test(k)) keys.add(k);   // Meldungen, nicht Suchwörter (SYN) oder Selektoren
  const list = [...keys].sort((a, b) => a.localeCompare(b, 'de'));
  fs.writeFileSync(path.join(SDIR, '_keys.json'), JSON.stringify(list, null, 0).replace(/","/g, '",\n"') + '\n');
  console.log(`Webseiten: ${list.length} Schlüssel, ${list.reduce((n, k) => n + k.length, 0)} Zeichen → i18n/site/_keys.json`);
}

if (require.main !== module) { module.exports = { scan, german, keysOf, volatile }; return; }   // als Bibliothek (Tests): nichts schreiben
const keys = new Set();
const htmlFile = path.join(DIR, '_html.json');
if (fs.existsSync(htmlFile)) for (const k of JSON.parse(fs.readFileSync(htmlFile, 'utf8'))) keys.add(norm(k));
else console.warn('Hinweis: i18n/_html.json fehlt (statische Texte im Browser mit I18N.collect() sammeln).');
// Texte, die nur die Web-Version einsetzt (Tab-Titel, Beschreibung, Fußzeile – tools/build-web.js)
const webFile = path.join(DIR, '_web.json');
if (fs.existsSync(webFile)) (function add(o) { for (const [k, v] of Object.entries(o)) if (k[0] !== '_') { if (typeof v === 'string') keys.add(norm(v)); else if (v && typeof v === 'object') add(v); } })(JSON.parse(fs.readFileSync(webFile, 'utf8')));
let fromJs = 0;
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  for (const lit of scan(src)) for (const k of keysOf(lit)) if (!keys.has(k)) { keys.add(k); fromJs++; }
}
if (process.argv.includes('--site')) { extractSite(); module.exports = { scan, german, keysOf, volatile }; return; }
// Technische Werte (Schriftlisten, CSS, PDF-Namen) und Versionsangaben (ändern sich mit jeder Version) nicht übersetzen
const technical = k => /calc\(|sans-serif|\bserif\b|^(Highlight|Underline|StrikeOut|Multiply|Squiggly|Contents|Popup|Movie|Screen|Sound|Launch|Rendition|Contact|Country|Price|Telephone)$/.test(k) || /^\S*_\S*$/.test(k) || /\bv\d{2,}\b/.test(k);
const list = [...keys].filter(k => !technical(k)).sort((a, b) => a.localeCompare(b, 'de'));
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, '_keys.json'), JSON.stringify(list, null, 0).replace(/","/g, '",\n"') + '\n');
console.log(`${list.length} Schlüssel (${fromJs} aus dem Programmcode), ${list.reduce((n, k) => n + k.length, 0)} Zeichen → i18n/_keys.json`);
if (process.argv.includes('--missing')) {
  for (const f of fs.readdirSync(DIR).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f))) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), miss = list.filter(k => !(k in d));
    console.log(`${f}: ${Object.keys(d).length} übersetzt, ${miss.length} fehlen`);
  }
}
module.exports = { scan, german, keysOf, volatile };
