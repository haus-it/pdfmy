// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Texte der Erweiterungsseiten in der Sprache des Browsers (_locales/<sprache>/messages.json, Deutsch als Grundlage):
// data-i18n="schlüssel" setzt den Text, data-i18n-html="schlüssel" setzt Text mit <b>/<a> (nur aus den eigenen Sprachdateien).
'use strict';
const T = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;
(() => {
  document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0] || 'de';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = T(el.dataset.i18nHtml);
  if (document.title && document.querySelector('title[data-i18n]')) document.title = T(document.querySelector('title').dataset.i18n);
})();
