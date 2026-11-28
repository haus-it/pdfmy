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

test('Lebenslauf als PDF: persönliche Daten, Abschnitte neueste zuerst, Kenntnisse, Unterschriftszeile; leere Teile entfallen (app-v361)', async () => {
  const L = require('../vendor/pdf-lib.min.js'), fontkit = require('../vendor/fontkit.umd.min.js'), fs = require('node:fs'), path = require('node:path');
  const V = f => fs.readFileSync(path.join(__dirname, '..', 'vendor', f));
  const d = {
    name: 'Erika Mustermann', strasse: 'Lindenweg 3', ort: '33104 Paderborn', telefon: '05251 123456', email: 'erika@example.org', geburt: '', nationalitaet: '',
    abschnitte: [
      { titel: 'Berufserfahrung', eintraege: [
        { von: '08/2010', bis: '07/2015', titel: 'Verkäuferin', wo: 'Beispiel Markt, Bielefeld', text: '' },
        { von: '08/2015', bis: 'heute', titel: 'Sachbearbeiterin', wo: 'Muster GmbH, Paderborn', text: '- Auftragsbearbeitung\n- Kundenkontakt am Telefon und per E-Mail' },
      ] },
      { titel: 'Schule und Ausbildung', eintraege: [{ von: '2006', bis: '2008', titel: 'Ausbildung zur Kauffrau im Einzelhandel', wo: 'IHK Ostwestfalen', text: '' }] },
      { titel: 'Weiterbildung', eintraege: [{ von: '', bis: '', titel: '', wo: '', text: '' }] },
    ],
    kenntnisse: [{ art: 'Sprachen', wert: 'Deutsch (Muttersprache), Englisch (gut)' }, { art: 'EDV', wert: 'Word, Excel, Warenwirtschaft' }, { art: 'Führerschein', wert: '' }],
    interessen: 'Wandern, Ehrenamt im Sportverein', unterschriftOrt: 'Paderborn', datum: '28.11.2026',
  };
  const trace = [], bytes = await B.lebenslaufPdf(L, d, { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), trace });
  const doc = await L.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getTitle(), 'Lebenslauf Erika Mustermann');
  const t = trace.join(' ');
  for (const s of ['Lebenslauf', 'Erika Mustermann', 'Lindenweg 3, 33104 Paderborn', 'Berufserfahrung', 'Sachbearbeiterin', 'Kundenkontakt', 'Schule und Ausbildung', 'Kenntnisse', 'Englisch (gut)', 'Interessen', 'Paderborn, 28.11.2026']) assert.ok(t.includes(s), s);
  assert.ok(t.indexOf('Sachbearbeiterin') < t.indexOf('Verkäuferin'), 'neueste Stelle zuerst');
  assert.ok(!t.includes('Weiterbildung'), 'leerer Abschnitt entfällt');
  assert.ok(!t.includes('Führerschein'), 'leere Kenntnis entfällt');
  assert.ok(!t.includes('Geburtsdatum'), 'leere persönliche Angabe entfällt');
  // langer Lebenslauf: Seitenumbruch
  const lang = { ...d, abschnitte: [{ titel: 'Berufserfahrung', eintraege: Array.from({ length: 30 }, (_, i) => ({ von: '01/' + (1990 + i), bis: '12/' + (1990 + i), titel: 'Stelle ' + i, wo: 'Firma ' + i, text: '- Aufgabe eins\n- Aufgabe zwei' })) }] };
  const d2 = await L.PDFDocument.load(await B.lebenslaufPdf(L, lang, { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf') }));
  assert.ok(d2.getPageCount() >= 3);
});

test('Lebenslauf: laufende Station in jeder Sprache oben („heute“, „today“, „danes“, „الآن“), sonst nach Jahr (app-v361)', () => {
  const k = B.sortKey;
  for (const w of ['heute', 'today', 'danes', 'الآن', 'сейчас']) assert.ok(k({ von: '08/2015', bis: w }) > k({ von: '01/2020', bis: '12/2024' }), w);
  assert.ok(k({ von: '2010', bis: '2015' }) < k({ von: '2016', bis: '2018' }));
  assert.ok(k({ von: '03/2019', bis: '' }) > 0, 'nur Beginn');
});

test('Sprache der Dokumente: Lebenslauf und Mappe auf Deutsch (Standard) oder Englisch, unabhängig von der Oberfläche (app-v366)', async () => {
  const L = require('../vendor/pdf-lib.min.js'), fontkit = require('../vendor/fontkit.umd.min.js'), fs = require('node:fs'), path = require('node:path');
  const V = f => fs.readFileSync(path.join(__dirname, '..', 'vendor', f));
  const d = { name: 'Amina Haddad', ort: '33104 Paderborn', telefon: '0151 123', abschnitte: [{ titel: 'Berufserfahrung', eintraege: [{ von: '2020', bis: 'heute', titel: 'Verkäuferin', wo: 'Muster GmbH' }] }],
    kenntnisse: [{ art: 'Sprachen', wert: 'Arabisch, Deutsch (B1)' }, { art: 'Führerschein', wert: 'Klasse B' }], datum: '28.11.2026' };
  const run = async lang => { const trace = []; const bytes = await B.lebenslaufPdf(L, d, { fontkit, regular: V('DejaVuSans.ttf'), bold: V('dejavu/DejaVuSans-Bold.ttf'), trace, lang }); return { t: trace.join(' | '), doc: await L.PDFDocument.load(bytes) }; };
  const de = await run(), en = await run('en');
  for (const s of ['Lebenslauf', 'Anschrift', 'Telefon', 'Berufserfahrung', 'Kenntnisse', 'Sprachen', 'Führerschein']) assert.ok(de.t.includes(s), 'de: ' + s);
  for (const s of ['Curriculum Vitae', 'Address', 'Phone', 'Work experience', 'Skills', 'Languages', 'Driving licence']) assert.ok(en.t.includes(s), 'en: ' + s);
  assert.ok(!/Berufserfahrung|Kenntnisse|Anschrift/.test(en.t), 'englisch ohne deutsche Überschriften');
  assert.equal(en.doc.getTitle(), 'Curriculum Vitae Amina Haddad');
  // Lesezeichen der Mappe und Dateiname
  const teile = [{ kind: 'anschreiben' }, { kind: 'lebenslauf' }, { kind: 'anlage', name: 'Zeugnis.pdf' }];
  assert.deepEqual(B.titles(teile), ['Anschreiben', 'Lebenslauf', 'Anlage 1: Zeugnis']);
  assert.deepEqual(B.titles(teile, 'en'), ['Cover letter', 'CV', 'Attachment 1: Zeugnis']);
  assert.equal(B.fileName('Amina Haddad'), 'Bewerbung_Amina_Haddad.pdf');
  assert.equal(B.fileName('Amina Haddad', '', 'en'), 'Application_Amina_Haddad.pdf');
  assert.equal(B.titles(teile, 'xx')[0], 'Anschreiben', 'unbekannte Sprache → Deutsch');
  // Der Nachweis für Jobcenter/Agentur bleibt deutsch
  const nb = B.nachweisBlocks([{ datum: '2026-11-20', arbeitgeber: 'Muster GmbH', stelle: 'Verkäuferin', art: 'E-Mail', ergebnis: 'Absage' }], { name: 'Amina Haddad' });
  assert.equal(nb[0].text, 'Nachweis der Eigenbemühungen');
  assert.ok(JSON.stringify(nb).includes('Absage'));
});
