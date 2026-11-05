// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Antworten und Status bei Kommentaren (wie in Acrobat): Notizen und Markierungen bekommen einen Verlauf
   (a.replies = [{ text, by, at, t }]) und einen Prüfstatus (a.state, Zustandsmodell „Review“ der PDF-Norm).
   In der PDF-Datei: Antworten sind Text-Anmerkungen mit /IRT (In Reply To) auf den Kommentar, der Status eine
   Text-Anmerkung mit /StateModel (Review) und /State – so zeigen Acrobat, Foxit und Co. den Verlauf an.
   Reine Logik ohne DOM, damit sie im Test (node) und im Browser gleich läuft. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Kommentare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Zustände des Modells „Review“ (ISO 32000, 12.5.6.3); '' = noch nicht bearbeitet
  const STATES = [['', 'Offen'], ['Accepted', 'Angenommen'], ['Rejected', 'Abgelehnt'], ['Cancelled', 'Abgebrochen'], ['Completed', 'Erledigt']];
  const LABEL = Object.fromEntries(STATES);
  const label = st => LABEL[st] || LABEL[''];
  const day = d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

  // Antwort anhängen (leere Antworten nicht)
  function reply(a, text, by, now = new Date()) {
    const t = String(text || '').trim(); if (!t) return null;
    const r = { text: t, by: String(by || '').trim(), at: day(now), t: now.toISOString() };
    (a.replies = a.replies || []).push(r);
    return r;
  }
  function setState(a, st, by, now = new Date()) {
    if (!(st in LABEL)) throw new Error('Unbekannter Status: ' + st);
    if (!st) { delete a.state; delete a.stateBy; delete a.stateT; return; }
    a.state = st; a.stateBy = String(by || '').trim(); a.stateT = now.toISOString();
  }
  const hasThread = a => !!((a.replies && a.replies.length) || a.state);
  // Antworten als Textzeilen (für Notizzettel auf der Seite, im Bild und in der PDF)
  const replyLines = a => (a.replies || []).map(r => `↳ ${r.by ? r.by + ': ' : ''}${r.text}`);
  // Verlauf als Klartext (Kommentarliste kopieren)
  function plain(a, indent = '    ') {
    const out = (a.replies || []).map(r => `${indent}↳ ${[r.at, r.by].filter(Boolean).join(' · ')}: ${r.text}`);
    if (a.state) out.push(`${indent}Status: ${label(a.state)}${a.stateBy ? ' (' + a.stateBy + ')' : ''}`);
    return out;
  }

  // PDF-Datum (D:JJJJMMTThhmmssZ) hin und zurück
  function pdfDate(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  }
  function parsePdfDate(s) {
    const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?\s*(Z|[+-])?(\d{2})?'?(\d{2})?/.exec(String(s || '').trim());
    if (!m) return null;
    const [, Y, M = '01', D = '01', h = '00', mi = '00', se = '00', z, oh = '00', om = '00'] = m;
    let ms = Date.UTC(+Y, +M - 1, +D, +h, +mi, +se);
    if (z === '+' || z === '-') ms -= (z === '+' ? 1 : -1) * (+oh * 60 + +om) * 60000;
    const d = new Date(ms); return isNaN(d) ? null : d;
  }

  /* Verläufe aus einer fremden PDF lesen: entries = Text-Anmerkungen mit /IRT
     [{ irt, contents, by, m, stateModel, state }] → Map(irt → { replies, state, stateBy, stateT }).
     Antworten nach Zeit sortiert; beim Status zählt der jüngste Eintrag des Modells „Review“
     (das Modell „Marked“ – Häkchen – ist privat und wird übergangen). */
  function threads(entries) {
    const map = new Map();
    const when = e => parsePdfDate(e.m);
    const sorted = [...entries].sort((x, y) => (when(x) || 0) - (when(y) || 0));
    for (const e of sorted) {
      const th = map.get(e.irt) || { replies: [] }; map.set(e.irt, th);
      const d = when(e);
      if (e.stateModel) {
        if (e.stateModel !== 'Review') continue;
        if (e.state === 'None') { delete th.state; delete th.stateBy; delete th.stateT; continue; }
        if (!e.state || !(e.state in LABEL)) continue;
        th.state = e.state; th.stateBy = e.by || ''; th.stateT = d ? d.toISOString() : '';
        continue;
      }
      const text = String(e.contents || '').trim(); if (!text) continue;
      th.replies.push({ text, by: e.by || '', at: d ? day(d) : '', t: d ? d.toISOString() : '' });
    }
    for (const [k, th] of map) if (!th.replies.length && !th.state) map.delete(k);
    return map;
  }

  return { STATES, label, reply, setState, hasThread, replyLines, plain, pdfDate, parsePdfDate, threads };
});
