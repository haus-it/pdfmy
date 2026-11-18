// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Formular-Rundlauf (18.11.2026, Anlass: Hinweis in Borns IT-Blog, manche Programme speichern Formulare fehlerhaft):
// Acrobat-typisches Formular (Schrift /Helv mit automatischer Größe, NeedAppearances) mit PDFMy ausfüllen, speichern, erneut ausfüllen.
// Geprüft wird, was Acrobat, Foxit und Firefox beim Öffnen brauchen: Werte, Ansichten, gültige Schriftangabe, Exportwerte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const L = require('../vendor/pdf-lib.min.js');
const fontkit = require('../vendor/fontkit.umd.min.js');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

// fillFormBytes und optionPairs aus app.js laden (ohne Browser)
const grab = re => { const m = app.match(re); assert.ok(m, 'fehlt: ' + re); return m[0]; };
const code = grab(/^const optionPairs = .*$/m) + '\n' + grab(/^async function fillFormBytes\([\s\S]*?\n\}/m);
const fillFormBytes = new Function('PDFLib', 'PDFDocument', 'plainLib', 'loadFontkit', 'asset', 'noteError',
  code + '\nreturn fillFormBytes;')(L, L.PDFDocument, b => L.PDFDocument.load(b), async () => fontkit,
  async (k, p) => fs.readFileSync(path.join(ROOT, p)), e => { throw e; });

const N = n => L.PDFName.of(n);
async function acrobatForm() {
  const d = await L.PDFDocument.create(), pg = d.addPage([595, 842]), form = d.getForm();
  const t = (n, y, o = {}) => { const f = form.createTextField(n); if (o.multi) f.enableMultiline(); if (o.max) { f.setMaxLength(o.max); f.enableCombing(); } f.addToPage(pg, { x: 50, y, width: o.w || 300, height: o.h || 20 }); if (o.v) f.setText(o.v); if (o.ro) f.enableReadOnly(); };
  t('Antragsteller.Name', 780); t('Bemerkung', 650, { multi: true, h: 80 }); t('PLZ', 620, { max: 5, w: 120 }); t('Aktenzeichen', 590, { ro: true, v: 'AZ-2026-17' });
  const cb = form.createCheckBox('Einverstanden'); cb.addToPage(pg, { x: 50, y: 520, width: 14, height: 14 });
  const rg = form.createRadioGroup('Familienstand'); for (const [o, x] of [['ledig', 50], ['verheiratet', 90]]) rg.addOptionToPage(o, pg, { x, y: 480, width: 14, height: 14 });
  const dd = form.createDropdown('Bundesland'); dd.addOptions(['Bayern', 'Nordrhein-Westfalen']); dd.addToPage(pg, { x: 50, y: 440, width: 200, height: 20 });
  dd.acroField.dict.lookup(N('Opt')).set(1, d.context.obj([L.PDFHexString.fromText('NW'), L.PDFHexString.fromText('Nordrhein-Westfalen')]));
  for (const w of cb.acroField.getWidgets()) for (const k of ['N', 'D']) { const s = w.dict.lookup(N('AP')).lookup(N(k)); if (s) { const y = s.get(N('Yes')); s.delete(N('Yes')); s.set(N('Ja'), y); } }
  const af = form.acroForm.dict;
  af.set(N('NeedAppearances'), L.PDFBool.True);
  af.set(N('DR'), d.context.obj({ Font: { Helv: d.context.register(d.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' })) } }));
  for (const f of form.getFields()) f.acroField.dict.set(N('DA'), L.PDFString.of(f.getName() === 'Bemerkung' ? '/Helv 10 Tf 0 g' : '/Helv 0 Tf 0 g'));
  return d.save({ updateFieldAppearances: false });
}
const VALUES = { 'Antragsteller.Name': 'Jürgen Müßig-Öztürk', Bemerkung: 'Zeile eins\nZeile zwei mit „Anführung“ und €-Betrag', PLZ: '33100', Einverstanden: true, Familienstand: 'verheiratet', Bundesland: 'Nordrhein-Westfalen' };

test('Formular-Rundlauf: Werte, Ansichten und Exportwerte kommen in jedem Programm an', async () => {
  const { keep, filled, bad } = await fillFormBytes(await acrobatForm(), VALUES);
  assert.equal(bad, 0);
  const f = (await L.PDFDocument.load(keep)).getForm();
  assert.equal(f.getTextField('Antragsteller.Name').getText(), 'Jürgen Müßig-Öztürk');
  assert.equal(f.getTextField('Bemerkung').getText(), VALUES.Bemerkung);
  assert.equal(f.getTextField('Aktenzeichen').getText(), 'AZ-2026-17', 'unberührtes, schreibgeschütztes Feld bleibt');
  assert.ok(f.getCheckBox('Einverstanden').isChecked());
  const cw = f.getCheckBox('Einverstanden').acroField;
  assert.equal(cw.dict.get(N('V')).toString(), '/Ja', 'Ein-Zustand des Formulars („Ja“), nicht „Yes“');
  assert.equal(cw.getWidgets()[0].dict.get(N('AS')).toString(), '/Ja');
  assert.equal(f.getRadioGroup('Familienstand').getSelected(), 'verheiratet');
  assert.equal(f.getDropdown('Bundesland').acroField.dict.lookup(N('V')).decodeText(), 'NW', 'gespeichert wird der Exportwert');
  for (const fl of f.getFields()) for (const w of fl.acroField.getWidgets()) assert.ok(w.dict.has(N('AP')), 'Ansicht vorhanden: ' + fl.getName());
  // flache Fassung (Anzeige, Zusammenstellen): Werte stehen als Seiteninhalt da
  const flat = await L.PDFDocument.load(filled);
  assert.equal(flat.getForm().getFields().length, 0);
});

test('Formular-Rundlauf: Schriftangabe bleibt gültig (Acrobat/Foxit können später weiter bearbeiten)', async () => {
  const keep = (await fillFormBytes(await acrobatForm(), VALUES)).keep;
  const f = (await L.PDFDocument.load(keep)).getForm(), af = f.acroForm.dict;
  const dr = af.lookup(N('DR')).lookup(N('Font')).keys().map(String);
  for (const fl of f.getFields()) {
    const da = fl.acroField.dict.get(N('DA'))?.decodeText?.() ?? fl.acroField.dict.get(N('DA'))?.toString();
    if (!da) continue;
    const font = da.match(/\/(\S+)\s+[\d.]+\s+Tf/)?.[1];
    assert.ok(dr.includes('/' + font), `${fl.getName()}: Schrift /${font} steht im Schriftverzeichnis (${dr})`);
  }
  assert.match(f.getTextField('Antragsteller.Name').acroField.dict.get(N('DA')).toString(), /\/Helv 0 Tf/, 'automatische Größe bleibt');
  assert.equal(af.get(N('NeedAppearances')).toString(), 'false', 'alle Ansichten erzeugt – kein Neuaufbau mit fremder Schrift');
});

test('Formular-Rundlauf: gespeichertes Formular erneut ausfüllen behält die übrigen Eingaben', async () => {
  const first = (await fillFormBytes(await acrobatForm(), VALUES)).keep;
  const f = (await L.PDFDocument.load((await fillFormBytes(first, { 'Antragsteller.Name': 'Zweiter Durchlauf', Einverstanden: false })).keep)).getForm();
  assert.equal(f.getTextField('Antragsteller.Name').getText(), 'Zweiter Durchlauf');
  assert.equal(f.getTextField('Bemerkung').getText(), VALUES.Bemerkung);
  assert.equal(f.getCheckBox('Einverstanden').isChecked(), false);
  assert.equal(f.getRadioGroup('Familienstand').getSelected(), 'verheiratet');
});

test('Formular ohne NeedAppearances: Merker entsteht nicht neu', async () => {
  const d = await L.PDFDocument.create(), pg = d.addPage(); d.getForm().createTextField('X').addToPage(pg, { x: 50, y: 700, width: 200, height: 20 });
  const k = await L.PDFDocument.load((await fillFormBytes(await d.save(), { X: 'Ä€' })).keep);
  assert.equal(k.getForm().getTextField('X').getText(), 'Ä€');
  assert.equal(k.getForm().acroForm.dict.has(N('NeedAppearances')), false);
});
