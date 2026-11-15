// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Texte der Erweiterungsseiten in der Sprache des Browsers (_locales/<sprache>/messages.json, Deutsch als Grundlage):
// data-i18n="schlüssel" setzt den Text, data-i18n-html="schlüssel" setzt Text mit <b>/<a> (nur aus den eigenen Sprachdateien).
'use strict';
const T = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;
(() => {
  document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0] || 'de';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  // Ohne innerHTML: nur <b>…</b> und <a href="https://pdfmy.de/…">…</a> werden als Elemente aufgebaut, alles andere bleibt Text
  for (const el of document.querySelectorAll('[data-i18n-html]')) {
    el.textContent = '';
    for (const part of T(el.dataset.i18nHtml).split(/(<b>[^<]*<\/b>|<a href="https:\/\/pdfmy\.de\/[^"]*"[^>]*>[^<]*<\/a>)/)) {
      const b = /^<b>([^<]*)<\/b>$/.exec(part), a = /^<a href="(https:\/\/pdfmy\.de\/[^"]*)"[^>]*>([^<]*)<\/a>$/.exec(part);
      if (b) { const e = document.createElement('b'); e.textContent = b[1]; el.append(e); }
      else if (a) { const e = document.createElement('a'); e.href = a[1]; e.target = '_blank'; e.rel = 'noopener'; e.textContent = a[2]; el.append(e); }
      else if (part) el.append(document.createTextNode(part));
    }
  }
  if (document.title && document.querySelector('title[data-i18n]')) document.title = T(document.querySelector('title').dataset.i18n);
})();
