// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Text ändern (app-v309): Rechtschreibprüfung in der Sprache des Dokuments statt der Oberflächensprache.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const Letter = require('../js/letter.js'), I18N = require('../js/i18n.js');
const src = app.match(/function spellLang\(p, text\) \{[\s\S]+?\n\}/)[0];
const make = own => new Function('Letter', 'I18N', 'ocrPrimary', src + '; return spellLang;')(Letter, I18N, () => own);

const FR = 'Nous vous remercions pour votre lettre du mois dernier et nous avons le plaisir de vous informer que votre demande a été acceptée par notre service. Pour toute question, nous sommes à votre disposition par téléphone ou par courrier dans les meilleurs délais.';
const DE = 'Wir bedanken uns für Ihr Schreiben vom letzten Monat und freuen uns, Ihnen mitteilen zu können, dass Ihr Antrag von unserer Abteilung angenommen wurde. Bei Fragen stehen wir Ihnen gern telefonisch oder schriftlich zur Verfügung, und wir melden uns bald.';
const RU = 'Благодарим вас за письмо от прошлого месяца и рады сообщить, что ваше заявление было принято нашим отделом. По всем вопросам мы готовы ответить по телефону.';

test('Sprache der Seite (Texterkennung) hat Vorrang', () => {
  assert.equal(make('deu')({ lang: 'fra' }, 'Hallo'), 'fr-FR');
});
test('ohne erkannte Sprache: am Text bzw. Seitentext erkannt', () => {
  const f = make('deu');
  assert.equal(f({}, FR), 'fr-FR');
  assert.equal(f({ ocr: { text: RU } }, 'Иванов'), 'ru-RU');
  assert.equal(f({}, DE), 'de-DE');
  assert.equal(f({}, 'Kurz'), 'de-DE', 'zu wenig Text: Erkennungssprache');
  assert.equal(make('eng')({}, 'Short'), 'en-GB');
});
test('Bearbeitungsfeld bekommt Rechtschreibprüfung und lang', () => {
  assert.match(app, /el\.contentEditable = 'true'; el\.spellcheck = true; const sl = spellLang\(p, a\.text\); if \(sl\) el\.lang = sl;/);
});
