# Prüft pain.008-Dateien gegen das amtliche ISO-20022-Schema (Quelle: iso20022.org,
# https://www.iso20022.org/sites/default/files/documents/messages/pain/schemas/pain.008.001.08.xsd,
# SHA-256 7edf4e4ce34c47a5567af6a327e22af4ed4007f715822af9f353c94ecc10f5ba). Aufruf: python -I pruefe.py schema.xsd datei.xml ...
import sys
from lxml import etree
schema = etree.XMLSchema(etree.parse(sys.argv[1]))
fehler = 0
for f in sys.argv[2:]:
    if not schema.validate(etree.parse(f)):
        fehler += 1
        for e in schema.error_log: print(f, 'Zeile', e.line, e.message)
sys.exit(1 if fehler else 0)
