// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.Tools = require('../js/tools.js');
const Pptx = require('../js/pptx.js');

// kleinstes gültiges JPEG (1×1 Pixel)
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64');

test('PowerPoint: Folien in Seitengröße, Bild und unsichtbarer Text (python-pptx)', () => {
  const bytes = Pptx.build([
    { jpeg: JPG, w: 595.28, h: 841.89, lines: [{ t: 'Angebot Nr. 4711', x: 0.1, y: 0.1, w: 0.5, h: 0.03 }, { t: 'Preis & <Rabatt>', x: 0.1, y: 0.2, w: 0.4, h: 0.02 }] },
    { jpeg: JPG, w: 841.89, h: 595.28, lines: [] },   // Querformat in Hochformat-Präsentation: eingepasst
  ], { title: 'Angebot', author: 'Mentor GmbH' });
  const f = path.join(os.tmpdir(), 'pdfmy-test.pptx'); fs.writeFileSync(f, bytes);
  const out = execFileSync('python', ['-I', '-c', `
import sys
from pptx import Presentation
sys.stdout.reconfigure(encoding="utf-8")
p = Presentation(sys.argv[1])
print(len(p.slides), p.slide_width, p.slide_height, p.core_properties.title)
for s in p.slides:
    kinds = [sh.shape_type for sh in s.shapes]
    texts = [sh.text_frame.text for sh in s.shapes if sh.has_text_frame]
    pics = [sh for sh in s.shapes if sh.shape_type == 13]
    print(len(pics), "|".join(texts), pics[0].left, pics[0].top, pics[0].width, pics[0].height)
`, f]).toString().trim().split(/\r?\n/);
  assert.equal(out[0], '2 7560056 10692003 Angebot');   // A4 hoch in EMU
  const [n1, t1] = out[1].split(' ');
  assert.equal(n1, '1'); assert.match(out[1], /Angebot Nr\. 4711\|Preis & <Rabatt>/);
  const s2 = out[2].split(' '); assert.equal(s2[0], '1');
  assert.ok(+s2[4] === 7560056 && +s2[5] < 10692003 && +s2[3] > 0, 'Querformat-Seite eingepasst und mittig: ' + out[2]);
});
