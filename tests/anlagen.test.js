// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Anlagen vom Unterzeichner (app-v246): „Bitte beifügen“, Anlage beifügen/entfernen, Prüfprotokoll, E-Mail, Bereinigen beim Lesen
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/sigreq.js');
const sha = c => c.repeat(64);
const base = () => S.create({ title: 'Mietvertrag', requester: { name: 'Anna', email: 'anna@firma.de' }, signers: [{ name: 'Max', email: 'max@kunde.de' }, { name: 'Eva', email: 'eva@kunde.de' }], attach: '  Kopie des Personalausweises\n' });

test('„Bitte beifügen“ wird gesäubert gespeichert und steht in der E-Mail', () => {
  const r = base();
  assert.equal(r.attach, 'Kopie des Personalausweises');
  assert.match(S.mail(r).body, /Bitte fügen Sie bei: Kopie des Personalausweises\. In PDFMy geht das mit „Anlage beifügen …“/);
  assert.equal(S.create({ title: 'X', signers: [{ name: 'A', email: 'a@b.de' }] }).attach, undefined);
});

test('Anlage beifügen: Name gesäubert, doppelte ignoriert, Protokoll, Höchstzahl', () => {
  let r = S.addAttachment(base(), 0, { name: 'Ausweis: Vorder/Rückseite.pdf', sha: sha('a'), size: 123456, at: '2026-11-12T10:00:00Z' });
  assert.deepEqual(r.signers[0].att, [{ name: 'Ausweis_ Vorder_Rückseite.pdf', sha: sha('a'), size: 123456, at: '2026-11-12T10:00:00Z' }]);
  assert.equal(r.log.at(-1).what, 'Anlage beigefügt'); assert.equal(r.log.at(-1).to, 'Ausweis_ Vorder_Rückseite.pdf');
  assert.equal(S.addAttachment(r, 0, { name: 'nochmal.pdf', sha: sha('a'), size: 1 }), r, 'gleicher Prüfwert = nichts tun');
  assert.throws(() => S.addAttachment(r, 0, { name: 'x.pdf', sha: 'kein-sha', size: 1 }), /ungültig/);
  for (let k = 1; k < 10; k++) r = S.addAttachment(r, 0, { name: `n${k}.pdf`, sha: k.toString(16).repeat(64).slice(0, 64), size: 1 });
  assert.equal(r.signers[0].att.length, 10);
  assert.throws(() => S.addAttachment(r, 0, { name: 'elf.pdf', sha: sha('f'), size: 1 }), /Höchstens 10/);
});

test('Nach der Unterschrift keine Anlage mehr; Entfernen nur vorher', () => {
  let r = S.addAttachment(base(), 0, { name: 'a.pdf', sha: sha('b'), size: 10 });
  const r2 = S.removeAttachment(r, 0, sha('b'));
  assert.equal(r2.signers[0].att, undefined); assert.ok(!r2.log.some(l => l.what === 'Anlage beigefügt'));
  r = S.markSigned(r, 0, { hash: sha('c') });
  assert.throws(() => S.addAttachment(r, 0, { name: 'b.pdf', sha: sha('d'), size: 1 }), /keine Anlage mehr/);
  assert.equal(S.removeAttachment(r, 0, sha('b')), r);
  assert.equal(r.signers[0].att.length, 1, 'Anlage bleibt bei der Unterschrift erhalten');
});

test('Prüfprotokoll: angeforderte Anlage, Name, Größe und SHA-256 je Anlage', () => {
  let r = S.addAttachment(base(), 1, { name: 'Vollmacht.pdf', sha: sha('e'), size: 2.5 * 1048576 });
  r = S.addAttachment(r, 1, { name: 'Foto.jpg', sha: sha('1'), size: 300 });
  const t = S.auditLines(r).map(x => x[1]).join('\n');
  assert.match(t, /Angeforderte Anlage: Kopie des Personalausweises/);
  assert.match(t, /Anlage: Vollmacht\.pdf \(2,5 MB\)/); assert.match(t, /Anlage: Foto\.jpg \(1 KB\)/);
  assert.match(t, new RegExp('SHA-256 der Anlage: ' + sha('e')));
  assert.match(t, /Anlage beigefügt – Eva → Vollmacht\.pdf/);
});

test('Lesen aus der PDF: ungültige Anlagen-Einträge fallen weg, gültige bleiben', () => {
  const r = base();
  r.signers[0].att = [{ name: 'ok.pdf', sha: sha('a'), size: 5 }, { name: '', sha: sha('b') }, { name: 'x.pdf', sha: '123' }, 'Unsinn'];
  r.signers[1].att = 'kein Array'; r.attach = '';
  const p = S.parse(JSON.stringify(r));
  assert.deepEqual(p.signers[0].att.map(a => a.name), ['ok.pdf']);
  assert.equal(p.signers[1].att, undefined); assert.equal(p.attach, undefined);
});
