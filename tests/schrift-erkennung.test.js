// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Meldung 2026-0014 (app-v358): Beim Scan eines deutschen Hefts hieß es auf einer Bildseite „Ukrainisch erkannt“ – die kyrillische Probe
// war nur etwas „sicherer“ als der deutsche Zeichensalat. Eine andere Schrift gewinnt jetzt nur, wenn sie für sich lesbar ist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Letter = require('../js/letter.js');

test('Zeichensalat einer Bildseite gewinnt nicht gegen Deutsch, auch wenn er „sicherer“ ist', () => {
  const de = { conf: 24, text: 'Ve re in sh ef t 4/ 20 26 ~ |l. ;: = J ah re sh au pt' };
  // typischer Zeichensalat der kyrillischen Probe auf Fotos: kurze Bruchstücke, kaum ganze Wörter
  const cyr = { conf: 41, text: 'Веі ш 4 2026 — ІІ. ; Ж ах ре ї щ ау пт ві ии ш ії ь Ь ж' };
  assert.equal(Letter.scriptWins(de, cyr), false, 'nur 41 % und keine echten Wörter');
  assert.equal(Letter.scriptWins(de, { conf: 64, text: cyr.text }), false, 'sicherer, aber ohne Wörter');
  // echter Zeichensalat der kyrillischen Probe auf dem nachgestellten Titelbild (PDFMy im Browser, 32 %): „ukr“, aber kaum Wörter
  const salat = 'Мегеіпзпей 4/2026 Ре чу ІН ецрімюєзатітиго З отеках З Тата я т Эр %” вк при '.repeat(2);   // 8 „Wörter“ (≥ 6), aber nur 24 %
  assert.equal(Letter.scriptWins(de, { conf: 70, text: salat }), false, 'Anteil echter Wörter zu klein');
  assert.equal(Letter.scriptWins(de, { conf: 58, text: 'Шановний пане Іваненко, повідомляємо вам про зміну тарифу з першого грудня' }), false, 'unter 60 %');
});

test('Echte Briefe in kyrillischer oder griechischer Schrift werden weiter erkannt', () => {
  const de = { conf: 31, text: 'Lllaxo8hhm naHe IBaHeHKo, noBiAoMnseMo' };
  assert.equal(Letter.scriptWins(de, { conf: 78, text: 'Шановний пане Іваненко, повідомляємо вам про зміну тарифу з першого грудня. З повагою, Ваша компанія' }), true, 'Ukrainisch');
  assert.equal(Letter.scriptWins(de, { conf: 74, text: 'Уважаемый господин Иванов, сообщаем вам об изменении тарифа с первого декабря. С уважением' }), true, 'Russisch');
  assert.equal(Letter.scriptWins(de, { conf: 71, text: 'Αγαπητέ κύριε Παπαδόπουλε, σας ενημερώνουμε για την αλλαγή του τιμολογίου από τον Δεκέμβριο' }), true, 'Griechisch');
  // und Ukrainisch bleibt Ukrainisch (і/ї/є), Russisch bleibt Russisch
  assert.equal(Letter.cyrLang('Шановний пане Іваненко, повідомляємо вам про зміну тарифу з першого грудня'), 'ukr');
});

test('Erkennung der Bildseite schaltet die Schriftproben ab (App)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /const pictorial = p\.autoMode === 'original';\n\s*if \(!pictorial && res\.conf < 62/);
  assert.match(app, /if \(Letter\.scriptWins\(res, r\)/);
  assert.match(app, /if \(!LATIN_OCR\.has\(lang\) && r2\.conf >= 60\) ocrHint = lang;/, 'unsichere Schrift nicht als Vorgabe für die nächsten Seiten');
});
