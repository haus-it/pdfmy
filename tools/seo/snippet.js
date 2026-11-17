// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Suchergebnis-Ausschnitt: Google zeigt etwa 60 Zeichen Titel und 160 Zeichen Beschreibung (SEO-Prüfung 17.11.2026).
// Wirkt beim Bauen auf alle Sprachfassungen, ohne die Übersetzungen zu ändern:
//  - Titel > 60 Zeichen: Zusatz „ – PDFMy“ entfällt (das Stichwort bleibt vollständig sichtbar)
//  - Beschreibung > 160 Zeichen: endet nach dem letzten ganzen Satz, der noch passt (mindestens 70 Zeichen); sonst unverändert
const TITLE = 60, DESC = 160, MIN = 70;
const decode = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encode = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
const len = s => [...s].length;

function fitTitle(t) {
  if (len(t) <= TITLE) return t;
  const m = /^(.*\S)\s+[–|-]\s+PDFMy$/.exec(t);
  return m ? m[1] : t;
}

// Satzende: . ! ? oder 。 gefolgt von Leerzeichen bzw. Textende – nicht nach Abkürzungen wie „z. B.“, „bzw.“, „etc.“
const ABBR = /(?:\b(?:z|B|bzw|ca|ggf|evtl|inkl|usw|etc|e\.g|i\.e|vs|Nr|S|St|Dr|Mr|Mrs|p|pp|vgl|u\.a|d\.h|z\.B))\.$/;
function fitDesc(d) {
  if (len(d) <= DESC) return d;
  const chars = [...d];
  for (let i = Math.min(DESC, chars.length) - 1; i >= MIN - 1; i--) {
    const c = chars[i], next = chars[i + 1];
    if (!/[.!?。！？]/.test(c) || (next !== undefined && !/\s/.test(next) && c !== '。')) continue;
    const head = chars.slice(0, i + 1).join('');
    if (c === '.' && (ABBR.test(head) || /\d\.$/.test(head))) continue;
    return head;
  }
  // kein ganzer Satz passt: am letzten Gedankenstrich oder Semikolon enden (statt mitten im Wort wie die Suchmaschine)
  const cut = chars.slice(0, DESC - 1).join('');
  const at = Math.max(cut.lastIndexOf(' – '), cut.lastIndexOf('; '), cut.lastIndexOf(' ; '));
  if (at >= MIN) return cut.slice(0, at).replace(/[\s,: ]+$/, '') + '.';
  return d;
}

// HTML-Kopf: <title>, meta description, og:description anpassen
function fitHtml(html) {
  return html
    .replace(/<title>([^<]*)<\/title>/, (m, t) => { const f = fitTitle(decode(t)); return f === decode(t) ? m : `<title>${encode(f)}</title>`; })
    .replace(/(<meta (?:name="description"|property="og:description") content=")([^"]*)(")/g, (m, a, d, b) => { const f = fitDesc(decode(d)); return f === decode(d) ? m : a + encode(f) + b; });
}

module.exports = { fitTitle, fitDesc, fitHtml, TITLE, DESC };
