// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* PDFMy für Thunderbird: Anhänge in PDFMy öffnen (Thunderbird-Tab mit pdfmy.de). Beim Verfassen: PDF bearbeiten und ersetzen bzw.
   ein neues PDF (Scan, Fotos, Dateien) anhängen. Der Anhang geht von Thunderbird direkt an die PDFMy-Seite auf diesem Gerät
   (bridge.js, postMessage) – kein Upload, keine Verbindung außer dem Laden von pdfmy.de. */
'use strict';
const ORIGIN = 'https://pdfmy.de';
const OPENABLE = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|heic|docx|xlsx|pptx|odt|ods|odp|rtf|txt|csv|md|xml|eml|xps)$/i;
const jobs = new Map();   // Kennung → { file, composeTab, replace }
const t = k => messenger.i18n.getMessage(k) || k;

async function openJob(job) {
  const token = crypto.randomUUID();
  jobs.set(token, job);
  setTimeout(() => jobs.delete(token), 30 * 60 * 1000);   // nach einer halben Stunde vergessen
  await messenger.tabs.create({ url: `${ORIGIN}/#pdfmy-import=${token}` });
}
// Anhang einer angezeigten E-Mail bzw. einer E-Mail im Verfassen-Fenster öffnen
async function openReadAttachment(messageId, att) {
  const file = await messenger.messages.getAttachmentFile(messageId, att.partName);
  await openJob({ file: new File([file], att.name, { type: file.type }) });
}
async function openComposeAttachment(tabId, att) {
  const file = await messenger.compose.getAttachmentFile(att.id);
  await openJob({ file: new File([file], att.name, { type: file.type }), composeTab: tabId, replace: /\.pdf$/i.test(att.name) ? att.id : null });
}
async function newForCompose(tabId) { await openJob({ file: null, composeTab: tabId }); }

// bridge.js holt die Datei und gibt das Ergebnis zurück.
// Kein async-Listener (Prüfhinweis ATN, 19.11.2026): Nur Nachrichten von PDFMy mit gültiger Kennung bekommen ein Promise als Antwort,
// alle anderen gehen ohne Antwort an mögliche weitere Listener (siehe webextension-api.thunderbird.net, runtimeMessaging).
async function answer(msg, job) {
  if (msg.get) return { name: job.file?.name || '', bytes: job.file ? await job.file.arrayBuffer() : null, attach: !!job.composeTab };
  if (msg.attach && job.composeTab) {
    try {
      await messenger.compose.addAttachment(job.composeTab, { file: new File([msg.attach.bytes], msg.attach.name, { type: 'application/pdf' }) });
      if (job.replace) { try { await messenger.compose.removeAttachment(job.composeTab, job.replace); } catch { /* Original bleibt zusätzlich */ } job.replace = null; }
      return { ok: true };
    } catch (e) { console.warn('PDFMy: Anhängen', e); return { ok: false }; }
  }
  return { ok: false };
}
messenger.runtime.onMessage.addListener((msg, sender) => {
  if (!sender?.url?.startsWith(ORIGIN + '/') || typeof msg?.token !== 'string' || !(msg.get || msg.attach)) return undefined;   // nicht für uns
  const job = jobs.get(msg.token);
  return job ? answer(msg, job) : Promise.resolve({ error: t('expired') });
});

/* Angezeigte E-Mail zu einem Rechtsklick auf einen Anhang finden (Prüfhinweis ATN: Rechtsklick öffnete nichts).
   Je nach Thunderbird-Fassung und Ansicht (Nachrichtenbereich, eigener Tab, eigenes Fenster) liefert getDisplayedMessage nichts –
   dann die angezeigten bzw. ausgewählten Nachrichten durchsuchen und die nehmen, die einen Anhang mit diesem Teil und Namen hat. */
// Thunderbird 160 übergibt beim Rechtsklick auf einen Anhang einen inneren Tab ohne Typ (type: null) statt des Mail-Tabs –
// für ihn liefern die Nachrichten-Funktionen nichts. Dann zusätzlich den aktiven Tab des zuletzt benutzten Fensters fragen (getestet 19.11.2026).
async function tabsFor(tab) {
  const out = tab ? [tab] : [];
  for (const q of [{ active: true, lastFocusedWindow: true }, { active: true, currentWindow: true }])
    try { for (const t of await messenger.tabs.query(q)) if (!out.some(x => x.id === t.id)) out.push(t); } catch {}
  return out;
}
async function messageFor(tab, att) {
  const ids = [];
  for (const t of await tabsFor(tab)) {
    try { const m = await messenger.messageDisplay.getDisplayedMessage(t.id); if (m) ids.push(m.id); } catch {}
    try { const l = await messenger.messageDisplay.getDisplayedMessages(t.id); for (const m of (Array.isArray(l) ? l : l?.messages || [])) ids.push(m.id); } catch {}
    try { const l = await messenger.mailTabs.getSelectedMessages(t.id); for (const m of l?.messages || []) ids.push(m.id); } catch {}
    if (ids.length) break;
  }
  for (const id of [...new Set(ids)]) {
    if (ids.length === 1) return id;
    try { if ((await messenger.messages.listAttachments(id)).some(a => a.partName === att.partName && a.name === att.name)) return id; } catch {}
  }
  return ids[0] ?? null;
}

// Kontextmenü an Anhängen (Lesen und Verfassen)
messenger.menus.create({ id: 'pdfmy-open', title: t('openInPdfmy'), contexts: ['message_attachments', 'compose_attachments'] }, () => void messenger.runtime.lastError);
messenger.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'pdfmy-open') return;
  try {
    const list = (info.attachments || []).filter(x => OPENABLE.test(x.name || '')).slice(0, 3);
    if (!list.length) return;
    // Verfassen-Fenster: der übergebene oder der aktive Tab (siehe tabsFor)
    const compose = (await tabsFor(tab)).find(t => t.type === 'messageCompose');
    if (compose && info.attachments?.[0]?.id != null) { for (const a of list) await openComposeAttachment(compose.id, a); return; }
    const id = await messageFor(tab, list[0]);
    if (id != null) for (const a of list) await openReadAttachment(id, a);
    else console.warn('PDFMy: keine angezeigte Nachricht gefunden');
  } catch (e) { console.warn('PDFMy: Rechtsklick', e); }
});
// Für das Fenster der Symbolleisten-Knöpfe (popup.js)
self.pdfmy = { openReadAttachment, openComposeAttachment, newForCompose, OPENABLE };
