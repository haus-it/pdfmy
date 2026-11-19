# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
"""Ersatzschrift für Chinesisch, Japanisch und Koreanisch (vendor/cjk/PDFMyCJK-Regular.ttf.gz) aus Noto Sans CJK SC erzeugen.

Warum umwandeln: Noto Sans CJK ist eine CID-CFF-Schrift. Beim Bilden der Teilmenge (pdf-lib/fontkit) gehen dort bei einzelnen Zeichen
Unterprogramme verloren – das Zeichen ist im PDF leer (gefunden 19.11.2026 an „漢“). TrueType-Umrisse (glyf) teilt fontkit zuverlässig,
wie bei DejaVu. Deshalb: CFF → quadratische Kurven (cu2qu, Toleranz 1 Einheit), nur die Bereiche für CJK, ohne Layout- und Vertikaltabellen
(waagerechter Satz braucht sie nicht), Zeichendaten auf 4 Byte aufgefüllt (fontkit kürzt mit kurzen Offsets – ungerade Längen zerstören die
Teilmenge, gefunden bei WOFF2). Ausgeliefert als .ttf.gz; der Browser entpackt (DecompressionStream). Lädt nur bei Bedarf.
Lizenz: SIL Open Font License 1.1 – die Schrift ist umbenannt (Reserved Font Name „Noto“ darf eine geänderte Fassung nicht tragen).

Aufruf:  python -I tools/cjk-schrift.py <NotoSansCJKsc-Regular.otf> vendor/cjk/PDFMyCJK-Regular.ttf.gz
Quelle:  https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
"""
import io, sys
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools import subset

src, dst = sys.argv[1], sys.argv[2]

# Unicode-Bereiche: Satzzeichen und Kana, Hangul, CJK-Ideogramme (Basis, Erweiterung A, Kompatibilität), Halb-/Vollbreite
BEREICHE = [(0x2E80, 0x2FDF), (0x3000, 0x30FF), (0x3100, 0x31FF), (0x3200, 0x33FF), (0x3400, 0x4DBF), (0x4E00, 0x9FFF),
            (0xA960, 0xA97F), (0xAC00, 0xD7FF), (0x1100, 0x11FF), (0x3130, 0x318F), (0xF900, 0xFAFF), (0xFE30, 0xFE4F), (0xFF00, 0xFFEF)]

f = TTFont(src)
opts = subset.Options()
opts.layout_features = []            # Layouttabellen entfallen (unten)
opts.name_IDs = ['*']
opts.notdef_outline = True
opts.desubroutinize = True
s = subset.Subsetter(opts)
s.populate(unicodes=[u for a, b in BEREICHE for u in range(a, b + 1)])
s.subset(f)

# CFF → glyf
order = f.getGlyphOrder()
gs = f.getGlyphSet()
glyf = newTable('glyf'); glyf.glyphOrder = order; glyf.glyphs = {}
for name in order:
    pen = TTGlyphPen(gs)
    gs[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
    glyf.glyphs[name] = pen.glyph()
glyf.padding = 4
f['glyf'] = glyf
f['loca'] = newTable('loca')
for t in ('CFF ', 'VORG', 'GSUB', 'GPOS', 'GDEF', 'BASE', 'JSTF', 'vhea', 'vmtx', 'DSIG'):
    if t in f: del f[t]
maxp = f['maxp']; maxp.tableVersion = 0x00010000
for k in ('maxZones', 'maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs', 'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements'):
    setattr(maxp, k, 0)
maxp.maxZones = 1
f['head'].indexToLocFormat = 1
f['head'].glyphDataFormat = 0
post = f['post']; post.formatType = 3.0; post.extraNames = []; post.mapping = {}
if hasattr(post, 'glyphOrder'): post.glyphOrder = None
f.sfntVersion = '\x00\x01\x00\x00'

# Umbenennen (OFL: geänderte Fassung ohne Reserved Font Name), Herkunft im Copyright-/Lizenzfeld behalten
for rec in f['name'].names:
    if rec.nameID in (1, 4, 16):
        rec.string = 'PDFMy CJK'
    elif rec.nameID == 6:
        rec.string = 'PDFMyCJK-Regular'
    elif rec.nameID == 3:
        rec.string = 'PDFMy CJK Regular; abgeleitet von Noto Sans CJK SC (SIL OFL 1.1)'
f['OS/2'].fsType = 0   # einbettbar (OFL)

import gzip
buf = io.BytesIO(); f.save(buf)
with open(dst, 'wb') as out: out.write(gzip.compress(buf.getvalue(), 9, mtime=0))
print('fertig:', dst, len(order), 'Glyphen')
