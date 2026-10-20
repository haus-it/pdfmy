// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
'use strict';
const SITES = { origins: ['http://*/*', 'https://*/*'] };
const $ = s => document.querySelector(s);

async function show() {
  const { auto = true, target = 'web' } = await chrome.storage.local.get(['auto', 'target']);
  const granted = await chrome.permissions.contains(SITES);
  $('#auto').checked = auto && granted;
  $('#target').value = target;
  const st = $('#state');
  st.className = 'muted ' + (auto && granted ? 'ok' : auto ? 'warn' : '');
  st.textContent = auto && granted ? 'Aktiv: Angeklickte PDFs öffnen sich in PDFMy.'
    : auto ? 'Zum Einschalten einmal den Zugriff auf Webseiten erlauben (Schalter antippen).'
      : 'Aus: PDFs öffnen sich wie gewohnt. Rechtsklick → „In PDFMy öffnen“ geht trotzdem.';
}

$('#auto').onchange = async e => {
  const on = e.target.checked;
  // Zugriff auf Webseiten nur, wenn der Nutzer das automatische Öffnen will (Datenminimierung)
  if (on && !(await chrome.permissions.request(SITES))) { e.target.checked = false; return show(); }
  if (!on) await chrome.permissions.remove(SITES).catch(() => {});
  await chrome.storage.local.set({ auto: on });
  show();
};
$('#target').onchange = e => chrome.storage.local.set({ target: e.target.value });
$('#open').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  await chrome.runtime.sendMessage({ type: 'open-tab', url: tab.url, tabId: tab.id, index: tab.index });
  window.close();
};
show();
