// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Beiträge per Überweisung (app-v327): Beitragsrechnung mit GiroCode je Mitglied, Abgleich mit dem Kontoauszug, Zahlungserinnerungen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../vendor/pdf-lib.min.js'), B = require('../js/beitrag.js'), Q = require('../js/qrstempel.js'), Bank = require('../js/bank.js'), qrcode = require('../vendor/qrcode.js');
const fontkit = require('../vendor/fontkit.umd.min.js'), regular = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'DejaVuSans.ttf')), bold = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'dejavu', 'DejaVuSans-Bold.ttf'));
const qr = p => { qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; const q = qrcode(0, 'M'); q.addData(p, 'Byte'); q.make(); return { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) }; };
const liste = [['Mitgliedsnummer', 'Vorname', 'Nachname', 'Straße', 'PLZ', 'Ort', 'Beitrag', 'E-Mail'],
  ['17', 'Ayşe', 'Yılmaz', 'Lindenweg 3', '33100', 'Paderborn', '60,00', 'a@example.org'],
  ['', 'Max', 'Müller', '', '', '', '30', ''], ['18', 'Erika', 'Muster', '', '', '', '45', ''], ['19', 'Ohne', 'Betrag', '', '', '', '', '']];
const v = { verein: 'TV Paderborn 1900 e.V.', anschrift: 'Sportplatzweg 1\n33100 Paderborn', iban: 'DE89370400440532013000', zweck: 'Beitrag 2027', faellig: '2027-01-31', kontakt: 'kasse@example.org' };

test('Mitgliederliste: Referenz aus Mitgliedsnummer bzw. laufend, Verwendungszweck im SEPA-Zeichensatz', () => {
  const t = B.ausTabelle(liste, { praefix: 'B27' });
  assert.deepEqual(t.mitglieder.map(m => [m.name, m.ref, m.betrag]), [['Ayşe Yılmaz', 'B27-17', 60], ['Max Müller', 'B27-002', 30], ['Erika Muster', 'B27-18', 45]]);
  assert.match(t.fehler[0], /Ohne Betrag.*Betrag fehlt/);
  assert.equal(B.zweckVon(t.mitglieder[0], 'Beitrag 2027'), 'B27-17 Beitrag 2027 Ayse Yilmaz', 'Referenz vorn, Umlaute umgeschrieben');
  assert.match(B.ausTabelle([['Name', 'Ort']]).fehler[0], /Betrag/);
});

test('Abgleich: Referenz sicher, Name als Rückfall (Groß/ue), Teilzahlungen addiert, fremde Gutschrift bleibt übrig', () => {
  const t = B.ausTabelle(liste, { praefix: 'B27' });
  const csv = 'Buchungstag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck;Betrag\n05.01.2027;Ayse Yilmaz;B27-17 Beitrag 2027 Ayse Yilmaz;60,00\n06.01.2027;MAX MUELLER;Mitgliedsbeitrag;20,00\n08.01.2027;Max Mueller;Rest;10,00\n07.01.2027;Fremd GmbH;Rechnung 4711;99,00\n09.01.2027;Verein;Gebuehr;-5,00\n';
  const a = B.abgleich(t.mitglieder, Bank.parse(csv, 'k.csv'));
  const by = Object.fromEntries(a.mitglieder.map(m => [m.name, m]));
  assert.equal(by['Ayşe Yılmaz'].status, 'bezahlt'); assert.equal(by['Ayşe Yılmaz'].sicher, true);
  assert.equal(by['Max Müller'].status, 'bezahlt', '20 + 10'); assert.equal(by['Max Müller'].sicher, false);
  assert.equal(by['Erika Muster'].status, 'offen'); assert.equal(by['Erika Muster'].offen, 45);
  assert.deepEqual(a.anzahl, { bezahlt: 2, teilweise: 0, offen: 1 }); assert.equal(a.nichtZugeordnet, 1);
  assert.deepEqual(a.summe, { soll: 135, offen: 45, eingang: 90 });
  // zwei Mitglieder mit gleichem Namen: Zahlung ohne Referenz wird nicht geraten
  const zwei = B.ausTabelle([['Name', 'Beitrag'], ['Anna Schmidt', '10'], ['Anna Schmidt', '10']]).mitglieder;
  const z = B.abgleich(zwei, [{ date: '2027-01-02', amount: 10, name: 'Anna Schmidt', purpose: 'Beitrag' }]);
  assert.equal(z.anzahl.offen, 2); assert.equal(z.nichtZugeordnet, 1);
  const csvOffen = B.offenCsv(a); assert.match(csvOffen, /^﻿Name;Referenz;Soll;Eingang;Offen;Stand;E-Mail\r\nErika Muster;B27-18;45,00;0,00;45,00;offen;\r\n$/);
});

test('PDF: Beitragsrechnung mit lesbarem GiroCode-Inhalt, Übersicht, Erinnerung nur mit offenem Betrag', async () => {
  const t = B.ausTabelle(liste, { praefix: 'B27' });
  let qrPayload = []; const qrSpy = p => { qrPayload.push(p); return qr(p); };
  const d = await L.PDFDocument.load(await B.aufforderung(L, v, t.mitglieder, { qr: qrSpy, epc: Q.epc, fontkit, regular, bold }));
  assert.equal(d.getPageCount(), 3); assert.match(d.getTitle(), /^Beitragsrechnung – Beitrag 2027 – TV Paderborn/);
  assert.ok(qrPayload.includes('BCD\n002\n1\nSCT\n\nTV Paderborn 1900 e.V.\nDE89370400440532013000\nEUR60.00\n\n\nB27-17 Beitrag 2027 Ayse Yilmaz'));
  const a = B.abgleich(t.mitglieder, [{ date: '2027-01-06', amount: 20, name: 'Max Müller', purpose: 'Beitrag' }]);
  const u = await L.PDFDocument.load(await B.uebersicht(L, v, a, { fontkit, regular, bold })); assert.equal(u.getPageCount(), 1);
  qrPayload = [];
  const er = await L.PDFDocument.load(await B.aufforderung(L, v, a.mitglieder.filter(m => m.status !== 'bezahlt'), { qr: qrSpy, epc: Q.epc, fontkit, regular, bold, erinnerung: true }));
  assert.equal(er.getPageCount(), 3); assert.match(er.getTitle(), /^Zahlungserinnerung/);
  assert.ok(qrPayload.some(p => p.includes('EUR10.00')), 'Max: nur der offene Rest');
  const raw = Buffer.from(await B.aufforderung(L, v, t.mitglieder.slice(2, 3), {})).toString('latin1');
  assert.doesNotMatch(raw, /\/JavaScript|\/JS\s/);
});

test('Oberfläche angebunden', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pro.js'), 'utf8'), sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.match(html, /id="btnBw"/); assert.match(html, /<script src="js\/beitrag\.js"><\/script>/); assert.match(sw, /'js\/beitrag\.js'/);
  assert.match(src, /Beitrag\.abgleich\(bwListe, txs\)/); assert.match(src, /erinnerung: true/);
});
