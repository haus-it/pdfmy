// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Nur auf https://pdfmy.de/: Datei zur Kennung (#pdfmy-import=…) aus Thunderbird holen und an PDFMy übergeben (Gastgeber-Schnittstelle
   in js/app.js); „An E-Mail anhängen“ von PDFMy zurück an Thunderbird. Die Kennung wird sofort aus der Adresse entfernt. */
'use strict';
(() => {
  const m = /^#pdfmy-import=([0-9a-f-]{36})$/.exec(location.hash); if (!m) return;
  const token = m[1];
  history.replaceState(null, '', location.pathname + location.search);
  const post = d => window.postMessage(d, location.origin);
  /* Ladeanzeige (1.0.1, Prüfhinweis ATN): Beim ersten Öffnen lädt Thunderbird PDFMy erst von pdfmy.de (danach aus dem Offline-Speicher).
     Bis die Datei übergeben ist, zeigt ein Hinweis oben im Tab, dass der Anhang kommt – statt scheinbar nur der Startseite. */
  const msg = k => { try { return browser.i18n.getMessage(k) || ''; } catch { return ''; } };
  const bar = document.createElement('div');
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;background:#454c7c;color:#fff;font:600 14px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)';
  const show = text => { bar.textContent = text; if (!bar.isConnected) (document.body || document.documentElement).append(bar); };
  const hide = (ms = 0) => setTimeout(() => bar.remove(), ms);
  show(msg('loading') || 'Anhang aus Thunderbird wird in PDFMy geöffnet …');
  let file = null, sent = false;
  const deliver = () => {
    if (sent || !file) return; sent = true;
    if (file.attach) post({ type: 'pdfmy:host', actions: ['attach'] });
    if (file.bytes) post({ type: 'pdfmy:open-file', name: file.name, bytes: file.bytes });
    hide(file.bytes ? 1500 : 0);
  };
  window.addEventListener('message', async e => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (d?.type === 'pdfmy:ready') deliver();
    else if (d?.type === 'pdfmy:host-action' && d.id === 'attach' && d.bytes instanceof ArrayBuffer) {
      const r = await browser.runtime.sendMessage({ token, attach: { name: d.name, bytes: d.bytes } }).catch(() => null);
      post({ type: 'pdfmy:host-result', ok: !!r?.ok });
    }
  });
  browser.runtime.sendMessage({ token, get: true }).then(r => {
    if (!r || r.error) { hide(); post({ type: 'pdfmy:open-file', error: r?.error || 'Die Übergabe ist abgelaufen.' }); return; }
    file = r;
    // PDFMy meldet „bereit“ beim Start; ist es schon bereit, antwortet es auf den Ping
    const ping = setInterval(() => { if (sent) return clearInterval(ping); post({ type: 'pdfmy:ping' }); }, 300);
  });
})();
