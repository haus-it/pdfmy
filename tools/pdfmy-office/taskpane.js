// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Outlook: Anhänge (PDF, Bilder, Word, Excel …) in PDFMy öffnen. Beim Verfassen: PDF bearbeiten und ersetzen, neues PDF anhängen.
   Die Anhänge liest Outlook auf dem Gerät aus (getAttachmentContentAsync); PDFMy gibt das Ergebnis direkt zurück (addFileAttachmentFromBase64Async). */
'use strict';
const T = s => (self.I18N ? I18N.t(s) : s);
const $ = s => document.querySelector(s);
const OPENABLE = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|heic|docx|xlsx|pptx|odt|ods|odp|rtf|txt|csv|md|xml|eml|xps)$/i;
const say = (s, err) => { $('#msg').textContent = T(s); $('#msg').classList.toggle('err', !!err); };
let compose = false;

const call = (fn, ...args) => new Promise((res, rej) => fn(...args, r => r.status === Office.AsyncResultStatus.Succeeded ? res(r.value) : rej(new Error(r.error?.message || 'Outlook meldet einen Fehler'))));
async function attachments() {
  const item = Office.context.mailbox.item;
  const list = compose ? await call(item.getAttachmentsAsync.bind(item)) : item.attachments || [];
  return list.filter(a => a.attachmentType === 'file' && !a.isInline && OPENABLE.test(a.name || ''));
}
async function content(a) {
  const item = Office.context.mailbox.item, c = await call(item.getAttachmentContentAsync.bind(item), a.id);
  if (c.format !== Office.MailboxEnums.AttachmentContentFormat.Base64) throw new Error('Dieser Anhang ist keine Datei.');
  return { name: a.name, b64: c.content };
}
// Ergebnis aus PDFMy anhängen; replace: Original-Anhang danach entfernen (bearbeitet statt doppelt)
async function attach(f, replace) {
  const item = Office.context.mailbox.item;
  await call(item.addFileAttachmentFromBase64Async.bind(item), f.b64, f.name, { isInline: false });
  if (replace) try { await call(item.removeAttachmentAsync.bind(item), replace.id); } catch { /* Original bleibt dann zusätzlich */ }
  say(replace ? `„${f.name}“ ersetzt den bisherigen Anhang.` : `„${f.name}“ ist angehängt.`);
  render();
  return true;
}
function openOne(a) {
  say('PDFMy wird geöffnet …');
  if (mobile()) return openInline(a);
  PdfmyOffice.open({
    get: () => content(a), mode: compose ? 'compose' : '',
    onAttach: f => attach(f, /\.pdf$/i.test(a.name) ? a : null),
    onError: t => say(t, true), onClosed: () => say(''),
  });
}
// Outlook für iOS und Android (app-v256): Der Aufgabenbereich ist dort bildschirmfüllend – PDFMy öffnet sich direkt darin
// (eingebettet, gleiche Herkunft pdfmy.de) statt im Office-Dialog, dessen Unterstützung auf dem Handy nicht zugesagt ist.
function mobile() {
  const p = String(Office.context.diagnostics?.platform || Office.context.platform || '');
  return /^(iOS|Android)$/i.test(p) || new URLSearchParams(location.search).get('mobil') === '1';
}
async function openInline(a) {
  let f;
  try {
    if (typeof Office.context.mailbox.item.getAttachmentContentAsync !== 'function') throw new Error(T('Diese Outlook-Fassung gibt Anhänge nicht an Add-ins weiter. Bitte den Anhang öffnen und über „Teilen“ an PDFMy senden.'));
    f = await content(a);
  } catch (e) { return say(e.message, true); }
  const frame = document.createElement('iframe');
  frame.title = 'PDFMy'; frame.className = 'inline-app'; frame.src = '../einbetten.html';
  document.body.classList.add('inline'); document.body.append(frame);
  const back = document.createElement('button'); back.type = 'button'; back.className = 'inline-back'; back.textContent = '← ' + T('Zurück zur E-Mail');
  back.onclick = () => { frame.remove(); back.remove(); document.body.classList.remove('inline'); say(''); };
  document.body.prepend(back);
  await new Promise(res => {
    const onMsg = e => { if (e.source === frame.contentWindow && e.origin === location.origin && e.data?.type === 'pdfmy:ready') { removeEventListener('message', onMsg); clearInterval(t); res(); } };
    addEventListener('message', onMsg);
    const t = setInterval(() => { try { frame.contentWindow.postMessage({ type: 'pdfmy:ping' }, location.origin); } catch { /* lädt */ } }, 300);
  });
  const bytes = PdfmyTransfer.fromB64(f.b64), buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  frame.contentWindow.postMessage({ type: 'pdfmy:open-file', name: f.name, bytes: buf }, location.origin, [buf]);
}
async function render() {
  const ul = $('#list'); ul.textContent = '';
  let list = [];
  try { list = await attachments(); } catch (e) { say(e.message, true); }
  for (const a of list) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.textContent = compose && /\.pdf$/i.test(a.name) ? T('Bearbeiten') : T('In PDFMy öffnen');
    b.onclick = () => openOne(a);
    const n = document.createElement('span'); n.className = 'name'; n.textContent = a.name; n.title = a.name;
    li.append(n, b); ul.append(li);
  }
  $('#none').hidden = list.length > 0;
}
Office.onReady(() => {
  const item = Office.context.mailbox?.item; if (!item) return say('Bitte eine E-Mail auswählen.');
  compose = typeof item.getAttachmentsAsync === 'function' && !item.attachments;
  $('#composeBox').hidden = !compose;
  if (compose) $('#intro').textContent = T('PDFs bearbeiten oder neu erstellen – PDFMy hängt das Ergebnis an diese E-Mail an. Nichts wird hochgeladen.');
  $('#btnNew').onclick = () => { say('PDFMy wird geöffnet …'); PdfmyOffice.open({ mode: 'empty', onAttach: f => attach(f, null), onError: t => say(t, true), onClosed: () => say('') }); };
  // Auswahl einer anderen E-Mail bei angeheftetem Bereich, geänderte Anhänge beim Verfassen
  try { Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, () => location.reload()); } catch { /* ältere Fassung */ }
  try { if (compose) item.addHandlerAsync(Office.EventType.AttachmentsChanged, render); } catch { /* ältere Fassung */ }
  render();
});
