// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Bewerbungen (app-v359): Mappe ordnen und benennen, Prüfprofil „Bewerbung“, Nachweis der Eigenbemühungen für Jobcenter/Arbeitsagentur
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/bewerbung.js');

const ANSCHREIBEN = `Erika Mustermann · Lindenweg 3 · 33104 Paderborn
Muster Haustechnik GmbH
Personalabteilung
Industriestraße 4
33100 Paderborn
Paderborn, 27.11.2026
Bewerbung als Industriekauffrau (m/w/d) – Ihre Stellenanzeige vom 20.11.2026
Sehr geehrte Damen und Herren,
mit großem Interesse habe ich Ihre Stellenanzeige gelesen und bewerbe mich hiermit.
Mit freundlichen Grüßen
Erika Mustermann`;
const LEBENSLAUF = `Lebenslauf
Persönliche Daten  Erika Mustermann, geboren am 01.01.1990
Berufserfahrung  2015–2026 Sachbearbeiterin
Schulbildung  2006 Realschulabschluss
Kenntnisse  EDV-Kenntnisse: Word, Excel; Sprachkenntnisse: Englisch`;
const ZEUGNIS = `Arbeitszeugnis
Frau Erika Mustermann war vom 01.08.2015 bis 31.10.2026 in unserem Unternehmen als Sachbearbeiterin beschäftigt. Sie erledigte ihre Aufgaben stets zu unserer vollsten Zufriedenheit.`;

test('Art der Teile: Anschreiben, Lebenslauf, Zeugnis, Deckblatt – auch am Dateinamen', () => {
  assert.equal(B.kindOf(ANSCHREIBEN), 'anschreiben');
  assert.equal(B.kindOf(LEBENSLAUF), 'lebenslauf');
  assert.equal(B.kindOf(ZEUGNIS), 'anlage');
  assert.equal(B.kindOf('Bewerbung\nals Industriekauffrau\nErika Mustermann'), 'deckblatt');
  assert.equal(B.kindOf('', 'Lebenslauf_Mustermann.pdf'), 'lebenslauf', 'Scan ohne Text: Dateiname');
  assert.equal(B.kindOf('', 'Scan_001.jpg'), 'anlage', 'unbekannt = Anlage');
  assert.equal(B.kindOf('', 'Anschreiben.docx'), 'anschreiben');
});

test('Reihenfolge und Lesezeichen: Deckblatt, Anschreiben, Lebenslauf, Anlagen in Auswahlreihenfolge', () => {
  const teile = [{ name: 'Zeugnis_Firma_A.pdf', kind: 'anlage' }, { name: 'CV.pdf', kind: 'lebenslauf' }, { name: 'Scan_0003.jpg', kind: 'anlage' }, { name: 'Anschreiben.pdf', kind: 'anschreiben' }];
  const o = B.order(teile);
  assert.deepEqual(o.map(t => t.name), ['Anschreiben.pdf', 'CV.pdf', 'Zeugnis_Firma_A.pdf', 'Scan_0003.jpg']);
  assert.deepEqual(B.titles(o), ['Anschreiben', 'Lebenslauf', 'Anlage 1: Zeugnis Firma A', 'Anlage 2']);
});

test('Dateiname für Portale, Arbeitgeber und Stelle aus dem Anschreiben', () => {
  assert.equal(B.fileName('Erika Müller-Lüdenscheidt'), 'Bewerbung_Erika_Mueller_Luedenscheidt.pdf');
  assert.equal(B.fileName('Zoë Öztürk', 'Muster GmbH & Co. KG'), 'Bewerbung_Zoe_Oeztuerk_Muster_GmbH_Co_KG.pdf');
  assert.equal(B.fileName(''), 'Bewerbung.pdf');
  assert.equal(B.employer(ANSCHREIBEN), 'Muster Haustechnik GmbH');
  assert.equal(B.position(ANSCHREIBEN), 'Industriekauffrau');
  assert.equal(B.position('Bewerbung um eine Ausbildungsstelle als Elektroniker für Betriebstechnik'), 'Elektroniker für Betriebstechnik');
  assert.equal(B.employer('Sehr geehrte Damen und Herren'), '');
});

test('Nachweis der Eigenbemühungen: Zeitraum, Tabelle, Unterschrift; CSV verlustfrei', () => {
  const liste = [
    { datum: '2026-11-03', arbeitgeber: 'Muster GmbH', ort: 'Paderborn', stelle: 'Lagerist', art: 'Online-Portal', quelle: 'Jobbörse der BA', ergebnis: 'Absage', notiz: '' },
    { datum: '2026-11-20', arbeitgeber: 'Beispiel AG; Werk 2', ort: 'Bielefeld', stelle: 'Fahrer "C1"', art: 'E-Mail', quelle: 'Zeitung', ergebnis: 'Einladung zum Gespräch', notiz: 'Termin 2.12.' },
    { datum: '2026-10-28', arbeitgeber: 'Alt KG', ort: '', stelle: 'Helfer', art: 'Post', quelle: '', ergebnis: 'offen', notiz: '' },
  ];
  const bl = B.nachweisBlocks(liste, { von: '2026-11-01', bis: '2026-11-30', name: 'Erika Mustermann', nummer: '123A456789', heute: new Date(2026, 10, 27) });
  assert.equal(bl[0].text, 'Nachweis der Eigenbemühungen');
  assert.match(bl[1].text, /Zeitraum: 01\.11\.2026 bis 30\.11\.2026/); assert.match(bl[1].text, /Anzahl Bewerbungen: 2/); assert.match(bl[1].text, /123A456789/);
  const t = bl.find(b => b.type === 'table');
  assert.deepEqual(t.rows[1], ['1', '03.11.2026', 'Muster GmbH, Paderborn', 'Lagerist', 'Online-Portal', 'Absage']);
  assert.equal(t.rows.length, 3, 'Oktober liegt außerhalb des Zeitraums');
  assert.match(bl.find(b => /Unterschrift/.test(b.text || '')).text, /Ort, Datum/);
  const back = B.parseCsv(B.toCsv(liste));
  assert.deepEqual(back, liste);
});

test('Prüfprofil „Bewerbung“: kleine PDF ohne Kennwort besteht; Skript, Größe und Dateiname werden gemeldet', async () => {
  globalThis.window = globalThis; globalThis.self = globalThis;
  globalThis.PDFLib = require('../vendor/pdf-lib.min.js'); globalThis.BeaCheck = require('../js/bea.js');
  globalThis.PdfACheck = require('../js/pdfacheck.js'); globalThis.A11yCheck = require('../js/a11ycheck.js'); globalThis.Bewerbung = B;
  const P = require('../js/preflight.js'), L = globalThis.PDFLib;
  const pdf = async ({ js = false, big = 0, author = '' } = {}) => {
    const d = await L.PDFDocument.create(), f = await d.embedFont(L.StandardFonts.Helvetica);
    d.addPage([595, 842]).drawText('Bewerbung als Lagerist', { x: 60, y: 760, size: 14, font: f });
    if (author) d.setAuthor(author);
    if (js) d.catalog.set(L.PDFName.of('OpenAction'), d.context.obj({ S: 'JavaScript', JS: L.PDFString.of('app.alert(1)') }));
    if (big) d.attach(new Uint8Array(require('node:crypto').randomBytes(big)), 'x.bin', { mimeType: 'application/octet-stream' });
    return d.save({ useObjectStreams: false });
  };
  const t = r => r.items.map(i => (i.ok === true ? '✓' : i.ok === false ? '✗' : 'i') + ' ' + i.title);
  assert.ok(P.PROFILES.bewerbung, 'Profil vorhanden');
  const ok = await P.run('bewerbung', await pdf({ author: 'Erika Mustermann' }), { name: 'Bewerbung_Erika_Mustermann.pdf', pages: 1, textPages: 1, person: 'Erika Mustermann' });
  assert.equal(ok.ok, true, t(ok).join('\n'));
  assert.ok(t(ok).includes('✓ Dateiname ohne Umlaute und Leerzeichen'));
  assert.ok(ok.items.some(i => /Autor: Erika Mustermann/.test(i.detail)), 'Autor wird zum Prüfen gezeigt');
  const bad = await P.run('bewerbung', await pdf({ js: true }), { name: 'Bewerbung Müller (final).pdf', pages: 2, textPages: 1, person: 'Erika Müller' });
  assert.equal(bad.ok, false);
  assert.ok(t(bad).includes('✗ Keine aktiven Inhalte oder Dateianhänge'));
  assert.ok(bad.items.some(i => /Bewerbung_Erika_Mueller\.pdf/.test(i.detail)), 'Vorschlag für den Dateinamen');
  assert.ok(t(bad).includes('i Text maschinenlesbar'), 'Scan-Seite ohne Text als Hinweis');
  const gross = await P.run('bewerbung', await pdf({ big: 5.5 * 1024 * 1024 }), { name: 'Bewerbung.pdf', pages: 1, textPages: 1 });
  assert.ok(t(gross).includes('✗ Größe höchstens 5 MB'));
});
