// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// Läuft nur auf https://pdfmy.de/*: holt die vom Browser geladene PDF bei der Erweiterung ab und übergibt sie
// per postMessage an PDFMy (Import-Schnittstelle in js/app.js). Ohne Token in der Adresse tut das Skript nichts.
'use strict';
(() => {
  const m = location.hash.match(/^#pdfmy-import=([0-9a-f-]{36})$/i);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);   // Token nicht in Verlauf/Lesezeichen

  const pageReady = new Promise(resolve => {
    const done = () => { removeEventListener('message', onMsg); clearInterval(t); resolve(); };
    const onMsg = e => { if (e.source === window && e.data?.type === 'pdfmy:ready') done(); };
    addEventListener('message', onMsg);
    const t = setInterval(() => document.documentElement?.dataset.pdfmyImport ? done() : postMessage({ type: 'pdfmy:ping' }, location.origin), 150);
  });
  const deliver = async msg => { await pageReady; postMessage(msg, location.origin, msg.bytes ? [msg.bytes] : []); };

  const port = chrome.runtime.connect({ name: 'pdfmy-import' });
  let name = 'Dokument.pdf', buf = null, pos = 0;
  port.onMessage.addListener(msg => {
    if (msg.error) { deliver({ type: 'pdfmy:open-file', error: msg.error }); return port.disconnect(); }
    if (msg.size != null) { name = msg.name; buf = new Uint8Array(msg.size); return; }
    if (msg.chunk) {
      const s = atob(msg.chunk);
      for (let i = 0; i < s.length; i++) buf[pos + i] = s.charCodeAt(i);
      pos += s.length; return;
    }
    if (msg.done) { deliver({ type: 'pdfmy:open-file', name, bytes: buf.buffer }); port.disconnect(); }
  });
  port.postMessage({ token: m[1] });
})();
