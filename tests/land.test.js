// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Land (app-v366, js/land.js): Vermutung ohne Ortung, Funktionen je Land, Bezeichnungen; Nachweis bleibt deutsch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Land = require('../js/land.js');
const B = require('../js/bewerbung.js');

test('Land vermuten: Zeitzone vor Browsersprache, sonst Deutschland – nichts wird übertragen', () => {
  assert.equal(Land.vermute({ tz: 'Europe/Vienna', sprachen: ['de-DE'] }), 'AT');
  assert.equal(Land.vermute({ tz: 'Europe/Zurich' }), 'CH');
  assert.equal(Land.vermute({ tz: 'Europe/Vaduz' }), 'CH');
  assert.equal(Land.vermute({ tz: 'Europe/Berlin', sprachen: ['de-AT'] }), 'DE', 'Zeitzone hat Vorrang');
  assert.equal(Land.vermute({ tz: '', sprachen: ['de-CH'] }), 'CH');
  assert.equal(Land.vermute({ tz: 'Africa/Nairobi', sprachen: ['sw-KE'] }), 'XX');
  assert.equal(Land.vermute({}), 'DE');
  // js/land.js fragt kein Netz und keinen Standort ab
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'land.js'), 'utf8');
  assert.ok(!/fetch\(|XMLHttpRequest|geolocation/.test(src));
});

test('Funktionen je Land: Zuwendungsbestätigung nur DE, SEPA/GiroCode nicht in der Schweiz', () => {
  assert.ok(Land.gibt('zuwendung', 'DE') && !Land.gibt('zuwendung', 'AT') && !Land.gibt('zuwendung', 'CH'));
  assert.ok(Land.gibt('sepa', 'AT') && !Land.gibt('sepa', 'CH'));
  assert.ok(Land.gibt('nachweis', 'CH'), 'ohne Eintrag überall');
  assert.equal(Land.text('nachweisMenu', 'AT'), 'Bewerbungen und Liste für das AMS …');
  assert.equal(Land.text('nachweisTitel', 'CH'), 'Nachweis der persönlichen Arbeitsbemühungen');
  assert.equal(Land.text('nachweisTitel', 'XX'), 'Nachweis der Eigenbemühungen');
  assert.equal(Land.fristLand('AT'), 'AT'); assert.equal(Land.fristLand('DE'), 'NW');
  // jeder Text hat alle vier Länder
  for (const k of ['nachweisMenu', 'nachweisDlg', 'nachweisTitel', 'nachweisHinweis', 'lesefassungNachweis', 'steuerberater', 'nummerText', 'nummerLabel', 'nachweisDatei', 'nachweisDeutsch'])
    for (const [c] of Land.LAENDER) assert.ok(Land.text(k, c), `${k}/${c}`);
});

test('index.html: Kennzeichnungen passen zu js/land.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const texte = [...html.matchAll(/data-land-text="([^"]+)"/g)].map(m => m[1]);
  assert.ok(texte.length >= 6);
  for (const k of texte) assert.ok(Land.text(k, 'AT'), 'Text fehlt: ' + k);
  assert.match(html, /id="btnZuw" data-land-nur="DE"/);
  assert.match(html, /<script src="js\/land\.js"><\/script>/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), /'js\/land\.js'/);
});

test('Nachweis je Land: Titel und Nummer angepasst, Inhalt bleibt deutsch', () => {
  const liste = [{ datum: '2026-11-20', arbeitgeber: 'Muster AG', stelle: 'Lager', art: 'E-Mail', ergebnis: 'Absage' }];
  const ch = B.nachweisBlocks(liste, { name: 'A', nummer: '756.1234', titel: Land.text('nachweisTitel', 'CH'), nummerText: Land.text('nummerText', 'CH') });
  assert.equal(ch[0].text, 'Nachweis der persönlichen Arbeitsbemühungen');
  assert.match(ch[1].text, /Kunden- oder Personennummer: 756\.1234/);
  assert.match(ch[1].text, /Zeitraum: gesamt/);
  assert.ok(JSON.stringify(ch).includes('Absage'));
});

test('Verein und Fristen je Land: Statuten, Rechnungsprüfer/-revisoren, Rechtsgrundlagen; CH-Mitgliedsantrag ohne SEPA (app-v368)', async () => {
  assert.equal(Land.verein('AT').satzung, 'Statuten');
  assert.equal(Land.verein('CH').pruefer, 'Rechnungsrevisoren');
  assert.equal(Land.verein('DE').pruefer, 'Kassenprüfer');
  assert.match(Land.text('fristHinweis', 'AT'), /AVG/);
  assert.match(Land.text('fristHinweis', 'CH'), /Art\. 142–145 ZPO/);
  assert.match(Land.text('mvFristLabel', 'CH'), /Statuten/, 'CH übernimmt den Text für AT');
  assert.equal(Land.text('mappeMenu', 'CH'), 'Bewerbungsdossier …');
  assert.ok(!Land.gibt('pauschale', 'AT') && Land.gibt('pauschale', 'DE'));
  const V = require('../js/versammlung.js');
  assert.ok(V.tagesordnung('', 'AT').includes('Bericht der Rechnungsprüfer'));
  assert.ok(V.tagesordnung('', 'DE').includes('Bericht der Kassenprüfer'));
  const VV = require('../js/vereinsvorlagen.js'), L = require('../vendor/pdf-lib.min.js');
  const de = await VV.erzeugen(L, 'mitglied', { verein: 'TV Muster' }, { land: 'DE' });
  const ch = await VV.erzeugen(L, 'mitglied', { verein: 'TV Muster' }, { land: 'CH' });
  const felder = async b => (await L.PDFDocument.load(b)).getForm().getFields().map(f => f.getName());
  assert.ok((await felder(de)).includes('IBAN'));
  assert.ok(!(await felder(ch)).includes('IBAN'), 'in der Schweiz kein SEPA-Mandat');
});

test('Hinweise, Platzhalter und Vorschläge je Land: AMS, Job-Room/RAV statt Jobcenter (app-v370)', () => {
  assert.ok(Land.liste('bwgQuellen', 'AT').includes('Vermittlungsvorschlag AMS'));
  assert.ok(Land.liste('bwgQuellen', 'CH').includes('Job-Room (arbeit.swiss)'));
  assert.ok(!Land.liste('bwgQuellen', 'CH').some(v => /Jobcenter|Agentur für Arbeit/.test(v)));
  assert.ok(Land.liste('bwgQuellen', 'XX').includes('Jobbörse der Agentur für Arbeit'));
  for (const k of ['nachweisTip', 'docLangTip', 'fristTip']) for (const l of ['AT', 'CH']) assert.doesNotMatch(Land.text(k, l), /Jobcenter|Bundeslands/, k + ' ' + l);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const k of ['fristTip', 'nachweisTip', 'docLangTip']) assert.match(html, new RegExp(`data-land-title="${k}"`));
  assert.match(html, /<datalist id="bwgQuellen" data-land-liste="bwgQuellen">/);
});
