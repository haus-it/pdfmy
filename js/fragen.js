// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Fragen an die Ablage (Wettbewerbsanalyse Rang 9, „Vertragsakte“): eine Frage über viele abgelegte Dokumente – wie „Chat mit
   mehreren PDFs“ bei Acrobat AI Assistant oder PDFgear, aber ohne Upload. Die Volltextsuche der Ablage (Index im Browser) wählt die
   passenden Dokumente, daraus werden Ausschnitte um die Fundstellen, die KI auf diesem Gerät (Browser-KI oder lokale KI auf demselben
   PC) antwortet nur daraus und nennt die Quellen als [1], [2] … – jede Quelle lässt sich öffnen und nachprüfen.
   Rangfolge: BM25 über Wortstämme; Absender, Betreff, Art und Akte zählen doppelt. Kein Modell, keine Einbettungen, nichts verlässt den Rechner. */
(function (root) {
  'use strict';
  const STOP = new Set(('der die das den dem des ein eine einer eines einem einen und oder aber ist sind war waren wurde wurden werden wird ' +
    'mit von zu zum zur im in am an auf für bei aus nach über unter vor bis seit als auch noch nur nicht kein keine keinen sich ich wir sie ' +
    'er es mir mich uns ihr ihnen ihm wie was wer wann wo wofür woher welche welcher welches welchen welchem viel viele vielen alle allen ' +
    'gibt gab habe haben hat hatte hätte muss müssen kann können soll sollen meine meiner meinen mein unser unsere unseren bitte dass ' +
    'dieser diese dieses diesem diesen jener schon mal denn doch noch etwa also dann wenn ob ' +
    'the and or of to in on for is are was were be been what which who whom when where how many much all any with from by about ' +
    'do does did have has had my our your their this that these those there please').split(/\s+/));
  const low = s => String(s || '').toLowerCase().normalize('NFKC');
  // Wortstamm grob (Deutsch und Englisch): „Verträge“ findet „Vertrag“ nicht, „Kündigungsfrist“ findet „Kündigungsfristen“
  const stem = w => /^\d/.test(w) ? w : w.length > 5 ? w.replace(/(ungen|ung|heit|keit|en|er|es|em|e|n|s)$/u, '') : w;
  const UML = { 'ä': 'a', 'ö': 'o', 'ü': 'u' };
  function terms(q) {
    const ws = low(q).match(/[\p{L}\p{N}](?:[\p{L}\p{N}./-]*[\p{L}\p{N}])?/gu) || [];
    const out = new Set();
    for (const w of ws) {
      if (STOP.has(w) || (w.length < 3 && !/^\d+$/.test(w))) continue;
      out.add(stem(w));
      if (/[äöü]/.test(w) && w.length > 5) out.add(stem(w.replace(/[äöü]/g, c => UML[c])).slice(0, -1));   // „Verträge“ → „vertrag“
    }
    return [...out].filter(t => t.length >= 2);
  }
  const count = (hay, t) => { let n = 0, i = 0; while ((i = hay.indexOf(t, i)) >= 0) { n++; i += t.length; } return n; };

  /* docs: [{ key, text, meta }] – meta: Absender, Betreff, Art, Akte, Datum, Datei (zählt doppelt). Ergebnis: [{ doc, score }] absteigend. */
  function rank(docs, q, k1 = 1.4, b = 0.75) {
    const ts = terms(q); if (!ts.length || !docs.length) return [];
    const prep = docs.map(d => { const meta = low(d.meta); const hay = low(d.text) + ' ' + meta + ' ' + meta; return { d, hay, len: hay.length || 1 }; });
    const avg = prep.reduce((s, x) => s + x.len, 0) / prep.length;
    const df = ts.map(t => prep.filter(x => x.hay.includes(t)).length), N = prep.length;
    const out = [];
    for (const x of prep) {
      let s = 0, hit = 0;
      ts.forEach((t, i) => {
        const tf = count(x.hay, t); if (!tf) return; hit++;
        const idf = Math.log(1 + (N - df[i] + 0.5) / (df[i] + 0.5));
        s += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * x.len / avg));
      });
      if (s > 0) out.push({ doc: x.d, score: s * (1 + hit / ts.length) });   // mehr verschiedene Begriffe getroffen → vorn
    }
    return out.sort((a, c) => c.score - a.score);
  }

  /* Ausschnitte um die Fundstellen (je ±radius Zeichen, überlappende zusammengefasst), höchstens budget Zeichen; ohne Fundstelle der Anfang */
  function excerpt(text, ts, budget, radius = 350) {
    const t = String(text || ''), lo = low(t);
    if (t.length <= budget) return t;
    const spans = [];
    for (const term of ts) { let i = 0, n = 0; while ((i = lo.indexOf(term, i)) >= 0 && n++ < 8) { spans.push([Math.max(0, i - radius), Math.min(t.length, i + term.length + radius)]); i += term.length; } }
    if (!spans.length) return t.slice(0, budget) + ' …';
    spans.sort((a, c) => a[0] - c[0]);
    const merged = [];
    for (const s of spans) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push([...s]); }
    let out = '', used = 0;
    for (const [a, c] of merged) {
      const piece = t.slice(a, c); if (used + piece.length > budget) { if (!out) out = piece.slice(0, budget); break; }
      out += (a > 0 ? '… ' : '') + piece + (c < t.length ? ' …' : '') + '\n'; used += piece.length;
    }
    return out.trim();
  }

  /* Kontext für die KI: höchstens maxDocs Dokumente, zusammen höchstens maxChars Zeichen.
     Ohne Treffer (z. B. „Fasse diese Akte zusammen“) und bei wenigen Dokumenten im Ausschnitt: alle, gekürzt. */
  function build(docs, q, { maxChars = 12000, maxDocs = 6 } = {}) {
    const ts = terms(q);
    let picks = rank(docs, q).slice(0, maxDocs).map(r => r.doc), all = false;
    if (!picks.length && docs.length && docs.length <= maxDocs) { picks = docs.slice(); all = true; }
    const per = picks.length ? Math.floor(maxChars / picks.length) : 0;
    const items = picks.map((d, i) => ({ n: i + 1, key: d.key, label: d.label || d.meta || d.key, text: excerpt(d.text, ts, per) }));
    return { items, all, terms: ts };
  }
  function prompt(q, items, lang = 'de') {
    const docs = items.map(it => `[${it.n}] ${it.label}\n"""\n${it.text}\n"""`).join('\n\n');
    return `Dokumente aus der Ablage:\n\n${docs}\n\nFrage: ${q}\n\nAntworte in der Sprache „${lang}“ nur anhand dieser Dokumente. Nenne nach jeder Aussage die Quelle in eckigen Klammern, z. B. [2]. Beträge, Daten, Fristen und Namen genau wie im Dokument. Steht die Antwort in keinem Dokument, sage das.`;
  }
  // Welche Quellen nennt die Antwort? (nur gültige Nummern, in Reihenfolge des ersten Auftretens)
  function cited(answer, n) {
    const out = [];
    for (const m of String(answer || '').matchAll(/\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\]/g))
      for (const x of m[1].split(/[,;]/).map(s => +s.trim())) if (x >= 1 && x <= n && !out.includes(x)) out.push(x);
    return out;
  }

  const api = { terms, rank, excerpt, build, prompt, cited };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Fragen = api;
})(typeof self !== 'undefined' ? self : globalThis);
