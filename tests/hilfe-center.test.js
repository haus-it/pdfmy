// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Hilfe-Center (app-v346): bebilderte Anleitungen in Themengruppen (tools/site/hilfe.html). Prüft, dass jede Kachel zu einer
// Anleitung führt, jede Anleitung Bild + Schritte hat und die Bilder in Deutsch und Englisch vorliegen – mit den richtigen Maßen
// (width/height im HTML = echte Bildgröße, sonst springt die Seite beim Laden).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const SITE = path.join(__dirname, '..', 'tools', 'site'), H = fs.readFileSync(path.join(SITE, 'hilfe.html'), 'utf8');
const sec = H.slice(H.indexOf('<section class="hsec" id="anleitungen">'), H.indexOf('</section>', H.indexOf('id="anleitungen"')));

// Breite/Höhe aus dem WebP-Kopf (VP8, VP8L, VP8X)
function webpSize(b) {
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const t = b.toString('ascii', 12, 16);
  if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (t === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  if (t === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  throw new Error('unbekanntes WebP: ' + t);
}

const arts = [...sec.matchAll(/<article class="hguide" id="([a-z-]+)"><h3>([^<]+)<\/h3>([\s\S]*?)<\/article>/g)].map(m => ({ id: m[1], title: m[2], body: m[3] }));
const cards = [...sec.matchAll(/<a class="hcard" href="#([a-z-]+)">/g)].map(m => m[1]);

test('Hilfe-Center: mindestens 18 Anleitungen in Themengruppen, jede Kachel führt zu einer Anleitung', () => {
  assert.ok(arts.length >= 18, 'Anleitungen: ' + arts.length);
  assert.ok((sec.match(/class="hgroup"/g) || []).length >= 5, 'Themengruppen');
  assert.deepEqual([...cards].sort(), arts.map(a => a.id).sort(), 'Kacheln und Anleitungen passen zusammen');
  assert.equal(new Set(arts.map(a => a.id)).size, arts.length, 'IDs eindeutig');
  // Reihenfolge der Anleitungen folgt den Kacheln
  assert.deepEqual(arts.map(a => a.id), cards);
});

test('Hilfe-Center: jede Anleitung hat Bild mit Beschreibung, nummerierte Schritte und passende Bildmaße (de + en)', () => {
  for (const a of arts) {
    const img = a.body.match(/<img src="hilfe-bilder\/de\/([a-z]+)\.webp" width="(\d+)" height="(\d+)"[^>]*alt="([^"]{20,})"/);
    assert.ok(img, a.id + ': Bild mit Maßen und Beschreibung');
    assert.match(a.body, /<a href="hilfe-bilder\/de\/[a-z]+\.webp" class="hshot">/, a.id + ': Vergrößern');
    const steps = (a.body.match(/<ol class="hsteps">([\s\S]*?)<\/ol>/) || [])[1] || '';
    assert.ok((steps.match(/<li>/g) || []).length >= 2, a.id + ': mindestens zwei Schritte');
    for (const l of ['de', 'en']) {
      const f = path.join(SITE, 'hilfe-bilder', l, img[1] + '.webp');
      assert.ok(fs.existsSync(f), `${l}/${img[1]}.webp fehlt`);
      assert.deepEqual(webpSize(fs.readFileSync(f)), [+img[2], +img[3]], `${l}/${img[1]}.webp: Maße wie im HTML`);
      assert.ok(fs.statSync(f).size < 250000, `${l}/${img[1]}.webp: klein genug fürs Handy`);
    }
  }
});

test('Hilfe-Center: Verweise „Mehr …“ zeigen auf vorhandene Abschnitte', () => {
  const ids = new Set([...H.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  for (const a of arts) for (const m of a.body.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(m[1]), `${a.id}: #${m[1]} fehlt`);
});
