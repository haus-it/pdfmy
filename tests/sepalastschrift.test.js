// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SEPA-Lastschrift für den Beitragseinzug (app-v317): Mitgliederliste → pain.008.001.08
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const S = require('../js/sepalastschrift.js');
const heute = new Date(2026, 10, 20);   // Freitag, 20.11.2026
const verein = { name: 'TuS Musterdorf 1920 e.V.', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', glaeubigerId: 'DE98ZZZ09999999999', faellig: new Date(2026, 11, 1) };
const rows = [['Vorname', 'Nachname', 'IBAN', 'BIC', 'Beitrag', 'Mandatsreferenz', 'Mandatsdatum', 'Lastschriftart'],
  ['Ayşe', 'Yılmaz', 'DE02 1203 0000 0000 2020 51', '', '60,00', 'M-0001', '15.03.2024', ''],
  ['Jürgen', 'Groß & Söhne', 'DE02120300000000202051', 'BYLADEM1001', '30', 'M-0002', '2026-11-01', 'Erstlastschrift'],
  ['Kein', 'Geld', 'DE02120300000000202051', '', '0', 'M-0003', '01.01.2025', ''],
  ['Falsche', 'IBAN', 'DE02120300000000202052', '', '10', 'M-0004', '01.01.2025', ''],
  ['Ohne', 'Referenz', 'DE02120300000000202051', '', '12,50', '', '01.01.2025', ''],
  ['Doppelt', 'Ref', 'DE02120300000000202051', '', '5', 'M-0001', '01.01.2025', ''],
  ['Zukunft', 'Mandat', 'DE02120300000000202051', '', '5', 'M-0009', '01.01.2027', '']];

test('Prüfziffern: IBAN, BIC, Gläubiger-ID', () => {
  assert.ok(S.ibanOk('DE89 3704 0044 0532 0130 00')); assert.ok(!S.ibanOk('DE89370400440532013001'));
  assert.ok(S.bicOk('COBADEFFXXX')); assert.ok(S.bicOk('BYLADEM1')); assert.ok(!S.bicOk('BYLADEM'));
  assert.ok(S.glaeubigerOk('DE98ZZZ09999999999')); assert.ok(S.glaeubigerOk('DE98ABC09999999999'), 'Geschäftsbereich zählt nicht zur Prüfziffer'); assert.ok(!S.glaeubigerOk('DE99ZZZ09999999999'));
});

test('SEPA-Zeichensatz und Referenzen', () => {
  assert.equal(S.sepaText('Ayşe Yılmaz – Groß & Söhne „Fan“'), "Ayse Yilmaz - Gross + Soehne 'Fan'");
  assert.equal(S.sepaText('Łukasz Żółć <x>@'), 'Lukasz Zolc x (at)');
  assert.equal(S.sepaRef('/M 2026//01/'), 'M2026/01');
  assert.equal(S.sepaText('a'.repeat(80), 70).length, 70);
});

test('Mitgliederliste: Fehler je Zeile, Sequenz, Mandatsreferenzen vergeben', () => {
  const t = S.ausTabelle(rows, { heute, zweck: 'Mitgliedsbeitrag 2027' });
  assert.equal(t.posten.length, 2);
  assert.deepEqual(t.fehler.map(f => f.replace(/:.*/, '')), ['Zeile 4 (Kein Geld)', 'Zeile 5 (Falsche IBAN)', 'Zeile 6 (Ohne Referenz)', 'Zeile 7 (Doppelt Ref)', 'Zeile 8 (Zukunft Mandat)']);
  assert.equal(t.posten[0].name, 'Ayse Yilmaz'); assert.equal(t.posten[0].seq, 'RCUR'); assert.equal(t.posten[0].zweck, 'Mitgliedsbeitrag 2027');
  assert.equal(t.posten[1].name, 'Juergen Gross + Soehne'); assert.equal(t.posten[1].seq, 'FRST'); assert.equal(t.posten[1].betrag, 30);
  const v = S.ausTabelle(rows, { heute, vergeben: true, praefix: 'MITGL-' });
  assert.deepEqual(v.vergeben, [{ name: 'Ohne Referenz', mandat: 'MITGL-0001' }]);
  assert.equal(v.posten.length, 3);
  assert.match(S.vergebenCsv([{ name: '=HYPERLINK("x")', mandat: 'M-1' }]), /'=HYPERLINK\(""x""\)/);
  assert.match(S.ausTabelle([['Name', 'Betrag']]).fehler[0], /IBAN/);
});

test('Fälligkeit: Bankarbeitstage (TARGET), frühestes Datum, Vorabankündigung', () => {
  assert.equal(S.bankarbeitstag(new Date(2026, 11, 25)), false); assert.equal(S.bankarbeitstag(new Date(2026, 3, 3)), false, 'Karfreitag 2026');
  assert.equal(S.bankarbeitstag(new Date(2026, 3, 6)), false, 'Ostermontag 2026'); assert.equal(S.bankarbeitstag(new Date(2026, 10, 23)), true);
  assert.equal(S.fruehestens(heute).toDateString(), new Date(2026, 10, 24).toDateString(), 'Fr → Di (Mo ist Einreichungstag)');
  assert.equal(S.faelligkeitPruefen(new Date(2026, 10, 23), heute).ok, false);
  assert.match(S.faelligkeitPruefen(new Date(2026, 10, 26), heute).hinweis, /Vorabankündigung/);
  assert.equal(S.faelligkeitPruefen(new Date(2026, 11, 15), heute).hinweis, '');
  assert.match(S.faelligkeitPruefen(new Date(2026, 11, 26), heute).hinweis, /kein Bankarbeitstag/);
});

test('pain.008.001.08: Aufbau, Reihenfolge, Summen, ohne BIC NOTPROVIDED', () => {
  const { posten } = S.ausTabelle(rows, { heute });
  const x = S.xml(verein, posten, { jetzt: new Date(Date.UTC(2026, 10, 20, 10, 0, 0)) });
  assert.match(x, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain\.008\.001\.08"/);
  assert.match(x, /<GrpHdr><MsgId>PDFMY-20261120100000<\/MsgId><CreDtTm>2026-11-20T10:00:00<\/CreDtTm><NbOfTxs>2<\/NbOfTxs><CtrlSum>90\.00<\/CtrlSum><InitgPty><Nm>TuS Musterdorf 1920 e\.V\.<\/Nm><\/InitgPty><\/GrpHdr>/);
  assert.equal((x.match(/<PmtInf>/g) || []).length, 2, 'FRST und RCUR getrennt');
  assert.match(x, /<SeqTp>FRST<\/SeqTp><\/PmtTpInf>\n<ReqdColltnDt>2026-12-01<\/ReqdColltnDt><Cdtr><Nm>TuS Musterdorf 1920 e\.V\.<\/Nm><\/Cdtr><CdtrAcct><Id><IBAN>DE89370400440532013000<\/IBAN><\/Id><\/CdtrAcct>/);
  assert.match(x, /<CdtrAgt><FinInstnId><BICFI>COBADEFFXXX<\/BICFI><\/FinInstnId><\/CdtrAgt><ChrgBr>SLEV<\/ChrgBr>\n<CdtrSchmeId><Id><PrvtId><Othr><Id>DE98ZZZ09999999999<\/Id><SchmeNm><Prtry>SEPA<\/Prtry><\/SchmeNm><\/Othr><\/PrvtId><\/Id><\/CdtrSchmeId>/);
  assert.match(x, /<InstdAmt Ccy="EUR">60\.00<\/InstdAmt>\n<DrctDbtTx><MndtRltdInf><MndtId>M-0001<\/MndtId><DtOfSgntr>2024-03-15<\/DtOfSgntr><\/MndtRltdInf><\/DrctDbtTx>\n<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED<\/Id><\/Othr><\/FinInstnId><\/DbtrAgt><Dbtr><Nm>Ayse Yilmaz<\/Nm><\/Dbtr>/);
  assert.match(x, /<DbtrAgt><FinInstnId><BICFI>BYLADEM1001<\/BICFI><\/FinInstnId><\/DbtrAgt><Dbtr><Nm>Juergen Gross \+ Soehne<\/Nm>/);
  assert.ok(!/[^\x09\x0a\x0d\x20-\x7e]/.test(x), 'nur ASCII');
  const ids = [...x.matchAll(/<EndToEndId>([^<]+)</g)].map(m => m[1]); assert.equal(new Set(ids).size, 2); assert.ok(ids.every(i => i.length <= 35));
  assert.throws(() => S.xml({ ...verein, glaeubigerId: 'DE99ZZZ09999999999' }, posten), /Gläubiger/);
  assert.throws(() => S.xml(verein, []), /Keine/);
});

test('Oberfläche angebunden', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8');
  assert.match(html, /id="btnSepa"/); assert.match(html, /<script src="js\/sepalastschrift\.js"><\/script>/);
  assert.match(src, /SepaLastschrift\.ausTabelle\(await fdReadTable\(f\)/); assert.match(src, /SepaLastschrift\.xml\(/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), /js\/sepalastschrift\.js/);
});

test('pain.008.001.08 gültig nach amtlichem ISO-20022-Schema (Python/lxml, sonst übersprungen)', (t) => {
  const { spawnSync } = require('node:child_process'), os = require('node:os');
  const py = ['python', 'py', 'python3'].find(c => spawnSync(c, ['-I', '-c', 'import lxml'], { stdio: 'ignore' }).status === 0);
  if (!py) { t.skip('Python mit lxml nicht installiert'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pain008-')), lang = 'Ä'.repeat(90), datei = [];
  const liste = [rows[0], ...rows.slice(1, 3), ['Łukasz', 'Żółć ' + lang, 'AT611904300234573201', '', '0,01', 'M/2026/3', '01.01.2025', '', 'x'.repeat(200)]];
  for (let i = 0; i < 30; i++) liste.push(['Mitglied', String(i), 'DE02120300000000202051', i % 2 ? 'BYLADEM1001' : '', String(10 + i), 'M-1' + i, '01.01.2025', i % 3 ? '' : 'FRST', '']);
  const { posten, fehler } = S.ausTabelle(liste, { heute, zweck: 'Mitgliedsbeitrag 2027' });
  assert.equal(fehler.length, 0); assert.equal(posten.length, 33);
  for (const [n, v, p] of [['mit-bic', verein, posten], ['ohne-bic', { ...verein, bic: '' }, posten.filter(x => x.seq === 'RCUR')], ['einzeln', verein, posten.slice(0, 1)]]) {
    const f = path.join(dir, n + '.xml'); fs.writeFileSync(f, S.xml(v, p, { jetzt: new Date(Date.UTC(2026, 10, 20, 10)) })); datei.push(f);
  }
  const r = spawnSync(py, ['-I', path.join(__dirname, 'sepa-xsd', 'pruefe.py'), path.join(__dirname, 'sepa-xsd', 'pain.008.001.08.xsd'), ...datei], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
