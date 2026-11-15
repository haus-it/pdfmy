# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# LibreOffice-Erweiterung „In PDFMy öffnen“ (app-v256): speichert das offene Dokument (Writer, Calc, Impress, Draw) als PDF
# in einen Arbeitsordner auf diesem Rechner und öffnet es über pdfmy Scan in PDFMy im Browser – wie ein Doppelklick auf eine PDF.
# Kein Upload: pdfmy Scan gibt die Datei nur über 127.0.0.1 an PDFMy heraus. Ohne pdfmy Scan: Ordner zeigen und pdfmy.de öffnen.
import os
import re
import subprocess
import sys
import tempfile
import time

import uno
from com.sun.star.beans import PropertyValue

# Texte in allen Sprachen – beim Bauen eingesetzt (tools/addins.js aus i18n/site/<code>.json)
TEXTE = {'de': {'loNoFilter': '', 'loExportFailed': '', 'loNoScan': ''}}   # __TEXTE__ (wird beim Bauen ersetzt)

FILTERS = (   # Dienst des Dokuments → PDF-Filter
    ('com.sun.star.text.TextDocument', 'writer_pdf_Export'),
    ('com.sun.star.text.WebDocument', 'writer_web_pdf_Export'),
    ('com.sun.star.sheet.SpreadsheetDocument', 'calc_pdf_Export'),
    ('com.sun.star.presentation.PresentationDocument', 'impress_pdf_Export'),
    ('com.sun.star.drawing.DrawingDocument', 'draw_pdf_Export'),
)


def _prop(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


def _lang(ctx):
    try:
        cp = ctx.ServiceManager.createInstanceWithContext('com.sun.star.configuration.ConfigurationProvider', ctx)
        node = cp.createInstanceWithArguments('com.sun.star.configuration.ConfigurationAccess', (_prop('nodepath', '/org.openoffice.Setup/L10N'),))
        return node.getByName('ooLocale') or 'de'
    except Exception:
        return 'de'


def _t(ctx, key, *args):
    loc = _lang(ctx)
    table = TEXTE.get(loc) or TEXTE.get(loc.split('-')[0]) or next((v for k, v in TEXTE.items() if k.split('-')[0] == loc.split('-')[0]), None) or TEXTE['de']
    s = table.get(key) or TEXTE['de'][key]
    for i, a in enumerate(args):
        s = s.replace('{%d}' % i, str(a))
    return s


def _message(ctx, frame, text, error=False):
    try:
        toolkit = ctx.ServiceManager.createInstanceWithContext('com.sun.star.awt.Toolkit', ctx)
        from com.sun.star.awt.MessageBoxType import ERRORBOX, INFOBOX
        if frame is None:
            raise RuntimeError('kein Fenster')
        box = toolkit.createMessageBox(frame.getContainerWindow(),ERRORBOX if error else INFOBOX, 1, 'PDFMy', text)
        box.execute()
    except Exception:
        print(text, file=sys.stderr)


def _workdir():
    # Nicht unter „Dokumente“: der Ordner liegt oft in OneDrive und würde die Datei ungefragt hochladen (wie pdfmy Scan „Office“)
    if os.name == 'nt':
        base = os.path.join(os.environ.get('LOCALAPPDATA') or tempfile.gettempdir(), 'PDFMy', 'Office')
    elif sys.platform == 'darwin':
        base = os.path.expanduser('~/Library/Caches/PDFMy/Office')
    else:
        base = os.path.join(os.environ.get('XDG_CACHE_HOME') or os.path.expanduser('~/.cache'), 'pdfmy', 'office')
    os.makedirs(base, exist_ok=True)
    # Alte Übergaben nach einem Tag aufräumen
    for f in os.listdir(base):
        p = os.path.join(base, f)
        try:
            if os.path.isfile(p) and time.time() - os.path.getmtime(p) > 86400:
                os.remove(p)
        except OSError:
            pass
    return base


def _name(doc):
    url = doc.getURL()
    title = uno.fileUrlToSystemPath(url) if url.startswith('file:') else (doc.getTitle() if hasattr(doc, 'getTitle') else '') or 'Dokument'
    base = re.sub(r'\.[^.\\/]+$', '', os.path.basename(title)).strip() or 'Dokument'
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', base)[:120] + '.pdf'


def export_pdf(doc):
    """Dokument als PDF in den Arbeitsordner speichern; gibt den Pfad zurück."""
    flt = next((f for s, f in FILTERS if doc.supportsService(s)), None)
    if not flt:
        raise ValueError('kein-filter')
    path = os.path.join(_workdir(), _name(doc))
    if os.path.exists(path):   # gleiche Datei noch offen in PDFMy → neuer Name statt überschreiben
        stem, n = path[:-4], 2
        while os.path.exists('%s (%d).pdf' % (stem, n)):
            n += 1
        path = '%s (%d).pdf' % (stem, n)
    doc.storeToURL(uno.systemPathToFileUrl(path), (_prop('FilterName', flt),))
    return path


def _hand_over(path):
    """PDF über pdfmy Scan in PDFMy öffnen. True, wenn pdfmy Scan gefunden wurde."""
    if os.environ.get('PDFMY_TEST_NOOPEN'):   # Test: nur exportieren, Pfad melden
        with open(os.environ['PDFMY_TEST_NOOPEN'], 'w', encoding='utf-8') as f:
            f.write(path)
        return True
    if os.name == 'nt':
        for d in (os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'pdfmy Scan'), os.path.join(os.environ.get('ProgramFiles', r'C:\Program Files'), 'pdfmy Scan')):
            exe = os.path.join(d, 'pdfmy-Scan.exe')
            if os.path.isfile(exe):
                subprocess.Popen([exe, '--open', path], close_fds=True, creationflags=0x08000000)   # CREATE_NO_WINDOW
                return True
        return False
    if sys.platform == 'darwin':
        if os.path.isdir(os.path.expanduser('~/Applications/PDFMy.app')):
            subprocess.Popen(['/usr/bin/open', '-a', os.path.expanduser('~/Applications/PDFMy.app'), path])
            return True
        return False
    for cmd in ('/opt/pdfmy-scan/pdfmy-open', os.path.join(os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share'), 'pdfmy-scan', 'pdfmy-open')):
        if os.access(cmd, os.X_OK):
            subprocess.Popen([cmd, path], start_new_session=True)
            return True
    return False


def _open_folder_and_site(path):
    try:
        if os.name == 'nt':
            subprocess.Popen(['explorer', '/select,', path])
        elif sys.platform == 'darwin':
            subprocess.Popen(['/usr/bin/open', '-R', path])
        else:
            subprocess.Popen(['xdg-open', os.path.dirname(path)])
    except Exception:
        pass
    import webbrowser
    webbrowser.open('https://pdfmy.de/')


def open_in_pdfmy(*args):
    """Menü „Datei → In PDFMy öffnen“ und Symbolleiste."""
    ctx = XSCRIPTCONTEXT.getComponentContext()   # noqa: F821 – von LibreOffice gesetzt
    # Dokument direkt übergeben (Test, andere Makros) oder das aktuelle aus dem Menü bzw. der Symbolleiste
    given = args[0] if args and hasattr(args[0], 'supportsService') and args[0].supportsService('com.sun.star.document.OfficeDocument') else None
    doc = given or XSCRIPTCONTEXT.getDocument() or XSCRIPTCONTEXT.getDesktop().getCurrentComponent()   # noqa: F821
    if doc is None:
        return
    ctrl = doc.getCurrentController() if hasattr(doc, 'getCurrentController') else None
    frame = ctrl.getFrame() if ctrl else None
    try:
        path = export_pdf(doc)
    except ValueError:
        return _message(ctx, frame, _t(ctx, 'loNoFilter'), True)
    except Exception as e:
        return _message(ctx, frame, _t(ctx, 'loExportFailed', e), True)
    if not _hand_over(path):
        _message(ctx, frame, _t(ctx, 'loNoScan', path))
        _open_folder_and_site(path)


g_exportedScripts = (open_in_pdfmy,)
