// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Unterschriftsanfrage per E-Mail (js/sigreq.js)
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../js/sigreq.js');

const mk = () => R.create({ title: 'Mietvertrag Halle 2', requester: { name: 'Anna Absender', email: 'Anna@Firma.de' },
  signers: [{ name: 'Max Müller', email: 'max@example.com' }, { name: 'Erika Meier', email: 'erika@example.com' }, { name: '', email: '' }], message: 'Bitte bis Freitag.' });

test('Anlegen: leere Zeilen entfallen, Adressen klein, Status offen, Protokoll „angefragt“', () => {
  const r = mk();
  assert.equal(r.signers.length, 2); assert.equal(r.requester.email, 'anna@firma.de');
  assert.ok(r.signers.every(s => s.status === 'offen')); assert.equal(r.log[0].what, 'angefragt');
  assert.deepEqual(R.problems(r), []);
});

test('Prüfung: fehlende Namen, ungültige Adressen, eigene Adresse', () => {
  const r = R.create({ title: 'X', requester: { name: 'A' }, signers: [{ name: 'B', email: 'kaputt' }, { name: '', email: 'c@d.de' }] });
  const p = R.problems(r).join(' | ');
  assert.match(p, /E-Mail-Adresse von B/); assert.match(p, /Name von Person 2/); assert.match(p, /Ihre eigene E-Mail-Adresse/);
  assert.match(R.problems(R.create({ requester: { email: 'a@b.de' } })).join(), /Mindestens eine Person/);
});

test('Reihenfolge: wer ist dran, unterschreiben, Abschluss', () => {
  let r = mk();
  assert.equal(R.next(r), 0);
  r = R.markSigned(r, 0, { hash: 'abc', at: '2026-10-19T10:00:00Z' });
  assert.equal(R.next(r), 1); assert.equal(R.doneCount(r), 1); assert.equal(R.complete(r), false);
  r = R.markSigned(r, 1, { hash: 'def', at: '2026-10-19T11:00:00Z' });
  assert.equal(R.next(r), -1); assert.equal(R.complete(r), true);
  assert.deepEqual(r.log.map(l => l.what), ['angefragt', 'unterschrieben', 'unterschrieben', 'abgeschlossen']);
  assert.equal(r.signers[0].hash, 'abc');
});

test('Hin und zurück über JSON; ungültige Felder werden verworfen', () => {
  const r = mk(); r.fields.push({ s: 0, page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }, { s: 5, page: 0, x: 0, y: 0, w: 0.1, h: 0.1 }, { s: 1, page: 0, x: 2, y: 0, w: 0.1, h: 0.1 });
  const back = R.parse(R.serialize(r));
  assert.equal(back.id, r.id); assert.equal(back.fields.length, 1); assert.deepEqual(back.fields[0], { s: 0, t: 'sign', label: '', v: '', page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.06 });
  assert.equal(R.parse('kein json'), null); assert.equal(R.parse({ v: 2 }), null);
});

test('Übersicht fürs Posteingangsbuch', () => {
  let r = mk(); r = R.markSigned(r, 0, { at: '2026-10-19T10:00:00Z' });
  assert.match(R.summaryText(r), /^1\/2: Max Müller ✓ 19\.10\.2026, \d\d:00; Erika Meier offen$/);
});

test('E-Mails: erste Person, nächste Person mit Kopie an den Absender, Abschluss an den Absender', () => {
  let r = mk();
  let m = R.mail(r);
  assert.equal(m.to, 'max@example.com'); assert.equal(m.cc, ''); assert.match(m.subject, /^Bitte unterschreiben: Mietvertrag Halle 2$/);
  assert.match(m.body, /Person 1 von 2/); assert.match(m.body, /Bitte bis Freitag\./); assert.match(m.body, /an Erika Meier vor/);
  r = R.markSigned(r, 0, {}); m = R.mail(r);
  assert.equal(m.to, 'erika@example.com'); assert.equal(m.cc, 'anna@firma.de'); assert.match(m.body, /zurück an Anna Absender/); assert.match(m.body, /Bereits unterschrieben: Max Müller/);
  r = R.markSigned(r, 1, {}); m = R.mail(r);
  assert.equal(m.to, 'anna@firma.de'); assert.match(m.subject, /^Unterschrieben:/); assert.match(m.cc, /max@example\.com, erika@example\.com/);
});

test('Feldarten: werden übernommen, Unbekanntes wird Unterschrift; Wert und Bezeichnung reisen mit', () => {
  const r = mk(); r.fields.push({ s: 0, t: 'text', label: 'Anschrift', v: 'Hauptstr. 1', page: 0, x: 0.1, y: 0.1, w: 0.3, h: 0.03 }, { s: 1, t: 'unsinn', page: 0, x: 0.1, y: 0.2, w: 0.3, h: 0.06 });
  const back = R.parse(R.serialize(r));
  assert.deepEqual(back.fields.map(f => [f.t, f.label, f.v]), [['text', 'Anschrift', 'Hauptstr. 1'], ['sign', '', '']]);
  const r2 = mk(); r2.fields.push({ s: 0, t: 'text', label: 'Anschrift', v: '', page: 0, x: 0, y: 0, w: 0.1, h: 0.1 });
  assert.equal(R.missing(r2, 0).length, 1); assert.equal(R.missing(r2, 1).length, 0);
});

test('Ablehnen: Anfrage endet, E-Mail mit Begründung an den Absender, Übersicht', () => {
  let r = mk(); r = R.markSigned(r, 0, { at: '2026-10-19T10:00:00Z' });
  r = R.decline(r, 1, { reason: 'Miete zu hoch', at: '2026-10-19T12:00:00Z' });
  assert.equal(R.declined(r), 1); assert.equal(R.next(r), -1); assert.equal(R.complete(r), false);
  const m = R.mail(r);
  assert.equal(m.to, 'anna@firma.de'); assert.equal(m.cc, 'max@example.com'); assert.match(m.subject, /^Abgelehnt:/); assert.match(m.body, /Begründung: Miete zu hoch/);
  assert.match(R.summaryText(r), /Erika Meier abgelehnt .*„Miete zu hoch“/);
  assert.equal(r.log.at(-1).what, 'abgelehnt');
});

test('Prüfprotokoll: Überschrift, Personen mit Prüfsumme, Angaben, Ablauf, Hinweis', () => {
  let r = mk(); r.fields.push({ s: 0, t: 'text', label: 'Anschrift', v: 'Hauptstr. 1', page: 0, x: 0, y: 0, w: 0.1, h: 0.1 });
  r = R.markSigned(r, 0, { hash: 'aaa', at: '2026-10-19T10:00:00Z' }); r = R.markSigned(r, 1, { hash: 'bbb', at: '2026-10-19T11:00:00Z' });
  const L = R.auditLines(r, 'ccc'), txt = L.map(l => l[1]).join('\n');
  assert.equal(L[0][1], 'Prüfprotokoll – Unterschriftsanfrage');
  assert.match(txt, /Status: abgeschlossen/); assert.match(txt, /1\. Max Müller <max@example\.com>/); assert.match(txt, /SHA-256 der erhaltenen Fassung: aaa/);
  assert.match(txt, /Angaben: Anschrift: Hauptstr\. 1/); assert.match(txt, /– abgeschlossen/); assert.match(txt, /letzten Fassung vor dieser Seite: ccc/); assert.match(txt, /eIDAS/);
});

test('Feldvorschläge: Unterschriften der Reihe nach, Datum zur Unterschrift in derselben Zeile', () => {
  const spots = [{ kind: 'sign', page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.02 }, { kind: 'sign', page: 1, x: 0.6, y: 0.8, w: 0.3, h: 0.02 }, { kind: 'date', page: 1, x: 0.6, y: 0.75, w: 0.2, h: 0.02 }, { kind: 'date', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.02 }];
  const f = R.suggest(spots, 2);
  assert.deepEqual(f.filter(x => x.t === 'sign').map(x => [x.page, x.s]), [[1, 0], [1, 1]]);
  const d = f.filter(x => x.t === 'date');
  assert.equal(d.length, 1); assert.equal(d[0].s, 1);   // gehört zur rechten Unterschrift (gleiche Höhe), das Datum auf Seite 1 ohne Unterschrift entfällt
  assert.ok(f.every(x => x.y >= 0 && x.y + x.h <= 1.0001));
});

test('Frist: nur gültiges Datum, steht in der E-Mail; Erinnerung an die Person, die dran ist', () => {
  const r = R.create({ title: 'Vertrag', requester: { name: 'A', email: 'a@b.de' }, signers: [{ name: 'Max', email: 'm@x.de' }], due: '2026-10-30' });
  assert.equal(r.due, '2026-10-30'); assert.match(R.mail(r).body, /Bitte bis 30\.10\.2026\./); assert.match(R.mail(r).body, /Ohne PDFMy geht es auch/);
  assert.equal(R.create({ signers: [], due: '30.10.2026' }).due, undefined);
  assert.equal(R.parse(JSON.stringify({ ...r, due: 'kaputt' })).due, undefined);
  const m = R.reminder({ title: 'Vertrag', to: 'm@x.de', name: 'Max', due: '2026-10-30', from: 'Anna', attached: true });
  assert.equal(m.to, 'm@x.de'); assert.match(m.subject, /^Erinnerung: Bitte unterschreiben: Vertrag$/); assert.match(m.body, /Bitte bis 30\.10\.2026/); assert.match(m.body, /noch einmal an/); assert.match(m.body, /Anna$/);
});

test('Anderes PDF-Programm: Feldnamen eindeutig je Anfrage, Unterschrift wird so protokolliert', () => {
  const r = mk(); r.fields.push({ s: 0, t: 'sign', page: 0, x: 0, y: 0, w: 0.1, h: 0.1 });
  assert.equal(R.formField(r, R.formName(r, 0)), 0); assert.equal(R.formField(r, 'pdfmy_anders_0'), -1); assert.equal(R.formField(r, R.formName(r, 5)), -1); assert.equal(R.formField(r, 'Name'), -1);
  const s = R.markSigned(r, 0, { ext: true, at: '2026-10-19T10:00:00Z' });
  assert.equal(s.signers[0].ext, true); assert.equal(s.log.at(-1).what, 'unterschrieben (anderes PDF-Programm)');
  assert.match(R.auditLines(s).map(l => l[1]).join('\n'), /Unterschrieben in einem anderen PDF-Programm am/);
});

test('Vorlagen: Personen, Felder, Nachricht, Frist in Tagen; Frist wieder als Datum', () => {
  const today = new Date(2026, 9, 19);
  const r = R.create({ title: 'Mietvertrag', requester: { email: 'a@b.de' }, signers: [{ name: 'Max', email: 'm@x.de' }], message: 'Bitte zügig.', due: '2026-10-30' });
  r.fields.push({ s: 0, t: 'date', label: '', v: '19.10.2026', page: 1, x: 0.1, y: 0.2, w: 0.2, h: 0.03 });
  const t = R.template(r, '  Mietvertrag Standard ', f => f.page, today);
  assert.equal(t.name, 'Mietvertrag Standard'); assert.equal(t.days, 11); assert.equal(t.message, 'Bitte zügig.');
  assert.deepEqual(t.fields, [{ s: 0, t: 'date', label: '', page: 1, x: 0.1, y: 0.2, w: 0.2, h: 0.03 }]);   // Werte nicht in die Vorlage
  assert.equal(R.dueIn(11, today), '2026-10-30'); assert.equal(R.dueIn(0, today), '');
});

test('Zur Kenntnis: Adressen bereinigt und geprüft, Kopie nur beim Ergebnis, im Protokoll und in der Vorlage', () => {
  let r = R.create({ title: 'Vertrag', requester: { name: 'A', email: 'a@b.de' }, signers: [{ name: 'Max', email: 'm@x.de' }], cc: ' Steuer@Kanzlei.de; buchhaltung@firma.de, steuer@kanzlei.de ' });
  assert.deepEqual(r.cc, ['steuer@kanzlei.de', 'buchhaltung@firma.de']); assert.deepEqual(R.problems(r), []);
  assert.match(R.problems(R.create({ requester: { email: 'a@b.de' }, signers: [{ name: 'M', email: 'm@x.de' }], cc: 'kaputt' })).join(), /Zur Kenntnis“: kaputt/);
  assert.doesNotMatch(R.mail(r).cc, /kanzlei/);   // die unterschreibende Person bekommt keine Kopie-Empfänger
  r = R.markSigned(r, 0, {}); assert.match(R.mail(r).cc, /m@x\.de, steuer@kanzlei\.de, buchhaltung@firma\.de/);
  const d = R.decline(R.create({ requester: { email: 'a@b.de' }, signers: [{ name: 'M', email: 'm@x.de' }], cc: 'k@k.de' }), 0, {});
  assert.match(R.mail(d).cc, /k@k\.de/);
  assert.match(R.auditLines(r).map(l => l[1]).join('\n'), /Zur Kenntnis: steuer@kanzlei\.de, buchhaltung@firma\.de/);
  assert.deepEqual(R.template(r, 'V').cc, ['steuer@kanzlei.de', 'buchhaltung@firma.de']);
  assert.deepEqual(R.parse(R.serialize(r)).cc, ['steuer@kanzlei.de', 'buchhaltung@firma.de']);
});

test('E-Mails übersetzbar: tr bekommt Sätze mit Platzhaltern, Werte werden danach eingesetzt und nicht übersetzt', () => {
  const dict = { 'Bitte unterschreiben: {0}': 'Please sign: {0}', 'Guten Tag {0},': 'Hello {0},', 'Viele Grüße': 'Kind regards', 'Bitte bis {0}.': 'Please by {0}.' };
  const seen = []; const tr = s => { seen.push(s); return dict[s] || s; };
  const r = R.create({ title: 'Viele Grüße', requester: { name: 'Anna', email: 'a@b.de' }, signers: [{ name: 'Max', email: 'm@x.de' }], due: '2026-10-30' });
  const m = R.mail(r, { tr });
  assert.equal(m.subject, 'Please sign: Viele Grüße');   // Titel bleibt, obwohl er wie ein Satz aussieht
  assert.match(m.body, /^Hello Max,/); assert.match(m.body, /Please by 30\.10\.2026\./); assert.match(m.body, /Kind regards\nAnna$/);
  assert.ok(seen.every(s => !s.includes('Max') && !s.includes('30.10.2026')), 'nur Vorlagen an tr, keine Werte');
  assert.match(R.reminder({ title: 'X', name: 'Max', tr }).body, /^Hello Max,/);
});
