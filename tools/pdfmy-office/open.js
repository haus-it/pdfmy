// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Office-Dialog: Datei vom Add-in empfangen (PdfmyTransfer), PDFMy (/einbetten.html, gleiche Herkunft) im Rahmen öffnen und die Datei
   per postMessage hineinreichen. Im Verfassen-Modus von Outlook („attach“) gibt PDFMy das fertige PDF zurück → an das Add-in. */
'use strict';
const T = (s) => (self.I18N ? I18N.t(s) : s);
const frame = document.getElementById('app'), wait = document.getElementById('wait'), waitText = document.getElementById('waitText');
let appReady = null, mode = '';
const say = s => { waitText.textContent = T(s); };

// PDFMy im Rahmen laden und auf „bereit“ warten (Ping, bis die App antwortet)
function loadApp() {
  if (appReady) return appReady;
  frame.src = '../einbetten.html'; frame.hidden = false;
  appReady = new Promise(res => {
    const onMsg = e => { if (e.source === frame.contentWindow && e.origin === location.origin && e.data?.type === 'pdfmy:ready') { removeEventListener('message', onMsg); clearInterval(ping); res(); } };
    addEventListener('message', onMsg);
    const ping = setInterval(() => { try { frame.contentWindow.postMessage({ type: 'pdfmy:ping' }, location.origin); } catch { /* lädt noch */ } }, 300);
  });
  return appReady;
}
// Nachrichten von PDFMy: fertiges PDF zurück an Outlook
addEventListener('message', e => {
  if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
  const d = e.data;
  if (d?.type === 'pdfmy:host-action' && d.id === 'attach' && d.bytes instanceof ArrayBuffer)
    PdfmyTransfer.sendFile(t => Office.context.ui.messageParent(t), { name: d.name, bytes: new Uint8Array(d.bytes), mode: 'attach' });
});

Office.onReady(() => {
  const receive = PdfmyTransfer.receiver(async f => {
    mode = f.mode || '';
    await loadApp();
    if (mode === 'compose') frame.contentWindow.postMessage({ type: 'pdfmy:host', actions: ['attach'] }, location.origin);
    const buf = f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength);
    frame.contentWindow.postMessage({ type: 'pdfmy:open-file', name: f.name, bytes: buf }, location.origin, [buf]);
    wait.hidden = true;
  }, m => {
    if (m.t === 'error') say(m.error === 'Übertragung unvollständig' ? 'Die Datei kam nicht vollständig an. Bitte das Fenster schließen und erneut versuchen.' : m.error);
    else if (m.t === 'result') frame.contentWindow.postMessage({ type: 'pdfmy:host-result', ok: !!m.ok }, location.origin);
    else if (m.t === 'empty') { wait.hidden = true; loadApp(); }   // „Neues PDF anhängen“: PDFMy leer öffnen (scannen, Fotos, Dateien)
    else if (m.t === 'compose') { loadApp().then(() => frame.contentWindow.postMessage({ type: 'pdfmy:host', actions: ['attach'] }, location.origin)); wait.hidden = true; }
    else if (m.t === 'fail') say(m.error || 'Das Dokument konnte nicht gelesen werden.');
  });
  // Office ≥ DialogApi 1.2: Nachrichten vom Add-in empfangen
  if (Office.context.ui.addHandlerAsync) {
    Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, a => receive(a.message), r => {
      if (r.status !== Office.AsyncResultStatus.Succeeded) { say('Diese Office-Fassung ist zu alt für die Übergabe. Bitte Office aktualisieren oder über den Drucker „PDFMy“ gehen.'); return; }
      Office.context.ui.messageParent(JSON.stringify({ t: 'ready' }));
    });
  } else say('Diese Office-Fassung ist zu alt für die Übergabe. Bitte Office aktualisieren oder über den Drucker „PDFMy“ gehen.');
});
