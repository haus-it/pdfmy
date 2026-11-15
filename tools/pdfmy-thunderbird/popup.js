// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Fenster der Knöpfe „PDFMy“ (E-Mail lesen bzw. verfassen): Anhänge auflisten, öffnen; beim Verfassen neues PDF anhängen. */
'use strict';
const t = k => messenger.i18n.getMessage(k) || k;
const $ = s => document.querySelector(s);
(async () => {
  const bg = (await messenger.runtime.getBackgroundPage()).pdfmy;
  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  const compose = tab?.type === 'messageCompose';
  $('#hint').textContent = t('privacy');
  let items = [];
  if (compose) {
    items = (await messenger.compose.listAttachments(tab.id)).filter(a => bg.OPENABLE.test(a.name || '')).map(a => ({ name: a.name, go: () => bg.openComposeAttachment(tab.id, a), edit: /\.pdf$/i.test(a.name) }));
    $('#btnNew').hidden = false; $('#btnNew').textContent = t('newPdf');
    $('#btnNew').onclick = async () => { await bg.newForCompose(tab.id); window.close(); };
  } else {
    const msg = await messenger.messageDisplay.getDisplayedMessage(tab.id);
    if (msg) items = (await messenger.messages.listAttachments(msg.id)).filter(a => bg.OPENABLE.test(a.name || '')).map(a => ({ name: a.name, go: () => bg.openReadAttachment(msg.id, a) }));
  }
  for (const it of items) {
    const li = document.createElement('li'), n = document.createElement('span'), b = document.createElement('button');
    n.textContent = it.name; n.title = it.name; b.textContent = it.edit ? t('edit') : t('open');
    b.onclick = async () => { await it.go(); window.close(); };
    li.append(n, b); $('#list').append(li);
  }
  $('#none').hidden = items.length > 0; $('#none').textContent = t('noAttachments');
})();
