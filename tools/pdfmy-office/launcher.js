// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* PDFMy-Fenster öffnen (Office-Dialog mit open.html) und eine Datei übergeben; nimmt bei Outlook das fertige PDF zurück.
   PdfmyOffice.open({ get: async () => ({ name, bytes | b64 }), mode, onAttach(file) → Promise<bool>, onError(text), onClosed() })
   mode: '' (nur ansehen/bearbeiten) · 'compose' (PDF darf zurück an die E-Mail) · 'empty' (PDFMy leer, z. B. zum Scannen) */
(function (root) {
  'use strict';
  const base = new URL('.', document.currentScript?.src || location.href).href;
  // Dokument aus Word/PowerPoint (PDF) bzw. Excel (xlsx) in Stücken lesen
  function documentFile(type) {
    return new Promise((res, rej) => {
      Office.context.document.getFileAsync(type, { sliceSize: 4 * 1024 * 1024 }, r => {
        if (r.status !== Office.AsyncResultStatus.Succeeded) return rej(new Error(r.error?.message || 'Dokument nicht lesbar'));
        const file = r.value, parts = []; let i = 0;
        const next = () => file.getSliceAsync(i, s => {
          if (s.status !== Office.AsyncResultStatus.Succeeded) { file.closeAsync(); return rej(new Error(s.error?.message || 'Dokument nicht lesbar')); }
          parts.push(new Uint8Array(s.value.data));
          if (++i < file.sliceCount) return next();
          file.closeAsync();
          const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0;
          for (const p of parts) { out.set(p, o); o += p.length; }
          res(out);
        });
        next();
      });
    });
  }
  // Dateiname aus der Adresse des Dokuments (lokal oder OneDrive/SharePoint), sonst „Dokument“
  function docName(ext) {
    const url = Office.context.document?.url || '';
    const base = decodeURIComponent(url.split(/[\\/]/).pop() || '').replace(/\?.*$/, '').replace(/\.[^.]+$/, '').trim();
    return (base || 'Dokument') + '.' + ext;
  }
  // get: async () => { name, bytes | b64 } – wird erst nach dem Öffnen des Fensters gelesen (sofort sichtbare Rückmeldung)
  function open({ get, mode = '', onAttach, onError = () => {}, onClosed = () => {} }) {
    Office.context.ui.displayDialogAsync(base + 'open.html', { height: 92, width: 92, promptBeforeOpen: false }, r => {
      if (r.status !== Office.AsyncResultStatus.Succeeded) { onError(r.error?.code === 12007 ? 'PDFMy ist schon geöffnet.' : (r.error?.message || 'PDFMy konnte nicht geöffnet werden.')); return onClosed(); }
      const dlg = r.value, send = t => dlg.messageChild(t);
      const receive = PdfmyTransfer.receiver(async f => {   // fertiges PDF aus PDFMy
        let ok = false;
        try { ok = onAttach ? await onAttach(f) : false; } catch { ok = false; }
        send(JSON.stringify({ t: 'result', ok }));
      }, async m => {
        if (m.t !== 'ready') return;
        if (mode === 'empty') return send(JSON.stringify({ t: 'compose' }));
        try { const f = await get(); PdfmyTransfer.sendFile(send, { ...f, mode }); }
        catch (e) { send(JSON.stringify({ t: 'fail', error: e.message || String(e) })); }
      });
      dlg.addEventHandler(Office.EventType.DialogMessageReceived, a => receive(a.message));
      dlg.addEventHandler(Office.EventType.DialogEventReceived, () => onClosed());   // Fenster geschlossen
    });
  }
  root.PdfmyOffice = { open, documentFile, docName };
})(self);
