// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// „Problem melden“: Dateinamen, Benutzernamen und E-Mail-Adressen werden vor dem Senden unkenntlich gemacht (Art. 25 Abs. 2 DSGVO).
// Anlass: Fehlerbericht 20.11.2026 – „Importiere <Name>.pptx …“ stand nach einem Update-Neuladen im Klartext.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

// maskReport aus pro.js herauslösen und mit leerem Zustand ausführen (wie nach einem Neuladen: keine bekannten Namen)
function mask(text, { docs = [], seen = [] } = {}) {
  const a = src.indexOf('const maskReport = t => {'), b = src.indexOf('const repShown');
  assert.ok(a > 0 && b > a, 'maskReport nicht gefunden');
  const body = src.slice(a + 'const maskReport = '.length, b).trim().replace(/;$/, '');
  const fn = new Function('state', 'window', 'SUPPORT', 'return (' + body + ');')({ meta: {}, docs: docs.map(name => ({ name })) }, { seenFileNames: new Set(seen) }, 'support@pdfmy.de');
  return fn(text);
}

test('Fehlerbericht: Präsentation mit Leerzeichen, Komma, & und Klammern – auch ohne bekannte Namen', () => {
  const out = mask([
    '10:22:36 Importiere Miyon Pitch Telcos, UCaaS & MSPs (DE).pptx …',
    '10:22:36 Miyon Pitch Telcos, UCaaS & MSPs (DE).pptx wird in PDF umgewandelt …',
    '10:22:39 Miyon Pitch Telcos, UCaaS & MSPs (DE).pptx: 24 Folie(n) umgewandelt.',
  ].join('\n'));
  assert.doesNotMatch(out, /Miyon|UCaaS|MSPs/);
  assert.equal(out, '10:22:36 Importiere [Datei].pptx …\n10:22:36 [Datei].pptx wird in PDF umgewandelt …\n10:22:39 [Datei].pptx: 24 Folie(n) umgewandelt.');
});

test('Fehlerbericht: übrige Formate und Pfade, Technik bleibt lesbar', () => {
  const out = mask([
    '10:23:12 Gespeichert: Angebot Müller 2026.pdf (1,2 MB · vorher 1,1 MB, 16,6 s)',
    '10:49:07 Importiere Rechnung (Kopie).pdf …',
    '10:50:00 Importiere Protokoll Vorstand.odp …',
    '2026-11-19 23:57:24 Öffnen in der PDFMy-App: Bescheid Finanzamt.pdf',
    '2026-11-19 09:58:34 Installiert: 1.21.0 nach C:\\Users\\Haus iT\\AppData\\Local\\Programs\\pdfmy Scan\\pdfmy-Scan.exe',
    '10:56:07 Dokument geschlossen: 24 Seite(n)',
    'Kontakt: max.muster@example.org',
  ].join('\n'));
  assert.doesNotMatch(out, /Müller|Rechnung \(Kopie|Protokoll Vorstand|Finanzamt|Haus iT|max\.muster/);
  assert.match(out, /10:56:07 Dokument geschlossen: 24 Seite\(n\)/);
  assert.match(out, /pdfmy-Scan\.exe/);
  assert.match(out, /C:\\Users\\\[Benutzer\]\\AppData/);
  assert.match(out, /\[E-Mail\]/);
});

test('Bekannte Dateinamen werden ganz ersetzt und überstehen ein Neuladen im Tab', () => {
  assert.equal(mask('11:02:00 Vorlage Geheimes Projekt, Entwurf (v2).docx geöffnet', { seen: ['Geheimes Projekt, Entwurf (v2).docx'] }), '11:02:00 Vorlage [Datei].docx geöffnet');
  assert.match(app, /sessionStorage\.getItem\('mpdf\.names'\)/, 'gemerkte Namen werden nach dem Neuladen gelesen');
  assert.match(app, /rememberFileName\(f\.name\)/, 'jede importierte Datei wird gemerkt');
});

test('Bericht geht nicht verloren (v328): lokal aufheben bis „Ja, gesendet“, Ausweichwege ohne Mailprogramm, Erinnerung beim Start', () => {
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['repSentDlg', 'repGmail', 'repOutlookWeb', 'repCopy', 'repFile', 'repSentOk', 'repLater', 'repDrop']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /id="repGmail" target="_blank" rel="noopener noreferrer"/, 'Webmail nur auf Klick, ohne Herkunftsadresse');
  // beide Sendewege merken den Bericht und fragen nach
  assert.equal((src.match(/repMerken\(reportSubject\(\), txt\)/g) || []).length, 2);
  assert.equal((src.match(/setTimeout\(\(\) => repNachfragen\(\), 2500\)/g) || []).length, 2);
  assert.match(src, /\$\('#repSentOk'\)\.onclick = \(\) => \{ LS\.del\('repPending'\)/);
  assert.match(src, /const REP_KEEP_DAYS = 14;/);
  assert.match(src, /Date\.now\(\) - p\.at > 120000/, 'Erinnerung nicht für gerade eben erstellte Berichte');
  assert.match(src, /https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=\$\{enc\(SUPPORT\)\}/);
  assert.match(src, /https:\/\/outlook\.live\.com\/mail\/0\/deeplink\/compose\?to=\$\{enc\(SUPPORT\)\}/);
});
