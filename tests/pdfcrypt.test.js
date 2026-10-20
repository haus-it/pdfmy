// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// Passwortschutz AES-256, ISO 32000-2 Revision 6
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../js/pdfcrypt.js');

test('Hash 2.B: 32 Byte, deterministisch, abhängig von Passwort und Salz', async () => {
  const s = new Uint8Array(8).fill(7), a = await P.hash2B(P.pwBytes('geheim'), s, new Uint8Array(0));
  assert.equal(a.length, 32);
  assert.deepEqual(a, await P.hash2B(P.pwBytes('geheim'), s, new Uint8Array(0)));
  assert.notDeepEqual(a, await P.hash2B(P.pwBytes('Geheim'), s, new Uint8Array(0)));
  assert.notDeepEqual(a, await P.hash2B(P.pwBytes('geheim'), new Uint8Array(8).fill(8), new Uint8Array(0)));
});

test('Einträge U/UE/O/OE: Längen und Rückgewinnung des Dateischlüssels', async () => {
  const fk = crypto.getRandomValues(new Uint8Array(32)), e = await P.entries('Müller 2026', 'Eigentümer!', fk);
  assert.deepEqual([e.U.length, e.UE.length, e.O.length, e.OE.length], [48, 32, 48, 32]);
  assert.deepEqual(await P.fileKeyFor('Müller 2026', e), fk);       // Benutzerpasswort
  assert.deepEqual(await P.fileKeyFor('Eigentümer!', e), fk);       // Eigentümerpasswort
  assert.equal(await P.fileKeyFor('falsch', e), null);
  assert.deepEqual(await P.fileKeyFor('Müller 2026', e), fk); // andere Unicode-Schreibweise des „ü“
});

test('Passwort höchstens 127 Byte (ISO 32000-2)', () => {
  assert.equal(P.pwBytes('x'.repeat(200)).length, 127);
});
