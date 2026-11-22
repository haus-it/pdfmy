#!/usr/bin/env node
// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Meldungen von pdfmy.de abholen und den Stand setzen (Betreiber, app-v329). Schlüssel: .deploy/melde-key.txt (nicht im Repository).
   node tools/meldungen.js liste            → offene Meldungen als JSON (neu, in Arbeit, in Prüfung)
   node tools/meldungen.js liste --alle     → alle
   node tools/meldungen.js status <id> <neu|in Arbeit|in Prüfung|erledigt|kein Fehler|beantwortet> [--version app-v330] [--antwort "…"] [--notiz "…"]
   Bei „erledigt“, „kein Fehler“ und „beantwortet“ schickt pdfmy.de dem Meldenden eine Danke-Mail, wenn er eine Adresse angegeben hat;
   in PDFMy sieht er den Stand unter „Meine Meldungen“. PDFMY_MELDE_URL überschreibt die Adresse (Test). */
'use strict';
const fs = require('fs'), path = require('path');
const URL_ = process.env.PDFMY_MELDE_URL || 'https://pdfmy.de/melden.php';
const keyFile = path.join(__dirname, '..', '.deploy', 'melde-key.txt');
if (!fs.existsSync(keyFile)) { console.error('Schlüssel fehlt: .deploy/melde-key.txt'); process.exit(2); }
const key = fs.readFileSync(keyFile, 'utf8').trim();
const [cmd, ...rest] = process.argv.slice(2);
const opt = n => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : undefined; };
async function admin(was, body) {
  const r = await fetch(`${URL_}?admin=${encodeURIComponent(was)}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-melde-key': key }, body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(`pdfmy.de antwortet ${r.status}: ${d.fehler || 'Fehler'}`);
  return d;
}
(async () => {
  if (cmd === 'liste') {
    const d = await admin('liste', { offen: !rest.includes('--alle') });
    console.log(JSON.stringify(d.meldungen, null, 1));
    console.error(`${d.meldungen.length} Meldung(en)`);
  } else if (cmd === 'status') {
    const [id, status] = rest;
    if (!id || !status) throw new Error('Aufruf: status <id> <status> [--version …] [--antwort …] [--notiz …]');
    const body = { id, status };
    for (const n of ['version', 'antwort', 'notiz']) if (opt(n) !== undefined) body[n] = opt(n);
    const d = await admin('status', body);
    console.log(`${id}: ${status}${d.mail ? ' – Danke-Mail an den Meldenden gesendet' : ''}`);
  } else {
    console.log('Aufruf: node tools/meldungen.js liste [--alle] | status <id> <status> [--version …] [--antwort …] [--notiz …]');
  }
})().catch(e => { console.error(e.message); process.exit(1); });
