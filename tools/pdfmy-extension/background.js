// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// PDFMy-Erweiterung (Manifest V3): PDFs aus dem Browser in PDFMy öffnen – ohne Upload.
// Ablauf: PDF-Aufruf erkennen → Datei hier im Browser laden → PDFMy-Tab öffnen → pdfmy-bridge.js holt die Bytes
// über einen Port ab und reicht sie per postMessage an die Seite. Kein Server außer der Quelle der PDF ist beteiligt.
'use strict';

const TARGETS = { web: 'https://pdfmy.de/', mentor: 'https://pdfmy.de/mentor/' };
const SITES = { origins: ['http://*/*', 'https://*/*'] };
const MAX_BYTES = 300 * 1024 * 1024;
const RECENT_MS = 10 * 60 * 1000;      // dieselbe PDF im selben Tab nicht erneut abfangen (z. B. „Zurück“)
const jobs = new Map();                  // token → { url, name, data: Promise<{bytes,name}> }

const settings = async () => ({ auto: true, target: 'web', ...(await chrome.storage.local.get(['auto', 'target'])) });

/* ---------- Erkennung ---------- */
const pdfPath = url => { try { return /\.pdf$/i.test(new URL(url).pathname); } catch { return false; } };
const header = (list, n) => (list || []).find(h => h.name.toLowerCase() === n)?.value || '';

function nameFrom(url, disposition = '') {
  const star = disposition.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i), plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  let n = '';
  try { n = star ? decodeURIComponent(star[1].trim()) : plain ? plain[1].trim() : ''; } catch { n = plain?.[1] || ''; }
  if (!n) try { n = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch { /* leer */ }
  n = n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'Dokument';
  return /\.pdf$/i.test(n) ? n : n + '.pdf';
}

// Adobe-Acrobat-Erweiterung u. a. leiten PDFs auf ihren eigenen Viewer um: chrome-extension://<id>/https://…/datei.pdf
function sourceOf(url) {
  if (!url) return '';
  if (/^https?:/i.test(url)) return url;
  const m = url.match(/^chrome-extension:\/\/[a-p]{32}\/.*?(https?:\/\/.+)$/i) || url.match(/[?&](?:file|src|url)=(https?%3A[^&]+)/i);
  if (!m) return '';
  try { return /^https?%3A/i.test(m[1]) ? decodeURIComponent(m[1]) : m[1]; } catch { return ''; }
}

async function recentlyHandled(tabId, url) {
  const key = `r:${tabId}:${url}`, now = Date.now(), { [key]: t } = await chrome.storage.session.get(key);
  if (t && now - t < RECENT_MS) return true;
  await chrome.storage.session.set({ [key]: now });
  return false;
}

async function intercept(tabId, url, name) {
  const s = await settings();
  if (!s.auto || tabId < 0 || url.startsWith('https://pdfmy.de/')) return;
  if (await recentlyHandled(tabId, url)) return;
  openInPdfMy({ url, name, tabId });
}

chrome.webRequest.onHeadersReceived.addListener(d => {
  if (d.method !== 'GET' || d.statusCode < 200 || d.statusCode >= 300) return;
  const type = header(d.responseHeaders, 'content-type').toLowerCase(), disp = header(d.responseHeaders, 'content-disposition');
  const isPdf = type.includes('application/pdf') || (pdfPath(d.url) && (!type || type.includes('octet-stream')));
  // Downloads (attachment) bleiben Downloads – sonst würde die Seite ersetzt, auf der man gerade ist.
  if (!isPdf || /^\s*attachment/i.test(disp)) return;
  intercept(d.tabId, d.url, nameFrom(d.url, disp));
}, { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] }, ['responseHeaders']);

chrome.webRequest.onBeforeRedirect.addListener(d => {
  // Umleitung einer .pdf-Adresse in den Viewer einer anderen Erweiterung (z. B. Adobe Acrobat)
  if (d.method === 'GET' && /^chrome-extension:/i.test(d.redirectUrl) && pdfPath(d.url)) intercept(d.tabId, d.url, nameFrom(d.url));
}, { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] });

/* ---------- Übergabe an PDFMy ---------- */
async function load(url) {
  const r = await fetch(url, { credentials: 'include', cache: 'force-cache' }).catch(() => {
    throw new Error('Die Datei konnte nicht geladen werden. Bitte im Symbol „PDFMy“ den Zugriff auf Webseiten erlauben (Schalter „Automatisch öffnen“).');
  });
  if (!r.ok) throw new Error(`Der Server hat die Datei nicht geliefert (HTTP ${r.status}).`);
  if (+r.headers.get('content-length') > MAX_BYTES) throw new Error('Die Datei ist größer als 300 MB.');
  const bytes = await r.arrayBuffer();
  const head = new TextDecoder('latin1').decode(new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength)));
  if (!head.includes('%PDF-')) throw new Error('Der Link führt nicht zu einer PDF-Datei.');
  return { bytes, name: nameFrom(r.url || url, r.headers.get('content-disposition') || '') };
}

async function openInPdfMy({ url, name, tabId, newTab = false, index, openerTabId }) {
  url = sourceOf(url);
  const token = crypto.randomUUID(), { target } = await settings();
  const job = { url, name, data: url ? load(url) : Promise.reject(new Error('Keine PDF-Adresse gefunden.')) };
  job.data.catch(() => {});
  jobs.set(token, job);
  await chrome.storage.session.set({ ['j:' + token]: { url, name } });   // falls der Service Worker neu startet
  const dest = (TARGETS[target] || TARGETS.web) + '#pdfmy-import=' + token;
  if (newTab || tabId == null || tabId < 0) await chrome.tabs.create({ url: dest, index, openerTabId });
  else await chrome.tabs.update(tabId, { url: dest });
  return token;
}

// pdfmy-bridge.js fragt die Datei zum Token ab; Übertragung in Base64-Stücken (Nachrichten sind JSON)
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'pdfmy-import' || !port.sender?.url?.startsWith('https://pdfmy.de/')) return port.disconnect();
  port.onMessage.addListener(async ({ token }) => {
    const key = 'j:' + token;
    let job = jobs.get(token);
    if (!job) {
      const { [key]: saved } = await chrome.storage.session.get(key);
      if (saved) job = { ...saved, data: load(saved.url) };
    }
    jobs.delete(token); chrome.storage.session.remove(key);       // Token gilt genau einmal
    if (!job) return port.postMessage({ error: 'Die Übergabe ist abgelaufen. Bitte die PDF noch einmal anklicken.' });
    try {
      const { bytes, name } = await job.data, u8 = new Uint8Array(bytes), STEP = 3 * 1024 * 1024;
      port.postMessage({ name: job.name || name, size: u8.length });
      for (let i = 0; i < u8.length; i += STEP) {
        let s = '';
        const part = u8.subarray(i, i + STEP);
        for (let k = 0; k < part.length; k += 0x8000) s += String.fromCharCode.apply(null, part.subarray(k, k + 0x8000));
        port.postMessage({ chunk: btoa(s) });
      }
      port.postMessage({ done: true });
    } catch (e) { port.postMessage({ error: e.message }); }
  });
});

/* ---------- Kontextmenü ---------- */
chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pdfmy-link', title: 'In PDFMy öffnen', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'pdfmy-page', title: 'Diese PDF in PDFMy öffnen', contexts: ['page', 'frame'],
      documentUrlPatterns: ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.PDF', '*://*/*.PDF?*', 'chrome-extension://*/*'] });
  });
  if (reason === 'install') chrome.tabs.create({ url: 'welcome.html' });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.menuItemId === 'pdfmy-link' ? info.linkUrl : (info.frameUrl || info.pageUrl);
  openInPdfMy({ url, name: nameFrom(sourceOf(url) || ''), newTab: true, index: tab ? tab.index + 1 : undefined, openerTabId: tab?.id });
});

// Popup: „Diese PDF in PDFMy öffnen“ für den aktiven Tab
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || msg?.type !== 'open-tab') return;
  openInPdfMy({ url: msg.url, name: nameFrom(sourceOf(msg.url) || ''), newTab: true, index: msg.index + 1, openerTabId: msg.tabId })
    .then(() => reply({ ok: true }), e => reply({ ok: false, error: e.message }));
  return true;
});

self.pdfmy = { openInPdfMy, nameFrom, sourceOf, SITES };   // für Tests
