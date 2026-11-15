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

// bridge.js holt die Datei und gibt das Ergebnis zurück
messenger.runtime.onMessage.addListener(async (msg, sender) => {
  if (!sender.url?.startsWith(ORIGIN + '/')) return;
  const job = jobs.get(msg?.token); if (!job) return { error: t('expired') };
  if (msg.get) return { name: job.file?.name || '', bytes: job.file ? await job.file.arrayBuffer() : null, attach: !!job.composeTab };
  if (msg.attach && job.composeTab) {
    try {
      await messenger.compose.addAttachment(job.composeTab, { file: new File([msg.attach.bytes], msg.attach.name, { type: 'application/pdf' }) });
      if (job.replace) { try { await messenger.compose.removeAttachment(job.composeTab, job.replace); } catch { /* Original bleibt zusätzlich */ } job.replace = null; }
      return { ok: true };
    } catch (e) { console.warn('PDFMy: Anhängen', e); return { ok: false }; }
  }
  return null;
});

// Kontextmenü an Anhängen (Lesen und Verfassen)
messenger.menus.create({ id: 'pdfmy-open', title: t('openInPdfmy'), contexts: ['message_attachments', 'compose_attachments'] });
messenger.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'pdfmy-open') return;
  const list = (info.attachments || []).filter(x => OPENABLE.test(x.name || '')).slice(0, 3);
  if (tab.type === 'messageCompose') { for (const a of list) await openComposeAttachment(tab.id, a); return; }
  const msg = await messenger.messageDisplay.getDisplayedMessage(tab.id);
  if (msg) for (const a of list) await openReadAttachment(msg.id, a);
});
// Für das Fenster der Symbolleisten-Knöpfe (popup.js)
self.pdfmy = { openReadAttachment, openComposeAttachment, newForCompose, OPENABLE };
