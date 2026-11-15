// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
'use strict';
const SITES = { origins: ['http://*/*', 'https://*/*'] };
const $ = s => document.querySelector(s);

async function show() {
  const on = (await chrome.permissions.contains(SITES)) && (await chrome.storage.local.get('auto')).auto !== false;
  $('#state').className = on ? 'ok' : '';
  $('#state').textContent = on ? T('welcomeOn') : '';
  $('#go').hidden = on;
}
$('#go').onclick = async () => {
  if (!(await chrome.permissions.request(SITES))) {
    $('#state').textContent = T('welcomeDenied');
    return;
  }
  await chrome.storage.local.set({ auto: true });
  show();
};
chrome.permissions.onAdded.addListener(show);
show();
