// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Gleichzeitig unterschreiben – Stufen (app-v247, js/sigreq.js): Stufen anlegen, wer ist dran, E-Mails, Zusammenführen beim Absender
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../js/sigreq.js');

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
// Max und Eva gleichzeitig (Stufe 1), danach die Bank (Stufe 2)
const base = (o = {}) => {
  const r = R.create({ title: 'Gesellschaftsvertrag', requester: { name: 'Anna', email: 'anna@firma.de' }, signers: [{ name: 'Max', email: 'max@x.de' }, { name: 'Eva', email: 'eva@x.de', par: true }, { name: 'Bank', email: 'bank@y.de' }], ...o });
  r.fields.push({ s: 0, t: 'sign', page: 0, x: 0.1, y: 0.8, w: 0.3, h: 0.06 }, { s: 1, t: 'sign', page: 0, x: 0.6, y: 0.8, w: 0.3, h: 0.06 }, { s: 1, t: 'date', page: 0, x: 0.6, y: 0.9, w: 0.16, h: 0.025 }, { s: 2, t: 'sign', page: 1, x: 0.1, y: 0.8, w: 0.3, h: 0.06 });
  return r;
};

test('Ohne „gleichzeitig“ bleibt die Anfrage wie bisher (kein Feld g, eine Person je Stufe)', () => {
  const r = R.create({ title: 'T', requester: { name: 'A', email: 'a@x.de' }, signers: [{ name: 'B', email: 'b@x.de' }, { name: 'C', email: 'c@x.de', par: false }] });
  assert.deepEqual(r.signers.map(s => Object.keys(s)), [['name', 'email', 'status', 'signedAt', 'hash'], ['name', 'email', 'status', 'signedAt', 'hash']]);
  assert.equal(R.parallel(r), false); assert.deepEqual(R.open(r), [0]); assert.equal(R.together(r, 0), false);
  assert.equal(R.backToSender(R.markSigned(r, 0), 0), false);
  // „gleichzeitig“ bei der ersten Person ist bedeutungslos
  const r1 = R.create({ title: 'T', requester: { email: 'a@x.de' }, signers: [{ name: 'B', email: 'b@x.de', par: true }] });
  assert.equal(r1.signers[0].g, undefined);
});

test('Stufen: anlegen, wer ist dran, nächste Stufe erst nach allen, Vorlage und Speichern', () => {
  let r = base();
  assert.deepEqual(r.signers.map(s => s.g), [0, 0, 1]);
  assert.equal(R.parallel(r), true); assert.deepEqual(R.stages(r), [0, 1]); assert.equal(R.stageNo(r, 2), 2);
  assert.deepEqual(R.open(r), [0, 1]); assert.equal(R.next(r), 0); assert.equal(R.afterStage(r, 0), 2);
  r = R.markSentOpen(r, '2026-11-12T08:00:00Z');
  assert.ok(r.signers[0].sentAt && r.signers[1].sentAt && !r.signers[2].sentAt);
  const w = R.waiting(r, new Date('2026-11-12T12:00:00Z'));
  assert.equal(w.name, 'Max, Eva'); assert.equal(w.after, 'Bank'); assert.deepEqual(w.open, [0, 1]);
  // Eva zuerst: Max ist weiter offen, die Bank noch nicht dran
  const e = R.markSigned(r, 1);
  assert.deepEqual(R.open(e), [0]); assert.equal(R.backToSender(e, 1), true);
  const both = R.markSigned(e, 0);
  assert.deepEqual(R.open(both), [2]); assert.equal(R.backToSender(both, 0), false);
  // Speichern und wieder lesen: Stufen bleiben, Bild nur bei Unterschriftsfeldern und nur gültig
  const x = R.parse(R.serialize({ ...r, fields: r.fields.map((f, k) => k === 1 ? { ...f, img: IMG } : k === 2 ? { ...f, img: IMG } : k === 0 ? { ...f, img: 'data:text/html;base64,PHNjcmlwdD4=' } : f) }));
  assert.deepEqual(x.signers.map(s => s.g), [0, 0, 1]);
  assert.equal(x.fields[1].img, IMG); assert.equal(x.fields[2].img, undefined); assert.equal(x.fields[0].img, undefined);
  // Beschädigte Stufen → wieder nacheinander
  const bad = R.parse(R.serialize({ ...r, signers: r.signers.map((s, i) => ({ ...s, g: [1, 0, 3][i] })) }));
  assert.ok(bad.signers.every(s => s.g === undefined)); assert.deepEqual(R.open(bad), [0]);
  // Vorlage merkt „gleichzeitig“
  const t = R.template(r, 'GV');
  assert.deepEqual(t.signers.map(s => !!s.par), [false, true, false]);
  assert.deepEqual(R.create({ title: 'T', requester: {}, signers: t.signers }).signers.map(s => s.g), [0, 0, 1]);
});

test('E-Mails: eine an alle der Stufe, zurück an den Absender, danach an die nächste Stufe', () => {
  let r = R.markSentOpen(base());
  const m = R.mail(r);
  assert.equal(m.to, 'max@x.de, eva@x.de'); assert.equal(m.cc, 'anna@firma.de');
  assert.match(m.body, /^Guten Tag,/); assert.match(m.body, /Gleichzeitig unterschreiben: Max, Eva\./);
  assert.match(m.body, /„Unterschrieben – zurücksenden“/); assert.doesNotMatch(m.body, /Person 1 von 3/);
  // nur eine Person (z. B. nach Weitergeben)
  assert.equal(R.mail(r, { who: [1] }).to, 'eva@x.de');
  // Max unterschreibt: zurück an Anna
  r = R.markSigned(r, 0, { hash: 'a'.repeat(64) });
  const b = R.mail(r, { back: 0 });
  assert.equal(b.to, 'anna@firma.de'); assert.match(b.subject, /^Unterschrieben, bitte zusammenführen: /);
  assert.match(b.body, /Max hat „Gesellschaftsvertrag“ unterschrieben\./); assert.match(b.body, /In dieser Fassung fehlt noch: Eva\./);
  // nach beiden: die Bank allein, mit „Bereits unterschrieben“
  r = R.markSigned(r, 1); r = R.markSentOpen(r);
  const n = R.mail(r);
  assert.equal(n.to, 'bank@y.de'); assert.match(n.body, /Person 3 von 3/); assert.match(n.body, /Bereits unterschrieben: Max, Eva\./);
  assert.match(n.body, /„Unterschrieben – weitersenden“ klicken\. PDFMy bereitet die E-Mail zurück an Anna vor\./);
  // Absender selbst in der Stufe: keine Kopie an sich selbst
  const own = R.create({ title: 'T', requester: { name: 'Anna', email: 'anna@firma.de' }, signers: [{ name: 'Anna', email: 'anna@firma.de' }, { name: 'Max', email: 'max@x.de', par: true }] });
  const om = R.mail(own); assert.equal(om.to, 'anna@firma.de, max@x.de'); assert.equal(om.cc, ''); assert.equal(om.notify, '');
});

test('Zusammenführen: Stand, Werte, Bild und Protokoll der anderen Fassung; Bild danach entfernt; Fehler bei fremder Fassung', () => {
  const sent = R.markSentOpen(base(), '2026-11-12T08:00:00Z');
  // Max' Fassung (Grundlage) und Evas Fassung (Kopie)
  const maxCopy = R.markSigned(sent, 0, { hash: 'a'.repeat(64), at: '2026-11-12T09:00:00Z' });
  maxCopy.fields[0].img = IMG;
  const evaCopy = R.markSigned(sent, 1, { hash: 'a'.repeat(64), at: '2026-11-12T10:00:00Z' });
  evaCopy.fields[1].img = IMG; evaCopy.fields[2].v = '12.11.2026';
  const evaR = R.parse(R.serialize(evaCopy));
  const { r, added } = R.merge(maxCopy, [{ r: evaR, ret: 'b'.repeat(64) }], { at: '2026-11-12T11:00:00Z', by: 'Anna' });
  assert.equal(added.length, 1); assert.equal(added[0].i, 1); assert.deepEqual(added[0].fields, [1, 2]); assert.equal(added[0].imgs[1], IMG);
  assert.equal(r.signers[1].status, R.DONE); assert.equal(r.signers[1].ret, 'b'.repeat(64)); assert.equal(r.signers[1].g, 0);
  assert.equal(r.fields[2].v, '12.11.2026');
  assert.ok(r.fields.every(f => !f.img), 'Bilder nach vollständiger Stufe entfernt');
  assert.deepEqual(R.open(r), [2]);
  // Protokoll: beide Unterschriften in zeitlicher Reihenfolge, dann „zusammengeführt“
  const whats = r.log.map(l => `${l.what}:${l.by}`);
  assert.ok(whats.indexOf('unterschrieben:Max') < whats.indexOf('unterschrieben:Eva'));
  assert.deepEqual(r.log.at(-1), { at: '2026-11-12T11:00:00Z', what: 'zusammengeführt', by: 'Anna', to: 'Eva' });
  assert.equal(r.log.filter(l => l.what === 'gesendet').length, 2, 'gemeinsame Einträge nicht doppelt');
  // Prüfprotokoll: Stufen und Rücksende-Prüfsumme
  const lines = R.auditLines(r).map(([, t]) => t).join('\n');
  assert.match(lines, /Stufe 1 von 2 – gleichzeitig mit Eva/); assert.match(lines, /Stufe 2 von 2/);
  assert.match(lines, /SHA-256 der zurückgesandten Fassung: b{64}/); assert.match(lines, /zusammengeführt \(gleichzeitig unterschriebene Fassungen\) – Anna → Eva/);
  // Nichts Neues: unverändert
  assert.equal(R.merge(r.signers[1].status ? maxCopy : maxCopy, [{ r: R.parse(R.serialize(sent)) }]).added.length, 0);
  // Fremde Anfrage
  assert.throws(() => R.merge(maxCopy, [{ r: { ...evaR, id: 'anders' } }]), /gehört nicht zu dieser Anfrage/);
  // Letzte Stufe gleichzeitig: Zusammenführen schließt ab
  const last = R.create({ title: 'T', requester: { name: 'A', email: 'a@x.de' }, signers: [{ name: 'B', email: 'b@x.de' }, { name: 'C', email: 'c@x.de', par: true }] });
  const done = R.merge(R.markSigned(last, 0), [{ r: R.markSigned(last, 1) }]).r;
  assert.equal(R.complete(done), true); assert.equal(done.log.at(-1).what, 'abgeschlossen');
});

test('Weitergeben in einer gleichzeitigen Stufe: Vertretung bleibt in der Stufe', () => {
  const r = R.delegate(R.markSentOpen(base()), 1, { name: 'Vera', email: 'vera@x.de', reason: 'Urlaub' });
  assert.equal(r.signers[1].g, 0); assert.deepEqual(R.open(r), [0, 1]);
  assert.equal(R.mail(r, { who: [1] }).to, 'vera@x.de');
});
