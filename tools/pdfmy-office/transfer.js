// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Übergabe von Dateien zwischen Add-in (Aufgabenbereich bzw. Funktionsdatei) und dem PDFMy-Fenster (Office-Dialog) – auf dem Gerät,
   über die Nachrichten von Office (messageChild / messageParent). Office begrenzt die Nachrichtengröße, darum in Stücken (Base64).
   Protokoll: { t: 'ready' } (Dialog bereit) · { t: 'begin', id, name, size, n, mode } · { t: 'part', id, i, d } · { t: 'end', id } · { t: 'result', ok } */
(function (root) {
  'use strict';
  const PART = 96 * 1024;   // Zeichen je Nachricht (sicher unter den Grenzen von Office im Web und auf dem Desktop)
  const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = b64 => { const s = atob(b64), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; };
  // Datei in Nachrichten zerlegen; send(text) ist messageChild oder messageParent
  function sendFile(send, { name, bytes, mode = '', b64 }) {
    const data = b64 || toB64(bytes), id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), n = Math.ceil(data.length / PART) || 1;
    send(JSON.stringify({ t: 'begin', id, name, size: data.length, n, mode }));
    for (let i = 0; i < n; i++) send(JSON.stringify({ t: 'part', id, i, d: data.slice(i * PART, (i + 1) * PART) }));
    send(JSON.stringify({ t: 'end', id }));
  }
  // Empfänger: sammelt die Stücke, ruft onFile({ name, bytes, b64, mode }) bzw. onOther(msg) für andere Nachrichten
  function receiver(onFile, onOther) {
    let cur = null;
    return text => {
      let m; try { m = JSON.parse(text); } catch { return; }
      if (m.t === 'begin') cur = { ...m, parts: new Array(m.n) };
      else if (m.t === 'part' && cur && m.id === cur.id) cur.parts[m.i] = m.d;
      else if (m.t === 'end' && cur && m.id === cur.id) {
        const b64 = cur.parts.join(''), f = cur; cur = null;
        if (b64.length !== f.size) return onOther?.({ t: 'error', error: 'Übertragung unvollständig' });
        onFile({ name: f.name, mode: f.mode, b64, bytes: fromB64(b64) });
      } else onOther?.(m);
    };
  }
  root.PdfmyTransfer = { sendFile, receiver, toB64, fromB64 };
})(self);
