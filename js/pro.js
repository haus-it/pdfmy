// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Pro-Funktionen: Posteingangsbuch mit Fristen, "Ablegen & nächster", Dokumente vergleichen, Stapelverarbeitung.
   Läuft nach app.js und nutzt dessen Zustand und Funktionen (state, buildPdf, recognize …). */
'use strict';

/* ---------- Posteingangsbuch ---------- */
// Lokal im Browser – und, wenn ein Ablageordner verbunden ist, zusätzlich als "Posteingangsbuch.csv" darin.
// Liegt die Ablage in SharePoint/OneDrive, sieht so das ganze Team dasselbe Buch (Excel-tauglich).
const JOURNAL_FILE = 'Posteingangsbuch.csv';
const jLocal = () => LS.get('journal', []);
async function jReadDir() {
  if (!state.outDir) return [];
  try { return Journal.parseCsv(await (await (await state.outDir.getFileHandle(JOURNAL_FILE)).getFile()).text()); }
  catch { return []; }
}
async function jWriteDir(list) {
  if (!state.outDir) return true;
  try {
    const w = await (await state.outDir.getFileHandle(JOURNAL_FILE, { create: true })).createWritable();
    await w.write(Journal.toCsv(list)); await w.close(); return true;
  } catch (e) { console.warn('Posteingangsbuch:', e); return false; }   // z. B. gerade in Excel geöffnet
}
async function journalAll() { return Journal.merge(await jReadDir(), jLocal()); }
async function journalSave(list) {
  LS.set('journal', list.slice(0, 2000));
  const ok = await jWriteDir(list);
  if (!ok) status(`Posteingangsbuch: „${JOURNAL_FILE}“ ist gerade gesperrt (in Excel geöffnet?) – der Eintrag ist lokal gespeichert und wird beim nächsten Mal übernommen.`);
  renderDeadlines(list);
}
const updStamp = () => stamp() + ':' + String(new Date().getSeconds()).padStart(2, '0');
const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
// Nach jedem Ablegen eines Briefs: Eintrag anlegen (where = Anzeigepfad, z. B. "Ablage\Rechnung\2026-…pdf")
async function journalAdd(meta, where, pages, text = docPages().map(pageText).join('\n')) {
  const rel = state.outDir && where?.startsWith(state.outDir.name + '\\') ? where.slice(state.outDir.name.length + 1) : where;
  if (state.outDir && rel && text) ftPut(rel, text);
  if (!meta || !(meta.sender || meta.type || meta.deadline || meta.subject)) return;
  learnRule(meta);
  const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), savedAt: stamp(), date: meta.date, sender: meta.sender, type: meta.type,
    subject: meta.subject, deadline: meta.deadline, amount: meta.amount, reference: meta.reference || meta.customerNo, invoiceNo: meta.invoiceNo,
    file: rel || '', pages, done: false, by: S.author || '', sha256: state.hashes?.[rel] || '', inNo: meta.inNo || '',
    assignee: state.assignee || '', status: 'offen', upd: updStamp(), wv: state.wv || '', akte: state.akte || '', tags: Journal.tagList(state.tags).join(', '), fields: Journal.fieldsText(state.cf) };
  try {
    const all = await journalAll(), fa = state.fromArchive;
    const old = fa?.saved && fa.id ? all.find(x => x.id === fa.id) : null;
    if (old) {   // neue Version desselben Dokuments: Eintrag fortschreiben statt neuen anlegen
      const upd = { ...old, ...Object.fromEntries(['date', 'sender', 'type', 'subject', 'deadline', 'amount', 'reference', 'invoiceNo', 'akte', 'tags', 'fields'].map(k => [k, e[k] || old[k] || ''])),
        file: old.file, sha256: e.sha256 || old.sha256, pages, ver: String((+old.ver || 1) + 1), upd: updStamp() };
      upd.seal = await sha256(new TextEncoder().encode(Journal.sealText(upd)));
      await journalSave(all.map(x => x.id === old.id ? upd : x));
      status(`Neue Version gespeichert (v${upd.ver}) – die bisherige Fassung liegt unverändert in „${fa.saved.prev}“.`);
      fa.saved = null; return;
    }
    e.ver = '1'; e.seal = await sha256(new TextEncoder().encode(Journal.sealText(e)));
    await journalSave(Journal.merge(all, [e]));
  } catch (err) { console.warn(err); }
}

/* Lernende Ablage: Typ je Absender merken (der zuletzt abgelegte gewinnt). Mit Ablageordner teamweit als JSON-Datei. */
const RULES_FILE = 'pdfmy-Regeln.json', normSender = s => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9]+/g, ' ').trim();
let rules = LS.get('rules', {});
function ruleFor(sender) { const k = normSender(sender); return k.length > 2 ? rules[k]?.type || '' : ''; }
async function learnRule(meta) {
  const k = normSender(meta.sender); if (k.length < 3 || !meta.type) return;
  if (state.outDir) { try { rules = { ...JSON.parse(await (await (await state.outDir.getFileHandle(RULES_FILE)).getFile()).text()), ...rules }; } catch {} }
  rules[k] = { type: meta.type, at: stamp() };
  LS.set('rules', rules);
  if (state.outDir) { try { const w = await (await state.outDir.getFileHandle(RULES_FILE, { create: true })).createWritable(); await w.write(JSON.stringify(rules, null, 1)); await w.close(); } catch {} }
}
setTimeout(async () => { if (state.outDir) try { rules = { ...JSON.parse(await (await (await state.outDir.getFileHandle(RULES_FILE)).getFile()).text()), ...rules }; } catch {} }, 1500);

/* Dubletten: wurde dieser Brief schon abgelegt? (gleicher Absender + gleiche Rechnungs-Nr./Zeichen, oder gleiches Datum + Betreff) */
function findDuplicate(meta, list = jLocal()) {
  const n = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n(meta.sender)) return null;
  return list.find(e => n(e.sender) === n(meta.sender) && (
    (n(meta.invoiceNo) && n(e.invoiceNo) === n(meta.invoiceNo)) ||
    (n(meta.reference) && n(e.reference) === n(meta.reference) && n(e.date) === n(meta.date)) ||
    (n(meta.date) && n(e.date) === n(meta.date) && n(meta.subject) && n(e.subject) === n(meta.subject)))) || null;
}
async function confirmNotDuplicate(meta) {
  const d = findDuplicate(meta, await journalAll());
  return !d || confirm(`Dieser Brief scheint schon abgelegt zu sein:\n\n${[d.type, d.sender, d.subject].filter(Boolean).join(' · ')}\nEingang ${d.savedAt}${d.by ? ' (' + d.by + ')' : ''}\n${d.file}\n\nTrotzdem noch einmal ablegen?`);
}

/* ---------- Archivsuche: Volltext aller PDFs in der Ablage (auch von Kollegen abgelegte) ---------- */
// Index im Browser (IndexedDB): Pfad → { m: Änderungszeit, t: Text }. Geänderte/neue Dateien werden nachgelesen.
let FT = null, ftTimer = null, ftScanning = null;
async function ftLoad() { if (!FT) FT = new Map(Object.entries((await idb.get('fulltext')) || {})); return FT; }
const ftSave = () => { clearTimeout(ftTimer); ftTimer = setTimeout(() => idb.set('fulltext', Object.fromEntries([...FT].map(([k, v]) => [k, { m: v.m, t: v.t }]))), 600); };
const ftClean = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 30000);
async function ftPut(rel, text) { await ftLoad(); FT.set(rel, { m: 0, t: ftClean(text) }); ftSave(); }
async function ftScan() {
  if (!state.outDir) return;
  if (ftScanning) return ftScanning;
  ftScanning = (async () => {
    await ftLoad();
    const todo = [];
    const walk = async (dir, prefix, depth) => {
      for await (const [n, h] of dir.entries()) {
        if (h.kind === 'directory' && depth < 4 && !n.startsWith('.')) await walk(h, prefix + n + '\\', depth + 1);
        else if (h.kind === 'file' && /\.pdf$/i.test(n)) todo.push([prefix + n, h]);
      }
    };
    await walk(state.outDir, '', 0);
    let k = 0;
    for (const [rel, h] of todo) {
      const f = await h.getFile(), e = FT.get(rel);
      if (e && (e.m === f.lastModified || e.m === 0)) { if (e.m === 0) e.m = f.lastModified; continue; }
      $('#jIdx').textContent = `Ablage wird durchsuchbar gemacht … ${++k}`;
      let t = '';
      try {
        const js = await openPdf(new Uint8Array(await f.arrayBuffer()));
        for (let i = 1; i <= Math.min(js.numPages, 40); i++) t += (await (await js.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + ' ';
        js.destroy();
      } catch {}
      FT.set(rel, { m: f.lastModified, t: ftClean(t) });
    }
    const live = new Set(todo.map(x => x[0]));
    for (const key of [...FT.keys()]) if (!live.has(key)) FT.delete(key);
    ftSave();
    $('#jIdx').textContent = `Volltextsuche über ${todo.length} PDF(s) der Ablage`;
    if ($('#jDlg').open && $('#jq').value.trim().length >= 3) renderJournal();
  })().catch(e => console.warn('Archivsuche:', e)).finally(() => { ftScanning = null; });
  return ftScanning;
}
function ftHit(rel, q) {
  const e = FT?.get(rel); if (!e || !e.t) return null;
  const lo = e.lo ||= e.t.toLowerCase(), at = lo.indexOf(q);
  return at < 0 ? null : (at > 40 ? '…' : '') + e.t.slice(Math.max(0, at - 40), at + q.length + 60) + '…';
}
const hl = (s, q) => esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[&<>"]/g, c => esc(c)), 'gi'), m => `<mark>${m}</mark>`);

/* Fristen-Überblick auf der Startseite */
const fmtDate = iso => iso ? I18N.fmtDate(iso.slice(0, 10)) : '';   // Anzeige im Format der Oberflächensprache
const inDays = d => d < -1 ? `seit ${-d} Tagen überfällig` : d === -1 ? 'seit gestern überfällig' : d === 0 ? 'heute' : d === 1 ? 'morgen' : `in ${d} Tagen`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function renderDeadlines(list = jLocal()) {
  const box = $('#deadlines'); if (!box) return;
  const due = Journal.deadlines(list), n = list.length;
  if (!n) { box.hidden = true; return; }
  box.hidden = false;
  const urgent = due.filter(e => e.state !== 'later').length;
  const my = S.author ? list.filter(e => Journal.mine(e, S.author) && !Journal.isClosed(e)).length : 0;
  box.innerHTML = `<div class="dl-head"><b>${due.length ? `Fristen${urgent ? ` <span class="dl-badge">${urgent} dringend</span>` : ''}` : 'Keine offenen Fristen'}</b>
    <span>${my ? `<button type="button" class="linkbtn" data-j="mine">Meine Post (${my})</button> · ` : ''}<button type="button" class="linkbtn" data-j="open">Posteingangsbuch (${n}) →</button></span></div>
    <div class="dl-list">${Journal.resubmit(list).slice(0, 5).map(e => `<button type="button" class="dl wv" data-id="${esc(e.id)}"><span class="dl-when">Wiedervorlage</span><span class="dl-what">${esc([e.type, e.sender].filter(Boolean).join(' · ') || e.file)}</span><span class="dl-date">${fmtDate(e.wv)}</span></button>`).join('')}${due.slice(0, 5).map(e => `<button type="button" class="dl ${e.state}" data-id="${esc(e.id)}"><span class="dl-when">${inDays(e.days)}</span>
    <span class="dl-what">${esc([e.type, e.sender].filter(Boolean).join(' · ') || e.file)}</span><span class="dl-date">${fmtDate(e.deadline)}</span></button>`).join('')}</div>`;
  box.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.j === 'remind') return enableReminders();
    openJournal('', b.dataset.id, b.dataset.j === 'mine' ? 'mine' : b.dataset.j === 'expired' ? 'expired' : '');
  };
  if (due.length && 'Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied' && !IS_IOS)
    box.querySelector('.dl-head > span').insertAdjacentHTML('afterbegin', '<button type="button" class="linkbtn" data-j="remind" title="Einmal am Tag eine Erinnerung, wenn Fristen heute fällig oder überfällig sind">Erinnern</button> · ');
  remindDeadlines(due);
  const expired = list.filter(e => e.file && !e.retainMoved && Journal.retention(e).expired).length;
  if (expired) box.insertAdjacentHTML('beforeend', `<div class="hint retainhint"><button type="button" class="linkbtn" data-j="expired">${expired} Beleg(e) über der gesetzlichen Aufbewahrungsfrist</button> – können aussortiert werden.</div>`);
  fillTeam(list);
}

/* ---------- Fristen-Erinnerung: Zahl am App-Symbol und im Fenstertitel, auf Wunsch einmal täglich eine Mitteilung ---------- */
function remindDeadlines(due) {
  const urgent = due.filter(e => e.days <= 0).length, soon = due.filter(e => e.state !== 'later').length;
  try { soon ? navigator.setAppBadge?.(soon) : navigator.clearAppBadge?.(); } catch {}
  document.title = (urgent ? `(${urgent}) ` : '') + document.title.replace(/^\(\d+\) /, '');
  const today = todayStr();
  if (urgent && 'Notification' in window && Notification.permission === 'granted' && LS.get('remindDay', '') !== today) {
    LS.set('remindDay', today);
    const first = due[0], what = [first.type, first.sender].filter(Boolean).join(' · ') || first.file;
    try {
      const n = new Notification(I18N.t(`PDFMy: ${urgent > 1 ? `${urgent} Fristen` : `${urgent} Frist`} heute fällig oder überfällig`), { body: what + (urgent > 1 ? ` und ${urgent - 1} weitere` : ''), icon: 'icons/mentor-192.png', tag: 'pdfmy-fristen' });
      n.onclick = () => { focus(); openJournal('', first.id, 'open'); n.close(); };
    } catch {}
  }
}
async function enableReminders() {
  const r = await Notification.requestPermission().catch(() => 'denied');
  if (r === 'granted') { LS.set('remindDay', ''); toast('Erinnerung eingeschaltet: Einmal am Tag eine Mitteilung, wenn Fristen fällig sind (solange PDFMy geöffnet ist bzw. beim Start).', 7000); }
  else toast('Mitteilungen sind im Browser gesperrt – die Fristen stehen weiterhin auf der Startseite.', 6000);
  renderDeadlines();
}
// Läuft PDFMy den ganzen Tag: einmal pro Stunde nachsehen (neuer Tag → neue Erinnerung)
setInterval(() => { try { renderDeadlines(); } catch {} }, 3600 * 1000);

/* Posteingangsbuch-Fenster: suchen, filtern, erledigt abhaken, Brief öffnen, als Excel speichern */
let jList = [];
async function openJournal(q = '', focusId, filter) {
  jList = await journalAll(); await teamLoad(); fillTeam(jList); jFillFilters();
  $('#jq').value = q; $('#jf').value = filter || (focusId ? 'open' : 'all');
  renderJournal(focusId);
  if (!$('#jDlg').open) $('#jDlg').showModal();
  $('#jIdx').textContent = state.outDir ? '' : 'Volltextsuche: mit Ablageordner auch im Text aller abgelegten Briefe.';
  ftScan();
  $('#jHint').textContent = state.outDir ? `Gemeinsame Datei: ${state.outDir.name}\\${JOURNAL_FILE} (für das Team, wenn die Ablage in SharePoint/OneDrive liegt)`
    : 'Nur in diesem Browser gespeichert. Mit einem Ablageordner wird das Buch dort als Excel-Datei geführt – für das ganze Team.';
}
// Filter „Akte“ und „Jahr“ aus den Einträgen füllen (Auswahl bleibt erhalten)
function jFillFilters() {
  const ak = $('#jAkte').value, yr = $('#jYear').value, tg = $('#jTag').value, names = fillCases(jList);
  $('#jTag').innerHTML = `<option value="">Alle Schlagwörter</option>` + Journal.allTags(jList).map(t => `<option value="${esc(t.tag)}"${t.tag.toLowerCase() === tg.toLowerCase() && tg ? ' selected' : ''}>${esc(t.tag)} (${t.n})</option>`).join('');
  $('#jAkte').innerHTML = `<option value="">Alle Akten</option>` + names.map(n => `<option${n === ak ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const years = [...new Set(jList.map(e => (e.date || e.savedAt || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort().reverse();
  $('#jYear').innerHTML = `<option value="">Alle Jahre</option>` + years.map(y => `<option${y === yr ? ' selected' : ''}>${y}</option>`).join('');
}
function jSetView(cases) {
  $('#jvList').setAttribute('aria-pressed', String(!cases)); $('#jvCases').setAttribute('aria-pressed', String(cases));
  $('#jCases').hidden = !cases; $('#jWrap').hidden = cases; if (cases) $('#jPrev').hidden = true;
  if (cases) renderCases(); else renderJournal();
}
function renderCases() {
  const list = Journal.cases(jList, todayStr()), q = $('#jq').value.trim().toLowerCase();
  const rows = list.filter(c => !q || c.name.toLowerCase().includes(q));
  $('#jCount').textContent = `${rows.length} Akte(n)`;
  $('#jCases').innerHTML = rows.map(c => `<div class="jcase" data-akte="${esc(c.name)}"><b>${esc(c.name)}</b>
    <div class="acts"><button type="button" class="linkbtn" data-show>Dokumente anzeigen</button>${state.outDir ? '<button type="button" class="linkbtn" data-openall>Akte öffnen</button>' : ''}</div>
    <span class="meta">${c.count === 1 ? '1 Dokument' : `${c.count} Dokumente`}${c.open ? ` · ${c.open} offen` : ''}${c.last ? ` · zuletzt ${esc(fmtDate(c.last))}` : ''}${c.next ? ` · <span class="due">Frist ${esc(fmtDate(c.next))}</span>` : ''}${c.people.length ? ` · ${esc(c.people.join(', '))}` : ''}</span></div>`).join('')
    || `<p class="hint" style="padding:12px">${jList.length ? 'Noch keine Akten. Beim Ablegen einfach eine Akte eintragen (Feld „Akte“ in den Briefdaten) – oder hier in der Liste „Dokumente“ in der Spalte „Akte“.' : 'Noch leer.'}</p>`;
}
$('#jvList').onclick = () => jSetView(false);
$('#jvCases').onclick = () => jSetView(true);
$('#jAkte').onchange = () => renderJournal();
$('#jYear').onchange = () => renderJournal();
$('#jTag').onchange = () => renderJournal();
$('#jBody').addEventListener('focusin', ev => { if (ev.target.matches('[data-tags]')) tagSuggest(ev.target, jList, jList.find(x => x.id === ev.target.closest('tr')?.dataset.id)?.tags); });
$('#jBody').addEventListener('input', ev => { if (ev.target.matches('[data-tags]')) tagSuggest(ev.target, jList, jList.find(x => x.id === ev.target.closest('tr')?.dataset.id)?.tags); });
$('#jCases').addEventListener('click', async ev => {
  const card = ev.target.closest('[data-akte]'); if (!card) return;
  const name = card.dataset.akte;
  if (ev.target.closest('[data-show]')) { jFillFilters(); $('#jAkte').value = name; jSetView(false); }
  else if (ev.target.closest('[data-openall]')) await openCase(name);
});
// Akte öffnen: alle Dokumente der Akte nach Datum als ein Dokument (zum Lesen, Drucken, Zusammen-Speichern)
async function openCase(name) {
  const docs = jList.filter(e => String(e.akte || '').trim().toLowerCase() === name.toLowerCase() && e.file).sort((a, b) => String(a.date || a.savedAt).localeCompare(String(b.date || b.savedAt)));
  if (!docs.length) return status('In dieser Akte sind keine Dateien abgelegt.');
  if (state.dirty && state.pages.length && !confirm('Aktuellen Brief verwerfen? Er wurde noch nicht gespeichert.')) return;
  const files = [], missing = [];
  for (const e of docs) {
    try { let dir = state.outDir; const parts = e.file.split('\\'), fn = parts.pop(); for (const p of parts) dir = await dir.getDirectoryHandle(p); files.push(await (await dir.getFileHandle(fn)).getFile()); }
    catch { missing.push(e.file); }
  }
  if (!files.length) return status('Die Dateien dieser Akte wurden nicht gefunden (verschoben oder umbenannt?).');
  $('#jDlg').close(); resetDoc(); await importFiles(files);
  state.akte = name; $('#akte').value = name; state.akteTouched = true;
  status(`Akte „${name}“: ${files.length === 1 ? '1 Dokument' : `${files.length} Dokumente`} geöffnet${missing.length ? ` – ${missing.length} nicht gefunden` : ''}.`);
}
function renderJournal(focusId) {
  if (!$('#jCases').hidden) return renderCases();
  const q = $('#jq').value.trim().toLowerCase(), f = $('#jf').value, today = Journal.deadlines(jList);
  const dueIds = new Map(today.map(e => [e.id, e]));
  const deep = q.length >= 3 && FT, snip = new Map();
  let rows = jList.filter(e => {
    if (!q || Object.values(e).join(' ').toLowerCase().includes(q)) return true;
    const s = deep && ftHit(e.file, q); if (s) snip.set(e.id, s); return !!s;
  });
  // Treffer in Ablage-PDFs ohne Eintrag im Buch (z. B. früher oder von Kollegen abgelegt)
  if (deep && f === 'all') {
    const known = new Set(jList.map(e => e.file));
    for (const rel of FT.keys()) if (!known.has(rel)) { const s = ftHit(rel, q); if (s) { const id = 'f:' + rel; snip.set(id, s); rows.push({ id, file: rel, savedAt: '', sender: '', type: '', subject: rel.split('\\').pop().replace(/\.pdf$/i, ''), extra: true }); } }
  }
  const ak = $('#jAkte').value.toLowerCase(), yr = $('#jYear').value;
  if (ak) rows = rows.filter(e => String(e.akte || '').trim().toLowerCase() === ak);
  if (yr) rows = rows.filter(e => (e.date || e.savedAt || '').startsWith(yr));
  const tg = $('#jTag').value.toLowerCase(); if (tg) rows = rows.filter(e => Journal.tagList(e.tags).some(t => t.toLowerCase() === tg));
  if (f === 'mine') {
    if (!S.author) { $('#jIdx').textContent = 'Für „Meine Post“ unter Einstellungen Ihr Name oder Kürzel eintragen.'; }
    rows = rows.filter(e => !e.extra && Journal.mine(e, S.author) && !Journal.isClosed(e));
  }
  if (f === 'open') rows = rows.filter(e => !e.extra && !Journal.isClosed(e));
  if (f === 'due') rows = rows.filter(e => dueIds.has(e.id)).sort((a, b) => dueIds.get(a.id).days - dueIds.get(b.id).days);
  if (f === 'paid') rows = rows.filter(e => e.status === 'bezahlt');
  if (f === 'expired') rows = rows.filter(e => !e.extra && e.file && !e.retainMoved && Journal.retention(e).expired);
  $('#jRetainMove').hidden = f !== 'expired' || !rows.length || !state.outDir;
  if (f === 'done') rows = rows.filter(e => e.status === 'erledigt');
  $('#jCount').textContent = q ? `${rows.length} Treffer` : `${rows.length} von ${jList.length} Einträgen`;
  $('#jBody').innerHTML = rows.map(e => {
    const d = dueIds.get(e.id);
    const closed = !e.extra && Journal.isClosed(e);
    return `<tr data-id="${esc(e.id)}" class="${closed ? 'done' : ''}${e.id === focusId ? ' focus' : ''} st-${(e.status || '').replace(' ', '-')}">
      <td>${e.extra ? '' : `<select data-st title="Status">${Journal.STATUS.map(s => `<option${s === e.status ? ' selected' : ''}>${s}</option>`).join('')}</select>`}</td>
      <td>${e.extra ? '' : `<input data-as list="teamList" value="${esc(e.assignee)}" placeholder="–" title="Zuständig" size="6">`}</td><td>${e.extra ? '' : `<input data-akte list="caseList" value="${esc(e.akte)}" placeholder="–" title="Akte" aria-label="Akte">`}</td><td>${e.extra ? '<span class="hint">Ablage</span>' : esc(fmtDate(e.savedAt))}${e.inNo ? `<br><small class="hint">Nr. ${esc(e.inNo)}</small>` : ''}</td>
      <td>${esc(e.sender)}</td><td>${esc(e.type)}</td><td class="jsub">${esc(e.subject)}${e.sigs ? `<small class="jcf" translate="no">✍ ${esc(e.sigs)}</small>` : ''}${e.sigReads?.length ? `<small class="jcf" translate="no">✓✓ ${esc(I18N.t('Gelesen'))}: ${e.sigReads.map(x => esc(x.n) + ' (' + esc(SigReq.fmt(x.at)) + ')').join(', ')}</small>` : ''}${+e.remN ? `<small class="jcf">Erinnert: ${esc(e.remN)}× · zuletzt ${esc(fmtDate(e.remAt))}</small>` : ''}${e.fields ? `<small class="jcf" translate="no">${esc(String(e.fields).replace(/; /g, ' · '))}</small>` : ''}${snip.has(e.id) ? `<small class="snip">${hl(snip.get(e.id), q)}</small>` : ''}${e.extra ? '' : `<div class="jtags">${Journal.tagList(e.tags).map(t => `<span class="tagw"><button type="button" class="tag" data-tag="${esc(t)}" title="Nur Dokumente mit diesem Schlagwort zeigen">${esc(t)}</button><button type="button" class="untag" data-untag="${esc(t)}" aria-label="${esc(`Schlagwort „${t}“ entfernen`)}" title="Entfernen">×</button></span>`).join('')}<input data-tags list="tagList" value="" placeholder="+ Schlagwort" aria-label="Schlagwort hinzufügen"></div>`}</td>
      <td class="jdl ${d ? d.state : ''}">${e.deadline ? fmtDate(e.deadline) + (d ? `<small>${inDays(d.days)}</small>` : '') : ''}${e.wv ? `<small class="wvtag">WV ${fmtDate(e.wv)} <button type="button" class="linkbtn" data-wvclear="${esc(e.id)}" title="Wiedervorlage erledigt" aria-label="Wiedervorlage entfernen">✕</button></small>` : ''}</td>
      <td>${esc(e.amount)}</td><td>${esc(e.reference || e.invoiceNo)}</td>
      <td class="jact">${+e.ver > 1 ? `<small class="ver" title="${esc(`${e.ver} Fassungen – frühere liegen unverändert im Ordner „_Versionen“`)}">v${esc(e.ver)}</small> ` : ''}${e.file && state.outDir ? `<button type="button" class="linkbtn" data-open title="${esc(e.file)}">Öffnen</button>` : `<span class="hint" title="${esc(e.file)}">${esc((e.file || '').split('\\').pop().slice(0, 28))}</span>`}${e.file && state.outDir ? ` <button type="button" class="linkbtn" data-share title="Per WhatsApp, Telegram, Webex oder E-Mail senden">Teilen</button>` : ''}${e.extra ? '' : ` <button type="button" class="linkbtn" data-fwd title="An Kollegen weitergeben: zuständig setzen und E-Mail mit allen Briefdaten öffnen">Weiterleiten</button>`}${e.sigreq && e.sigTo && e.status === 'in Arbeit' ? ` <button type="button" class="linkbtn" data-sigrem${SigReq.urgent(e.sigSince || e.savedAt, e.deadline) ? ' data-urgent' : ''} title="${esc(`Erinnerungs-E-Mail an ${e.sigName || e.sigTo} vorbereiten`)}">Erinnern</button>` : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="11" class="hint" style="padding:18px">${jList.length ? 'Keine Treffer.' : 'Noch leer. Jeder abgelegte Brief wird hier automatisch eingetragen – mit Absender, Betreff, Betrag und Frist.'}</td></tr>`;
  $('#jBody tr.focus')?.scrollIntoView({ block: 'center' });
  // Vorschau behalten, solange die Zeile noch in der Liste steht
  const sel = jSel && [...$('#jBody').rows].find(r => r.dataset.id === jSel);
  if (sel) sel.classList.add('sel'); else { jSel = null; $('#jPrev').hidden = true; }
}
// Status und Zuständig direkt in der Tabelle ändern – mit Zeitstempel, damit im Team die letzte Änderung gilt
async function updateEntry(id, patch) {
  const all = (await journalAll()).map(x => x.id === id ? { ...x, ...patch, upd: updStamp() } : x);
  jList = all; LS.set('journal', all.slice(0, 2000));
  if (!await jWriteDir(all)) status(`Posteingangsbuch: „${JOURNAL_FILE}“ ist gerade gesperrt (in Excel geöffnet?) – die Änderung ist lokal gespeichert.`);
  renderDeadlines(all);
  return all.find(x => x.id === id);
}
$('#jBody').addEventListener('change', async ev => {
  const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
  if (ev.target.matches('[data-st]')) {
    const e = await updateEntry(tr.dataset.id, { status: ev.target.value });
    tr.classList.toggle('done', Journal.isClosed(e)); tr.className = tr.className.replace(/\bst-\S+/, 'st-' + e.status.replace(' ', '-'));
    status(`Status: ${e.status} – ${[e.type, e.sender].filter(Boolean).join(' ')}`);
  } else if (ev.target.matches('[data-tags]')) {
    const cur = jList.find(x => x.id === tr.dataset.id)?.tags || '';
    const e = await updateEntry(tr.dataset.id, { tags: Journal.tagList(cur + ',' + ev.target.value).join(', ') }); jFillFilters(); renderJournal();
    status(e.tags ? `Schlagwörter: ${e.tags}` : 'Schlagwörter entfernt.');
  } else if (ev.target.matches('[data-akte]')) {
    const e = await updateEntry(tr.dataset.id, { akte: ev.target.value.trim() }); jFillFilters();
    status(e.akte ? `Akte: ${e.akte} – ${[e.type, e.sender].filter(Boolean).join(' ')}` : 'Aus der Akte entfernt.');
  } else if (ev.target.matches('[data-as]')) {
    const e = await updateEntry(tr.dataset.id, { assignee: ev.target.value.trim() });
    status(e.assignee ? `Zuständig: ${e.assignee} – ${[e.type, e.sender].filter(Boolean).join(' ')}` : 'Zuständigkeit entfernt.');
  }
});

/* ---------- Team: Namen/Kürzel und E-Mail-Adressen (lokal und, mit Ablage, als pdfmy-Team.json für alle) ---------- */
const TEAM_FILE = 'pdfmy-Team.json';
let team = LS.get('team', {});
async function teamLoad() {
  if (!state.outDir) return team;
  try { team = { ...JSON.parse(await (await (await state.outDir.getFileHandle(TEAM_FILE)).getFile()).text()), ...team }; } catch {}
  return team;
}
async function teamSave() {
  LS.set('team', team);
  if (state.outDir) try { const w = await (await state.outDir.getFileHandle(TEAM_FILE, { create: true })).createWritable(); await w.write(JSON.stringify(team, null, 1)); await w.close(); } catch {}
}
function fillTeam(list = jList) {
  const names = new Set([S.author, ...Object.keys(team), ...list.flatMap(e => [e.by, e.assignee])].map(x => String(x || '').trim()).filter(Boolean));
  $('#teamList').innerHTML = [...names].sort((a, b) => a.localeCompare(b, 'de')).map(n => `<option value="${esc(n)}">${team[n] ? esc(team[n]) : ''}</option>`).join('');
}

/* ---------- Weiterleiten: zuständig setzen + E-Mail mit allen Briefdaten und Ablagepfad ---------- */
let fwdEntry = null;
function openForward(e) {
  fwdEntry = e;
  $('#fwdWhat').textContent = [e.type, e.sender, e.subject].filter(Boolean).join(' · ') || e.file;
  $('#fwdTo').value = e.assignee && !Journal.mine(e, S.author) ? e.assignee : '';
  $('#fwdMail').value = team[$('#fwdTo').value] || ''; $('#fwdNote').value = '';
  $('#fwdErr').textContent = '';
  $('#fwdDlg').showModal(); $('#fwdTo').focus();
}
$('#fwdTo').addEventListener('input', () => { const m = team[$('#fwdTo').value.trim()]; if (m) $('#fwdMail').value = m; });
$('#fwdCancel').onclick = () => $('#fwdDlg').close();
$('#fwdForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const to = $('#fwdTo').value.trim(), mail = $('#fwdMail').value.trim(), note = $('#fwdNote').value.trim();
  if (!to) { $('#fwdErr').textContent = 'Bitte Namen oder Kürzel angeben.'; return; }
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { $('#fwdErr').textContent = 'Die E-Mail-Adresse sieht nicht gültig aus.'; return; }
  if (mail && team[to] !== mail) { team[to] = mail; await teamSave(); }
  // Aus dem geöffneten Brief (noch nicht abgelegt): Zuständigkeit für die Ablage vormerken
  const e = fwdEntry.id ? await updateEntry(fwdEntry.id, { assignee: to, status: fwdEntry.status === 'offen' ? 'in Arbeit' : fwdEntry.status })
    : (state.assignee = to, $('#assignee').value = to, { ...fwdEntry, assignee: to });
  $('#fwdDlg').close(); renderJournal(); fillTeam();
  if (mail) {
    const a = document.createElement('a');
    a.href = Journal.forwardMail(e, { to: mail, note, from: S.author, folder: state.outDir?.name || '' }); a.click();
    status(`Weitergeleitet an ${to}: Zuständigkeit gesetzt, E-Mail ist vorbereitet.`);
  } else status(`Zuständig: ${to}. (Mit E-Mail-Adresse öffnet sich zusätzlich eine vorbereitete E-Mail.)`);
});
$('#assignee').addEventListener('input', e => { state.assignee = e.target.value.trim(); });
/* ---------- Akten ---------- */
$('#akte').addEventListener('input', e => { state.akte = e.target.value.trim(); state.akteTouched = true; });
function fillCases(list = jLocal()) {
  const names = [...new Set(list.map(e => String(e.akte || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  $('#caseList').innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');
  return names;
}
window.suggestAkte = () => {
  if (state.akteTouched || !state.pages.length) return;
  const s = Journal.suggestCase(jLocal(), state.meta);
  if (s !== (state.akte || '')) { state.akte = s; $('#akte').value = s; $('#akte').title = s ? 'Vorschlag aus früher abgelegten Briefen (gleiches Aktenzeichen bzw. gleicher Absender)' : ''; }
};
fillCases();
/* ---------- Eigene Felder (Mandant, Projekt …): Namen fürs Büro (mit Ablage als pdfmy-Felder.json für alle), Werte je Brief ---------- */
const FIELDS_FILE = 'pdfmy-Felder.json';
let cfNames = Journal.fieldNames(LS.get('fields', []));
state.cf = state.cf || {};
async function cfLoad() {
  if (state.outDir) try {
    const f = JSON.parse(await (await (await state.outDir.getFileHandle(FIELDS_FILE)).getFile()).text());
    if (Array.isArray(f.names)) { cfNames = Journal.fieldNames(f.names); LS.set('fields', cfNames); }
  } catch {}
  cfRender();
}
async function cfSave(names) {
  cfNames = Journal.fieldNames(names); LS.set('fields', cfNames);
  if (state.outDir) try { const w = await (await state.outDir.getFileHandle(FIELDS_FILE, { create: true })).createWritable(); await w.write(JSON.stringify({ names: cfNames }, null, 1)); await w.close(); } catch {}
  cfRender();
}
function cfRender() {
  const list = jLocal();
  $('#cfBox').innerHTML = cfNames.map((n, i) => `<div class="field"><label for="cf-${i}" translate="no">${esc(n)}</label><input id="cf-${i}" data-cf="${esc(n)}" list="cfl-${i}" autocomplete="off" value="${esc(state.cf?.[n] || '')}"><datalist id="cfl-${i}">${Journal.fieldValues(list, n).slice(0, 30).map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist></div>`).join('');
  $('#cfEdit').textContent = cfNames.length ? 'Eigene Felder ändern …' : 'Eigene Felder festlegen …';
}
window.cfRender = cfRender;
$('#cfBox').addEventListener('input', ev => { const n = ev.target.dataset.cf; if (n == null) return; state.cf = { ...state.cf, [n]: ev.target.value }; state.cfTouched = true; });
// Vorschlag aus früheren Briefen (gleiches Aktenzeichen bzw. gleicher Absender), solange nichts selbst eingetragen wurde
window.suggestFields = () => {
  if (state.cfTouched || !state.pages.length || !cfNames.length) return;
  const s = Journal.suggestFields(jLocal(), state.meta);
  state.cf = Object.fromEntries(cfNames.map(n => [n, s[n] || ''])); cfRender();
};
$('#cfEdit').onclick = () => {
  const ph = ['z. B. Mandant', 'z. B. Projekt', 'z. B. Kostenstelle', '', ''];
  $('#cfNames').innerHTML = [0, 1, 2, 3, 4].map(i => `<div class="field"><label for="cfN${i}">${`Feld ${i + 1}`}</label><input id="cfN${i}" maxlength="30" autocomplete="off" value="${esc(cfNames[i] || '')}" placeholder="${esc(ph[i])}"></div>`).join('');
  $('#cfDlg').showModal(); $('#cfN0').focus();
};
$('#cfCancel').onclick = () => $('#cfDlg').close();
$('#cfForm').onsubmit = async ev => {
  ev.preventDefault();
  await cfSave([0, 1, 2, 3, 4].map(i => $('#cfN' + i).value));
  $('#cfDlg').close();
  status(cfNames.length ? `Eigene Felder: ${cfNames.join(', ')}` : 'Keine eigenen Felder.');
};
cfRender(); cfLoad();
/* ---------- Unterschriftsanfrage per E-Mail (js/sigreq.js): Unterzeichner festlegen, Felder setzen, nacheinander unterschreiben lassen ---------- */
let req = null, reqDoc = -1, reqArm = -1, reqDraft = false, reqHash = '', reqSigned = false, reqStart = 0, reqType = 'sign', reqAudit = false, reqExt = false;
let reqTrack = -1, reqSeen = new Set(), reqFromMe = false;   // reqFromMe: dieser Rechner ist der Absender (für Handlungstipps)   // Person, deren Lesen gerade festgehalten wird, und angesehene Seiten
const RQ_ICON = { sign: '✍', initials: '✍', date: '📅', name: '👤', text: '✎', check: '☑' };
const reqMine = () => req && !reqDraft ? SigReq.next(req) : -1;
window.reqReset = () => { reqFromMe = false; reqConfirmed = false; reqTrack = -1; reqSeen = new Set(); req = null; reqDoc = -1; reqArm = -1; reqDraft = false; reqHash = ''; reqSigned = false; reqExt = false; reqBytes = null; reqBase = null; renderReqBar(); };
function reqRow(s = {}, i = 0) {
  return `<div class="reqrow"><b>${i + 1}.</b><input data-rn aria-label="Name" placeholder="Name" list="teamList" autocomplete="off" value="${esc(s.name || '')}"><input data-rm type="email" aria-label="E-Mail-Adresse" placeholder="E-Mail-Adresse" value="${esc(s.email || '')}"><button type="button" class="linkbtn" data-rdel aria-label="Person entfernen" title="Person entfernen">✕</button></div>`;
}
function reqRenumber() { [...$('#reqRows').children].forEach((r, i) => { r.querySelector('b').textContent = `${i + 1}.`; }); }
$('#btnSigReq').onclick = () => {
  if (!state.pages.length) return status('Zuerst ein Dokument öffnen, das unterschrieben werden soll.');
  const cur = reqDraft && req ? req : null;
  $('#reqTitle').value = cur?.title || state.meta?.subject || filename().replace(/\.pdf$/i, '');
  $('#reqRows').innerHTML = (cur?.signers.length ? cur.signers : [{}]).map(reqRow).join('');
  $('#reqMe').value = cur?.requester.name || S.author || ''; $('#reqMeMail').value = cur?.requester.email || LS.get('reqMail', '') || team[S.author] || '';
  $('#reqMsg').value = cur?.message || ''; $('#reqDue').value = cur?.due || ''; $('#reqCc').value = (cur?.cc || []).join(', '); $('#reqErr').textContent = '';
  reqTplFill(cur ? '' : null);
  $('#reqSerial').checked = !!cur?.serial; $('#reqList').value = cur?.serial ? cur.serial.map(s => `${s.name}; ${s.email}`).join('\n') : ''; reqSerialUi();
  $('#reqDlg').showModal(); $('#reqRows input').focus();
};
// Serienversand: Empfängerliste statt Reihenfolge
function reqSerialUi() {
  const on = $('#reqSerial').checked; $('#reqSerialBox').hidden = !on; document.querySelector('#reqDlg .reqsig').hidden = on;
  if (!on) { $('#reqListInfo').textContent = ''; return; }
  const { list, bad } = SigReq.recipients($('#reqList').value);
  $('#reqListInfo').textContent = !$('#reqList').value.trim() ? '' : `${list.length} Empfänger erkannt${bad.length ? ` · ${bad.length} Zeile(n) ohne gültige E-Mail-Adresse: ${bad.slice(0, 3).join(' | ')}` : ''}`;
}
$('#reqSerial').onchange = reqSerialUi;
$('#reqList').addEventListener('input', reqSerialUi);
$('#reqListFile').onclick = () => $('#reqListIn').click();
$('#reqListIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const raw = new Uint8Array(await f.arrayBuffer());
  let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { t = new TextDecoder('windows-1252').decode(raw); }   // ältere Excel-CSV
  $('#reqList').value = t; reqSerialUi();
};
// Vorlagen für wiederkehrende Dokumente (Personen, Felder, Nachricht, Frist in Tagen) – nur auf diesem Gerät
const reqTpls = () => LS.get('reqTpl', []);
function reqTplFill(sel) {
  const list = reqTpls(); $('#reqTplRow').hidden = !list.length;
  $('#reqTpl').innerHTML = '<option value="">– keine –</option>' + list.map((t, i) => `<option value="${i}" translate="no">${esc(t.name)}</option>`).join('');
  $('#reqTpl').value = sel ?? ''; $('#reqTplDel').hidden = !$('#reqTpl').value;
}
$('#reqTpl').onchange = () => {
  const t = reqTpls()[+$('#reqTpl').value]; $('#reqTplDel').hidden = !t; if (!t) return;
  $('#reqTitle').value = t.title || $('#reqTitle').value; $('#reqMsg').value = t.message || '';
  $('#reqDue').value = SigReq.dueIn(t.days); $('#reqCc').value = (t.cc || []).join(', ');
  $('#reqRows').innerHTML = (t.signers.length ? t.signers : [{}]).map(reqRow).join('');
};
$('#reqTplDel').onclick = () => {
  const i = +$('#reqTpl').value, t = reqTpls()[i]; if (!t || !confirm(`Vorlage „${t.name}“ löschen?`)) return;
  LS.set('reqTpl', reqTpls().filter((x, k) => k !== i)); reqTplFill(''); status(`Vorlage „${t.name}“ gelöscht.`);
};
function reqTplSave() {
  if (!req?.fields.length) return status('Zuerst Felder setzen – die Vorlage speichert Personen, Felder, Nachricht und Frist.');
  const name = (prompt('Name der Vorlage (z. B. Mietvertrag, Arbeitsvertrag)', req.title) || '').trim(); if (!name) return;
  const pages = docPages(), t = SigReq.template(req, name, f => pages.indexOf(f.pg));
  const list = reqTpls().filter(x => x.name.toLowerCase() !== t.name.toLowerCase());
  LS.set('reqTpl', [t, ...list].slice(0, 30));
  status(`Vorlage „${t.name}“ gespeichert – beim nächsten „Zur Unterschrift senden …“ oben auswählbar.`);
}
$('#reqAdd').onclick = () => { if ($('#reqRows').children.length >= 10) return; $('#reqRows').insertAdjacentHTML('beforeend', reqRow({}, $('#reqRows').children.length)); $('#reqRows').lastElementChild.querySelector('input').focus(); };
$('#reqRows').addEventListener('click', ev => { if (!ev.target.closest('[data-rdel]')) return; ev.target.closest('.reqrow').remove(); if (!$('#reqRows').children.length) $('#reqRows').innerHTML = reqRow({}, 0); reqRenumber(); });
// Name aus dem Team gewählt → E-Mail-Adresse ergänzen
$('#reqRows').addEventListener('change', ev => { if (!ev.target.matches('[data-rn]')) return; const m = ev.target.parentElement.querySelector('[data-rm]'); if (!m.value && team[ev.target.value.trim()]) m.value = team[ev.target.value.trim()]; });
$('#reqCancel').onclick = () => $('#reqDlg').close();
$('#reqForm').onsubmit = ev => {
  ev.preventDefault();
  const serial = $('#reqSerial').checked ? SigReq.recipients($('#reqList').value).list : null;
  if (serial && !serial.length) { $('#reqErr').textContent = 'Bitte mindestens einen Empfänger mit E-Mail-Adresse eintragen.'; return; }
  const signers = serial ? [serial[0]] : [...$('#reqRows').children].map(r => ({ name: r.querySelector('[data-rn]').value, email: r.querySelector('[data-rm]').value }));
  const r = SigReq.create({ title: $('#reqTitle').value, requester: { name: $('#reqMe').value, email: $('#reqMeMail').value }, signers, message: $('#reqMsg').value, due: $('#reqDue').value, cc: $('#reqCc').value, id: reqDraft && req ? req.id : undefined });
  const pr = SigReq.problems(r); if (pr.length) { $('#reqErr').textContent = pr.join(' '); return; }
  // Felder behalten, soweit die Person noch dabei ist
  if (reqDraft && req) r.fields = req.fields.map(f => ({ ...f, s: r.signers.findIndex(s => s.email === req.signers[f.s]?.email) })).filter(f => f.s >= 0);
  // Vorlage gewählt: ihre Felder übernehmen (Seiten, die es im Dokument nicht gibt, entfallen; Personen über die Reihenfolge)
  const tpl = reqTpls()[+$('#reqTpl').value];
  if (tpl && !r.fields.length) { const pages = docPages(); r.fields = tpl.fields.filter(f => f.page < pages.length && f.s < r.signers.length).map(f => ({ ...f, v: '', pg: pages[f.page] })); }
  if (serial) r.serial = serial;   // Felder werden für die erste Person gesetzt und für alle übernommen
  req = r; reqDraft = true; reqDoc = -1; reqFromMe = true; LS.set('reqMail', r.requester.email);
  $('#reqDlg').close();
  reqSuggest().then(n => {
    reqArm = req.signers.findIndex((s, i) => !req.fields.some(f => f.s === i));
    renderReqBar(); renderAnns();
    if (tpl && req.fields.length) toast(`Felder aus der Vorlage „${tpl.name}“ übernommen – bitte prüfen, dann „Senden …“.`, 8000);
    else if (n) toast(`${n} Felder an erkannten Unterschriftsstellen vorgeschlagen – bitte prüfen. Ein Klick auf den Namen im Feld ordnet es einer anderen Person zu.`, 9000);
    else if (reqArm >= 0) toast(`Jetzt auf die Stelle klicken, an der ${req.signers[reqArm].name} unterschreiben soll.`, 7000);
  });
};
// Erkannte Unterschrifts- und Datumsstellen („Unterschrift …“, „Ort, Datum“) als Felder vorschlagen
async function reqSuggest() {
  if (req.fields.length) return 0;
  const pages = docPages(), spots = [];
  try {
    for (const [i, p] of pages.entries()) { await spotsFor(p); for (const s of p.signSpots || []) spots.push({ ...s, page: i }); }
  } catch (e) { console.warn('Feldvorschläge', e); return 0; }
  const sg = SigReq.suggest(spots, req.signers.length);
  for (const f of sg) req.fields.push({ ...f, pg: pages[f.page] });
  return sg.length;
}
// Klick auf die Seite: Feld für die gewählte Person setzen (Größe einer Unterschriftszeile)
window.reqPlaceClick = (p, s) => {
  if (!req || !reqDraft || reqArm < 0) return false;
  const t = reqType; let [w, h] = SigReq.SIZE[t]; if (t === 'check') h = w * (p.w || 1) / (p.h || 1.414);
  let label = '';
  if (t === 'text') { label = (prompt('Was soll die Person hier eintragen? (z. B. Anschrift, IBAN)', '') || '').trim(); if (!label) return true; }
  if (t === 'check') { label = (prompt('Text zum Ankreuzen (z. B. „Ich habe die AGB gelesen“)', '') || '').trim(); if (!label) return true; }
  req.fields.push({ s: reqArm, t, label, v: '', pg: p, x: clamp(s.x - w / 2, 0, 1 - w), y: clamp(s.y - h / 2, 0, 1 - h), w, h });
  const nxt = t === 'sign' ? req.signers.findIndex((x, i) => !req.fields.some(f => f.s === i)) : reqArm;   // nach einer Unterschrift weiter zur nächsten Person ohne Feld
  reqArm = nxt;
  renderAnns(); renderReqBar();
  const msg = nxt >= 0 ? `Feld gesetzt. Jetzt die Stelle für ${req.signers[nxt].name} anklicken.` : 'Alle Felder gesetzt. Weitere Felder über die Namen in der Leiste, dann „Senden …“.';
  status(msg); toast(msg, 5000);
  return true;
};
window.reqRender = (ov, p) => {
  if (!req) return;
  const mine = reqMine();
  req.fields.forEach((f, k) => {
    if (f.pg !== p) return;
    const sg = req.signers[f.s]; if (!sg || (!reqDraft && sg.status === SigReq.DONE)) return;
    const t = f.t || 'sign', el = document.createElement('div'); el.className = 'reqf' + (f.s === mine ? ' mine' : ''); placeEl(el, f); el.dataset.rfk = k;
    const lb = document.createElement('span'); lb.className = 'rfl'; lb.setAttribute('translate', 'no');
    lb.textContent = `${RQ_ICON[t]} ${t === 'sign' ? '' : (f.label || SigReq.TYPES[t]) + ' – '}${sg.name}`;
    if (reqDraft) { lb.dataset.rfcycle = k; lb.title = 'Klick: anderer Person zuordnen'; }
    if (f.s === mine && !reqSigned && t === 'text') { el.insertAdjacentHTML('beforeend', `<input type="text" data-rfval="${k}" aria-label="${esc(f.label || 'Text')}" placeholder="${esc(f.label || '')}" value="${esc(f.v || '')}">`); el.title = f.label || ''; }
    else if (f.s === mine && !reqSigned && t === 'check') el.insertAdjacentHTML('beforeend', `<label translate="no"><input type="checkbox" data-rfchk="${k}"${f.v ? ' checked' : ''}> ${esc(f.label || '')}</label>`);
    else el.append(lb);
    if (reqDraft) el.insertAdjacentHTML('beforeend', `<button type="button" data-rfdel="${k}" aria-label="Feld entfernen" title="Feld entfernen">✕</button>`);
    else if (f.s === mine && !reqSigned && t === 'sign') el.insertAdjacentHTML('beforeend', '<button type="button" data-rsign>Hier unterschreiben</button>');
    ov.append(el);
  });
};
// Eingaben der Person in Text- und Ankreuzfeldern merken (überleben das Neuzeichnen)
// Geführtes Ausfüllen: Felder der Person in Lesereihenfolge (Seite, von oben nach unten, links nach rechts); zuerst offene Pflichtangaben
const reqMyFields = () => { const i = reqMine(); return i < 0 ? [] : req.fields.map((f, k) => ({ f, k })).filter(x => x.f.s === i && x.f.pg).sort((a, b) => reqIdx(a.f) - reqIdx(b.f) || a.f.y - b.f.y || a.f.x - b.f.x); };
let reqCursor = -1;
function reqNextField() {
  const list = reqMyFields(); if (!list.length) return;
  const open = list.filter(x => x.f.t === 'text' && !String(x.f.v || '').trim());
  const pick = open.length ? open.find(x => list.indexOf(x) > reqCursor) || open[0] : list[(reqCursor + 1) % list.length];
  reqCursor = list.indexOf(pick); reqGoto(pick.f); renderAnns();
  setTimeout(() => {
    const el = document.querySelector(`#overlay [data-rfk="${pick.k}"]`); if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); (el.querySelector('input') || el.querySelector('button'))?.focus({ preventScroll: true });
  }, 80);
  status(`Feld ${reqCursor + 1} von ${list.length}: ${pick.f.label || SigReq.TYPES[pick.f.t || 'sign']}`);
}
// Enter in einem Textfeld: weiter zum nächsten Feld
$('#overlay').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches?.('[data-rfval]') && req) { ev.preventDefault(); reqNextField(); } });
$('#overlay').addEventListener('input', ev => { const k = ev.target.dataset.rfval ?? ev.target.dataset.rfchk; if (k == null || !req) return; req.fields[+k].v = ev.target.type === 'checkbox' ? (ev.target.checked ? 'ja' : '') : ev.target.value; renderReqBar(); });
$('#overlay').addEventListener('change', ev => { if (ev.target.dataset.rfchk != null && req) req.fields[+ev.target.dataset.rfchk].v = ev.target.checked ? 'ja' : ''; });
$('#overlay').addEventListener('click', ev => {
  const d = ev.target.closest('[data-rfdel]'); if (d && req) { req.fields.splice(+d.dataset.rfdel, 1); renderAnns(); renderReqBar(); return; }
  const c = ev.target.closest('[data-rfcycle]'); if (c && req && reqDraft) { const f = req.fields[+c.dataset.rfcycle]; f.s = (f.s + 1) % req.signers.length; renderAnns(); renderReqBar(); status(`Feld gehört jetzt zu ${req.signers[f.s].name}.`); return; }
  if (ev.target.closest('[data-rsign]')) reqSignNow();
});
const reqIdx = f => state.pages.indexOf(f.pg);
function reqGoto(f) { const i = reqIdx(f); if (i >= 0 && i !== state.sel) { state.sel = i; refresh(); } }
// Unterschrift in alle Felder der Person setzen, die gerade dran ist
async function reqSignNow() {
  const i = reqMine(); if (i < 0) return;
  const mine = req.fields.filter(f => f.s === i && f.pg); if (!mine.length) return status('Für Sie ist in diesem Dokument kein Unterschriftsfeld gesetzt.');
  const miss = SigReq.missing(req, i).filter(f => f.pg);
  if (miss.length) { reqGoto(miss[0]); renderAnns(); document.querySelector(`#overlay [data-rfval="${req.fields.indexOf(miss[0])}"]`)?.focus(); return status(`Bitte zuerst ausfüllen: ${miss.map(f => f.label || 'Text').join(', ')}.`); }
  // gezeichnete Unterschrift bzw. Kürzel holen (gespeichert oder neu zeichnen)
  const need = k => mine.some(f => (f.t || 'sign') === k) && !state.sigs[k] ? new Promise(res => { reqGoto(mine.find(f => (f.t || 'sign') === k)); openSign(() => res(), k); }) : Promise.resolve();
  await need('sign'); await need('initials');
  const img = async src => { const im = new Image(); im.src = src; await im.decode(); return im; };
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  for (const f of mine) {
    const p = f.pg, t = f.t || 'sign'; pushUndo(p);
    if (t === 'sign' || t === 'initials') {
      const src = state.sigs[t]; if (!src) continue;
      const im = await img(src), ar = im.height / im.width; let w = f.w, h = w * ar * p.w / p.h;
      if (h > f.h) { h = f.h; w = h / (ar * p.w / p.h); }
      p.annots.push({ id: ++uid, type: 'sign', kind: t, img: src, ar, x: f.x + (f.w - w) / 2, y: f.y + f.h - h, w, h }); reqSignedIds.add(uid);
      continue;
    }
    const text = t === 'date' ? today : t === 'name' ? req.signers[i].name : t === 'check' ? (f.v ? '✓' : '') : String(f.v || '').trim();
    if (t === 'date' || t === 'name') f.v = text;
    if (!text) continue;
    const asp = (p.w || 1) / (p.h || 1.414), fs = Math.min(0.016, f.h / asp * (t === 'check' ? 0.95 : 0.72));
    p.annots.push({ id: ++uid, type: 'text', x: f.x + (t === 'check' ? f.w * 0.15 : 0.004), y: f.y + Math.max(0, f.h - fs * asp * 1.2), w: 0, h: 0, text, fs, color: '#1B1D23' }); reqSignedIds.add(uid);
  }
  reqSigned = true; state.dirty = true; reqGoto(mine[0]); renderAnns(); renderReqBar();
  status('Unterschrift gesetzt. Jetzt „Unterschrieben – weitersenden“.');
}
// Als eingebettete Datei (lesbar in jedem PDF-Programm unter „Anlagen“); pdf.js liefert eigene Info-Einträge nicht zuverlässig
window.reqInfo = async (out, pages, when = new Date()) => {
  if (!req) return;
  if (reqAudit) await reqAuditPage(out);
  try { await reqFormFields(out, pages); } catch (e) { console.warn('Formularfelder der Unterschriftsanfrage:', e); }
  await out.attach(new TextEncoder().encode(SigReq.serialize(req, f => pages.indexOf(f.pg))), SigReq.FILE, { mimeType: 'application/json', description: 'PDFMy – Unterschriftsanfrage (Unterzeichner, Felder, Protokoll)', creationDate: when, modificationDate: when });
};
// Echte PDF-Formularfelder für die Person, die dran ist: So kann sie auch in Adobe Acrobat Reader, Vorschau (Mac) oder Edge
// ausfüllen und unterschreiben. Felder der empfangenen Fassung (beim Kopieren der Seiten mitgekommen) werden vorher entfernt.
async function reqFormFields(out, pages) {
  const L = PDFLib, N = n => L.PDFName.of(n), ctx = out.context, outPages = out.getPages(), hex = t => L.PDFHexString.fromText(t);
  for (const pg of outPages) {
    const an = pg.node.lookup(N('Annots')); if (!(an instanceof L.PDFArray)) continue;
    for (let k = an.size() - 1; k >= 0; k--) { const d = an.lookup(k), t = d instanceof L.PDFDict ? d.lookup(N('T')) : null; if (t?.decodeText && /^pdfmy_/.test(t.decodeText())) an.remove(k); }
  }
  // … und aus dem Formularverzeichnis (beim Anhängen an die empfangene Fassung bleibt es sonst bestehen)
  const af = out.catalog.lookup(N('AcroForm')), flds = af instanceof L.PDFDict ? af.lookup(N('Fields')) : null;
  if (flds instanceof L.PDFArray) for (let k = flds.size() - 1; k >= 0; k--) { const d = flds.lookup(k), t = d instanceof L.PDFDict ? d.lookup(N('T')) : null; if (t?.decodeText && /^pdfmy_/.test(t.decodeText())) flds.remove(k); }
  const i = SigReq.next(req); if (i < 0) return;
  const mine = req.fields.map((f, k) => ({ f, k })).filter(({ f }) => f.s === i && pages.indexOf(f.pg) >= 0); if (!mine.length) return;
  const form = out.getForm(), helv = await out.embedFont(L.StandardFonts.Helvetica), who = req.signers[i].name, red = [0.78, 0.06, 0.18];
  for (const { f, k } of mine) {
    const page = outPages[pages.indexOf(f.pg)], mb = page.getMediaBox(), W = mb.width, H = mb.height, t = f.t || 'sign', name = SigReq.formName(req, k);
    const box = { x: mb.x + f.x * W, y: mb.y + H - (f.y + f.h) * H, width: f.w * W, height: f.h * H, borderWidth: 0.75, borderColor: L.rgb(...red), backgroundColor: L.rgb(1, 0.95, 0.95) };
    const tip = `${f.label || SigReq.TYPES[t]} – ${who}`;
    if (t === 'sign' || t === 'initials') {   // Signaturfeld: Klick darauf signiert in Acrobat Reader & Co.
      const ref = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [box.x, box.y, box.x + box.width, box.y + box.height], T: hex(name), TU: hex(tip), F: 4, P: page.ref, MK: ctx.obj({ BC: red, BG: [1, 0.95, 0.95] }) }));
      page.node.addAnnot(ref); form.acroForm.addField(ref); continue;
    }
    let fld;
    if (t === 'check') { const sz = Math.min(box.width, box.height); fld = form.createCheckBox(name); fld.addToPage(page, { ...box, width: sz, height: sz }); if (f.v) fld.check(); }
    else { fld = form.createTextField(name); if (t === 'date') fld.setMaxLength(10); const v = t === 'name' ? who : f.v; if (v) fld.setText(String(v)); fld.addToPage(page, { ...box, font: helv }); }
    fld.acroField.dict.set(N('TU'), hex(tip));
    for (const wd of fld.acroField.getWidgets()) wd.dict.set(N('F'), L.PDFNumber.of(4));
  }
  form.updateFieldAppearances(helv);
}
// Kommt die Fassung aus einem anderen PDF-Programm zurück: Feldwerte übernehmen und erkennen, ob die Person dort unterschrieben hat
async function reqReadForm(r, bytes) {
  const L = PDFLib, lib = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }), i = SigReq.next(r); let ext = false;
  for (const f of lib.getForm().getFields()) {
    const k = SigReq.formField(r, f.getName()); if (k < 0) continue;
    const fd = r.fields[k], own = fd.s === i;
    if (f instanceof L.PDFTextField) { const v = (f.getText() || '').trim(); if (v && fd.t !== 'name') { fd.v = v; ext ||= own; } }
    else if (f instanceof L.PDFCheckBox) { if (f.isChecked()) { fd.v = 'ja'; ext ||= own; } }
    else if (f.acroField.dict.lookup(L.PDFName.of('V'))) ext ||= own;   // digital signiert
  }
  // „Ausfüllen & unterschreiben“ (Acrobat), Signatur in Vorschau: neue Freihand-, Text- oder Stempel-Anmerkungen auf den Seiten der Person
  const pgs = lib.getPages();
  for (const n of new Set(r.fields.filter(f => f.s === i).map(f => f.page))) {
    const an = pgs[n]?.node.lookup(L.PDFName.of('Annots')); if (!(an instanceof L.PDFArray)) continue;
    for (let k = 0; k < an.size(); k++) { const d = an.lookup(k), st = d instanceof L.PDFDict ? d.lookup(L.PDFName.of('Subtype'))?.asString?.() : ''; if (['/Ink', '/FreeText', '/Stamp'].includes(st)) ext = true; }
  }
  return ext;
}
window.reqLoad = (json, docIdx, bytes) => {
  let r = SigReq.parse(json); if (!r) return;
  // „Empfangen“: die Person, die dran ist, hat die PDF in PDFMy geöffnet – nicht, wenn der Absender seine Kopie ansieht
  const me = String(LS.get('reqMail', '') || '').toLowerCase(), nx = SigReq.next(r), mineReq = me ? me === r.requester.email : !!S.author && S.author === r.requester.name;
  reqTrack = -1; reqSeen = new Set(); reqFromMe = mineReq;
  if (nx >= 0 && (!mineReq || r.signers[nx].email === r.requester.email)) { r = SigReq.markOpened(r, nx); reqTrack = nx; }
  req = r; reqDoc = docIdx; reqDraft = false; reqArm = -1; reqSigned = false; reqHash = ''; reqStart = state.pages.length;   // Seiten dieses Dokuments folgen ab hier (auch als Scan aufbereitete)
  reqBytes = new Uint8Array(bytes); reqCursor = -1;   // empfangene Fassung: Unterschriften werden daran angehängt (js/pdfinc.js)
  sha256(bytes).then(h => { reqHash = h; });
  reqExt = false;
  reqReadForm(r, bytes).then(ext => { if (req === r && ext) { reqExt = true; renderReqBar(); renderAnns(); toast(`${r.signers[SigReq.next(r)]?.name || 'Die Person'} hat offenbar in einem anderen PDF-Programm unterschrieben – bitte prüfen und „Als unterschrieben übernehmen …“.`, 9000); } }).catch(e => console.warn('Formularfelder lesen:', e));
  reqJournal(r);
};
window.reqAfterImport = docIdx => {
  if (!req || reqDoc !== docIdx) return;
  const pages = state.pages.slice(reqStart);
  req.fields.forEach(f => { f.pg = pages[f.page]; });
  reqBase = { pages: pages.slice(), rot: pages.map(p => p.rotation), ids: new Set(pages.flatMap(p => p.annots.map(a => a.id))) };   // Stand beim Öffnen
  renderReqBar(); renderAnns();
  const i = reqMine();
  if (i >= 0) { const f = req.fields.find(x => x.s === i && x.pg); if (f) reqGoto(f); }
  window.reqSeenPage(cur());
};
// „Gelesen“: jede Seite der empfangenen Fassung wurde angezeigt
window.reqSeenPage = p => {
  if (reqTrack < 0 || !req || reqDraft || !reqBase || !p || !reqBase.pages.includes(p)) return;
  reqSeen.add(p.id);
  if (reqBase.pages.every(x => reqSeen.has(x.id)) && SigReq.next(req) === reqTrack) { req = SigReq.markRead(req, reqTrack); reqTrack = -1; renderReqBar(); }
};
// Prüfprotokoll-Seite (A4) nach der letzten Unterschrift: Personen, Zeitpunkte, Prüfsummen, Ablauf
async function reqAuditPage(out) {
  out.registerFontkit(await loadFontkit());
  const font = await out.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true }), bold = await out.embedFont(await asset('fontB', 'vendor/dejavu/DejaVuSans-Bold.ttf'), { subset: true });
  const W = 595.28, H = 841.89, L = 56, RW = W - 2 * L, cs = new Set(font.getCharacterSet()), safe = x => [...String(x ?? '')].filter(ch => cs.has(ch.codePointAt(0))).join('');
  let page = out.addPage([W, H]), y = H - 64;
  const style = { h: [16, bold, 26], s: [12, bold, 20], b: [10.5, bold, 15], p: [10, font, 14], m: [8, font, 11.5], n: [8.5, font, 12], g: [6, font, 6] };
  for (const [k, text] of SigReq.auditLines(req, '', s => I18N.t(s))) {   // Prüfprotokoll in der Sprache der Oberfläche
    const [size, f, lh] = style[k] || style.p;
    for (const line of k === 'g' ? [''] : wrapLines(safe(text), RW, x => f.widthOfTextAtSize(x, size))) {
      if (y < 60) { page = out.addPage([W, H]); y = H - 64; }
      if (line) page.drawText(line, { x: L, y, size, font: f, color: k === 'm' || k === 'n' ? rgb(0.35, 0.35, 0.35) : rgb(0.1, 0.1, 0.1) });
      y -= lh;
    }
  }
}
async function reqPdf() { if (ocrRunning) await runOcrAll(); return buildPdf(docPages(), state.meta, { noOcr: true, onPage: () => {} }); }
/* Nachweisbare Echtheit: Die Unterschrift wird an die empfangene Fassung ANGEHÄNGT statt die PDF neu zu schreiben (inkrementelles
   Speichern, ISO 32000). So bleibt jede Fassung Byte für Byte erhalten, und die Prüfsumme, die jede Person beim Unterschreiben
   festhält, lässt sich in der fertigen PDF nachrechnen. Nur wenn am Dokument sonst nichts geändert wurde (gleiche Seiten, gleiche
   Drehung, keine weiteren Anmerkungen) – sonst wie bisher neu schreiben. */
let reqBytes = null, reqBase = null;
function reqIncOk() {
  if (!reqBytes || !reqBase || !window.PdfInc) return false;
  const pages = docPages();
  if (pages.length !== reqBase.pages.length || pages.some((p, i) => p !== reqBase.pages[i] || p.rotation !== reqBase.rot[i])) return false;
  return pages.every(p => p.annots.every(a => reqBase.ids.has(a.id) || reqSignedIds.has(a.id)));
}
// Vorhandene Anlage der Anfrage entfernen (sonst stünde die alte neben der neuen)
function reqDropJson(doc) {
  const L = PDFLib, N = n => L.PDFName.of(n), names = doc.catalog.lookup(N('Names'));
  const ef = names instanceof L.PDFDict ? names.lookup(N('EmbeddedFiles')) : null; if (!(ef instanceof L.PDFDict)) return;
  const walk = node => {
    const arr = node.lookup(N('Names'));
    if (arr instanceof L.PDFArray) for (let i = arr.size() - 2; i >= 0; i -= 2) if (arr.lookup(i)?.decodeText?.() === SigReq.FILE) { arr.remove(i + 1); arr.remove(i); }
    const kids = node.lookup(N('Kids')); if (kids instanceof L.PDFArray) for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i));
  };
  walk(ef);
}
async function reqIncremental(audit) {
  if (!reqIncOk()) return null;
  try {
    const L = PDFLib, doc = await PdfInc.load(reqBytes), pages = docPages(), lp = doc.getPages();
    if (lp.length !== pages.length) return null;
    doc.registerFontkit(await loadFontkit());
    const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true });   // auch ✓ und Namen in kyrillischer Schrift
    for (const [k, p] of pages.entries()) {
      const page = lp[k], mb = page.getMediaBox(), W = mb.width, H = mb.height, ox = mb.x, oy = mb.y;
      for (const a of p.annots) {
        if (!reqSignedIds.has(a.id)) continue;
        const x = ox + a.x * W, y = oy + H - (a.y + a.h) * H;
        if (a.type === 'sign') page.drawImage(await doc.embedPng(a.img), { x, y, width: a.w * W, height: a.h * H });
        else if (a.type === 'text') {
          const sz = a.fs * W, [r, g, b] = [1, 3, 5].map(i => parseInt(a.color.slice(i, i + 2), 16) / 255);
          a.text.split('\n').forEach((t, li) => { if (t) page.drawText(t, { x, y: oy + H - (a.y * H + sz * (0.95 + (a.lh || 1.2) * li)), size: sz, font, color: L.rgb(r, g, b) }); });
        }
      }
    }
    reqDropJson(doc);
    reqAudit = audit; try { await window.reqInfo(doc, pages, new Date()); } finally { reqAudit = false; }   // Prüfprotokoll, Formularfelder, neue Anlage
    return await PdfInc.save(reqBytes, doc);
  } catch (e) { console.warn('Anhängen nicht möglich – die PDF wird neu geschrieben:', e); return null; }
}
const reqFile = (r, suffix) => `${r.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)}${suffix}`;
// E-Mail-Entwurf öffnen: mit pdfmy Scan unter Windows (ab 1.8.8) direkt im Mail-Programm – Outlook zeigt ihn als neue,
// sendebereite Nachricht mit Anhang –, sonst wie bisher als .eml-Datei herunterladen. true = direkt geöffnet.
async function openEml(bytes, name) {
  if (state.scanVersion && !state.scanMac) try {
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const r = await scanApi('/maildraft', { method: 'POST', body: JSON.stringify({ name, data: btoa(bin) }) }, 20000);
    if (r.ok) return true;
  } catch {}
  download(bytes, name, 'message/rfc822'); return false;
}
window.openEml = openEml;
const emlDone = (opened, to) => opened ? `E-Mail an ${to} ist in Ihrem Mail-Programm geöffnet – prüfen und senden.` : `E-Mail an ${to} vorbereitet – die .eml-Datei öffnen und senden.`;
async function reqMail(r, bytes, pdfName) {
  const m = SigReq.mail(r, { from: S.author, tr: s => I18N.t(s) });   // E-Mail in der Sprache der Oberfläche
  const eml = Journal.emlDraft({ to: m.to, cc: m.cc, notify: m.notify, subject: m.subject, body: m.body, attachments: [{ name: pdfName, mime: 'application/pdf', bytes }] });
  m.opened = await openEml(new TextEncoder().encode(eml), pdfName.replace(/\.pdf$/i, '') + '.eml');
  return m;
}
// Posteingangsbuch: Eintrag beim Senden anlegen, beim Öffnen einer zurückgekommenen Fassung fortschreiben
async function reqJournal(r, add) {
  const all = await journalAll(), has = all.some(x => x.sigreq === r.id);
  const nx = SigReq.next(r), cur = r.signers[nx];
  // Frist erscheint unter „Fristen“ (erledigt → erledigt sich mit); wer gerade dran ist, für „Erinnern“
  const patch = { sigs: SigReq.summaryText(r), status: SigReq.complete(r) ? 'erledigt' : SigReq.declined(r) >= 0 ? 'offen' : 'in Arbeit', upd: updStamp(),
    deadline: nx >= 0 && r.due ? r.due : '', ...(r.rt ? { sigRt: r.rt } : {}), sigSince: SigReq.waiting(r)?.since || '', sigTo: cur?.email || '', sigName: cur?.name || '', sigN: SigReq.doneCount(r) };
  let list;
  if (has) list = all.map(x => x.sigreq === r.id ? { ...x, ...patch } : x);
  else if (add) {
    const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), savedAt: stamp(), date: todayStr(), sender: r.requester.name || r.requester.email, type: 'Unterschriftsanfrage',
      subject: r.title, file: add.rel || '', pages: docPages().length, done: false, by: S.author || '', sha256: add.sha || '', sigreq: r.id, ...patch };
    e.seal = await sha256(new TextEncoder().encode(Journal.sealText(e)));
    list = [e, ...all];
  } else return;
  jList = list; LS.set('journal', list.slice(0, 2000)); await jWriteDir(list); renderDeadlines(list);
}
// Erinnerung aus dem Posteingangsbuch: E-Mail an die Person, die dran ist; hat noch niemand unterschrieben, hängt die abgelegte PDF an
async function reqRemind(e) {
  let bytes = null;
  if (!+e.sigN && e.file && state.outDir) try { bytes = new Uint8Array(await (await archiveFile(e.file)).arrayBuffer()); } catch {}
  const m = SigReq.reminder({ title: e.subject, to: e.sigTo, name: e.sigName, due: e.deadline, from: S.author, attached: !!bytes, tr: s => I18N.t(s) });
  const name = (e.file || 'Dokument.pdf').split('\\').pop();
  const opened = await openEml(new TextEncoder().encode(Journal.emlDraft({ ...m, notify: LS.get('reqMail', '') || '', attachments: bytes ? [{ name, mime: 'application/pdf', bytes }] : [] })), `Erinnerung – ${String(e.subject || 'Dokument').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)}.eml`);
  try { await updateEntry(e.id, { remN: (+e.remN || 0) + 1, remAt: stamp() }); renderJournal(); } catch {}
  status(opened ? `Erinnerung an ${e.sigName || e.sigTo} ist in Ihrem Mail-Programm geöffnet – prüfen und senden.` : `Erinnerung an ${e.sigName || e.sigTo} vorbereitet – die .eml-Datei öffnen und senden.`);
}
// Serienversand: je Empfänger eine eigene Anfrage (eigene Kennung, gleiche Felder), E-Mail-Entwurf und Eintrag im Posteingangsbuch.
// Bis 10 Empfänger mit pdfmy Scan direkt im Mail-Programm, sonst alle Entwürfe als ZIP (in Outlook per Doppelklick öffnen).
async function reqSendSerial() {
  const base = req, list = base.serial, direct = state.scanVersion && !state.scanMac && list.length <= 10;
  if (!base.fields.some(f => f.s === 0 && f.pg)) return status('Bitte zuerst das Unterschriftsfeld für die Empfänger setzen.');
  if (!confirm(`Für ${list.length} Empfänger je ein eigenes Exemplar mit E-Mail-Entwurf vorbereiten?`)) return;
  const files = [], rows = [['Name', 'E-Mail', 'Datei']], safe = s => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
  let opened = 0;
  try {
    for (const [i, rc] of list.entries()) {
      status(`Serienversand: ${i + 1} von ${list.length} – ${rc.name} …`, i / list.length);
      const r = SigReq.create({ title: base.title, requester: base.requester, signers: [rc], message: base.message, due: base.due, cc: (base.cc || []).join(', ') });
      r.fields = base.fields.filter(f => f.s === 0).map(f => ({ ...f, v: '', s: 0 }));
      req = SigReq.markSent(r, 0);
      const bytes = await reqPdf(), name = reqFile(r, ` – ${safe(rc.name)} – zur Unterschrift.pdf`);
      const m = SigReq.mail(r, { from: S.author, tr: s => I18N.t(s) });
      const eml = new TextEncoder().encode(Journal.emlDraft({ to: m.to, cc: m.cc, subject: m.subject, body: m.body, attachments: [{ name, mime: 'application/pdf', bytes }] }));
      let rel = '', sha = '';
      if (state.outDir) { const w = await deliver(bytes, name, 'application/pdf'); rel = w?.slice(state.outDir.name.length + 1) || ''; sha = await sha256(bytes); }
      const emlName = name.replace(/\.pdf$/i, '') + '.eml';
      if (direct && await openEml(eml, emlName)) opened++; else files.push({ name: emlName, data: eml });
      rows.push([rc.name, rc.email, emlName]);
      await reqJournal(req, { rel, sha });
    }
  } catch (e) { console.error(e); req = base; return status('Serienversand abgebrochen: ' + e.message); }
  req = base;
  let zipName = '';
  if (files.length) {
    files.push({ name: 'Empfänger.csv', data: new TextEncoder().encode('\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')) });
    zipName = `Serienversand – ${reqFile(base, '')}.zip`; download(Tools.zip(files), zipName, 'application/zip');
  }
  window.reqReset(); renderAnns();
  status(`Serienversand vorbereitet: ${list.length} Exemplare.${opened ? ` ${opened} E-Mail(s) sind im Mail-Programm geöffnet – prüfen und senden.` : ''}${zipName ? ` Die E-Mail-Entwürfe liegen in „${zipName}“ – entpacken und jede .eml-Datei öffnen und senden.` : ''} Den Stand je Person zeigt das Posteingangsbuch.`);
}
async function reqSend() {
  if (req.serial) return reqSendSerial();
  const miss = req.signers.filter((s, i) => !req.fields.some(f => f.s === i && f.pg));
  if (miss.length) return status(`Für ${miss.map(s => s.name).join(', ')} fehlt noch ein Unterschriftsfeld – Namen in der Leiste anklicken, dann die Stelle.`);
  try {
    status('Bereite die Unterschriftsanfrage vor …');
    req = SigReq.markSent(req, 0);
    const bytes = await reqPdf(), name = reqFile(req, ' – zur Unterschrift.pdf');
    let rel = '', sha = '';
    if (state.outDir) { const w = await deliver(bytes, name, 'application/pdf'); rel = w?.slice(state.outDir.name.length + 1) || ''; sha = await sha256(bytes); }
    const m = await reqMail(req, bytes, name);
    await reqJournal(req, { rel, sha });
    reqDraft = false; reqArm = -1; renderReqBar(); renderAnns();
    status(`${emlDone(m.opened, m.to)}${rel ? ` Kopie in der Ablage: ${rel}.` : ''} Den Stand sehen Sie im Posteingangsbuch.`);
  } catch (e) { console.error(e); status('Senden nicht möglich: ' + e.message); }
}
/* ---------- Unterschriftsanfrage per Messenger (WhatsApp, Signal, Teams …) mit Lesebestätigung – ohne Server ----------
   Absender: PDF über das Teilen-Menü des Systems senden; die Anfrage bekommt einen Schlüssel (rt), der auch im Posteingangsbuch steht.
   Empfänger: hat er alle Seiten gesehen, schickt er mit einem Tipp „✓✓ Gelesen“ samt Link zurück.
   Absender: der Link (#gelesen=…, geht nie an den Server) wird mit dem Schlüssel geprüft und setzt im Posteingangsbuch „Gelesen“. */
let reqConfirmed = false;   // Lesebestätigung in dieser Sitzung schon gesendet
async function reqSendMessenger() {
  const miss = req.signers.filter((s, i) => !req.fields.some(f => f.s === i && f.pg));
  if (miss.length) return status(`Für ${miss.map(s => s.name).join(', ')} fehlt noch ein Unterschriftsfeld – Namen in der Leiste anklicken, dann die Stelle.`);
  try {
    status('Bereite die Unterschriftsanfrage vor …');
    req.rt ||= SigReq.newToken(); req.via = 'messenger';
    req = SigReq.markSent(req, 0);
    const bytes = await reqPdf(), name = reqFile(req, ' – zur Unterschrift.pdf');
    let rel = '', sha = '';
    if (state.outDir) { const w = await deliver(bytes, name, 'application/pdf'); rel = w?.slice(state.outDir.name.length + 1) || ''; sha = await sha256(bytes); }
    await reqJournal(req, { rel, sha });
    reqDraft = false; reqArm = -1; renderReqBar(); renderAnns();
    const file = new File([bytes], name, { type: 'application/pdf' });
    const text = I18N.t(`Bitte unterschreiben: „${req.title}“. Die PDF in PDFMy öffnen (pdfmy.de, Datei ins Fenster ziehen) – die Felder sind markiert.`);
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text, title: req.title }); status(I18N.t('Gesendet – sobald die Lesebestätigung kommt, darauf tippen: PDFMy vermerkt „Gelesen“ im Posteingangsbuch.')); return; }
      catch (e) { if (e.name === 'AbortError') { status('Teilen abgebrochen. Die Anfrage steht im Posteingangsbuch; die PDF liegt hier zum Anhängen bereit.'); download(bytes, name, 'application/pdf'); return; } }
    }
    download(bytes, name, 'application/pdf');
    try { await navigator.clipboard.writeText(text); } catch {}
    status('PDF gespeichert – in WhatsApp, Signal oder Teams anhängen und senden (der Begleittext ist in der Zwischenablage).');
  } catch (e) { console.error(e); status('Senden nicht möglich: ' + e.message); }
}
async function reqReadConfirm() {
  const i = reqMine(); if (i < 0 || !req?.rt) return;
  const base = APP.edition === 'web' ? location.origin + location.pathname : 'https://pdfmy.de/';
  const link = await SigReq.readLink(req, i, req.signers[i].readAt || new Date().toISOString(), base);
  const text = `✓✓ ${I18N.t(`Gelesen: „${req.title}“ – ${req.signers[i].name}.`)} ${I18N.t('Zum Vermerken in PDFMy antippen:')} ${link}`;
  const done = msg => { reqConfirmed = true; renderReqBar(); status(msg); };
  if (navigator.share) {
    try { await navigator.share({ text }); return done('Lesebestätigung gesendet.'); }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); } catch {}
  done('Lesebestätigung in die Zwischenablage kopiert – im Messenger an den Absender einfügen und senden.');
}
// Absender: Lesebestätigung aus dem Messenger angetippt → prüfen und im Posteingangsbuch vermerken
async function readFromHash() {
  const p = SigReq.parseRead(location.hash); if (!p) return;
  history.replaceState(null, '', location.pathname + location.search);
  const all = await journalAll(), e = all.find(x => x.sigreq === p.id);
  if (!e || !e.sigRt) { status('Diese Lesebestätigung gehört zu einer Anfrage, die in diesem Browser nicht im Posteingangsbuch steht.'); return; }
  if (!await SigReq.verifyRead(e.sigRt, p)) { status('Diese Lesebestätigung ist ungültig oder unvollständig – bitte den Link vollständig antippen.'); return; }
  const reads = (e.sigReads || []).filter(x => x.n !== p.name).concat({ n: p.name, at: p.at });
  await updateEntry(e.id, { sigReads: reads }); renderJournal();
  const msg = I18N.t(`✓✓ ${p.name} hat „${e.subject}“ gelesen (${SigReq.fmt(p.at)}).`);
  status(msg); toast(msg, 8000);
}
readFromHash(); addEventListener('hashchange', readFromHash);

async function reqForward(ext = false) {
  const i = reqMine(); if (i < 0) return;
  if (!reqSigned) return status('Bitte zuerst im markierten Feld unterschreiben.');
  try {
    req = SigReq.markSigned(req, i, { hash: reqHash, ext: ext === true });
    reqExt = false;
    const done = SigReq.complete(req);
    if (!done) req = SigReq.markSent(req, SigReq.next(req));
    let bytes = await reqIncremental(done);
    if (!bytes) { reqAudit = done; try { bytes = await reqPdf(); } finally { reqAudit = false; } }
    const name = reqFile(req, done ? ' – unterschrieben.pdf' : ' – zur Unterschrift.pdf');
    const m = await reqMail(req, bytes, name);
    reqSigned = false; state.dirty = false; renderReqBar(); renderAnns();
    status(done ? `Alle haben unterschrieben. ${emlDone(m.opened, m.to)}` : `Danke! ${emlDone(m.opened, m.to)}`);
  } catch (e) { console.error(e); status('Weitersenden nicht möglich: ' + e.message); }
}
$('#reqDecCancel').onclick = () => $('#reqDecDlg').close();
$('#reqDecForm').onsubmit = async ev => {
  ev.preventDefault(); $('#reqDecDlg').close();
  const i = reqMine(); if (i < 0) return;
  try {
    req = SigReq.decline(req, i, { reason: $('#reqDecWhy').value });
    for (const p of docPages()) p.annots = p.annots.filter(a => !reqSignedIds.has(a.id));   // eigene, noch nicht versendete Unterschrift wieder entfernen
    const bytes = await reqIncremental(false) || await reqPdf(), m = await reqMail(req, bytes, reqFile(req, ' – abgelehnt.pdf'));
    reqSigned = false; state.dirty = false; renderReqBar(); renderAnns();
    status(`Abgelehnt. ${emlDone(m.opened, m.to)}`);
  } catch (e) { console.error(e); status('Ablehnen nicht möglich: ' + e.message); }
};
const reqSignedIds = new Set();
async function reqInfoShow() {
  if (!req) return;
  // Echtheit: Steckt die Fassung, die jede Person bekommen hat, unverändert in dieser Datei? (nur bei einer geöffneten Fassung)
  const ok = reqBytes && !reqDraft && window.PdfInc ? await PdfInc.contains(reqBytes, req.signers.map(s => s.hash)) : null;
  const signed = req.signers.filter(s => s.hash), good = ok ? req.signers.filter((s, i) => s.hash && ok[i]).length : 0;
  const head = !ok || !signed.length ? '' : good === signed.length
    ? `<p class="reqok">✓ Echtheit geprüft: Alle ${signed.length} unterschriebenen Fassungen sind unverändert in dieser Datei enthalten – spätere Schritte haben nur ergänzt.</p>`
    : `<p class="reqwarn">${good} von ${signed.length} Fassungen sind unverändert enthalten. Die übrigen lassen sich nicht nachweisen – die Datei wurde dazwischen neu gespeichert (z. B. in einem anderen PDF-Programm) oder verändert.</p>`;
  const cell = i => !ok || !req.signers[i].hash ? '–' : ok[i] ? '✓ unverändert enthalten' : '– nicht nachweisbar';
  const w = SigReq.waiting(req);
  const seit = n => n === 0 ? 'Seit heute' : n === 1 ? 'seit 1 Tag' : `seit ${n} Tagen`, late = n => n === 1 ? 'überfällig seit 1 Tag' : `überfällig seit ${n} Tagen`;
  // Teile einzeln übersetzen und erst dann zusammensetzen – zusammengesetztes HTML erkennen die Übersetzungsmuster nicht
  const T = (k, ...v) => String(I18N.t(k)).replace(/\{(\d+)\}/g, (all, n) => v[n] != null ? v[n] : all), L = k => esc(I18N.t(k));
  const due = !w?.due ? '' : ' ' + T('· Frist {0}: {1}', esc(SigReq.day(w.due)), w.dueDays < 0 ? `<b class="reqlate">${L(late(-w.dueDays))}</b>` : w.dueDays === 0 ? `<b class="reqlate">${L('heute fällig')}</b>` : L(w.dueDays === 1 ? 'noch 1 Tag' : `noch ${w.dueDays} Tage`));
  const wl = w ? `<p class="reqwait" translate="no">${T('Wartet auf <b translate="no">{0}</b>{1} · {2}{3}{4}', esc(w.name), w.stage.key === 'offen' ? '' : ` – ${L(w.stage.label)} ${esc(SigReq.fmt(w.stage.at))}`, L(seit(w.days)), due, w.after ? ' ' + T('· danach: <span translate="no">{0}</span>', esc(w.after)) : '')}</p>` : '';
  const last = req.log.filter(l => l.what === 'abgeschlossen').pop(), dur = last ? Math.round((new Date(last.at) - new Date(req.created)) / 86400000) : -1;
  const fin = dur >= 0 ? `<p class="reqok" translate="no">${T('✓ Abgeschlossen {0} – {1}.', esc(SigReq.fmt(last.at)), L(dur < 1 ? 'am selben Tag' : dur === 1 ? 'nach 1 Tag' : `nach ${dur} Tagen`))}</p>` : '';
  const adv = reqFromMe ? SigReq.advice(w) : null;
  const wa = adv ? `<p class="${adv.urgent ? 'reqwarn' : 'hint'}" translate="no">➜ ${L(adv.text)}</p>` : '';
  const steps = s => SigReq.steps(s).map(x => `${x.label} <small>${esc(SigReq.fmt(x.at))}</small>`).join('<br>') || 'Offen – noch nicht gesendet';
  $('#reqInfoBody').innerHTML = `<p><b translate="no">${esc(req.title)}</b> · ${SigReq.doneCount(req)} von ${req.signers.length} unterschrieben</p>${fin}${wl}${wa}${head}<table class="reqtab"><thead><tr><th>Person</th><th>Verlauf</th>${ok ? '<th>Echtheit</th>' : ''}<th>Prüfsumme (SHA-256)</th></tr></thead><tbody>${req.signers.map((s, i) => `<tr><td translate="no">${esc(s.name)}<br><small>${esc(s.email)}</small></td><td class="reqsteps">${steps(s)}${s.ext ? '<br><small>in einem anderen PDF-Programm</small>' : ''}${s.reason ? `<br><small translate="no">${esc(s.reason)}</small>` : ''}</td>${ok ? `<td>${cell(i)}</td>` : ''}<td><code>${esc(s.hash || '–')}</code></td></tr>`).join('')}</tbody></table><p class="hint">„Gesendet“: PDFMy hat die E-Mail vorbereitet. „Empfangen“ und „Gelesen“ hält PDFMy fest, wenn die Person die PDF in PDFMy öffnet und jede Seite ansieht – ohne Server sehen Sie das, sobald eine neuere Fassung bei Ihnen ankommt. Schneller geht es mit der Lesebestätigung, die jede Anfrage-E-Mail anfordert, wenn das Mail-Programm sie unterstützt.</p>`;
  $('#reqInfoDlg').showModal();
}
$('#reqInfoClose').onclick = () => $('#reqInfoDlg').close();
function renderReqBar() {
  const bar = $('#reqBar'); bar.hidden = !req; if (!req) return;
  const n = req.signers.length, d = SigReq.doneCount(req), i = reqMine(), b = (id, t, cls = '') => `<button type="button" class="linkbtn${cls}" data-rq="${id}">${t}</button>`;
  let text, btns;
  const di = SigReq.declined(req);
  if (reqDraft) {
    text = req.serial ? `Serienversand „${req.title}“ an ${req.serial.length} Empfänger: Felder setzen` : `Unterschriftsanfrage „${req.title}“: Felder setzen`;
    btns = `<label class="hint">Feldart <select id="reqType">${Object.entries(SigReq.TYPES).map(([k, v]) => `<option value="${k}"${k === reqType ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` + req.signers.map((s, k) => { const c = req.fields.filter(f => f.s === k).length; return `<button type="button" class="linkbtn" data-rarm="${k}"${k === reqArm ? ' aria-pressed="true"' : ''}>${k === reqArm ? '➜ ' : ''}${req.serial ? 'Feld für Empfänger' : `Feld für ${esc(s.name)}`}${c ? ` (${c})` : ''}</button>`; }).join('') + b('send', req.serial ? `An ${req.serial.length} Empfänger senden …` : 'Per E-Mail senden …') + (req.serial ? '' : b('msend', 'Per Messenger senden …')) + b('edit', 'Ändern …') + b('tpl', 'Als Vorlage speichern …') + b('cancel', 'Abbrechen');
  } else if (di >= 0) {
    text = `„${req.title}“ wurde von ${req.signers[di].name} abgelehnt${req.signers[di].reason ? `: ${req.signers[di].reason}` : ''}`;
    btns = b('info', 'Übersicht');
  } else if (i >= 0) {
    const parts = [`${req.requester.name || req.requester.email} bittet um Unterschrift: ${req.signers[i].name} ist dran (${d} von ${n} unterschrieben)`];
    const need = req.fields.filter(f => f.s === i && f.t === 'text' && f.pg);
    if (need.length && !reqSigned) parts.push(`– ${need.filter(f => String(f.v || '').trim()).length} von ${need.length} Angaben ausgefüllt`);
    const wt = SigReq.waiting(req);
    if (wt?.due) parts.push(wt.dueDays < 0 ? `– Frist ${SigReq.day(wt.due)} ist überschritten` : wt.dueDays === 0 ? '– Frist: heute' : `– Frist: ${SigReq.day(wt.due)}`);
    if (reqExt && !reqSigned) parts.push(`– ${req.signers[i].name} hat offenbar in einem anderen PDF-Programm unterschrieben`);
    text = parts.map(p => I18N.t(p)).join(' ');   // jeden Teil für sich übersetzen
    btns = (reqSigned ? b('fwd', 'Unterschrieben – weitersenden') : (reqExt ? b('ext', 'Als unterschrieben übernehmen …', ' strong') : '') + (reqMyFields().length > 1 ? b('nextf', 'Nächstes Feld →') : '') + b('sign', 'Hier unterschreiben')) + b('info', 'Übersicht') + (req.via === 'messenger' && req.rt && req.signers[i].readAt && !reqConfirmed ? b('rconf', 'Lesebestätigung senden', ' strong') : '') + b('decline', 'Ablehnen …') + (reqSigned || reqExt ? '' : b('ext', 'In anderem Programm unterschrieben …'));
  } else {
    text = `Alle ${n} haben „${req.title}“ unterschrieben ✓`;
    btns = b('info', 'Übersicht') + b('dsign', 'Zusätzlich digital signieren …');
  }
  $('#reqText').textContent = text;
  $('#reqText').toggleAttribute('translate', i >= 0 && !reqDraft && SigReq.declined(req) < 0); if ($('#reqText').hasAttribute('translate')) $('#reqText').setAttribute('translate', 'no');
  $('#reqBtns').innerHTML = btns;
}
$('#reqBtns').addEventListener('click', ev => {
  const a = ev.target.closest('[data-rarm]'); if (a) { reqArm = +a.dataset.rarm; renderReqBar(); toast(`Jetzt auf die Stelle klicken, an der ${req.signers[reqArm].name} unterschreiben soll.`, 6000); return; }
  const k = ev.target.closest('[data-rq]')?.dataset.rq;
  if (k === 'send') reqSend();
  else if (k === 'msend') reqSendMessenger();
  else if (k === 'rconf') reqReadConfirm();
  else if (k === 'edit') $('#btnSigReq').click();
  else if (k === 'cancel') { window.reqReset(); renderAnns(); status('Unterschriftsanfrage verworfen.'); }
  else if (k === 'sign') reqSignNow();
  else if (k === 'fwd') reqForward();
  else if (k === 'tpl') reqTplSave();
  else if (k === 'nextf') reqNextField();
  else if (k === 'ext') {
    const s = req.signers[reqMine()]; if (!s) return;
    if (!confirm(`${s.name} hat diese Fassung in einem anderen PDF-Programm ausgefüllt und unterschrieben?\n\nBitte vorher auf der Seite prüfen. Danach bereitet PDFMy die E-Mail an die nächste Person vor.`)) return;
    reqSigned = true; reqForward(true);
  }
  else if (k === 'info') reqInfoShow();
  else if (k === 'decline') { $('#reqDecWhy').value = ''; $('#reqDecDlg').showModal(); $('#reqDecWhy').focus(); }
  else if (k === 'dsign') { openExport({ format: 'pdf' }); const x = $('#x-sign'); if (x && !x.checked) { x.checked = true; x.dispatchEvent(new Event('change', { bubbles: true })); } }
});
/* ---------- Schlagwörter ---------- */
// Vorschläge auch für das zweite, dritte … Wort: die Liste enthält „bisherige Eingabe, Vorschlag“
function tagSuggest(input, list, existing = '') {
  const v = input.value, i = v.lastIndexOf(','), head = i >= 0 ? v.slice(0, i + 1) + ' ' : '', have = new Set(Journal.tagList(v + ',' + existing).map(t => t.toLowerCase()));
  $('#tagList').innerHTML = Journal.allTags(list).filter(t => !have.has(t.tag.toLowerCase())).slice(0, 30).map(t => `<option value="${esc(head + t.tag)}"></option>`).join('');
}
$('#tags').addEventListener('focus', e => tagSuggest(e.target, jLocal()));
$('#tags').addEventListener('input', e => { state.tags = e.target.value; tagSuggest(e.target, jLocal()); });
fillTeam();
teamLoad().then(() => fillTeam());

$('#jq').addEventListener('input', () => renderJournal());
$('#jf').addEventListener('change', () => renderJournal());
$('#jBody').addEventListener('click', async ev => {
  const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
  const e = jList.find(x => x.id === tr.dataset.id) || (tr.dataset.id.startsWith('f:') && { file: tr.dataset.id.slice(2) }); if (!e) return;
  if (ev.target.closest('[data-untag]')) {
    const t = ev.target.closest('[data-untag]').dataset.untag.toLowerCase();
    const e2 = await updateEntry(e.id, { tags: Journal.tagList(e.tags).filter(x => x.toLowerCase() !== t).join(', ') }); jFillFilters(); renderJournal();
    status(e2.tags ? `Schlagwörter: ${e2.tags}` : 'Schlagwörter entfernt.'); return;
  }
  if (ev.target.closest('[data-tag]')) { jFillFilters(); $('#jTag').value = ev.target.closest('[data-tag]').dataset.tag; renderJournal(); return; }
  if (!ev.target.closest('button, a, input, select, textarea, label')) return jPreview(e, tr);
  if (ev.target.closest('[data-fwd]')) openForward(e);
  else if (ev.target.closest('[data-sigrem]')) reqRemind(e);
  else if (ev.target.closest('[data-open]')) {
    try {
      let dir = state.outDir; const parts = e.file.split('\\'), name = parts.pop();
      for (const p of parts) dir = await dir.getDirectoryHandle(p);
      const file = await (await dir.getFileHandle(name)).getFile();
      if (state.dirty && state.pages.length && !confirm('Aktuellen Brief verwerfen? Er wurde noch nicht gespeichert.')) return;
      $('#jDlg').close(); resetDoc(); await importFiles([file]);
      state.fromArchive = { id: e.id && !String(e.id).startsWith('f:') ? e.id : null, file: e.file };   // Speichern → neue Version an derselben Stelle
      if (e.akte) { state.akte = e.akte; $('#akte').value = e.akte; state.akteTouched = true; }
      if (e.tags) { state.tags = e.tags; $('#tags').value = e.tags; }
      if (e.fields) { state.cf = Journal.fieldsParse(e.fields); state.cfTouched = true; cfRender(); }
    } catch (err) { status(`Datei nicht gefunden: ${e.file} (verschoben oder umbenannt?)`); }
  }
});
/* ---------- Vorschau: erste Seite des angeklickten Dokuments neben der Liste (ab 900 px Breite) ---------- */
let jSel = null;
const jPrevCache = new Map();
async function archiveFile(rel) {
  let dir = state.outDir; const parts = rel.split('\\'), name = parts.pop();
  for (const p of parts) dir = await dir.getDirectoryHandle(p);
  return (await dir.getFileHandle(name)).getFile();
}
async function jPreview(e, tr) {
  const box = $('#jPrev');
  if (!state.outDir || !e.file || matchMedia('(max-width: 899px)').matches) return;
  if (jSel === tr.dataset.id && !box.hidden) return;
  $('#jBody tr.sel')?.classList.remove('sel'); tr.classList.add('sel');
  jSel = tr.dataset.id; box.hidden = false; box.setAttribute('aria-busy', 'true');
  const name = e.file.split('\\').pop();
  let p = jPrevCache.get(e.file);
  if (!p) {
    try {
      const doc = await openPdf(new Uint8Array(await (await archiveFile(e.file)).arrayBuffer()));
      const pg = await doc.getPage(1), vp = pg.getViewport({ scale: 500 / pg.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      p = { url: c.toDataURL('image/jpeg', 0.85), pages: doc.numPages }; doc.loadingTask?.destroy?.();
    } catch (err) {
      if (err?.name === 'PasswordException') p = { err: `„${name}“ ist passwortgeschützt` };
      else if (err?.name === 'NotFoundError') p = { err: `Datei nicht gefunden: ${e.file} (verschoben oder umbenannt?)` };
      else { if (jSel === tr.dataset.id) box.hidden = true; return; }   // keine Vorschau möglich (z. B. beschädigte Datei) – Öffnen geht weiter über die Zeile
    }
    if (!p.err) { jPrevCache.set(e.file, p); if (jPrevCache.size > 30) jPrevCache.delete(jPrevCache.keys().next().value); }
  }
  if (jSel !== tr.dataset.id) return;   // inzwischen andere Zeile gewählt
  box.removeAttribute('aria-busy');
  const el = (tag, text, props = {}) => Object.assign(document.createElement(tag), text != null ? { textContent: text } : {}, props);
  if (p.err) return box.replaceChildren(el('p', p.err));
  const img = el('img', null, { src: p.url, alt: 'Vorschau' }), btn = el('button', 'Öffnen', { type: 'button', className: 'primary' });
  img.dataset.popen = btn.dataset.popen = '';
  box.replaceChildren(img, el('p', name, { translate: false }), el('p', `Seite ${1} von ${p.pages}`), btn);   // Vorlage = vorhandener Text „Seite {0} von {1}“
}
$('#jPrev').addEventListener('click', ev => {
  if (!ev.target.closest('[data-popen]')) return;
  [...$('#jBody').rows].find(r => r.dataset.id === jSel)?.querySelector('[data-open]')?.click();
});
// Tastatur: Vorschau, sobald „Öffnen“ in einer Zeile den Fokus bekommt
$('#jBody').addEventListener('focusin', ev => {
  if (!ev.target.matches('[data-open]')) return;
  const tr = ev.target.closest('tr[data-id]'), e = jList.find(x => x.id === tr.dataset.id) || (tr.dataset.id.startsWith('f:') && { file: tr.dataset.id.slice(2) });
  if (e) jPreview(e, tr);
});
$('#jExport').onclick = async () => {
  const where = await deliver(new TextEncoder().encode(Journal.toCsv(jList)), `Posteingangsbuch_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', null, true);
  if (where) status(`Posteingangsbuch gespeichert: ${where} – öffnet sich in Excel.`);
};
$('#jClose').onclick = () => $('#jDlg').close();
// Unverändert? Prüfsumme (SHA-256) jeder abgelegten Datei mit dem Eintrag im Buch vergleichen
$('#jVerify').onclick = async () => {
  if (!state.outDir) return status('Für die Prüfung den Ablageordner verbinden.');
  const list = jList.filter(e => e.sha256 && e.file); let ok = 0; const bad = [], gone = [];
  for (const [i, e] of list.entries()) {
    status(`Prüfe ${i + 1} von ${list.length} …`, i / list.length);
    try {
      let dir = state.outDir; const parts = e.file.split('\\'), name = parts.pop();
      for (const p of parts) dir = await dir.getDirectoryHandle(p);
      (await sha256(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer())) === e.sha256 ? ok++ : bad.push(e.file);
    } catch { gone.push(e.file); }
  }
  status(`Prüfung: ${ok} von ${list.length} Datei(en) unverändert` + (bad.length ? ` · VERÄNDERT: ${bad.join(', ')}` : '') + (gone.length ? ` · nicht gefunden (verschoben?): ${gone.length}` : '') + '.');
};
/* ---------- GoBD-Prüfprotokoll: Dateien (SHA-256), Siegel der Einträge, Lücken der Eingangsnummern, Verfahrensbeschreibung ---------- */
async function auditPdf(r) {
  const doc = await PDFDocument.create(); doc.registerFontkit(await loadFontkit());
  const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true }), cs = new Set(font.getCharacterSet());
  const safe = s => [...String(s)].filter(ch => cs.has(ch.codePointAt(0))).join('');
  const W = 595.28, H = 841.89, L = mm(20), R = W - mm(20), dark = rgb(0.1, 0.1, 0.1);
  let page = doc.addPage([W, H]), y = mm(22);
  const nl = (h = 14) => { y += h; if (y > H - mm(20)) { page = doc.addPage([W, H]); y = mm(20); } };
  const txt = (t, x = L, s = 10, c = dark) => { const words = safe(t).split(' '); let line = ''; for (const w of words) { const tt = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(tt, s) > R - x) { page.drawText(line, { x, y: H - y, size: s, font, color: c }); nl(s + 4); line = w; } else line = tt; } if (line) page.drawText(line, { x, y: H - y, size: s, font, color: c }); };
  txt('GoBD-Prüfprotokoll der Ablage', L, 16); nl(22);
  txt(`Erstellt: ${r.when} · von: ${r.by || '–'} · Ablageordner: ${r.dir}`, L, 9); nl(18);
  txt(`Einträge im Posteingangsbuch: ${r.total} · Dateien geprüft: ${r.checked}`, L, 11); nl(16);
  txt(`Unverändert: ${r.ok} · Verändert: ${r.changed.length} · Nicht gefunden: ${r.missing.length} · Ohne Prüfsumme: ${r.noHash} · Siegel ungültig: ${r.badSeal.length} · Ohne Siegel (vor Einführung): ${r.noSeal}`, L, 10); nl(16);
  txt(`Lücken in den Eingangsnummern: ${r.gaps.length ? r.gaps.join(', ') : 'keine'}`, L, 10); nl(16);
  txt(`Dokumente mit mehreren Fassungen: ${r.versioned}`, L, 10); nl(22);
  const list = (title, items) => { if (!items.length) return; txt(title, L, 11); nl(15); for (const it of items) { txt('• ' + it, L + 8, 9); nl(12); } nl(6); };
  list('Verändert (Prüfsumme stimmt nicht mehr):', r.changed); list('Nicht gefunden (verschoben, umbenannt oder gelöscht):', r.missing); list('Eintrag nachträglich geändert (Siegel ungültig):', r.badSeal);
  nl(6); txt('Verfahrensbeschreibung (Grundlage für die Verfahrensdokumentation)', L, 12); nl(16);
  for (const para of [
    'Eingang: Papierpost wird gescannt (Scanner, Kamera) oder digital empfangen (PDF, E-Mail, E-Rechnung). Die Texterkennung läuft lokal im Browser; Dokumente werden nicht hochgeladen.',
    'Erfassung: PDFMy liest Absender, Datum, Typ, Betrag, Frist und Aktenzeichen aus; der Bearbeiter prüft und ergänzt die Angaben (Akte, Zuständigkeit).',
    'Ablage: Speicherung als PDF/A im Ablageordner (Unterordner nach Typ/Jahr), bei E-Rechnungen zusätzlich das Original-XML. Für jede Datei wird die SHA-256-Prüfsumme im Posteingangsbuch festgehalten, dazu ein Siegel über die unveränderlichen Angaben des Eintrags und auf Wunsch eine fortlaufende Eingangsnummer.',
    'Änderungen: Wird ein abgelegtes Dokument geändert, bleibt die bisherige Fassung unverändert im Ordner „_Versionen“ erhalten; der Eintrag zählt die Version hoch und erhält die neue Prüfsumme.',
    'Aufbewahrung: Die Aufbewahrungsfristen werden je Dokumenttyp angezeigt; abgelaufene Belege werden nur verschoben („_Aufbewahrung abgelaufen“), nie gelöscht.',
    'Grenzen: Prüfsumme und Siegel machen Änderungen erkennbar. Unveränderbarkeit im Sinne der GoBD muss zusätzlich der Speicherort sicherstellen (z. B. Aufbewahrungsrichtlinien in SharePoint/Microsoft 365 oder ein WORM-Speicher) – ebenso Zugriffsrechte und Datensicherung.']) { txt(para, L, 9.5); nl(16); }
  doc.setTitle('GoBD-Prüfprotokoll'); doc.setLanguage('de-DE');
  return doc.save();
}
async function runAudit() {
  const list = await journalAll(); jList = list;
  const r = { when: new Date().toLocaleString('de-DE'), by: S.author, dir: state.outDir?.name || '(kein Ablageordner – nur Einträge geprüft)', total: list.length, checked: 0, ok: 0, changed: [], missing: [], noHash: 0, badSeal: [], noSeal: 0, versioned: 0, gaps: Journal.inNoGaps(list) };
  for (const [i, e] of list.entries()) {
    status(`Prüfe ${i + 1} von ${list.length} …`, i / list.length);
    if (+e.ver > 1) r.versioned++;
    if (!e.seal) r.noSeal++;
    else if (await sha256(new TextEncoder().encode(Journal.sealText(e))) !== e.seal) r.badSeal.push(`${e.savedAt} · ${e.sender || ''} · ${e.file || ''}`);
    if (!e.file) continue;
    if (!e.sha256) { r.noHash++; continue; }
    if (!state.outDir) continue;
    r.checked++;
    try {
      let dir = state.outDir; const parts = e.file.split('\\'), fn = parts.pop();
      for (const p of parts) dir = await dir.getDirectoryHandle(p);
      (await sha256(await (await (await dir.getFileHandle(fn)).getFile()).arrayBuffer())) === e.sha256 ? r.ok++ : r.changed.push(e.file);
    } catch { r.missing.push(e.file); }
  }
  const bytes = await auditPdf(r), d = new Date(), z = n => String(n).padStart(2, '0'), name = `GoBD-Pruefprotokoll_${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.pdf`;
  let where;
  if (state.outDir) { const dir = await state.outDir.getDirectoryHandle('_Protokolle', { create: true }); where = `${state.outDir.name}\\_Protokolle\\${await writeUnique(dir, name, bytes)}`; }
  else where = await deliver(bytes, name, 'application/pdf', null, true);
  const problems = r.changed.length + r.missing.length + r.badSeal.length + r.gaps.length;
  status(where ? `GoBD-Prüfprotokoll gespeichert: ${where} – ${problems ? `${problems} Auffälligkeit(en), siehe Protokoll` : 'keine Auffälligkeiten'}.` : 'Speichern abgebrochen.');
  return { r, bytes };
}
$('#jAudit').onclick = () => runAudit();
$('#btnJournal').onclick = () => openJournal();
renderDeadlines();
// Mit verbundener Ablage: gemeinsames Buch des Teams laden (Fristen der Kollegen erscheinen auch hier)
setTimeout(async () => { if (state.outDir) renderDeadlines(await journalAll()); }, 1500);

/* ---------- Ablegen & nächster Brief: ein Klick, ohne Dialog ---------- */
async function fileAndNext() {
  if (!state.pages.length) return;
  // Handy/Browser ohne Ordnerzugriff (Android, iPhone, Firefox): sichern über Teilen/Download, Buch wird lokal geführt
  if (!window.showDirectoryPicker) return fileAndNextSimple();
  if (!state.outDir) {
    status('Zuerst einmalig einen Ablageordner wählen – danach legt „Ablegen & nächster“ jeden Brief mit einem Klick ab.');
    await chooseOutDir(); if (!state.outDir) return;
  }
  // Ablage je Firma: Schreibrecht für den gewählten Ordner (einmal pro Sitzung bestätigen)
  if (!await permitted(state.outDir, 'readwrite', true)) return status(`Kein Schreibzugriff auf „${state.outDir.name}“.`);
  const pages = docPages();
  if (!pages.length) return status('Keine Seiten zum Ablegen.');
  const btn = $('#btnFile'); btn.disabled = true;
  try {
    await waitForOcr(pages); analyze();
    const meta = { ...state.meta }, name = filename();
    if (!await confirmNotDuplicate(meta)) return status('Nicht abgelegt (Dublette).');
    await stampInNo(pages, meta);
    const bytes = einvOriginal(pages) || await buildPdf(pages, meta, { pdfa: S.pdfa && allScans() });
    const where = `${state.outDir.name}\\${await saveToOutDir(bytes, name, meta)}`;
    await journalAdd(meta, where, pages.length);
    state.dirty = false; resetDoc();
    status(`✓ Abgelegt: ${where} (${Tools.formatBytes(bytes.length)}). Bereit für den nächsten Brief.`);
    if (state.scanHelper) openScanDialog();          // mit Scanner: gleich weiterscannen
  } catch (e) { console.error(e); status('Ablegen fehlgeschlagen: ' + e.message); }
  finally { btn.disabled = false; }
}
async function fileAndNextSimple() {
  const pages = docPages();
  if (!pages.length) return status('Keine Seiten zum Ablegen.');
  const btn = $('#btnFile'); btn.disabled = true;
  try {
    await waitForOcr(pages); analyze();
    const meta = { ...state.meta }, name = filename();
    if (!await confirmNotDuplicate(meta)) return status('Nicht abgelegt (Dublette).');
    await stampInNo(pages, meta);
    const bytes = einvOriginal(pages) || await buildPdf(pages, meta, { pdfa: S.pdfa && allScans() });
    const where = await deliver(bytes, name, 'application/pdf', null, false);
    if (!where) return status('Abgebrochen – der Brief ist noch offen.');
    await journalAdd(meta, name, pages.length);
    state.dirty = false; resetDoc();
    status(`✓ Gespeichert: ${where} (${Tools.formatBytes(bytes.length)}). Bereit für den nächsten Brief.`);
  } catch (e) { console.error(e); status('Speichern fehlgeschlagen: ' + e.message); }
  finally { btn.disabled = false; }
}
$('#btnFile').onclick = fileAndNext;

/* ---------- Teilen: per WhatsApp, Telegram, Webex, Signal, E-Mail … ----------
   Handy (Android, iPhone) und Windows: das System-Teilen-Menü zeigt alle installierten Apps.
   Zusätzlich am PC: E-Mail-Entwurf mit Anhang für Outlook (.eml) und Herunterladen. */
let shareFile = null;
const canShareFiles = f => { try { return !!navigator.canShare?.({ files: [f] }); } catch { return false; } };
async function sharePdf(bytes, name, meta = {}) {
  shareFile = { file: new File([bytes], name, { type: 'application/pdf' }), bytes, name, meta };
  // Direkt teilen, solange der Klick noch „frisch“ ist; sonst (Browser verlangt erneuten Tipp) den Teilen-Dialog zeigen
  if (canShareFiles(shareFile.file)) {
    try { await navigator.share({ files: [shareFile.file], title: name.replace(/\.pdf$/i, '') }); status(`Geteilt: ${name}`); return; }
    catch (e) { if (e.name === 'AbortError') { status('Teilen abgebrochen.'); return; } }
  }
  openShareDlg();
}
function openShareDlg() {
  const f = shareFile; if (!f) return;
  $('#shName').textContent = `${f.name} · ${Tools.formatBytes(f.bytes.length)}`;
  $('#shSystem').hidden = !canShareFiles(f.file);
  $('#shSystemHint').textContent = IS_MOBILE ? 'WhatsApp, Telegram, Webex, Signal, E-Mail, Google Drive, In Dateien sichern …' : 'Windows-Teilen: Outlook, Teams, WhatsApp, Telegram, Webex – je nachdem, was installiert ist';
  $('#shMail').hidden = IS_MOBILE;
  $('#shareDlg').showModal();
}
$('#shSystem').onclick = async () => {
  try { await navigator.share({ files: [shareFile.file], title: shareFile.name.replace(/\.pdf$/i, '') }); $('#shareDlg').close(); status(`Geteilt: ${shareFile.name}`); }
  catch (e) { if (e.name !== 'AbortError') status('Teilen nicht möglich: ' + e.message); }
};
$('#shMail').onclick = async () => {
  const f = shareFile, m = f.meta || {};
  const subject = [m.type, m.sender, m.subject].filter(Boolean).join(' – ') || f.name.replace(/\.pdf$/i, '');
  const body = `Guten Tag,\n\nanbei ${m.type ? 'die ' + m.type : 'das Dokument'}${m.sender ? ' von ' + m.sender : ''}${m.date ? ' vom ' + m.date.split('-').reverse().join('.') : ''}.\n\nViele Grüße${S.author ? '\n' + S.author : ''}`;
  const eml = Journal.emlDraft({ subject, body, attachments: [{ name: f.name, mime: 'application/pdf', bytes: f.bytes }] });
  $('#shareDlg').close();
  const opened = await openEml(new TextEncoder().encode(eml), f.name.replace(/\.pdf$/i, '') + '.eml');
  status(opened ? 'Neue E-Mail mit dem PDF ist in Ihrem Mail-Programm geöffnet – Empfänger eintragen und senden.' : 'E-Mail-Entwurf mit Anhang gespeichert – die .eml-Datei öffnen (unten im Browser), dann erscheint eine neue Outlook-Nachricht mit dem PDF.');
};
$('#shSave').onclick = async () => { $('#shareDlg').close(); const w = await deliver(shareFile.bytes, shareFile.name, 'application/pdf', null, true); if (w) status(`Gespeichert: ${w}`); };
$('#shCancel').onclick = () => $('#shareDlg').close();
$('#btnShareTop').onclick = () => shareDoc();
// Abgelegte Briefe direkt aus dem Posteingangsbuch teilen
$('#jBody').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-share]'); if (!b) return;
  const e = jList.find(x => x.id === b.closest('tr').dataset.id); if (!e) return;
  try { const bytes = await readAblage(e.file); $('#jDlg').close(); sharePdf(bytes, e.file.split('\\').pop(), e); }
  catch { status(`Datei nicht gefunden: ${e.file}`); }
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && state.pages.length && !document.querySelector('dialog[open]')) { e.preventDefault(); fileAndNext(); }
});

/* ---------- Dokumente vergleichen ---------- */
// Text einer Datei holen, ohne das offene Dokument anzutasten: PDF-Text direkt, Scans per Texterkennung
async function textOfFile(f, label) {
  const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name), parts = [];
  const ocrCanvas = async (c, i, n) => { status(`${label}: Texterkennung Seite ${i} von ${n} …`, i / n); return (await recognize(Imaging.enhance(c, 'document'))).text; };
  if (!isPdf) {
    const bmp = await loadBitmap(f), k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = Imaging.canvas(Math.round(bmp.width * k), Math.round(bmp.height * k)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return ocrCanvas(c, 1, 1);
  }
  const js = await openPdf(new Uint8Array(await f.arrayBuffer()));
  for (let i = 1; i <= js.numPages; i++) {
    const pg = await js.getPage(i), tc = await pg.getTextContent();
    let t = tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').trim();
    if (t.length < 20) {
      const vp = pg.getViewport({ scale: 220 / 72 }), c = Imaging.canvas(Math.round(vp.width), Math.round(vp.height)), x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: x, viewport: vp, intent: 'print' }).promise;
      t = await ocrCanvas(c, i, js.numPages);
    }
    parts.push(t);
  }
  return parts.join('\n\n');
}
// Seiten einer Fassung als Bild zeichnen – für den visuellen Vergleich (offenes Dokument oder Datei)
const CMP_DPI = 96;
function cmpPagesOfOpen() { return docPages().map(p => async () => p.kind === 'pdf' ? renderPdf(p, CMP_DPI) : p.processed); }
async function cmpPagesOfFile(f) {
  if (!(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) {
    const bmp = await loadBitmap(f), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height)), c = Imaging.canvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return [async () => c];
  }
  const js = await openPdf(new Uint8Array(await f.arrayBuffer()));
  return Array.from({ length: js.numPages }, (_, i) => async () => {
    const pg = await js.getPage(i + 1), vp = pg.getViewport({ scale: CMP_DPI / 72 }), c = Imaging.canvas(Math.round(vp.width), Math.round(vp.height)), x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: vp, intent: 'print' }).promise; return c;
  });
}
let cmpSrc = null, cmpPage = 0, cmpShares = [];
async function cmpDiffPage(i, maxW = 900) {
  const A = cmpSrc.a[i] ? await cmpSrc.a[i]() : null, B = cmpSrc.b[i] ? await cmpSrc.b[i]() : null, ref = A || B;
  const k = Math.min(1, maxW / ref.width), w = Math.max(1, Math.round(ref.width * k)), h = Math.max(1, Math.round(ref.height * k));
  const px = src => { const c = Imaging.canvas(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); if (src) x.drawImage(src, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
  return { w, h, ...Tools.pixelDiff(px(A), px(B), w, h) };
}
async function cmpShowPage(i) {
  const n = Math.max(cmpSrc.a.length, cmpSrc.b.length); cmpPage = Math.max(0, Math.min(n - 1, i));
  $('#cmpPg').textContent = `Seite ${cmpPage + 1} von ${n}`; $('#cmpPrev').disabled = cmpPage === 0; $('#cmpNextPg').disabled = cmpPage >= n - 1;
  const r = await cmpDiffPage(cmpPage), c = $('#cmpCanvas'); c.width = r.w; c.height = r.h;
  const x = c.getContext('2d'); x.putImageData(new ImageData(r.data, r.w, r.h), 0, 0);
  x.strokeStyle = '#d97706'; x.lineWidth = 2; x.setLineDash([6, 4]); for (const b of r.regions) x.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  const miss = !cmpSrc.a[cmpPage] ? ' – fehlt in der ersten Fassung' : !cmpSrc.b[cmpPage] ? ' – fehlt in der zweiten Fassung' : '';
  $('#cmpVisSum').textContent = r.changed ? (r.regions.length === 1 ? `1 geänderte Stelle auf dieser Seite${miss}` : `${r.regions.length} geänderte Stellen auf dieser Seite${miss}`) : 'Diese Seite sieht gleich aus.';
  c.setAttribute('aria-label', $('#cmpVisSum').textContent);
}
async function cmpVisual() {
  $('#cmpText').hidden = true; $('#cmpVis').hidden = false; $('#cmpModeText').setAttribute('aria-pressed', 'false'); $('#cmpModeVis').setAttribute('aria-pressed', 'true');
  await cmpShowPage(cmpPage);
  // Überblick: auf welchen Seiten gibt es Unterschiede? (grob, bis 60 Seiten)
  const n = Math.min(60, Math.max(cmpSrc.a.length, cmpSrc.b.length)), seq = cmpSrc;
  if (cmpShares.length) return;
  for (let i = 0; i < n; i++) { if (cmpSrc !== seq || $('#cmpVis').hidden) return; cmpShares[i] = (await cmpDiffPage(i, 300)).changed > 0; }
  const pages = cmpShares.map((v, i) => v ? i + 1 : 0).filter(Boolean);
  $('#cmpVisAll').textContent = pages.length ? `Unterschiede auf Seite ${pages.join(', ')}` : 'Alle Seiten sehen gleich aus.';
}
function cmpTextMode() { $('#cmpText').hidden = false; $('#cmpVis').hidden = true; $('#cmpModeText').setAttribute('aria-pressed', 'true'); $('#cmpModeVis').setAttribute('aria-pressed', 'false'); }
$('#cmpModeText').onclick = cmpTextMode;
$('#cmpModeVis').onclick = () => cmpVisual().catch(e => { console.error(e); status('Visueller Vergleich nicht möglich: ' + e.message); });
$('#cmpPrev').onclick = () => cmpShowPage(cmpPage - 1);
$('#cmpNextPg').onclick = () => cmpShowPage(cmpPage + 1);
async function compareFiles(files) {
  try {
    let a, b, nameA, nameB;
    cmpSrc = null; cmpPage = 0; cmpShares = []; $('#cmpVisAll').textContent = '';
    if (files.length === 1 && state.pages.length) {
      cmpSrc = { a: cmpPagesOfOpen(), b: await cmpPagesOfFile(files[0]) };
      status('Lese das offene Dokument …'); await waitForOcr(docPages());
      a = docPages().map(pageText).join('\n\n'); nameA = filename(); nameB = files[0].name;
      b = await textOfFile(files[0], nameB);
    } else if (files.length === 2) {
      [nameA, nameB] = files.map(f => f.name);
      cmpSrc = { a: await cmpPagesOfFile(files[0]), b: await cmpPagesOfFile(files[1]) };
      a = await textOfFile(files[0], nameA); b = await textOfFile(files[1], nameB);
    } else return status('Zum Vergleichen bitte genau zwei Dateien wählen (alte und neue Fassung).');
    showCompare(Tools.diffWords(a, b), nameA, nameB);
  } catch (e) { console.error(e); status('Vergleich nicht möglich: ' + e.message); }
}
function showCompare(d, nameA, nameB) {
  const ins = d.filter(x => x.op === '+').length, del = d.filter(x => x.op === '-').length;
  $('#cmpNames').innerHTML = `<del>${esc(nameA)}</del> → <ins>${esc(nameB)}</ins>`;
  $('#cmpSum').textContent = ins + del ? `${ins + del} Änderung(en): ${ins} × eingefügt, ${del} × entfernt` : 'Keine inhaltlichen Unterschiede gefunden.';
  $('#cmpOut').innerHTML = d.map(x => x.op === '=' ? esc(x.t) : `<${x.op === '+' ? 'ins' : 'del'}>${esc(x.t)}</${x.op === '+' ? 'ins' : 'del'}>`).join('');
  $('#cmpOnly').checked = false; $('#cmpOut').classList.remove('only');
  state.cmpAt = -1; cmpTextMode(); $('#cmpModeVis').disabled = !cmpSrc; $('#cmpDlg').showModal(); status('Vergleich fertig.');
}
$('#cmpOnly').onchange = e => $('#cmpOut').classList.toggle('only', e.target.checked);
$('#cmpNext').onclick = () => {
  const ch = [...$('#cmpOut').querySelectorAll('ins,del')]; if (!ch.length) return;
  ch.forEach(x => x.classList.remove('cur'));
  state.cmpAt = (state.cmpAt + 1) % ch.length; ch[state.cmpAt].classList.add('cur'); ch[state.cmpAt].scrollIntoView({ block: 'center' });
};
$('#cmpClose').onclick = () => $('#cmpDlg').close();
$('#btnCompare').onclick = () => { state.intent = 'compare'; const i = $('#intentIn'); i.accept = 'application/pdf,.pdf,image/*'; i.multiple = !state.pages.length; i.click(); };

/* ---------- Stapelverarbeitung: viele Dateien auf einmal – verkleinern, PDF/A, durchsuchbar machen oder Briefe ablegen ----------
   Läuft in einem eigenen Reiter, das geöffnete Dokument bleibt erhalten. Ergebnis als ZIP oder in einen Ordner. */
let batchStop = false;
function batchAsk(files) {
  return new Promise(res => {
    const d = $('#batchDlg'), n = files.length, mb = files.reduce((s, f) => s + f.size, 0);
    $('#batchWhat').textContent = `${n === 1 ? `${n} Datei` : `${n} Dateien`} ausgewählt (${Tools.formatBytes(mb)}).`;
    $('#batchSetup').hidden = false; $('#batchRun').hidden = true; $('#batchResult').hidden = true;
    $('#batchGo').hidden = false; $('#batchGo').textContent = 'Starten'; $('#batchCancel').textContent = 'Abbrechen';
    $('#batchDirRow').hidden = !window.showDirectoryPicker;
    // eigene Abläufe (Speichern-Dialog → „Als Ablauf speichern“) – nur PDF und PDF/A
    const fl = flows().map((f, i) => [f, i]).filter(([f]) => f.o.format === 'pdf' || f.o.format === 'pdfa');
    $('#batchFlows').replaceChildren(...fl.map(([f, i]) => {
      const l = document.createElement('label'); l.className = 'prrow';
      l.innerHTML = `<input type="radio" name="batchAct" value="flow:${i}"> <span><b translate="no"></b> <small>– eigener Ablauf</small></span>`;
      l.querySelector('b').textContent = f.name; return l;
    }));
    const last = LS.get('batchAct', 'small'); const r = d.querySelector(`[name=batchAct][value="${last}"]`) || d.querySelector('[name=batchAct][value=small]'); if (r) r.checked = true;
    const sync = () => { $('#batchOutSet').hidden = d.querySelector('[name=batchAct]:checked').value === 'file'; };
    d.querySelectorAll('[name=batchAct]').forEach(x => x.onchange = sync); sync();
    $('#batchGo').onclick = () => { const act = d.querySelector('[name=batchAct]:checked').value; LS.set('batchAct', act); res({ act, out: d.querySelector('[name=batchOut]:checked').value }); };
    $('#batchCancel').onclick = () => { if ($('#batchRun').hidden) { d.close(); res(null); } else { batchStop = true; $('#batchNow').textContent = 'Wird nach der aktuellen Datei angehalten …'; } };
    d.oncancel = e => { if (!$('#batchRun').hidden) { e.preventDefault(); batchStop = true; } else res(null); };
    if (!d.open) d.showModal(); $('#batchGo').focus();
  });
}
async function batchFiles(files) {
  if (!files.length) return;
  const choice = await batchAsk(files); if (!choice) return;
  if (choice.act !== 'file') return batchConvert(files, choice);
  $('#batchDlg').close();
  if (state.pages.length && state.dirty && !confirm('Aktuellen Brief verwerfen? Er wurde noch nicht gespeichert.')) return;
  if (!state.outDir) { await chooseOutDir(); if (!state.outDir) return status('Für die Stapelverarbeitung wird ein Ablageordner benötigt.'); }
  const done = [], failed = [], skipped = [];
  for (const [i, f] of files.entries()) {
    resetDoc(); state.intent = 'batch';
    try {
      status(`Stapel: Datei ${i + 1} von ${files.length} – ${f.name}`, i / files.length);
      await importFiles([f]);
      const pages = docPages(); if (!pages.length) throw new Error('keine Seiten');
      await waitForOcr(pages); analyze();
      const meta = { ...state.meta };
      const dup = findDuplicate(meta, await journalAll());
      if (dup) { skipped.push(`${f.name} (schon abgelegt: ${dup.file.split('\\').pop()})`); continue; }
      const bytes = einvOriginal(pages) || await buildPdf(pages, meta, { pdfa: S.pdfa && allScans(), onPage: k => status(`Stapel: Datei ${i + 1} von ${files.length}, Seite ${k + 1} …`, (i + k / pages.length) / files.length) });
      const where = `${state.outDir.name}\\${await saveToOutDir(bytes, filename(), meta)}`;
      await journalAdd(meta, where, pages.length); done.push(where);
    } catch (e) { console.error(e); failed.push(`${f.name} (${e.message})`); }
  }
  resetDoc();
  status(`Stapel fertig: ${done.length} von ${files.length} Datei(en) abgelegt in „${state.outDir.name}“` + (skipped.length ? ` · übersprungen (Dublette): ${skipped.join(', ')}` : '') + (failed.length ? ` · Fehler: ${failed.join(', ')}` : ''));
  if (done.length) openJournal();
}
// Verkleinern / PDF/A / durchsuchbar: jede Datei einzeln laden, umwandeln, sammeln
async function batchConvert(files, { act, out }) {
  let dir = null;
  if (out === 'dir') { try { dir = await showDirectoryPicker({ id: 'mpdf-batch', mode: 'readwrite' }); } catch (e) { if (e.name === 'AbortError') return; throw e; } }
  batchStop = false;
  $('#batchSetup').hidden = true; $('#batchRun').hidden = false; $('#batchGo').hidden = true; $('#batchCancel').textContent = 'Anhalten';
  const hadDoc = state.pages.length > 0;
  if (hadDoc) newTab();   // eigener Reiter: das geöffnete Dokument bleibt unangetastet
  const flow = act.startsWith('flow:') ? flows()[+act.slice(5)] : null;   // eigener Ablauf aus dem Speichern-Dialog
  if (act.startsWith('flow:') && !flow) { status('Dieser Ablauf existiert nicht mehr.'); return; }
  const results = [], suffix = flow ? '_' + flow.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().replace(/\s+/g, '_').slice(0, 30) : { small: '_klein', pdfa: '_PDFA', ocr: '_durchsuchbar' }[act], used = new Set();
  const label = flow ? flow.name : { small: 'Verkleinern', pdfa: 'PDF/A', ocr: 'Texterkennung' }[act];
  for (const [i, f] of files.entries()) {
    if (batchStop) break;
    const prog = k => { $('#batchBar').value = (i + (k || 0)) / files.length; $('#batchNow').textContent = `${label}: Datei ${i + 1} von ${files.length} – ${f.name}`; };
    prog(0);
    resetDoc(); state.intent = null;
    try {
      await importFiles([f]);
      let pages = docPages(); if (!pages.length) throw new Error('keine Seiten');
      if (flow) {
        const fo = flow.o, base = f.name.replace(/\.[^.]+$/, '');
        if (fo.dropBlank) pages = pages.filter(p => !(p.blank && !p.keepBlank));
        if (fo.format === 'pdfa') await waitForOcr(pages);
        let data = await buildPdf(pages, state.meta, { ...stampOpts({ ...fo, letterhead: fo.letterhead && fo.format === 'pdf' }, base), size: fo.size || 'balanced', pdfa: fo.format === 'pdfa', noOcr: fo.format !== 'pdfa', bookmarks: true, onPage: k => prog(k / Math.max(1, pages.length)) });
        if (fo.sheet && fo.sheet !== '1' && fo.format === 'pdf') data = await sheetLayout(data, fo.sheet);
        let name = base + suffix + '.pdf';
        for (let k = 2; used.has(name.toLowerCase()); k++) name = base + suffix + ` (${k}).pdf`;
        used.add(name.toLowerCase());
        if (dir) { const h = await dir.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(data); await w.close(); }
        results.push({ name, from: f.name, before: f.size, after: data.length, data: dir ? null : data });
        continue;
      }
      const opts = n => ({ onPage: k => prog(k / Math.max(1, pages.length)), size: n || (act === 'small' ? 'small' : 'balanced'), pdfa: act === 'pdfa', noOcr: act === 'small', bookmarks: true });
      if (act !== 'small') await waitForOcr(pages);
      let data = await buildPdf(pages, state.meta, opts());
      if (act === 'small') {
        const alt = await buildPdf(pages, state.meta, opts('balanced')); if (alt.length < data.length) data = alt;
        if (/\.pdf$/i.test(f.name) && f.size <= data.length) data = new Uint8Array(await f.arrayBuffer());   // Original ist schon kleiner
      }
      let name = f.name.replace(/\.[^.]+$/, '') + suffix + '.pdf';
      for (let k = 2; used.has(name.toLowerCase()); k++) name = f.name.replace(/\.[^.]+$/, '') + suffix + ` (${k}).pdf`;
      used.add(name.toLowerCase());
      if (dir) { const h = await dir.getFileHandle(name, { create: true }); const w = await h.createWritable(); await w.write(data); await w.close(); }
      results.push({ name, from: f.name, before: f.size, after: data.length, data: dir ? null : data });
    } catch (e) { console.error(e); results.push({ from: f.name, error: e.message || String(e) }); }
  }
  resetDoc();
  if (hadDoc) closeTab(tabCur);
  const ok = results.filter(r => !r.error), bad = results.length - ok.length;
  const before = ok.reduce((s, r) => s + r.before, 0), after = ok.reduce((s, r) => s + r.after, 0);
  let where = '';
  if (ok.length && !dir) { const zipName = `PDFMy_${label.replace('/', '')}_${new Date().toISOString().slice(0, 10)}.zip`; download(Tools.zip(ok.map(r => ({ name: r.name, data: r.data }))), zipName, 'application/zip'); where = `ZIP „${zipName}“ heruntergeladen`; }
  else if (dir) where = `gespeichert in „${dir.name}“`;
  $('#batchRun').hidden = true; $('#batchResult').hidden = false; $('#batchCancel').textContent = 'Schließen';
  $('#batchSum').textContent = `${ok.length} von ${files.length} Datei(en) fertig${batchStop ? ' (angehalten)' : ''}${where ? ' – ' + where : ''}.` + (act === 'small' && before ? ` Zusammen ${Tools.formatBytes(before)} → ${Tools.formatBytes(after)} (−${Math.max(0, Math.round((1 - after / before) * 100))} %).` : '') + (bad ? ` ${bad} Fehler.` : '');
  $('#batchList').innerHTML = results.map(r => r.error ? `<li><span class="bn">${esc(r.from)}</span><span class="bs bad">Fehler: ${esc(r.error)}</span></li>` : `<li><span class="bn" title="${esc(r.name)}">${esc(r.name)}</span><span class="bs">${Tools.formatBytes(r.before)} → ${Tools.formatBytes(r.after)}</span></li>`).join('');
  $('#batchCancel').onclick = () => $('#batchDlg').close();
  status($('#batchSum').textContent);
}

/* ---------- Übersetzen ohne Upload: eingebauter Übersetzer des Browsers (Translator API, Chrome ab 138) – läuft auf dem Gerät ----------
   Wie „PDF übersetzen“ bei iLovePDF, Smallpdf und PDFgear, aber ohne den Text an einen Dienst zu schicken. Ergebnis: neue PDF in einem
   eigenen Reiter mit Überschriften, Absätzen, Listen und Tabellen (Gliederung aus Tools.docBlocks, Satz mit js/textpdf.js). */
// Sprachen der Oberfläche, je Sprache einmal (Englisch, Serbisch …): Kürzel nach BCP 47 ohne Region
const trLangs = () => [...new Map(I18N.LANGS.map(l => [l.code.split('-')[0], l])).entries()].map(([code, l]) => ({ code, name: code === 'en' ? 'English' : l.name }));
const trFill = (sel, v) => { sel.replaceChildren(...trLangs().map(l => { const o = new Option(l.name, l.code); o.setAttribute('translate', 'no'); return o; })); sel.value = [...sel.options].some(o => o.value === v) ? v : 'en'; };
function openTranslate() {
  if (!state.pages.length) return;
  if (aiMode() === 'off') return openAi();
  $('#trHint').textContent = aiMode() === 'local' ? `Die Übersetzung macht die lokale KI auf diesem PC (${localCfg().model}) – der Text verlässt den Rechner nicht. Ergebnis: eine neue PDF im eigenen Reiter.` : 'Die Übersetzung läuft mit dem eingebauten Übersetzer des Browsers auf diesem Gerät – der Text wird nicht hochgeladen. Beim ersten Mal lädt der Browser das Sprachpaket. Ergebnis: eine neue PDF im eigenen Reiter.';
  if (aiMode() !== 'local' && !('Translator' in self)) {
    alert('Übersetzen ohne Upload nutzt den eingebauten Übersetzer des Browsers. Er steht in Google Chrome ab Version 138 am Computer zur Verfügung – bitte PDFMy dort öffnen. Ihr Dokument wird dabei nicht hochgeladen.');
    return;
  }
  const from = docLang(state.pages).split('-')[0], ui = I18N.lang.split('-')[0];
  trFill($('#trFrom'), from);
  trFill($('#trTo'), LS.get('trTo', '') || (ui === from ? (from === 'en' ? 'de' : 'en') : ui));
  $('#trInfo').textContent = ''; $('#trGo').disabled = false;
  $('#trDlg').showModal();
}
$('#trCancel').onclick = () => $('#trDlg').close();
$('#trForm').addEventListener('submit', async e => {
  e.preventDefault();
  const to = $('#trTo').value, from = $('#trFrom').value;
  LS.set('trTo', to);
  if (to === from) { $('#trInfo').textContent = 'Das Dokument ist bereits in dieser Sprache.'; return; }
  $('#trGo').disabled = true;
  let tr;
  if (aiMode() === 'local') tr = { translate: async s => (await localChat({ system: `Du übersetzt Text aus einem Dokument von „${from}“ nach „${to}“. Gib nur die Übersetzung aus, ohne Erklärung. Zahlen, Beträge, Daten, IBAN, Aktenzeichen, Namen und Adressen bleiben unverändert. Ist der Text mit „ | “ in Spalten geteilt, behalte genau diese Trennzeichen und die Spaltenzahl.`, prompt: s })) || s };
  else try {
    const av = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
    if (av === 'unavailable') { $('#trInfo').textContent = 'Diese Sprachkombination kann der eingebaute Übersetzer nicht.'; $('#trGo').disabled = false; return; }
    // Sprachpaket einmalig laden (vom Browser-Hersteller, nicht von PDFMy) – Klick zählt als Bestätigung
    tr = await Translator.create({ sourceLanguage: from, targetLanguage: to, monitor(m) { m.addEventListener('downloadprogress', ev => { $('#trInfo').textContent = `Sprachpaket wird geladen … ${Math.round(ev.loaded * 100)} %`; }); } });
  } catch (err) { console.error(err); $('#trInfo').textContent = 'Übersetzer nicht verfügbar: ' + err.message; $('#trGo').disabled = false; return; }
  $('#trDlg').close();
  try {
    const pages = docPages(), name = baseName();
    await waitForOcr(pages);
    const words = [];
    for (const p of pages) words.push(p.ocr?.words || (p.kind === 'pdf' && p.native !== false ? await nativeWords(p) : null) || []);
    const blocks = Tools.docBlocks(words), cache = new Map();
    let done = 0; const total = blocks.reduce((n, b) => n + (b.type === 'table' ? b.rows.flat().length : b.text ? 1 : 0), 0) || 1;
    const t = async s => {
      if (!s || !/\p{L}/u.test(s)) return s;   // Zahlen, Beträge, Daten bleiben
      if (!cache.has(s)) cache.set(s, await tr.translate(s));
      status(`Übersetze … ${Math.round(++done / total * 100)} %`, done / total);
      return cache.get(s);
    };
    for (const b of blocks) {
      // Tabellen zeilenweise im Zusammenhang übersetzen (einzelne Wörter ohne Kontext werden oft falsch), Zellen danach wieder trennen
      if (b.type === 'table') b.rows = await Promise.all(b.rows.map(async r => {
        if (r.filter(c => /\p{L}/u.test(c)).length < 2) return Promise.all(r.map(t));
        const whole = await t(r.join(' | ')), parts = whole.split(/\s*\|\s*/);
        return parts.length === r.length ? parts.map((x, i) => /\p{L}/u.test(r[i]) ? x : r[i]) : Promise.all(r.map(t));
      }));
      else if (b.text) b.text = await t(b.text);
    }
    const md = Tools.toMarkdown(blocks);
    const [fk, regular, bold, mono] = await Promise.all([loadFontkit(), asset('font', 'vendor/DejaVuSans.ttf'), asset('font:vendor/dejavu/DejaVuSans-Bold.ttf', 'vendor/dejavu/DejaVuSans-Bold.ttf'), asset('font:vendor/dejavu/DejaVuSansMono.ttf', 'vendor/dejavu/DejaVuSansMono.ttf')]);
    const bytes = await TextPdf.build(PDFLib, { text: md, kind: 'md', title: name, fonts: { fontkit: fk, regular, bold, mono } });
    newTab();
    await importFiles([new File([bytes], `${name}_${to.toUpperCase()}.pdf`, { type: 'application/pdf' })]);
    state.dirty = true;
    status(`Übersetzung fertig (${from.toUpperCase()} → ${to.toUpperCase()}) – im neuen Reiter. Maschinell übersetzt: bitte vor dem Versand prüfen.`);
  } catch (err) { console.error(err); status('Übersetzen nicht möglich: ' + err.message); }
  finally { tr?.destroy?.(); }
});
$('#btnTranslate').onclick = () => { closeMenu(); openTranslate(); };

/* ---------- Zusammenfassen und Fragen ohne Upload: eingebaute KI des Browsers (Summarizer- und Prompt-API, Chrome ab 138) ----------
   Wie „AI Summarizer“ und „Chat mit PDF“ bei Acrobat, Smallpdf, iLovePDF und PDFgear – aber das Modell läuft auf dem Gerät,
   der Text verlässt den Computer nicht. Lange Dokumente: abschnittsweise zusammenfassen, dann die Teilergebnisse zusammenfassen. */
const aiLang = () => I18N.lang.split('-')[0];
const AI_BROWSER_LANGS = ['de', 'en', 'es', 'ja', 'fr', 'it', 'pt', 'nl', 'pl'];   // Sprachen der Browser-KI
const aiBLang = () => AI_BROWSER_LANGS.includes(aiLang()) ? aiLang() : 'en';
/* ---------- KI-Assistent – Einstellung unter „… Mehr → KI-Assistent …“. Oberstes Ziel: alles bleibt auf dem Rechner des Kunden (KONZEPT.md, Abschnitt 4).
   KI des Browsers (Voreinstellung) oder – auf eigenen Wunsch – eine lokale KI auf demselben PC (Ollama, LM Studio; OpenAI-kompatible
   Schnittstelle unter localhost). Andere Adressen werden abgelehnt, die CSP erlaubt nur den eigenen Rechner. Aus: Zusammenfassen und
   Übersetzen erscheinen nicht im Menü. */
const aiMode = () => LS.get('aiMode', 'browser');
function aiApply() { for (const id of ['#btnSummary', '#btnTranslate']) { const b = $(id); if (b) b.hidden = aiMode() === 'off'; } }
window.aiApply = aiApply;
const AI_STATE = {
  available: 'Bereit – die KI des Browsers läuft auf diesem Gerät.',
  downloadable: 'Noch nicht eingerichtet: „KI des Browsers einrichten“ lädt das KI-Modell einmalig über den Browser (einige GB, je nach Gerät).',
  downloading: 'Das KI-Modell wird gerade geladen …',
  unavailable: 'Auf diesem Gerät nicht verfügbar – zu wenig Arbeitsspeicher oder Grafikleistung.',
};
async function aiStatus() {
  const el = $('#aiState'), btn = $('#aiSetup');
  if (!('Summarizer' in self) && !('LanguageModel' in self)) {
    el.textContent = 'Dieser Browser bringt keine KI mit. Sie steht in Google Chrome ab Version 138 am Computer zur Verfügung (mindestens 16 GB Arbeitsspeicher oder eine Grafikkarte mit 4 GB).' + ('Translator' in self ? ' Übersetzen ist verfügbar.' : '');
    btn.hidden = true; return;
  }
  let av = 'unavailable';
  try {
    const lang = aiBLang();
    const a = 'Summarizer' in self ? await Summarizer.availability({ type: 'key-points', format: 'plain-text', length: 'medium', expectedInputLanguages: [lang], outputLanguage: lang }) : 'unavailable';
    const b = 'LanguageModel' in self ? await LanguageModel.availability({ expectedOutputs: [{ type: 'text', languages: [lang] }] }) : 'unavailable';
    const rank = { available: 3, downloading: 2, downloadable: 1, unavailable: 0 };
    av = rank[a] >= rank[b] ? a : b;
  } catch (e) { console.warn('KI-Zustand', e); }
  el.textContent = (AI_STATE[av] || AI_STATE.unavailable) + ('Translator' in self ? ' Übersetzen ist verfügbar.' : '');
  btn.hidden = !(av === 'downloadable' || av === 'downloading');
}
/* ---------- Lokale KI auf diesem PC ---------- */
const LOCAL_APPS = { ollama: 'http://localhost:11434', lmstudio: 'http://localhost:1234' };
const localCfg = () => ({ app: 'ollama', url: LOCAL_APPS.ollama, model: '', ...(LS.get('aiLocal', null) || {}) });
// nur der eigene Rechner – nie ein Server im Netz oder im Internet
function localUrl(u) {
  try { const x = new URL(String(u || '').trim()); if (!/^https?:$/.test(x.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)) return null; return x.origin; } catch { return null; }
}
const localHow = app => app === 'lmstudio'
  ? 'In LM Studio unter „Developer“ den lokalen Server starten und in dessen Einstellungen „Enable CORS“ einschalten. Ein Modell laden – fertig.'
  : app === 'ollama'
    ? `Ollama einmalig für PDFMy freigeben (ohne Konsole): In Windows „Umgebungsvariablen für dieses Konto bearbeiten“ öffnen, eine neue Variable OLLAMA_ORIGINS mit dem Wert ${location.origin} anlegen und Ollama neu starten. Ein Modell, z. B. „llama3.2“ oder „qwen3“, in der Ollama-App laden.`
    : 'Das Programm muss eine OpenAI-kompatible Schnittstelle auf diesem PC anbieten und Anfragen von PDFMy zulassen (CORS).';
async function localModels(url) {
  const r = await fetch(url + '/v1/models', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Die lokale KI antwortet mit Fehler ${r.status}.`);
  return ((await r.json()).data || []).map(m => m.id).filter(Boolean);
}
const localNetErr = e => e instanceof TypeError ? 'Keine Verbindung zur lokalen KI – läuft das Programm, und ist PDFMy dort freigegeben (siehe Hinweis darunter)?' : (e.message || String(e));
// Eine Anfrage an die lokale KI (OpenAI-kompatibel, gestreamt): Antwort fortlaufend über onText
async function localChat({ system, prompt, onText }) {
  const c = localCfg(), url = localUrl(c.url);
  if (!url) throw new Error('Die lokale KI ist nicht eingerichtet – bitte unter „… Mehr → KI-Assistent“ wählen.');
  if (!c.model) throw new Error('Kein Modell gewählt – bitte unter „… Mehr → KI-Assistent“ „Verbindung prüfen“ und ein Modell wählen.');
  let r;
  try { r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: c.model, stream: true, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }) }); }
  catch (e) { throw new Error(localNetErr(e)); }
  if (!r.ok) throw new Error(`Die lokale KI meldet einen Fehler (${r.status})${r.status === 404 ? ' – ist das Modell geladen?' : ''}.`);
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '';
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if (d === '[DONE]') continue;
      try { const j = JSON.parse(d), t = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? ''; if (t) { text += t; onText?.(text); } } catch {}
    }
  }
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();   // Denkmodelle (z. B. qwen3): Gedankengang nicht anzeigen
}
const localNote = () => `\n\n— Maschinell erstellt mit ${localCfg().model} auf diesem PC: bitte mit dem Dokument abgleichen.`;
const localSys = () => `Du bist der KI-Assistent von PDFMy. Arbeite ausschließlich mit dem Dokument, das du bekommst. Antworte in der Sprache „${aiLang()}“, sachlich und ohne Einleitung. Steht etwas nicht im Dokument, sage das. Erfinde nichts. Beträge, Daten, Fristen und Namen genau wie im Dokument.`;
async function localFill(sel, url, keep) {
  $('#aiLocalState').textContent = 'Verbinde …';
  try {
    const ms = await localModels(url);
    sel.replaceChildren(...ms.map(m => { const o = new Option(m, m); o.setAttribute('translate', 'no'); return o; }));
    if (keep && ms.includes(keep)) sel.value = keep;
    $('#aiLocalState').textContent = ms.length ? `✓ Verbunden – ${ms.length === 1 ? '1 Modell' : ms.length + ' Modelle'} verfügbar.` : 'Verbunden, aber es ist noch kein Modell geladen – bitte im KI-Programm ein Modell laden.';
    return ms.length > 0;
  } catch (e) { console.warn(e); $('#aiLocalState').textContent = localNetErr(e); return false; }
}
$('#aiLocalApp').addEventListener('change', e => { if (LOCAL_APPS[e.target.value]) $('#aiLocalUrl').value = LOCAL_APPS[e.target.value]; $('#aiLocalHow').textContent = localHow(e.target.value); $('#aiLocalModel').replaceChildren(); $('#aiLocalState').textContent = ''; });
$('#aiLocalTest').onclick = () => { const u = localUrl($('#aiLocalUrl').value); if (!u) { $('#aiLocalState').textContent = 'Nur Adressen auf diesem PC sind erlaubt (localhost oder 127.0.0.1) – Ihre Dokumente sollen den Rechner nicht verlassen.'; return; } localFill($('#aiLocalModel'), u, localCfg().model); };
function openAi() {
  closeMenu?.();
  const d = $('#aiDlg'), m = ['off', 'local'].includes(aiMode()) ? aiMode() : 'browser';
  const c = localCfg(); $('#aiLocalApp').value = c.app; $('#aiLocalUrl').value = c.url; $('#aiLocalHow').textContent = localHow(c.app);
  $('#aiLocalModel').replaceChildren(...(c.model ? [new Option(c.model, c.model)] : [])); $('#aiLocalState').textContent = '';
  d.querySelector(`[name=aiMode][value="${m}"]`).checked = true;
  aiSync(); if (!d.open) d.showModal();
}
window.openAi = openAi;
function aiSync() {
  const m = $('#aiDlg').querySelector('[name=aiMode]:checked')?.value || 'browser';
  $('#aiBrowserSet').hidden = m !== 'browser'; $('#aiLocalSet').hidden = m !== 'local';
  if (m === 'browser') aiStatus();
  if (m === 'local' && !$('#aiLocalModel').options.length) { const u = localUrl($('#aiLocalUrl').value); if (u) localFill($('#aiLocalModel'), u, localCfg().model); }
}
$('#aiDlg').addEventListener('change', e => { if (e.target.name === 'aiMode') aiSync(); });
$('#btnAi').onclick = () => openAi();
$('#aiClose').onclick = () => $('#aiDlg').close();

/* ---------- Datenschutz selbst prüfen: welche Verbindungen dieses Fenster aufgebaut hat und ob Daten gesendet wurden.
   Abrufe liefert die Resource-Timing-Liste des Browsers; gesendete Daten zählt ein Mitschnitt von fetch und XMLHttpRequest. */
const netSent = [];   // { host, local, bytes }
(() => {
  const size = b => b == null ? 0 : typeof b === 'string' ? new Blob([b]).size : b.byteLength ?? b.size ?? 0;
  const note = (url, method, body) => {
    try {
      const u = new URL(url, location.href), m = String(method || 'GET').toUpperCase();
      if (!/^https?:$/.test(u.protocol) || (m === 'GET' && body == null)) return;
      netSent.push({ host: u.host, local: netLocal(u.hostname), same: u.origin === location.origin, bytes: size(body) });
    } catch {}
  };
  const f = window.fetch; window.fetch = function (input, init) { note(input?.url || input, init?.method || input?.method, init?.body); return f.apply(this, arguments); };
  const o = XMLHttpRequest.prototype.open, s = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.netReq = [u, m]; return o.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) { if (this.netReq) note(this.netReq[0], this.netReq[1], b); return s.apply(this, arguments); };
})();
function netLocal(h) { return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(h); }
function netBytes(n) { return n < 1024 ? n + ' Byte' : n < 1048576 ? (n / 1024).toFixed(1).replace('.', ',') + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
function netShow() {
  const T = (k, ...v) => String(I18N.t(k)).replace(/\{(\d+)\}/g, (all, n) => v[n] != null ? v[n] : all);
  $('#netOnline').textContent = navigator.onLine ? T('● Mit dem Internet verbunden.') : T('● Offline – PDFMy arbeitet trotzdem weiter.');
  const hosts = new Map();
  for (const e of [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]) {
    let u; try { u = new URL(e.name); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    hosts.set(u.host, (hosts.get(u.host) || 0) + 1);
  }
  const away = netSent.filter(x => !x.local).reduce((a, x) => a + x.bytes, 0), here = netSent.filter(x => x.local).reduce((a, x) => a + x.bytes, 0);
  $('#netSent').textContent = T('Ins Internet gesendete Daten: {0}', netBytes(away)) + (here ? ' · ' + T('an Programme auf diesem PC: {0}', netBytes(here)) : '');
  const list = $('#netList'); list.textContent = '';
  for (const [h, n] of hosts) {
    const li = document.createElement('li'), local = netLocal(h.replace(/:\d+$/, ''));
    li.textContent = h === location.host ? T('{0} · {1}× geladen – Programmteile, Schriften, Sprachdateien', h, n)
      : local ? T('{0} · {1}× – Programm auf diesem PC (pdfmy Scan oder lokale KI)', h, n) : T('{0} · {1}×', h, n);
    list.append(li);
  }
  for (const x of netSent.filter(x => !x.local && !hosts.has(x.host))) { const li = document.createElement('li'); li.textContent = T('{0} · Daten gesendet', x.host); list.append(li); }
}
const netOpen = () => { closeMenu?.(); netShow(); $('#netDlg').showModal(); netVerify(); };
$('#btnNet').onclick = netOpen; if ($('#trustNet')) $('#trustNet').onclick = netOpen;
$('#netRefresh').onclick = netShow;

/* Programmstand prüfen: die laufenden Programmdateien mit der Prüfsummenliste des Releases vergleichen (pruefsummen.json,
   nur auf pdfmy.de). Der Fingerabdruck der Liste steht im Release-Protokoll auf GitHub – unabhängig von pdfmy.de. */
const RELEASES_URL = 'https://github.com/haus-it/pdfmy/blob/main/docs/RELEASES.md';
async function netVerify() {
  const box = $('#netVer'), T = (k, ...v) => String(I18N.t(k)).replace(/\{(\d+)\}/g, (all, n) => v[n] != null ? v[n] : all);
  let list, txt;
  try {
    const [j, t] = await Promise.all([fetch('pruefsummen.json', { cache: 'no-store' }), fetch('pruefsummen.txt', { cache: 'no-store' })]);
    if (!j.ok || !t.ok) return void (box.hidden = true);
    list = await j.json(); txt = await t.text();
  } catch { return void (box.hidden = true); }
  const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
  const finger = await hex(new TextEncoder().encode(txt));
  const base = new URL('.', location.href).href, files = [...new Set([...document.scripts].map(s => s.src).filter(u => u.startsWith(base)).map(u => u.slice(base.length).split(/[?#]/)[0]))];
  const bad = [];
  for (const f of files) {
    try { const r = await fetch(f); if (!list.dateien[f] || await hex(await r.arrayBuffer()) !== list.dateien[f]) bad.push(f); } catch { bad.push(f); }
  }
  const ok = finger === list.fingerabdruck && !bad.length;
  box.innerHTML = '';
  const p = (cls, text) => { const e = document.createElement('p'); e.style.margin = '0 0 4px'; if (cls) e.style.fontWeight = '600'; e.textContent = text; box.append(e); return e; };
  p(true, ok ? T('✓ Programmstand geprüft: {0} von {0} geladenen Programmdateien stimmen mit der veröffentlichten Prüfsummenliste überein.', files.length)
    : T('⚠ {0} Programmdatei(en) weichen von der Prüfsummenliste ab: {1}. Nach einem Update bitte die Seite neu laden und erneut prüfen.', bad.length || 1, bad.join(', ') || 'pruefsummen.txt'));
  const f = p(false, T('Stand {0} · Fingerabdruck', list.stand) + ' '); const c = document.createElement('code'); c.translate = false; c.textContent = finger.slice(0, 16); f.append(c);
  const l = p(false, ''), a = document.createElement('a'); a.href = RELEASES_URL; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = T('Mit dem Release-Protokoll auf GitHub vergleichen'); l.append(a, ' ' + T('(dort steht derselbe Fingerabdruck, unabhängig von pdfmy.de).'));
  box.hidden = false;
}
addEventListener('online', () => $('#netDlg').open && netShow());
addEventListener('offline', () => $('#netDlg').open && netShow());
$('#aiForm').addEventListener('submit', e => {
  e.preventDefault();
  const m = $('#aiDlg').querySelector('[name=aiMode]:checked').value;
  if (m === 'local') {
    const u = localUrl($('#aiLocalUrl').value), model = $('#aiLocalModel').value;
    if (!u) { $('#aiLocalState').textContent = 'Nur Adressen auf diesem PC sind erlaubt (localhost oder 127.0.0.1) – Ihre Dokumente sollen den Rechner nicht verlassen.'; $('#aiLocalUrl').focus(); return; }
    if (!model) { $('#aiLocalState').textContent = 'Bitte zuerst „Verbindung prüfen“ und ein Modell wählen.'; return; }
    LS.set('aiLocal', { app: $('#aiLocalApp').value, url: u, model });
  }
  LS.set('aiMode', m); $('#aiDlg').close(); aiApply();
  toast(m === 'off' ? 'KI-Assistent ausgeschaltet.' : m === 'local' ? `KI-Assistent: lokale KI auf diesem PC (${localCfg().model}).` : 'KI-Assistent: KI des Browsers auf diesem Gerät.');
});
$('#aiSetup').onclick = async () => {
  const el = $('#aiState'), btn = $('#aiSetup'), lang = aiBLang();
  btn.disabled = true;
  const mon = what => m => m.addEventListener('downloadprogress', ev => { el.textContent = `${what} wird geladen … ${Math.round(ev.loaded * 100)} % (einmalig, vom Browser)`; });
  try {
    if ('Summarizer' in self) (await Summarizer.create({ type: 'key-points', format: 'plain-text', length: 'medium', expectedInputLanguages: [lang], outputLanguage: lang, monitor: mon('KI-Modell') })).destroy?.();
    if ('LanguageModel' in self) (await LanguageModel.create({ expectedOutputs: [{ type: 'text', languages: [lang] }], monitor: mon('KI-Modell für Fragen') })).destroy?.();
    toast('Die KI des Browsers ist eingerichtet.');
  } catch (e) { console.warn(e); el.textContent = 'Einrichten nicht möglich: ' + (e.message || e); btn.disabled = false; return; }
  btn.disabled = false; aiStatus();
};

aiApply();
let aiText = '', aiBusy = false;
async function aiDocText() {
  const pages = docPages(); await waitForOcr(pages);
  return pages.map(p => pageText(p).trim()).filter(Boolean).join('\n\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
}
// Text in Abschnitte von höchstens n Zeichen – an Absatz-, Zeilen- oder Satzgrenzen; nichts geht verloren
const aiChunks = (t, n) => {
  const out = []; let cur = '';
  const pieces = t.split(/\n\n/).flatMap(p => { if (p.length <= n) return [p]; const r = []; let s = ''; for (const part of p.split(/(?<=[.!?\n])\s+/)) { if ((s + ' ' + part).length > n && s) { r.push(s); s = ''; } s = s ? s + ' ' + part : part; while (s.length > n) { r.push(s.slice(0, n)); s = s.slice(n); } } if (s) r.push(s); return r; });
  for (const p of pieces) { if ((cur + '\n\n' + p).length > n && cur) { out.push(cur); cur = ''; } cur = cur ? cur + '\n\n' + p : p; }
  if (cur) out.push(cur); return out;
};
const aiOut = (txt, busy) => { $('#sumOut').textContent = txt; $('#sumCopy').hidden = busy || !txt; };
const aiProgress = m => (ev => { aiOut(`KI-Modell wird geladen … ${Math.round(ev.loaded * 100)} % (einmalig, vom Browser)`, true); });
function openSummary() {
  if (!state.pages.length) return;
  if (aiMode() === 'off') return openAi();
  $('#sumHint').textContent = aiMode() === 'local' ? `Mit der lokalen KI auf diesem PC (${localCfg().model}) – das Dokument verlässt den Rechner nicht.` : 'Mit der eingebauten KI des Browsers – sie läuft auf diesem Gerät, das Dokument wird nicht hochgeladen. Beim ersten Mal lädt der Browser das KI-Modell (einmalig, mehrere GB).';
  if (aiMode() === 'local') { aiText = ''; aiOut('', false); $('#sumAsk').disabled = $('#sumQ').disabled = false; $('#sumDlg').showModal(); return; }
  if (!('Summarizer' in self) && !('LanguageModel' in self)) {
    alert('Zusammenfassen ohne Upload nutzt die eingebaute KI des Browsers. Sie steht in Google Chrome ab Version 138 am Computer zur Verfügung (Windows, macOS, Linux; mindestens 16 GB Arbeitsspeicher oder eine Grafikkarte mit 4 GB). Ihr Dokument wird dabei nicht hochgeladen.');
    return;
  }
  aiText = ''; aiOut('', false); $('#sumAsk').disabled = !('LanguageModel' in self); $('#sumQ').disabled = !('LanguageModel' in self);
  $('#sumDlg').showModal();
}
$('#sumClose').onclick = () => $('#sumDlg').close();
$('#sumCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#sumOut').textContent); toast('In die Zwischenablage kopiert.'); } catch { toast('Kopieren nicht möglich.'); } };
$('#sumGo').onclick = async () => {
  if (aiBusy) return; aiBusy = true; $('#sumGo').disabled = true; aiOut('Wird zusammengefasst …', true);
  let sm;
  if (aiMode() === 'local') {   // lokale KI: lange Dokumente abschnittsweise, dann die Teilergebnisse zusammenfassen
    try {
      aiText ||= await aiDocText(); if (!aiText.trim()) throw new Error('Das Dokument enthält keinen lesbaren Text.');
      const how = { 'key-points': 'die wichtigsten Kernpunkte als Liste mit „• “', tldr: 'eine Kurzfassung in wenigen Sätzen', teaser: 'in zwei, drei Sätzen, worum es geht und was zu tun ist', headline: 'eine einzige treffende Überschrift' }[$('#sumType').value];
      const len = { short: 'Sehr knapp.', medium: 'Mittlere Länge.', long: 'Ausführlich, aber ohne Wiederholungen.' }[$('#sumLen').value] || '';
      const parts = aiChunks(aiText, 6000); let res;
      if (parts.length === 1) res = await localChat({ system: localSys(), prompt: `Dokument:\n"""\n${parts[0]}\n"""\n\nFasse das Dokument zusammen: ${how}. ${len}`, onText: t => aiOut(t, true) });
      else {
        const sums = [];
        for (const [i, p] of parts.entries()) { aiOut(`Fasse Abschnitt ${i + 1} von ${parts.length} zusammen …`, true); sums.push(await localChat({ system: localSys(), prompt: `Abschnitt eines Dokuments:\n"""\n${p}\n"""\n\nFasse diesen Abschnitt knapp zusammen.` })); }
        res = await localChat({ system: localSys(), prompt: `Zusammenfassungen der Abschnitte eines Dokuments:\n"""\n${sums.join('\n\n')}\n"""\n\nFasse das ganze Dokument zusammen: ${how}. ${len}`, onText: t => aiOut(t, true) });
      }
      aiOut(res + localNote(), false);
    } catch (e) { console.error(e); aiOut('Zusammenfassen nicht möglich: ' + e.message, false); }
    finally { aiBusy = false; $('#sumGo').disabled = false; }
    return;
  }
  try {
    if (!('Summarizer' in self)) throw new Error('Diese Chrome-Version kann noch nicht zusammenfassen.');
    const opts = { type: $('#sumType').value, length: $('#sumLen').value, format: 'plain-text', outputLanguage: aiBLang(), expectedInputLanguages: [docLang(state.pages).split('-')[0]], sharedContext: 'Ein Brief oder Dokument (z. B. Rechnung, Bescheid, Vertrag) für ein Büro.' };
    if (await Summarizer.availability(opts) === 'unavailable') throw new Error('Die eingebaute KI ist auf diesem Gerät nicht verfügbar (zu wenig Arbeitsspeicher oder Grafikleistung).');
    sm = await Summarizer.create({ ...opts, monitor(m) { m.addEventListener('downloadprogress', aiProgress()); } });   // Klick zählt als Bestätigung für das Herunterladen
    aiOut('Text wird gelesen …', true);
    aiText ||= await aiDocText();
    if (!aiText.trim()) throw new Error('Das Dokument enthält keinen lesbaren Text.');
    const size = Math.max(2000, Math.min(12000, (sm.inputQuota || 6000) * 2.5));   // grob 2,5 Zeichen je Token
    const parts = aiChunks(aiText, size);
    let res;
    if (parts.length === 1) res = await sm.summarize(parts[0]);
    else {
      const sums = [];
      for (const [i, p] of parts.entries()) { aiOut(`Fasse Abschnitt ${i + 1} von ${parts.length} zusammen …`, true); sums.push(await sm.summarize(p)); }
      res = await sm.summarize(sums.join('\n\n'));
    }
    aiOut(res.trim() + '\n\n— Maschinell erstellt (KI auf diesem Gerät): bitte mit dem Dokument abgleichen.', false);
  } catch (e) { console.error(e); aiOut('Zusammenfassen nicht möglich: ' + e.message, false); }
  finally { sm?.destroy?.(); aiBusy = false; $('#sumGo').disabled = false; }
};
$('#sumForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#sumQ').value.trim(); if (!q || aiBusy) return;
  aiBusy = true; $('#sumAsk').disabled = true; aiOut('Denke nach …', true);
  let lm;
  if (aiMode() === 'local') {
    try {
      aiText ||= await aiDocText(); if (!aiText.trim()) throw new Error('Das Dokument enthält keinen lesbaren Text.');
      const room = 24000, doc = aiText.length > room ? aiText.slice(0, room) + '\n[… gekürzt]' : aiText;
      const a = await localChat({ system: localSys(), prompt: `Dokument:\n"""\n${doc}\n"""\n\nFrage: ${q}`, onText: t => aiOut(t, true) });
      aiOut(a + (aiText.length > room ? '\n\n(Das Dokument war zu lang – nur der Anfang wurde berücksichtigt.)' : '') + localNote(), false);
    } catch (err) { console.error(err); aiOut('Antwort nicht möglich: ' + err.message, false); }
    finally { aiBusy = false; $('#sumAsk').disabled = false; }
    return;
  }
  try {
    const lang = aiBLang();
    if (await LanguageModel.availability({ expectedOutputs: [{ type: 'text', languages: [lang] }] }) === 'unavailable') throw new Error('Die eingebaute KI ist auf diesem Gerät nicht verfügbar.');
    aiOut('Text wird gelesen …', true);
    aiText ||= await aiDocText();
    if (!aiText.trim()) throw new Error('Das Dokument enthält keinen lesbaren Text.');
    lm = await LanguageModel.create({ expectedOutputs: [{ type: 'text', languages: [lang] }], monitor(m) { m.addEventListener('downloadprogress', aiProgress()); },
      initialPrompts: [{ role: 'system', content: `Du beantwortest Fragen ausschließlich anhand des folgenden Dokuments. Antworte kurz und sachlich in der Sprache „${lang}“. Steht die Antwort nicht im Dokument, sage das. Erfinde nichts.` }] });
    const room = Math.max(1500, ((lm.inputQuota || 6000) - 600) * 2.5), doc = aiText.length > room ? aiText.slice(0, room) + '\n[… gekürzt]' : aiText;
    aiOut('Denke nach …', true);
    const a = await lm.prompt(`Dokument:\n"""\n${doc}\n"""\n\nFrage: ${q}`);
    aiOut(a.trim() + (aiText.length > room ? '\n\n(Das Dokument war zu lang – nur der Anfang wurde berücksichtigt.)' : '') + '\n\n— Maschinell erstellt (KI auf diesem Gerät): bitte mit dem Dokument abgleichen.', false);
  } catch (err) { console.error(err); aiOut('Antwort nicht möglich: ' + err.message, false); }
  finally { lm?.destroy?.(); aiBusy = false; $('#sumAsk').disabled = false; }
});
$('#btnSummary').onclick = () => { closeMenu(); openSummary(); };


/* ---------- Befehlssuche (Strg+K): jede Funktion per Tastatur finden – Kacheln, Werkzeuge, Menü, Kopfzeile ---------- */
const CMD_SYNONYMS = { scan: 'scanner einlesen', merge: 'kombinieren verbinden', compress: 'komprimieren kleiner', redact: 'anonymisieren dsgvo',
  protect: 'verschlüsseln sperren', btnTranslate: 'übersetzen sprache englisch translate', btnPdfaCheck: 'archiv validieren konform langzeit iso 19005 veraPDF', btnSummary: 'ki zusammenfassung zusammenfassen frage chat kernpunkte ai', docx: 'word umwandeln konvertieren', compare: 'unterschiede diff', batch: 'mehrere dateien automatisch',
  bates: 'nummerieren akte', btnCam: 'foto handy smartphone kamera abfotografieren', tileCam: 'foto handy smartphone kamera abfotografieren', btnTax: 'datev buchhaltung steuer belege monat export', tileTax: 'datev buchhaltung steuer belege monat export', pdfa: 'archiv revisionssicher', btnJournal: 'fristen post liste', btnSettings: 'optionen kürzel', btnFile: 'ablage archivieren' };
function commands() {
  const out = [], seen = new Set();
  const add = (el, label, group) => {
    label = (label || '').replace(/\s+/g, ' ').trim();
    if (!label || el.id === 'btnCmd' || seen.has(label) || el.disabled || el.closest('[hidden]') || el.hidden) return;
    seen.add(label);
    const key = el.dataset.intent || el.id || el.dataset.tool || '';
    out.push({ label, group, el, hay: (label + ' ' + (el.title || '') + ' ' + (CMD_SYNONYMS[key] || '')).toLowerCase() });
  };
  const hasDoc = state.pages.length > 0;
  document.querySelectorAll('.actions > button, .actions > label.btn').forEach(b => add(b, b.querySelector('.lbl')?.textContent || b.textContent, 'Allgemein'));
  document.querySelectorAll('.menu-list .mi').forEach(b => { if (hasDoc || !b.classList.contains('doc')) add(b, b.querySelector('span')?.textContent || b.textContent, 'Menü'); });
  if (hasDoc) document.querySelectorAll('[data-tool]').forEach(b => add(b, 'Werkzeug: ' + b.textContent, 'Bearbeiten'));
  if (hasDoc) ['#btnGrid', '#reOcr', '#rotL', '#rotR', '#undo', '#redo', '#btnCrop', '#rdAuto'].forEach(s => { const b = $(s); if (b) add(b, b.querySelector('.lbl,span')?.textContent || b.title.split('(')[0], 'Seite'); });
  document.querySelectorAll('.tile').forEach(b => add(b, b.querySelector('b').textContent, 'Aufgaben'));
  return out;
}
let cmdList = [], cmdSel = 0;
function renderCmds() {
  const q = $('#cmdQ').value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
  const all = commands();
  cmdList = words.length ? all.filter(c => words.every(w => c.hay.includes(w))).sort((a, b) => (b.label.toLowerCase().startsWith(words[0]) - a.label.toLowerCase().startsWith(words[0]))) : all;
  cmdSel = Math.min(cmdSel, Math.max(0, cmdList.length - 1));
  $('#cmdOut').innerHTML = cmdList.slice(0, 40).map((c, i) => `<button type="button" tabindex="-1" role="option" id="cmd-${i}" aria-selected="${i === cmdSel}" class="cmd${i === cmdSel ? ' on' : ''}" data-i="${i}">${c.el.querySelector('.ic')?.outerHTML || ''}<span>${esc(c.label)}</span><small>${c.group}</small></button>`).join('')
    || '<p class="hint" role="option" aria-disabled="true" aria-selected="false" style="padding:10px 12px">Nichts gefunden.</p>';
  $('#cmdOut .cmd.on')?.scrollIntoView({ block: 'nearest' });
  if (cmdList.length) $('#cmdQ').setAttribute('aria-activedescendant', 'cmd-' + cmdSel); else $('#cmdQ').removeAttribute('aria-activedescendant');
}
function runCmd(c) { if (!c) return; $('#cmdDlg').close(); setTimeout(() => c.el.click(), 30); }
function openCmd() { if ($('#cmdDlg').open) return; document.querySelectorAll('dialog[open]').forEach(d => d.close()); closeMenu(); $('#cmdQ').value = ''; cmdSel = 0; renderCmds(); $('#cmdDlg').showModal(); $('#cmdQ').focus(); }
$('#cmdQ').addEventListener('input', () => { cmdSel = 0; renderCmds(); });
$('#cmdQ').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = Math.min(cmdSel + 1, cmdList.length - 1); renderCmds(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = Math.max(cmdSel - 1, 0); renderCmds(); }
  else if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdList[cmdSel]); }
});
$('#cmdOut').addEventListener('click', e => { const b = e.target.closest('.cmd'); if (b) runCmd(cmdList[+b.dataset.i]); });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); } });
$('#btnCmd').onclick = openCmd;

/* ---------- Export für den Steuerberater: Belege eines Monats als ZIP mit Belegliste (CSV) und DATEV-Importdatei ---------- */
const ymPrev = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthName = ym => new Date(ym + '-15T12:00').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });   // für Steuerberater (DATEV, E-Mail)
const monthNameUi = ym => I18N.fmtDate(new Date(ym + '-15T12:00'), { month: 'long', year: 'numeric' });
let taxAll = [];
async function openTax() {
  taxAll = await journalAll();
  closeMenu(); if ($('#jDlg').open) $('#jDlg').close();
  $('#taxMonth').value = $('#taxMonth').value || ymPrev();
  $('#taxMail').value = LS.get('taxMail', '');
  $('#taxDatev').checked = LS.get('taxDatev', true);
  renderTax(true);
  $('#taxDlg').showModal();
}
function taxTypes() { return [...document.querySelectorAll('#taxTypes input:checked')].map(i => i.value); }
function renderTax(resetTypes) {
  const month = $('#taxMonth').value || ymPrev(), inMonth = Journal.taxSelect(taxAll, month);
  const counts = {}; inMonth.forEach(e => { const t = e.type || 'Brief'; counts[t] = (counts[t] || 0) + 1; });
  const keep = resetTypes ? null : new Set(taxTypes());
  $('#taxTypes').innerHTML = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map(t =>
    `<label><input type="checkbox" value="${esc(t)}" ${(keep ? keep.has(t) : Journal.TAX_TYPES.includes(t)) ? 'checked' : ''}><span>${esc(t)} (${counts[t]})</span></label>`).join('')
    || '<span class="hint">Keine abgelegten Belege in diesem Monat.</span>';
  const sel = Journal.taxSelect(taxAll, month, taxTypes());
  const sums = {}; sel.forEach(e => { const a = Journal.splitAmount(e.amount); if (a.value) sums[a.cur] = (sums[a.cur] || 0) + +a.value.replace(',', '.'); });
  $('#taxSum').textContent = sel.length ? `${sel.length} Beleg(e) aus ${monthNameUi(month)}` + (Object.keys(sums).length ? ' · Summe ' + Object.entries(sums).map(([c, v]) => I18N.fmtMoney(v, c)).join(' + ') : '') : 'Keine Belege ausgewählt.';
  $('#taxGo').disabled = !sel.length || !state.outDir;
  $('#taxErr').innerHTML = state.outDir ? '' : 'Die Belege liegen im Ablageordner. <button type="button" class="linkbtn" id="taxConnect">Ablageordner jetzt verbinden</button>';
  $('#taxConnect')?.addEventListener('click', async () => { await $('#btnOut').onclick(); for (let k = 0; !state.outDir && k < 200; k++) await new Promise(r => setTimeout(r, 300)); taxAll = await journalAll(); renderTax(false); });
}
$('#taxMonth').addEventListener('input', () => renderTax(true));
$('#taxTypes').addEventListener('change', () => renderTax(false));
$('#taxCancel').onclick = () => $('#taxDlg').close();
async function readAblage(rel) {
  let dir = state.outDir; const parts = rel.split('\\'), name = parts.pop();
  for (const p of parts) dir = await dir.getDirectoryHandle(p);
  return new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer());
}
// ZIP zusammenstellen (ohne Speichern) – getrennt, damit es sich testen lässt
async function buildTaxZip(month, types, withDatev) {
  const sel = Journal.taxSelect(taxAll, month, types);
  const names = Journal.zipNames(sel.map(e => e.file)), files = [], rows = [], missing = [], docNames = [];
  for (const [i, e] of sel.entries()) {
    status(`Sammle Belege: ${i + 1} von ${sel.length} …`, i / sel.length);
    try {
      const pdf = await readAblage(e.file);
      files.push({ name: names[i], data: pdf }); rows.push({ e, zipName: names[i] });
      // E-Rechnung: Original-XML mitgeben (liegt neben dem PDF). Für DATEV jeden Beleg nur einmal melden:
      // ZUGFeRD-PDF (XML eingebettet) → das PDF; reine XRechnung → das XML (unser PDF ist nur die Lesefassung)
      let lead = names[i];
      try {
        const xn = names[i].replace(/\.pdf$/i, '.xml'); files.push({ name: xn, data: await readAblage(e.file.replace(/\.pdf$/i, '.xml')) });
        if (!new TextDecoder('latin1').decode(pdf).includes('/EmbeddedFile')) lead = xn;
      } catch {}
      docNames.push(lead);
    } catch { missing.push(e.file); rows.push({ e, zipName: '' }); }
  }
  const tag = month.replace('-', '_');
  files.push({ name: `Belegliste_${tag}.csv`, data: new TextEncoder().encode(Journal.taxCsv(rows)) });
  if (withDatev && docNames.length) files.push({ name: 'document.xml', data: new TextEncoder().encode(Journal.datevXml(docNames, { description: `Belege ${monthName(month)} – ${APP.name}`, system: APP.name })) });
  return { zip: Tools.zip(files), files, count: rows.length - missing.length, missing, tag };
}
$('#taxGo').onclick = async () => {
  const month = $('#taxMonth').value, mail = $('#taxMail').value.trim(), withDatev = $('#taxDatev').checked;
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { $('#taxErr').textContent = 'Die E-Mail-Adresse sieht nicht gültig aus.'; return; }
  LS.set('taxMail', mail); LS.set('taxDatev', withDatev);
  $('#taxGo').disabled = true;
  try {
    const r = await buildTaxZip(month, taxTypes(), withDatev);
    const where = await deliver(r.zip, `Belege_${r.tag}_Steuerberater.zip`, 'application/zip', null, true);
    if (!where) { status('Export abgebrochen.'); return; }
    $('#taxDlg').close();
    status(`Steuerberater-Export gespeichert: ${where} (${r.count} Beleg(e)` + (r.missing.length ? `, ${r.missing.length} Datei(en) nicht gefunden: ${r.missing.map(f => f.split('\\').pop()).join(', ')}` : '') + ').');
    if (mail) {
      const a = document.createElement('a');
      a.href = `mailto:${mail}?subject=${encodeURIComponent(`Belege ${monthName(month)}`)}&body=${encodeURIComponent(`Guten Tag,\n\nanbei die Belege für ${monthName(month)} (${r.count} Belege, Belegliste als CSV${withDatev ? ', DATEV-Importdatei document.xml' : ''}).\nBitte die Datei „Belege_${r.tag}_Steuerberater.zip“ anhängen.\n\nViele Grüße${S.author ? '\n' + S.author : ''}`)}`;
      a.click();
    }
  } catch (e) { console.error(e); status('Export fehlgeschlagen: ' + e.message); }
  finally { $('#taxGo').disabled = false; }
};
$('#btnTax').onclick = openTax;
$('#jTax').onclick = openTax;
$('#tileTax').onclick = openTax;


/* ---------- Mit Kamera scannen (js/camera.js): Live-Kantenerkennung, Auto-Auslöser, mehrere Seiten am Stück ---------- */
function addCameraPages(list) {
  const before = state.pages.length;
  list.forEach((c, i) => {
    // Kleine Aufnahmen (ältere Kameras, Webcam) hochskalieren – die Texterkennung braucht etwa 150–200 dpi
    const low = c.width < 1000;   // sehr kleines Bild (ältere Kamera/Webcam): später nicht in 1-Bit wandeln
    if (c.width < 1200) { const k = Imaging.canvas(1600, Math.round(c.height * 1600 / c.width)), x = k.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, k.width, k.height); c = k; }
    c.lowRes = low;
    addScan(c, `Kamera S. ${before + i + 1}`);   // bereits zugeschnitten → gerade richten und aufbereiten
  });
  state.dirty = true; if (state.sel < 0) state.sel = 0;
  refresh(); status(`${list.length} Seite(n) mit der Kamera aufgenommen.`);
  applyIntent();
  if (S.autoOcr) runOcrAll(); else analyze();
}
function openCamera() { closeMenu(); if ($('#scanDlg').open) $('#scanDlg').close(); Camera.open(addCameraPages, () => $('#camIn').click()); }
$('#btnCam').onclick = openCamera;
$('#tileCam').onclick = openCamera;
$('#homeCam').onclick = openCamera;
$('#scanPhone').onclick = openCamera;


/* ---------- Installierte Versionen immer sichtbar (Statuszeile unten): PDFMy-Stand und pdfmy Scan ---------- */
async function renderVerBar() {
  const v = (await versionLabel()).replace(/^Stand /, '').replace(/, (.+?) Uhr$/, ' $1');
  const running = await scanHelperRunning();
  let scan = '';
  if (running) scan = scanOutdated() ? ` · <span class="vs">pdfmy Scan ${esc(state.scanVersion)} <b>(Update ${scanLatest()})</b></span>` : ` · <span class="vs">pdfmy Scan ${esc(state.scanVersion)}</span>`;
  else if (!IS_MOBILE) scan = ' · <span class="vs">pdfmy Scan: nicht gestartet</span>';
  $('#verBar').innerHTML = `${esc(APP.name)} ${esc(v)}${scan}`;
  $('#verBar').title = `Installiert: ${APP.name} (${v || 'unbekannt'})` + (running ? `, pdfmy Scan ${state.scanVersion}` + (scanOutdated() ? ` – Version ${scanLatest()} ist verfügbar` : ' – aktuell') : IS_MOBILE ? '' : ', pdfmy Scan nicht gestartet') + '. Klicken: nach Updates suchen.';
  offerScanUpdate();
}
$('#verBar').onclick = async () => {
  await checkUpdates(true);
  if (state.scanVersion && scanOutdated()) openScanDialog();   // dort steht der Download des neuen pdfmy Scan
  renderVerBar();
};
setTimeout(renderVerBar, 1200);
setInterval(renderVerBar, 20 * 1000);          // pdfmy Scan gestartet/beendet/aktualisiert → Anzeige folgt
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderVerBar(); });


/* ---------- Problem melden: Fehlerbericht mit Protokoll per E-Mail an den Support ---------- */
const SUPPORT = APP.supportMail || 'wumertens@mentor-group.de';
let repBase = '';
async function buildReport(context) {
  const v = await versionLabel(true), running = await scanHelperRunning();
  let scanLog = '';
  if (running) { try { const l = await (await scanApi('/log', {}, 3000)).json(); scanLog = l.lines.slice(-60).join('\n'); } catch (e) { scanLog = 'Protokoll nicht abrufbar: ' + e.message; } }
  return [
    `Fehlerbericht ${APP.name} – ${new Date().toLocaleString('de-DE')}`,
    context ? `Anlass: ${context}` : '',
    '',
    `${APP.name}: ${v || 'unbekannt'} (${location.host || 'lokal'})`,
    `pdfmy Scan: ${running ? state.scanVersion + (scanOutdated() ? ` (veraltet, aktuell ${scanLatest()})` : ' (aktuell)') : IS_MOBILE ? 'Handy – nicht verwendet' : 'nicht gestartet'}`,
    `Browser: ${navigator.userAgent}`,
    `Bildschirm: ${screen.width}×${screen.height}, Kürzel: ${S.author || '–'}`,
    `Dokument: ${state.pages.length} Seite(n)${state.meta.type ? ', ' + state.meta.type : ''}`,
    '',
    '--- Letzte Meldungen von ' + APP.name + ' ---',
    ...appLog.slice(-30),
    '',
    '--- Protokoll pdfmy Scan ---',
    scanLog || '(keins)',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
let repKind = 'Fehlerbericht';
async function openReport(context) {
  closeMenu();
  repKind = /^Herausforderung/.test(context || '') ? 'Rückmeldung' : 'Fehlerbericht';
  document.querySelectorAll('dialog[open]').forEach(d => { if (d.id !== 'reportDlg') d.close(); });
  repBase = await buildReport(context);
  $('#repTo').textContent = SUPPORT; $('#repMask').checked = true; $('#repText').textContent = repShown(); $('#repWhat').value = '';
  $('#repOutlook').hidden = IS_MOBILE;
  $('#reportDlg').showModal(); $('#repWhat').focus();
}
// Datenschutz durch Voreinstellung (Art. 25 Abs. 2 DSGVO): Dateinamen, Absender, E-Mail-Adressen und Windows-Benutzernamen werden unkenntlich gemacht
const maskReport = t => {
  const names = [state.meta.sender].filter(s => s && s.length > 2);
  for (const n of names) t = t.split(n).join('[Absender]');
  return t.replace(/\b([A-Za-z]:\\(?:Users|Benutzer)\\)[^\\\s]+/gi, '$1[Benutzer]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, m => m === SUPPORT ? m : '[E-Mail]')
    .replace(/[^\s\\/„“"'()]+\.(pdf|jpe?g|png|tiff?|heic|eml|msg|xml|csv|xlsx|docx)\b/gi, (m, ext) => '[Datei].' + ext.toLowerCase())
    .replace(/„[^“\n]{2,80}“/g, '„…“');
};
const repShown = () => $('#repMask').checked ? maskReport(repBase) : repBase;
$('#repMask').onchange = () => { $('#repText').textContent = repShown(); };
const reportText = () => ($('#repWhat').value.trim() ? 'Beschreibung: ' + $('#repWhat').value.trim() + '\n\n' : '') + repShown();
const reportSubject = () => `${APP.name} ${repKind} – ${state.scanVersion ? 'pdfmy Scan ' + state.scanVersion + ' – ' : ''}${new Date().toLocaleDateString('de-DE')}`;
$('#repOutlook').onclick = async () => {
  const txt = reportText(), enc = new TextEncoder();
  const eml = Journal.emlDraft({ to: SUPPORT, subject: reportSubject(), body: txt.split('\n--- Letzte Meldungen')[0] + '\n\nDas vollständige Protokoll ist angehängt.\n\nViele Grüße' + (S.author ? '\n' + S.author : ''),
    attachments: [{ name: `Protokoll_${new Date().toISOString().slice(0, 16).replace(/\D/g, '')}.txt`, mime: 'text/plain', bytes: enc.encode(txt) }] });
  $('#reportDlg').close();
  if (await openEml(enc.encode(eml), 'Fehlerbericht_PDFMy.eml')) return status(`Fehlerbericht ist in Ihrem Mail-Programm geöffnet – bitte auf „Senden“ klicken (an ${SUPPORT}).`);
  status(`Fehlerbericht als E-Mail vorbereitet – die heruntergeladene Datei öffnen, in Outlook auf „Senden“ klicken (an ${SUPPORT}).`);
  toast('E-Mail vorbereitet: Datei „Fehlerbericht_PDFMy.eml“ öffnen und senden.', 8000);
};
$('#repMailto').onclick = async () => {
  const txt = reportText();
  try { await navigator.clipboard.writeText(txt); } catch {}
  // mailto-Links sind in der Länge begrenzt: Kopf (Versionen) + die NEUESTEN Protokollzeilen behalten, vollständig in der Zwischenablage
  let body = txt;
  if (txt.length > 1800) {
    const head = txt.split('\n--- Letzte Meldungen')[0].slice(0, 700);
    const tail = txt.slice(-(1750 - head.length));
    body = head + '\n…\n' + tail.slice(tail.indexOf('\n') + 1) + '\n\n(Vollständiges Protokoll: in der Zwischenablage – hier mit Strg+V einfügen.)';
  }
  const a = document.createElement('a'); a.href = `mailto:${SUPPORT}?subject=${encodeURIComponent(reportSubject())}&body=${encodeURIComponent(body)}`; a.click();
  $('#reportDlg').close();
  status('E-Mail-Programm geöffnet – das vollständige Protokoll liegt in der Zwischenablage (Strg+V).');
};
$('#repCancel').onclick = () => $('#reportDlg').close();
$('#btnReport').onclick = () => openReport('');
$('#fbReport').onclick = () => openReport('Herausforderung / Verbesserungsvorschlag');
$('#scanErrMail').onclick = () => openReport($('#scanErrDlg').classList.contains('logmode') ? 'Protokoll von pdfmy Scan' : 'Scannen: ' + $('#scanErrMsg').textContent);

/* ---------- Veraltete pdfmy-Scan-Version: gut sichtbar zur Aktualisierung anbieten ---------- */
function offerScanUpdate() {
  if (!state.scanVersion || !scanOutdated()) { $('#updBanner').hidden = true; return; }
  try { if (sessionStorage.getItem('mpdf.scanUpdLater') === scanLatest()) return; } catch {}
  $('#updBannerText').textContent = `pdfmy Scan ${scanLatest()} ist verfügbar – installiert ist ${state.scanVersion}.`;
  $('#updBannerGo').href = (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'download/' + (state.scanMac ? SCAN_FILE_UNIX() : SCAN_FILE);
  $('#updBanner').hidden = false;
}
$('#updBannerGo').addEventListener('click', () => {
  $('#updBanner').hidden = true;
  status(`pdfmy Scan ${scanLatest()} wird heruntergeladen – die Datei öffnen, das Update ersetzt die alte Version automatisch.`);
  toast(state.scanLinux ? 'Im Terminal starten: sh ~/Downloads/pdfmy-scan-linux.sh – das Update ersetzt die alte Version.' : state.scanMac ? 'ZIP öffnen und „pdfmy-Scan-Mac.command“ doppelklicken – das Update ersetzt die alte Version.' : 'Heruntergeladene Datei öffnen – pdfmy Scan aktualisiert sich selbst.', 9000);
});
$('#updBannerLater').onclick = () => { $('#updBanner').hidden = true; try { sessionStorage.setItem('mpdf.scanUpdLater', scanLatest()); } catch {} };


/* ---------- Datenschutz: alle lokal im Browser gespeicherten Daten löschen (ISO 27001 A.8.10, DSGVO Art. 17) ---------- */
$('#wipeLocal').onclick = async () => {
  if (!confirm('Alle in diesem Browser gespeicherten PDFMy-Daten löschen?\n\nEinstellungen, Posteingangsbuch (lokale Kopie), Volltext-Index, gelernte Absender-Regeln, Team-Adressen, eigene Anschrift, Briefbogen, Firmendaten der E-Rechnung, gemerkte Unterschrift, Signatur-Zertifikat, Liste „Zuletzt geöffnet“ und Ordner-Freigaben.\n\nDie Dateien in Ihrer Ablage (auch Posteingangsbuch.csv) bleiben erhalten.')) return;
  try { Object.keys(localStorage).filter(k => k.startsWith('mpdf.')).forEach(k => localStorage.removeItem(k)); } catch {}
  try { sessionStorage.clear(); } catch {}
  try { (await idb._db)?.close(); } catch {}
  try { await new Promise(res => { idb._db = null; const r = indexedDB.deleteDatabase('mpdf'); r.onsuccess = r.onerror = r.onblocked = res; }); } catch {}
  state.dirty = false;
  status('Alle lokal gespeicherten Daten wurden gelöscht.');
  setTimeout(() => location.reload(), 600);
};


/* ---------- Barrierefreiheit: Tastaturbedienung (WCAG 2.1.1) ---------- */
// Datei-Knöpfe (label mit verstecktem Dateifeld) mit Enter/Leertaste öffnen
document.querySelectorAll('label[role=button]').forEach(l => l.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); l.querySelector('input[type=file]')?.click(); }
}));
// Seitenansicht: Enter setzt das gewählte Werkzeug (Text, Notiz, Stempel, Unterschrift) in die Seitenmitte,
// Pfeiltasten verschieben das ausgewählte Element (mit Umschalt in größeren Schritten)
$('#viewer').addEventListener('keydown', e => {
  if (e.target !== $('#viewer') || !cur() || state.view !== 'page') return;
  const p = cur();
  if (e.key === 'Enter' && ['text', 'note', 'stamp', 'sign'].includes(state.tool)) {
    e.preventDefault();
    const r = $('#overlay').getBoundingClientRect();
    $('#overlay').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: r.left + r.width * 0.3, clientY: r.top + r.height * 0.4 }));
    dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    status('Element in die Seite gesetzt – mit den Pfeiltasten verschieben, Entf löscht.');
    return;
  }
  const a = p.annots.find(x => x.id === state.annSel);
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (a && d) {
    e.preventDefault(); pushUndo(p);
    const step = e.shiftKey ? 0.05 : 0.01;
    a.x = clamp(a.x + d[0] * step, 0, 1 - (a.w || 0)); a.y = clamp(a.y + d[1] * step, 0, 1 - (a.h || 0));
    state.dirty = true; renderAnns();
  } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && p.annots.length) {   // N: nächstes Element auswählen
    e.preventDefault();
    const i = p.annots.findIndex(x => x.id === state.annSel);
    state.annSel = p.annots[(i + 1) % p.annots.length].id; renderAnns();
  }
});


/* ---------- PDFs per Doppelklick im Explorer öffnen (über pdfmy Scan, Datei bleibt lokal) ---------- */
async function openFromHash() {
  const m = location.hash.match(/^#open=([a-f0-9]{16,64})$/); if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);   // Einmal-Kennwort aus der Adresszeile entfernen
  try {
    const r = await fetch(`${SCAN_API}/file/${m[1]}`, { headers: { 'X-Pdfmy': '1' }, cache: 'no-store' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Fehler ' + r.status);
    const name = decodeURIComponent(r.headers.get('X-Pdfmy-Name') || 'Dokument.pdf');
    if (state.pages.length) { if (state.dirty && !confirm(`„${name}“ öffnen? Das aktuelle Dokument wurde noch nicht gespeichert und wird geschlossen.`)) return; resetDoc(); }
    await importFiles([new File([await r.blob()], name, { type: 'application/pdf' })]);
    state.dirty = false;   // Original liegt unverändert auf dem Rechner
  } catch (e) { status('Die Datei konnte nicht geöffnet werden: ' + e.message); toast('Datei konnte nicht geöffnet werden – bitte noch einmal doppelt anklicken.', 6000); }
}
openFromHash(); addEventListener('hashchange', openFromHash);   // auch wenn PDFMy schon offen ist
/* ---------- Drucker „PDFMy“: in jedem Programm „Drucken“ → das Dokument öffnet sich in PDFMy. Windows: pdfmy Scan ab 1.10.0 legt
   je Benutzer einen Drucker mit dem eingebauten Treiber „Microsoft Print to PDF“ an (eine Windows-Bestätigung, nicht auf Terminalservern).
   Mac: pdfmy Scan für Mac ab 1.3.0 trägt „In PDFMy öffnen“ ins PDF-Menü des Druckdialogs ein. Die Druckdatei bleibt auf dem Rechner. */
$('#btnPrinter').onclick = async () => {
  closeMenu();
  const T = (k, ...v) => String(I18N.t(k)).replace(/\{(\d+)\}/g, (all, n) => v[n] != null ? v[n] : all);
  const dl = f => (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'download/' + f;
  if (IS_MOBILE) { toast(T('Auf dem Handy: in der App „Teilen“ → „PDFMy“ wählen (PDFMy muss als App installiert sein).'), 8000); return; }
  if (IS_LINUX) { alert(T('Unter Linux hat der Druckdialog „In Datei drucken“: als PDF speichern und die Datei in PDFMy öffnen. Ein eigener Drucker „PDFMy“ ist für Linux nicht vorgesehen.')); return; }
  const running = await scanHelperRunning();
  if (IS_MAC) {
    if (running && state.scanMac && !verLess(state.scanVersion, '1.3.0') && state.scanPrinter === 'on') { alert(T('So drucken Sie in PDFMy:\n\nIm Druckdialog eines beliebigen Programms unten links auf „PDF“ klicken und „In PDFMy öffnen“ wählen. Das Dokument öffnet sich sofort in PDFMy – es bleibt auf Ihrem Mac.')); return; }
    if (confirm(T('Dafür wird „pdfmy Scan für Mac“ ab Version 1.3.0 benötigt: Es trägt „In PDFMy öffnen“ ins PDF-Menü des Druckdialogs ein – ohne Administratorrechte.\n\nJetzt herunterladen (ZIP öffnen, „pdfmy-Scan-Mac.command“ doppelklicken)?'))) location.href = dl('pdfmy-Scan-Mac.zip');
    return;
  }
  if (!running || verLess(state.scanVersion, '1.10.0')) {
    if (confirm(T('Dafür wird das kleine Windows-Programm „pdfmy Scan“ ab Version 1.10.0 benötigt. Es legt einen Drucker „PDFMy“ nur für Sie an – mit dem in Windows eingebauten PDF-Treiber, die Dateien bleiben auf Ihrem Rechner.\n\nJetzt herunterladen?'))) location.href = dl(SCAN_FILE);
    return;
  }
  const st = state.scanPrinter, name = state.scanPrinterName;
  if (st === 'ts') { alert(T('Auf diesem Rechner melden sich mehrere Benutzer gleichzeitig an (Terminalserver). Ein Drucker „PDFMy“ gälte dort für alle – deshalb bietet PDFMy ihn hier nicht an. Alternative: im Druckdialog „Microsoft Print to PDF“ wählen und die Datei in PDFMy öffnen.')); return; }
  if (st === 'nodriver') {   // pdfmy Scan ab 1.10.1 öffnet das Windows-Fenster zum Einschalten selbst (unabhängig von der Sprache)
    if (verLess(state.scanVersion, '1.10.1')) { alert(T('Der in Windows eingebaute Drucker „Microsoft Print to PDF“ ist ausgeschaltet.\n\nEinschalten: Windows-Suche „Windows-Features aktivieren oder deaktivieren“ → Haken bei „Microsoft Print to PDF“ → OK. Danach hier noch einmal klicken.')); return; }
    if (!confirm(T('Der in Windows eingebaute PDF-Treiber „Microsoft Print to PDF“ ist ausgeschaltet.\n\nSoll pdfmy Scan das Windows-Fenster zum Einschalten öffnen? Dort den Haken bei „Microsoft Print to PDF“ setzen und OK klicken – danach den Drucker hier noch einmal einrichten.'))) return;
    const r = await fetch(SCAN_API + '/printer?on=1', { method: 'POST', headers: { 'X-Pdfmy': '1' } }).then(x => x.json()).catch(() => ({}));
    status(r.error || T('Das hat nicht geklappt.'));
    return;
  }
  const on = st !== 'on';
  if (on ? !confirm(T('Drucker „{0}“ einrichten?\n\nDanach wählen Sie in jedem Programm (Word, Browser, Warenwirtschaft …) beim Drucken den Drucker „{0}“ – das Dokument öffnet sich sofort in PDFMy.\n\nWindows fragt einmal nach Ihrer Bestätigung. Nur Sie können diesen Drucker benutzen; die Dateien bleiben auf Ihrem Rechner.', name))
         : !confirm(T('Der Drucker „{0}“ ist eingerichtet. Wieder entfernen?\n\nWindows fragt dafür einmal nach Ihrer Bestätigung.', name))) return;
  status(on ? T('Drucker wird eingerichtet – bitte die Windows-Abfrage bestätigen …') : T('Drucker wird entfernt – bitte die Windows-Abfrage bestätigen …'));
  try {
    const r = await fetch(SCAN_API + '/printer?on=' + (on ? 1 : 0), { method: 'POST', headers: { 'X-Pdfmy': '1' } }).then(x => x.json());
    state.scanPrinter = r.printer || state.scanPrinter;
    if (!r.ok) { const m = r.error || T('Das hat nicht geklappt.'); status(m); alert(m); return; }
    status(on ? T('Drucker „{0}“ ist eingerichtet. Zum Ausprobieren: in einem beliebigen Programm drucken und „{0}“ wählen.', name) : T('Drucker „{0}“ wurde entfernt.', name));
    toast(on ? T('Fertig: Beim Drucken „{0}“ wählen – das Dokument öffnet sich in PDFMy.', name) : T('Drucker „{0}“ wurde entfernt.', name), 8000);
  } catch { status(T('pdfmy Scan antwortet nicht. Bitte prüfen, ob es läuft (Symbol unten rechts), und noch einmal versuchen.')); }
};

/* ---------- In Office-Programm öffnen: Jeder Nutzer wählt selbst, mit welchem installierten Programm er was macht (ONLYOFFICE,
   LibreOffice, Collabora Office, Microsoft Word). pdfmy Scan erkennt die Programme, legt die PDF lokal ab und startet das gewählte
   Programm – die Datei verlässt den Rechner nicht. Die letzte Wahl merkt sich der Browser (je Nutzer). Zurück: Drucker „PDFMy“. */
const b64Bytes = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return btoa(s); };
const OFFICE_WHAT = {
  pdf: 'PDF direkt bearbeiten – Text, Seiten, Formulare',
  text: 'als Textdokument bearbeiten – der Text wird übernommen, das Layout kann sich ändern',
  draw: 'als Zeichnung bearbeiten – das Layout bleibt weitgehend, Text steht in Blöcken',
  word: 'als Word-Dokument bearbeiten – Word wandelt die PDF dabei um',
  docx: 'als Word-Dokument bearbeiten – PDFMy übernimmt Absätze, Überschriften und Tabellen',
  graphic: 'als Grafik bearbeiten – Linien, Formen und Text als Vektoren',
};
$('#btnOffice').onclick = async () => {
  closeMenu();
  if (!state.pages.length) { status('Zuerst ein Dokument öffnen – dann lässt es sich in einem Office-Programm bearbeiten.'); return; }
  if (IS_MOBILE) { toast('Auf dem Handy: das Dokument speichern und in der Office-App öffnen.', 7000); return; }
  const dl = f => (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'download/' + f;
  const running = await scanHelperRunning(), need = state.scanMac ? '1.4.0' : '1.11.0';
  if (!running || verLess(state.scanVersion, need)) {
    const mac = IS_MAC || state.scanMac;
    if (confirm(mac ? 'Dafür wird „pdfmy Scan“ für Mac bzw. Linux ab Version 1.4.0 benötigt. Es erkennt Ihre Office-Programme und öffnet das Dokument darin – die Datei bleibt auf Ihrem Rechner.\n\nJetzt herunterladen?'
      : 'Dafür wird das kleine Windows-Programm „pdfmy Scan“ ab Version 1.11.0 benötigt. Es erkennt Ihre Office-Programme und öffnet das Dokument darin – die Datei bleibt auf Ihrem Rechner.\n\nJetzt herunterladen?')) location.href = dl(mac ? SCAN_FILE_UNIX() : SCAN_FILE);
    return;
  }
  const r = await fetch(SCAN_API + '/office', { headers: { 'X-Pdfmy': '1' }, cache: 'no-store' }).then(x => x.json()).catch(() => ({ apps: [] }));
  const apps = r.apps || [], list = $('#officeList'), last = LS.get('officeChoice', '');
  list.textContent = '';
  for (const [i, a] of apps.entries()) {
    const l = document.createElement('label'); l.className = 'prrow';
    const inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'officeApp'; inp.value = a.id; inp.dataset.fmt = a.fmt || 'pdf'; inp.checked = a.id === last || (!apps.some(x => x.id === last) && i === 0);
    const sp = document.createElement('span'), b = document.createElement('b'), sm = document.createElement('small');
    b.textContent = a.app; b.translate = false; sm.textContent = ' – ' + I18N.t(OFFICE_WHAT[a.what] || '');
    sp.append(b, sm); l.append(inp, ' ', sp); list.append(l);
  }
  $('#officeNone').hidden = apps.length > 0; $('#officeSet').hidden = !apps.length; $('#officeGo').hidden = !apps.length;
  $('#officeDlg').showModal();
};
$('#officeClose').onclick = () => $('#officeDlg').close();
$('#officeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const sel = $('#officeDlg').querySelector('[name=officeApp]:checked'); if (!sel) return;
  const app = sel.closest('label').querySelector('b').textContent;
  LS.set('officeChoice', sel.value); $('#officeDlg').close();
  status(`Dokument wird für ${app} vorbereitet …`);
  try {
    const docx = sel.dataset.fmt === 'docx';   // Textprogramme bekommen das gegliederte Word-Dokument (Absätze, Überschriften, Tabellen)
    let bytes;
    if (docx) { await waitForOcr(state.pages); bytes = Tools.docx(await Promise.all(state.pages.map(pageBlocks)), { title: state.meta.subject || baseName(), author: state.meta.sender, lang: docLang(state.pages) }); }
    else bytes = await buildPdf(state.pages, state.meta, { onPage: () => {} });
    const res = await fetch(SCAN_API + '/office', { method: 'POST', headers: { 'X-Pdfmy': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sel.value, name: baseName() + (docx ? '.docx' : '.pdf'), data: b64Bytes(bytes) }) }).then(x => x.json());
    if (!res.ok) { status(res.error || 'Das hat nicht geklappt.'); alert(res.error || 'Das hat nicht geklappt.'); return; }
    status(sel.value === 'word' ? `Geöffnet in ${app}. Word fragt einmal, ob es die PDF umwandeln soll – mit „OK“ bestätigen. Zurück zu PDFMy: in Word drucken und den Drucker „PDFMy“ wählen.`
      : `Geöffnet in ${app}. Ergebnis dort mit „Speichern unter“ sichern – zurück zu PDFMy: im Programm drucken und den Drucker „PDFMy“ wählen.`);
    toast(`Geöffnet in ${app}.`, 6000);
  } catch { status('pdfmy Scan antwortet nicht. Bitte prüfen, ob es läuft (Symbol unten rechts), und noch einmal versuchen.'); }
});

$('#btnDefaultPdf').onclick = async () => {
  closeMenu();
  if (IS_MOBILE) { toast('Auf dem Handy: eine PDF in der Dateien-App antippen und „Öffnen mit … PDFMy“ wählen (PDFMy muss als App installiert sein).', 8000); return; }
  if (IS_LINUX) {   // Linux: pdfmy Scan für Linux trägt „PDFMy“ in mimeapps.list ein (gilt für GNOME, KDE, Xfce, Cinnamon …)
    const fm = 'So öffnet ein Doppelklick im Dateimanager jede PDF in PDFMy:\n\n1. Rechtsklick auf eine PDF → „Öffnen mit“ bzw. „Mit anderer Anwendung öffnen“.\n2. „PDFMy“ wählen und „Als Standard festlegen“ bzw. „Immer verwenden“ anhaken.';
    if (await scanHelperRunning() && state.scanLinux) {
      if (state.pdfDefault) { toast('PDFMy ist bereits Ihr Standard-Programm für PDF-Dateien.', 5000); return; }
      const r = await fetch(SCAN_API + '/defaultapps', { method: 'POST', headers: { 'X-Pdfmy': '1' } }).then(x => x.json()).catch(() => ({}));
      if (r.isDefault) { state.pdfDefault = true; toast('Fertig: PDF-Dateien öffnen sich jetzt per Doppelklick im Dateimanager in PDFMy.', 7000); } else alert(fm);
      return;
    }
    if (confirm('Dafür gibt es das kleine Programm „pdfmy Scan für Linux“: Es legt „PDFMy“ im Anwendungsmenü an, meldet es als PDF-Programm an und verbindet gleich Ihren Scanner. Die Dateien bleiben auf Ihrem Rechner.\n\nJetzt herunterladen? (Danach im Terminal: sh ~/Downloads/pdfmy-scan-linux.sh)')) scanDl('linux');
    return;
  }
  if (IS_MAC) {   // Mac: pdfmy Scan für Mac meldet die App „PDFMy“ bei macOS an (auch für Safari); sonst die installierte Web-App (Chrome/Edge)
    const finder = 'So öffnet ein Doppelklick im Finder jede PDF in PDFMy:\n\n1. Im Finder eine PDF mit Rechtsklick (oder ctrl-Klick) anklicken → „Informationen“.\n2. Unter „Öffnen mit“ „PDFMy“ wählen.\n3. Auf „Alle ändern …“ klicken und bestätigen.';
    if (await scanHelperRunning() && state.scanMac) {
      if (state.pdfDefault) { toast('PDFMy ist bereits Ihr Standard-Programm für PDF-Dateien.', 5000); return; }
      const r = await fetch(SCAN_API + '/defaultapps', { method: 'POST', headers: { 'X-Pdfmy': '1' } }).then(x => x.json()).catch(() => ({}));
      if (r.isDefault) { state.pdfDefault = true; toast('Fertig: PDF-Dateien öffnen sich jetzt per Doppelklick im Finder in PDFMy.', 7000); } else alert(finder);
      return;
    }
    if (runsAsApp()) { alert(finder); return; }
    if (confirm('Dafür gibt es das kleine Programm „pdfmy Scan für Mac“: Es meldet PDFMy bei macOS als PDF-Programm an – auch für Safari – und verbindet gleich Ihren Scanner. Die Dateien bleiben auf Ihrem Mac.\n\nJetzt herunterladen?')) location.href = (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'download/pdfmy-Scan-Mac.zip';
    return;
  }
  if (await scanHelperRunning() && !verLess(state.scanVersion, '1.5.0')) {
    if (state.pdfDefault) { toast('PDFMy ist bereits Ihr Standard-Programm für PDF-Dateien.', 5000); return; }
    await fetch(SCAN_API + '/defaultapps', { method: 'POST', headers: { 'X-Pdfmy': '1' } }).catch(() => {});
    alert('Die Windows-Einstellungen öffnen sich.\n\nDort bei „.pdf“ auf das bisherige Programm klicken, „PDFMy (pdfmy Scan)“ wählen und mit „Standard festlegen“ bestätigen.\n\nDanach öffnet ein Doppelklick auf eine PDF-Datei sie direkt in PDFMy.');
    return;
  }
  if (confirm('Dafür wird das kleine Windows-Programm „pdfmy Scan“ (ab Version 1.5.0) benötigt. Es meldet PDFMy bei Windows als PDF-Programm an – die Dateien bleiben dabei auf Ihrem Rechner.\n\nJetzt herunterladen?')) location.href = 'https://pdfmy.de/download/pdfmy-Scan.exe';
};


/* ---------- Kopfzeile „App herunterladen“: nur solange PDFMy auf diesem Gerät nicht als App installiert ist ---------- */
let installEvt = null, justInstalled = false;
const runsAsApp = () => matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay), (display-mode: minimal-ui)').matches || navigator.standalone === true;
const iosSafari = IS_IOS && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);   // iPhone: Installation nur über Safari „Zum Home-Bildschirm“
const macSafari = IS_MAC && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg\/|Firefox/.test(navigator.userAgent);   // Mac-Safari 17+: „Zum Dock hinzufügen“
function renderInstall() { $('#btnInstall').hidden = justInstalled || runsAsApp() || !(installEvt || iosSafari || macSafari); }
// Chrome/Edge/Android melden, dass die App installierbar ist – bei bereits installierter App kommt dieses Ereignis nicht
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderInstall(); });
addEventListener('appinstalled', () => { installEvt = null; justInstalled = true; renderInstall(); toast('PDFMy ist jetzt als App installiert – Sie finden es im Startmenü bzw. auf dem Startbildschirm.', 7000); });
matchMedia('(display-mode: standalone)').addEventListener?.('change', renderInstall);
$('#btnInstall').onclick = async () => {
  if (installEvt) {
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice.catch(() => ({}));
    if (outcome === 'accepted') { installEvt = null; justInstalled = true; }
    renderInstall(); return;
  }
  if (macSafari) { alert('So kommt PDFMy als App in Ihr Dock:\n\nIn Safari oben im Menü „Ablage“ → „Zum Dock hinzufügen …“ → „Hinzufügen“.\n\nTipp: Für den Scan-Ordner und „PDF per Doppelklick öffnen“ eignen sich Chrome oder Edge besser.'); return; }
  if (iosSafari) alert('So kommt PDFMy als App auf Ihr iPhone:\n\n1. Unten in Safari auf „Teilen“ tippen (Quadrat mit Pfeil nach oben).\n2. „Zum Home-Bildschirm“ wählen.\n3. Oben rechts auf „Hinzufügen“ tippen.\n\nDanach startet PDFMy wie eine App über das neue Symbol.');
};
renderInstall();


/* ---------- Handy: untere Aktionsleiste spiegelt Teilen / Ablegen / Speichern der Kopfzeile ---------- */
$('#mbShare').onclick = () => $('#btnShareTop').click();
$('#mbFile').onclick = () => $('#btnFile').click();
$('#mbSave').onclick = () => $('#btnSave').click();
const syncMobBar = () => {
  $('#mbSave').disabled = $('#btnSave').disabled; $('#mbFile').hidden = $('#btnFile').hidden; $('#mbShare').disabled = $('#btnShareTop').disabled;
  // Mit Ablageordner ist „Ablegen“ die Hauptaktion
  $('#mbFile').classList.toggle('primary', !$('#btnFile').hidden); $('#mbSave').classList.toggle('primary', $('#btnFile').hidden);
};
new MutationObserver(syncMobBar).observe($('header'), { subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
syncMobBar();


/* ---------- Einrichtung beim ersten Start: Name, Ablageordner, Scanner, PDF-Standard ---------- */
async function renderSetup() {
  $('#setAuthor').value = S.author || '';
  $('#stName').classList.toggle('ok', !!S.author);
  const saved = state.outDir || await idb.get('outDir').catch(() => null);
  $('#stOut').hidden = !window.showDirectoryPicker;   // Handy/Safari: keine Ordner-Freigabe
  $('#stOut').classList.toggle('ok', !!saved);
  $('#setOutInfo').textContent = saved ? `Ablage: ${saved.name} – jeder Brief wird dort mit erkanntem Namen abgelegt.` : 'Dorthin legt „Ablegen“ jeden Brief mit erkanntem Namen – z. B. ein mit SharePoint/OneDrive synchronisierter Ordner.';
  $('#setOut').textContent = saved ? 'Anderen Ordner wählen …' : 'Ordner wählen …';
  $('#setAutoRow').hidden = !saved; $('#setAuto').checked = !!S.autopilot;
  const helper = !IS_MOBILE && await scanHelperRunning();
  $('#stScan').hidden = IS_MOBILE;
  $('#stScan').classList.toggle('ok', helper || (IS_MAC && !!state.inDir));
  $('#setScanInfo').textContent = helper ? `pdfmy Scan ${state.scanVersion} läuft – Scanner im Netzwerk und am PC werden gefunden.` : 'Für Scanner und Multifunktionsgeräte am PC braucht PDFMy das kleine Programm „pdfmy Scan“ (einmal öffnen, es richtet sich selbst ein).';
  // Beide Systeme anbieten: das erkannte als Hauptknopf, das andere daneben
  $('#setScan').hidden = $('#setScanAlt').hidden = helper;
  $('#setScan').textContent = IS_MAC ? 'pdfmy Scan für Mac laden' : IS_LINUX ? 'pdfmy Scan für Linux laden' : 'pdfmy Scan für Windows laden';
  $('#setScanAlt').textContent = IS_MAC || IS_LINUX ? 'Für Windows' : 'Für Mac';
  if (IS_MAC && !helper) { $('#setScanInfo').textContent = state.inDir ? `Scan-Ordner „${state.inDir.name}“ ist verbunden – neue Scans erscheinen automatisch.` : 'Für Scanner am Mac: das kleine Programm „pdfmy Scan für Mac“ (Netzwerkscanner ohne Treiber, auch Dell und Samsung). Alternativ mit „Digitale Bilder“ in einen Ordner scannen.'; $('#setScan').hidden = $('#setScanAlt').hidden = false; }
  if (IS_LINUX && !helper) $('#setScanInfo').textContent = 'Für Scanner unter Linux: das kleine Programm „pdfmy Scan für Linux“ – Netzwerkscanner ohne Treiber (z. B. Epson, Dell, Samsung), USB-Scanner über SANE. Einrichtung im Terminal, ohne sudo.';
  // Schritt 4: am PC PDF-Standard (über pdfmy Scan), am Handy die App installieren
  if (IS_MOBILE) {
    $('#setPdfT').textContent = 'PDFMy als App'; $('#setPdfInfo').textContent = 'Eigenes Symbol auf dem Startbildschirm, startet ohne Browserleiste.';
    $('#stPdf').classList.toggle('ok', runsAsApp()); $('#setPdf').textContent = 'App installieren'; $('#setPdf').hidden = runsAsApp() || (!installEvt && !iosSafari);
  } else {
    $('#stPdf').classList.toggle('ok', !!state.pdfDefault);
    $('#setPdfInfo').textContent = state.pdfDefault ? 'PDFMy ist Ihr Standard für PDF-Dateien.' : state.pdfBrowserApp ? 'Bei PDF ist die Browser-App eingestellt – PDF-Dateien zeigen dann kein PDFMy-Logo. Bitte „PDFMy (pdfmy Scan)“ wählen; geöffnet wird weiter im App-Fenster.' : IS_MAC ? 'Doppelklick auf eine PDF im Finder öffnet sie in PDFMy (mit pdfmy Scan für Mac – auch für Safari).' : IS_LINUX ? 'Doppelklick auf eine PDF im Dateimanager öffnet sie in PDFMy (mit pdfmy Scan für Linux).' : 'Doppelklick auf eine PDF im Explorer öffnet sie in PDFMy (benötigt pdfmy Scan).';
    $('#setPdf').hidden = !!state.pdfDefault;
  }
}
async function openSetup() { closeMenu(); await renderSetup(); if (!$('#setupDlg').open) $('#setupDlg').showModal(); }
$('#btnSetup').onclick = openSetup;
$('#setAuthor').oninput = e => { S.author = e.target.value.trim(); saveSettings(); $('#author').value = S.author; $('#stName').classList.toggle('ok', !!S.author); };
$('#setOut').onclick = async () => { await chooseOutDir(); renderSetup(); };
const scanDl = kind => {
  if (kind === 'linux') { location.href = (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'download/pdfmy-scan-linux.sh'; $('#setScanInfo').textContent = 'Download gestartet – im Terminal starten: sh ~/Downloads/pdfmy-scan-linux.sh (ohne sudo). Dieses Fenster erkennt es automatisch.'; return; }
  if (kind === 'mac' || kind === true) { location.href = (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'download/pdfmy-Scan-Mac.zip'; $('#setScanInfo').textContent = 'Download gestartet – die ZIP-Datei öffnen und „pdfmy-Scan-Mac.command“ doppelklicken. Dieses Fenster erkennt es automatisch.'; return; }
  location.href = 'https://pdfmy.de/download/pdfmy-Scan.exe'; $('#setScanInfo').textContent = 'Download gestartet – die Datei „pdfmy-Scan.exe“ unten im Browser öffnen. Dieses Fenster erkennt es automatisch.';
};
$('#setScan').onclick = () => scanDl(IS_MAC ? 'mac' : IS_LINUX ? 'linux' : 'win');
$('#setScanAlt').onclick = () => scanDl(IS_MAC || IS_LINUX ? 'win' : 'mac');
$('#setPdf').onclick = () => { if (IS_MOBILE) $('#btnInstall').click(); else $('#btnDefaultPdf').click(); setTimeout(renderSetup, 1500); };
$('#setDone').onclick = $('#setLater').onclick = () => { LS.set('setupSeen', 1); $('#setupDlg').close(); };
$('#setupDlg').addEventListener('close', () => LS.set('setupSeen', 1));
// Während der Dialog offen ist: pdfmy Scan nach dem Download automatisch erkennen
setInterval(() => { if ($('#setupDlg').open && !$('#stScan').classList.contains('ok')) renderSetup(); }, 4000);
// Erster Start: nur auf der Startseite, nicht wenn eine Datei übergeben wurde
setTimeout(() => {
  if (LS.get('setupSeen', 0) || state.pages.length || location.hash || document.querySelector('dialog[open]')) return;
  if (S.author || LS.get('journal', []).length) { LS.set('setupSeen', 1); return; }   // bestehende Nutzer nicht stören
  openSetup();
}, 1200);


/* ---------- Aktionszeile „Was will dieser Brief von mir?“ über der Seite ---------- */
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
window.renderTodo = () => {
  const t = state.pages.length && !ocrRunningNow() ? Letter.todoFor(state.meta, todayStr()) : null;
  $('#todo').hidden = !t; if (!t) return;
  const ap = autopilot();
  $('#todo').className = 'todo ' + (ap?.armed ? 'auto' : t.tone);
  $('#todoText').textContent = t.text;
  if (ap) { const sm = document.createElement('small'); sm.textContent = ap.text; $('#todoText').append(sm); }
  for (const b of $('#todo').querySelectorAll('[data-act]')) b.hidden = b.dataset.act === 'stop' ? !ap?.armed : b.dataset.act === 'reply' ? !state.meta.sender : !t.actions.includes(b.dataset.act);
  $('#todo [data-act=file]').lastChild.textContent = $('#btnFile').hidden ? 'Speichern' : 'Ablegen';
};
const ocrRunningNow = () => typeof ocrRunning !== 'undefined' && ocrRunning && !state.meta.sender;
$('#todo').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'pay') { const g = $('#giro'); g.scrollIntoView({ behavior: 'smooth', block: 'center' }); g.classList.remove('flash'); void g.offsetWidth; g.classList.add('flash'); toast('GiroCode mit der Banking-App scannen – Empfänger, IBAN, Betrag und Verwendungszweck sind ausgefüllt.', 6000); }
  else if (a === 'cal') $('#btnIcs').click();
  else if (a === 'fwd') openForward({ ...state.meta, file: filename(), assignee: '' });
  else if (a === 'file') { stopAutopilot(); ($('#btnFile').hidden ? $('#btnSave') : $('#btnFile')).click(); }
  else if (a === 'reply') openReply();
  else if (a === 'stop') { stopAutopilot(true); status('Autopilot gestoppt – dieser Brief bleibt offen.'); window.renderTodo(); }
});

/* ---------- Autopilot-Ablage: Briefe vom Scanner ohne Klick ablegen, wenn alles sicher erkannt ist ---------- */
let apTimer = null, apLeft = 0;
const ocrComplete = () => !ocrRunning && state.pages.every(p => p.ocr || p.native || p.failed || p.blank);
function stopAutopilot(user) { clearInterval(apTimer); apTimer = null; if (state.autoArmed) state.autoArmed = user ? 'stopped' : null; }
// Liefert den Hinweis für die Aktionszeile (oder null) und startet bei sicherer Erkennung den Countdown
function autopilot() {
  if (!S.autopilot || !state.fromScanner || !state.scanDone || !state.pages.length || !ocrComplete()) return null;
  if (!state.outDir || !window.showDirectoryPicker) return { text: 'Autopilot: zuerst unter „Mehr → Einrichtung“ einen Ablageordner wählen.' };
  if (state.autoArmed === 'stopped') return { text: 'Autopilot gestoppt – zum Ablegen auf „Ablegen“ klicken.' };
  const k = normSender(state.meta.sender), known = k.length > 2 && (!!rules[k] || jLocal().some(e => normSender(e.sender) === k));
  const pages = docPages(), letters = Math.max(1, Letter.splitPoints(pages.map(pageText), S.ownName).length);
  const chk = Letter.autopilotCheck(state.meta, { known, duplicate: !!findDuplicate(state.meta), letters });
  if (!chk.ok) { stopAutopilot(); return { text: 'Autopilot wartet: ' + chk.reason + '.' }; }
  if (!apTimer) {
    const token = state.autoArmed = Symbol('ap'); apLeft = 6;
    apTimer = setInterval(() => {
      if (state.autoArmed !== token) return stopAutopilot();
      if (--apLeft > 0) return window.renderTodo();
      stopAutopilot(); state.autoArmed = null; fileAndNext();
    }, 1000);
  }
  return { armed: true, text: `Autopilot: wird in ${apLeft} s automatisch abgelegt …` };
}
// Eingriff des Nutzers in die Briefdaten stoppt den Countdown
document.addEventListener('input', e => { if (apTimer && e.target.closest('#side')) { stopAutopilot(true); window.renderTodo(); } }, true);


$('#setAuto').onchange = e => { S.autopilot = e.target.checked; saveSettings(); $('#s-autopilot').checked = S.autopilot; };


/* ---------- Trennblatt drucken: QR-Code „PDFMY:TRENNBLATT“ – zwischen die Briefe legen, ganzen Stapel scannen ---------- */
$('#btnSeparator').onclick = async () => {
  closeMenu();
  const doc = await PDFDocument.create(); doc.registerFontkit(await loadFontkit());
  const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true });
  const page = doc.addPage([595.28, 841.89]);
  await loadQrcode(); qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const q = qrcode(0, 'H'); q.addData(QR.SEPARATOR, 'Byte'); q.make();
  const n = q.getModuleCount(), size = 260, cell = size / n, x0 = (595.28 - size) / 2, y0 = 420;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) page.drawRectangle({ x: x0 + c * cell, y: y0 + size - (r + 1) * cell, width: cell + 0.2, height: cell + 0.2, color: rgb(0, 0, 0) });
  const center = (t, y, sz) => page.drawText(t, { x: (595.28 - font.widthOfTextAtSize(t, sz)) / 2, y, size: sz, font, color: rgb(0.15, 0.15, 0.15) });
  center('PDFMy – Trennblatt', 740, 30);
  center('Zwischen zwei Briefe legen und den ganzen Stapel auf einmal scannen.', 370, 12.5);
  center('PDFMy erkennt dieses Blatt, trennt die Briefe und lässt es weg.', 350, 12.5);
  center('Mehrfach verwendbar · nicht knicken · Vorderseite nach oben bzw. wie die Briefe einlegen', 120, 9.5);
  download(await doc.save(), 'PDFMy_Trennblatt.pdf', 'application/pdf');
  status('Trennblatt erstellt – ausdrucken (gern mehrere), zwischen die Briefe legen und den Stapel scannen. „Stapel trennen“ legt dann jeden Brief einzeln ab.');
};


/* ---------- Patchcode-Trennblatt (Kodak-Patchcode T): vier senkrechte Balken breit-schmal-schmal-schmal, schmal 0,08″, breit 0,2″,
   Abstand 0,2″. PDFMy erkennt alle Patchcode-Typen (js/patchcode.js) – auch die Blätter, die im Büro schon für den Dokumentenscanner liegen. */
$('#btnPatch').onclick = async () => {
  closeMenu();
  const doc = await PDFDocument.create(); doc.registerFontkit(await loadFontkit());
  const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true });
  const page = doc.addPage([595.28, 841.89]), N = 0.08 * 72, Wd = 0.2 * 72, G = 0.2 * 72;
  const widths = [Wd, N, N, N], total = widths.reduce((a, b) => a + b, 0) + 3 * G;
  let x = (595.28 - total) / 2;
  for (const w of widths) { page.drawRectangle({ x, y: 120, width: w, height: 600, color: rgb(0, 0, 0) }); x += w + G; }
  const center = (t, y, sz) => page.drawText(t, { x: (595.28 - font.widthOfTextAtSize(t, sz)) / 2, y, size: sz, font, color: rgb(0.15, 0.15, 0.15) });
  center('PDFMy – Trennblatt (Patchcode T)', 770, 24);
  center('Zwischen zwei Briefe legen und den ganzen Stapel auf einmal scannen.', 80, 11.5);
  center('PDFMy erkennt dieses Blatt, trennt die Briefe und lässt es weg – viele Dokumentenscanner auch.', 62, 11.5);
  center('In Originalgröße drucken (100 %, nicht „an Seite anpassen“) · nicht knicken · mehrfach verwendbar', 36, 8.5);
  download(await doc.save(), 'PDFMy_Patchcode_Trennblatt.pdf', 'application/pdf');
  status('Patchcode-Trennblatt erstellt – in Originalgröße drucken, zwischen die Briefe legen und den Stapel scannen. Vorhandene Patchcode-Blätter (Typ 1, 2, 3, 4, 6, T) erkennt PDFMy ebenfalls.');
};

/* ---------- Digitale Signatur mit eigenem Zertifikat (.p12/.pfx) – lokal, ohne Server ---------- */
let signCert = null;   // { name, bytes } – die Zertifikatsdatei ist selbst passwortgeschützt; das Passwort wird nie gespeichert
window.signCertName = () => signCert?.name || '';
idb.get('signCert').then(c => { if (c?.bytes || c?.thumb) { signCert = c; renderSignInfo(); } }).catch(() => {});
function renderSignInfo() {
  $('#x-sign-info').textContent = signCert ? (signCert.type === 'win' ? `${signCert.name}${signCert.qualified ? ' (qualifiziert)' : ''} · Windows · gültig bis ${I18N.fmtDate(new Date(signCert.notAfter))}`
    : state.signer ? `${state.signer.name} · gültig bis ${I18N.fmtDate(state.signer.notAfter)}` : signCert.name) : '';
  $('#x-sign-cert').textContent = signCert && signCert.type !== 'win' ? 'Andere Datei …' : 'Zertifikat wählen …';
  // Windows-Zertifikate nur mit pdfmy Scan ab 1.6.0 (am PC)
  $('#x-sign-win').hidden = IS_MOBILE || state.scanMac || !state.scanVersion || verLess(state.scanVersion, '1.6.0');
  $('#x-sign-ts-l').hidden = !state.scanTsa;   // Zeitstempel nur über pdfmy Scan (ab 1.9.0 / 1.1.9)
  $('#x-sign-ts').checked = !!state.scanTsa && LS.get('signTs', true);
}
$('#x-sign-ts').addEventListener('change', e => LS.set('signTs', e.target.checked));
// Zeitstempel (RFC 3161) über pdfmy Scan – Zeitstempeldienste erlauben keine direkten Anfragen aus dem Browser (kein CORS).
// Übertragen wird nur der Hashwert der Signatur (32 Byte in der Anfrage), nicht das Dokument. Bei Ausfall nächster Dienst.
const tsaFetch = () => !$('#x-sign-ts').checked || !state.scanTsa ? undefined : async req => {
  let s = ''; for (const b of req) s += String.fromCharCode(b);
  let last = null;
  for (const url of PdfSign.TSA) {
    try {
      const r = await scanApi('/tsa', { method: 'POST', body: JSON.stringify({ url, data: btoa(s) }) }, 30000), d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Zeitstempel nicht möglich');
      return Uint8Array.from(atob(d.data), c => c.charCodeAt(0));
    } catch (e) { last = e; }
  }
  throw new Error('Kein Zeitstempeldienst erreichbar' + (last ? ' (' + last.message + ')' : '') + ' – ohne Zeitstempel erneut speichern oder später versuchen.');
};
const tsNote = o => { if (o.tsTime) toast(`Signiert mit Zeitstempel vom ${I18N.fmtDate(o.tsTime)}, ${o.tsTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} Uhr.`, 5000); };
$('#x-sign-win').onclick = async () => {
  let certs = [];
  try { certs = (await (await scanApi('/certs', {}, 15000)).json()).certs || []; } catch (e) { return toast('pdfmy Scan antwortet nicht – bitte starten.', 5000); }
  if (!certs.length) return toast('In Windows ist kein Zertifikat mit privatem Schlüssel für Signaturen vorhanden (Signaturkarte eingesteckt?).', 7000);
  $('#certList').innerHTML = certs.map((c, i) => `<label class="certopt"><input type="radio" name="cert" value="${i}" ${signCert?.thumb === c.thumb || (!signCert && !i) ? 'checked' : ''}><span><b>${esc(c.name)}</b>${c.qualified ? '<span class="qbadge">qualifiziert</span>' : ''}<small>ausgestellt von ${esc(c.issuer)} · gültig bis ${new Date(c.notAfter).toLocaleDateString('de-DE')}</small></span></label>`).join('');
  $('#certOk').onclick = () => {
    const c = certs[+document.querySelector('#certList input:checked')?.value || 0];
    signCert = { type: 'win', thumb: c.thumb, name: c.name, notAfter: c.notAfter, qualified: c.qualified }; state.signer = null;
    idb.set('signCert', signCert);   // nur Fingerabdruck und Name – der Schlüssel bleibt in Windows bzw. auf der Karte
    $('#certDlg').close(); $('#x-sign').checked = true; renderSignInfo(); updateExportUi();
  };
  $('#certCancel').onclick = () => $('#certDlg').close();
  $('#certDlg').showModal();
};
$('#expDlg').addEventListener('toggle', renderSignInfo);
scanHelperRunning().then(renderSignInfo);
$('#x-sign-cert').onclick = () => $('#x-sign-file').click();
$('#x-sign-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  signCert = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }; state.signer = null;
  idb.set('signCert', signCert);   // nur die (verschlüsselte) Zertifikatsdatei – nicht das Passwort
  $('#x-sign').checked = true; renderSignInfo(); updateExportUi();
};
let forgeLoading = null;
const loadForge = () => forgeLoading ||= new Promise((res, rej) => { if (window.forge) return res(); const s = document.createElement('script'); s.src = 'vendor/forge.min.js'; s.onload = res; s.onerror = () => { forgeLoading = null; rej(new Error('Signatur-Baustein konnte nicht geladen werden.')); }; document.head.append(s); });
// Passwort abfragen (einmal pro Sitzung), signieren; null = abgebrochen
async function signFlow(bytes) {
  if (signCert.type === 'win') {
    // Windows-Zertifikat/Signaturkarte: pdfmy Scan fragt nach und Windows nach der PIN – hier kein Passwort
    status(`Signiere mit ${signCert.name} – bitte im Fenster von pdfmy Scan bestätigen …`);
    await scanHelperRunning();   // ab pdfmy Scan 1.8.0 meldet /status „pades: true“ (CMS mit signing-certificate-v2) → SubFilter ETSI.CAdES.detached
    const signer = { name: signCert.name, notAfter: new Date(signCert.notAfter + 'T23:59:59'), pades: !!state.scanPades, cms: async covered => {
      let s = ''; for (let i = 0; i < covered.length; i += 8192) s += String.fromCharCode.apply(null, covered.subarray(i, i + 8192));
      const r = await scanApi('/sign', { method: 'POST', body: JSON.stringify({ thumb: signCert.thumb, name: $('#x-name').value || 'Dokument', data: btoa(s) }) }, 300000);
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Signatur nicht möglich');
      return Uint8Array.from(atob(d.cms), c => c.charCodeAt(0));
    } };
    state.signer = signer;
    const so = { contact: S.author || '', tsa: tsaFetch() };
    if (so.tsa) await loadForge();   // Zeitstempel einbauen braucht den Signatur-Baustein
    try { const out = await PdfSign.signPdf(bytes, signer, so); tsNote(so); return out; }
    catch (e) { if (/abgelehnt/.test(e.message)) return null; throw e; }
  }
  await loadForge();
  if (!state.signer) {
    const ok = await new Promise(resolve => {
      $('#pwSignWhat').textContent = `Zertifikat: ${signCert.name}`; $('#pwSignPw').value = ''; $('#pwSignErr').textContent = '';
      $('#pwSignForm').onsubmit = ev => {
        ev.preventDefault();
        try { state.signer = PdfSign.readP12(signCert.bytes, $('#pwSignPw').value); $('#pwSignPw').value = ''; $('#pwSignDlg').close(); resolve(true); }
        catch (err) { $('#pwSignErr').textContent = err.message; $('#pwSignPw').select(); }
      };
      $('#pwSignCancel').onclick = () => { $('#pwSignPw').value = ''; $('#pwSignDlg').close(); resolve(false); };
      $('#pwSignDlg').oncancel = () => resolve(false);
      $('#pwSignDlg').showModal(); $('#pwSignPw').focus();
    });
    if (!ok) return null;
    renderSignInfo();
  } else $('#pwSignReason').value = $('#pwSignReason').value || '';
  status(`Signiere als ${state.signer.name} …`);
  if (tsaFetch()) await loadForge();
  const so = { reason: $('#pwSignReason').value.trim(), contact: S.author || '', tsa: tsaFetch() };
  const out = await PdfSign.signPdf(bytes, state.signer, so); tsNote(so); return out;
}


/* ---------- Antwortbrief nach DIN 5008 (Form B), optional auf dem eigenen Briefbogen – lokal erzeugt ---------- */
let letterhead = null;   // { name, bytes } – eigener Briefbogen (PDF, erste Seite als Hintergrund)
idb.get('letterhead').then(l => { if (l?.bytes) letterhead = l; }).catch(() => {});
function renderLh() { $('#rpLhInfo').textContent = letterhead ? `Briefbogen: ${letterhead.name}` : 'Ohne Briefbogen schreibt PDFMy einen schlichten Briefkopf.'; $('#rpLhOff').hidden = !letterhead; }
function openReply() {
  closeMenu();
  const text = state.pages.filter(p => !p.blank).map(pageText)[0] || '';
  const addr = Letter.senderAddress(text, S.ownName, state.meta.sender), d = Letter.replyDraft(state.meta);
  $('#rpTo').value = addr.length ? addr.join('\n') : (state.meta.sender || '');
  $('#rpSubject').value = d.subject;
  $('#rpBody').value = `${d.salutation}\n\n\n\n${d.closing}`;
  $('#rpFrom').value = LS.get('ownAddress', '');
  $('#rpName').value = LS.get('signName', '') || S.author || '';
  $('#rpTpl').value = ''; renderLh(); $('#replyDlg').showModal();
  // Cursor in die Leerzeile nach der Anrede
  const ta = $('#rpBody'), pos = d.salutation.length + 2; ta.focus(); ta.setSelectionRange(pos, pos);
}
$('#btnReply').onclick = openReply;
$('#rpCancel').onclick = () => $('#replyDlg').close();
$('#rpLh').onclick = () => $('#rpLhFile').click();
// Speichern-Dialog: denselben Briefbogen unter jede Seite legen (js/app.js underlay)
const lhInfo = () => { $('#x-lh-info').textContent = letterhead ? letterhead.name : 'noch keiner gewählt'; $('#x-lh').disabled = !letterhead; if (!letterhead) $('#x-lh').checked = false; };
$('#x-lh-pick').onclick = () => { $('#rpLhFile').click(); };
$('#expDlg').addEventListener('toggle', lhInfo); new MutationObserver(lhInfo).observe($('#expDlg'), { attributes: true, attributeFilter: ['open'] });
$('#rpLhFile').addEventListener('change', () => setTimeout(() => { lhInfo(); if (letterhead) $('#x-lh').checked = true; }, 300));
$('#rpLhFile').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; letterhead = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }; idb.set('letterhead', letterhead); renderLh(); };
$('#rpLhOff').onclick = () => { letterhead = null; idb.set('letterhead', null); renderLh(); };
const mm = v => v * 72 / 25.4;
async function buildLetterPdf({ to, subject, body, from, name }) {
  const doc = await PDFDocument.create(); doc.registerFontkit(await loadFontkit());
  const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true }), cs = new Set(font.getCharacterSet());
  const safe = s => [...String(s)].filter(ch => cs.has(ch.codePointAt(0))).join('');
  const W = 595.28, H = 841.89, L = mm(25), R = W - mm(20), dark = rgb(0.1, 0.1, 0.1);
  let bg = null;
  if (letterhead) { try { [bg] = await doc.embedPdf(letterhead.bytes, [0]); } catch (e) { console.warn('Briefbogen', e); bg = null; } }
  const newPage = () => {
    const p = doc.addPage([W, H]);
    if (bg) p.drawPage(bg, { x: 0, y: 0, width: W, height: H });
    // Falzmarken (105 / 210 mm) und Lochmarke (148,5 mm) nach DIN 5008 Form B
    for (const y of [105, 210]) p.drawLine({ start: { x: mm(3), y: H - mm(y) }, end: { x: mm(8), y: H - mm(y) }, thickness: 0.5, color: rgb(0.55, 0.55, 0.55) });
    p.drawLine({ start: { x: mm(3), y: H - mm(148.5) }, end: { x: mm(10), y: H - mm(148.5) }, thickness: 0.5, color: rgb(0.55, 0.55, 0.55) });
    return p;
  };
  let page = newPage();
  const txt = (t, x, yTop, size = 11, bold = false) => { const s = safe(t); page.drawText(s, { x, y: H - yTop, size, font, color: dark }); if (bold) page.drawText(s, { x: x + 0.35, y: H - yTop, size, font, color: dark }); };
  const fromLines = from.split('\n').map(s => s.trim()).filter(Boolean);
  // Schlichter Briefkopf, wenn kein Briefbogen hinterlegt ist
  if (!bg && fromLines.length) { txt(fromLines[0], L, mm(20), 15, true); fromLines.slice(1).forEach((l, i) => txt(l, L, mm(26) + i * 12, 9.5)); }
  // Rücksendeangabe und Anschriftfeld (Form B: ab 45 mm, Anschriftzone ab 62,7 mm)
  if (fromLines.length) txt(fromLines.join(' · '), L, mm(60), 7);
  to.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6).forEach((l, i) => txt(l, L, mm(66.5) + i * 13.5, 11));
  // Informationsblock rechts
  txt('Datum: ' + new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }), mm(125), mm(55), 10);
  // Betreff (fett) und Text
  let y = mm(107);
  for (const l of wrapLines(safe(subject), R - L, s => font.widthOfTextAtSize(s, 11))) { txt(l, L, y, 11, true); y += 15; }
  y += 15;
  for (const para of body.replace(/\r/g, '').split('\n')) {
    const ls = para.trim() ? wrapLines(safe(para), R - L, s => font.widthOfTextAtSize(s, 11)) : [''];
    for (const l of ls) {
      if (y > H - mm(25)) { page = newPage(); y = mm(30); }
      if (l) txt(l, L, y, 11); y += 15;
    }
  }
  if (name) { y += 30; if (y > H - mm(25)) { page = newPage(); y = mm(30); } txt(name, L, y, 11); }
  doc.setTitle(subject); doc.setAuthor(fromLines[0] || ''); doc.setLanguage('de-DE');
  return doc.save();
}
function replyValues() {
  LS.set('ownAddress', $('#rpFrom').value.trim()); LS.set('signName', $('#rpName').value.trim());
  return { to: $('#rpTo').value, subject: $('#rpSubject').value.trim(), body: $('#rpBody').value, from: $('#rpFrom').value, name: $('#rpName').value.trim() };
}
const replyName = v => `${new Date().toISOString().slice(0, 10)}_Antwort_${(v.to.split('\n')[0] || 'Brief').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 50)}.pdf`;
$('#replyForm').onsubmit = async e => {
  e.preventDefault();
  const v = replyValues(), bytes = await buildLetterPdf(v);
  $('#replyDlg').close();
  const where = await deliver(bytes, replyName(v), 'application/pdf', null, true);
  status(where ? `Antwortbrief gespeichert: ${where}` : 'Speichern abgebrochen.');
};
$('#rpOpen').onclick = async () => {
  const v = replyValues(), bytes = await buildLetterPdf(v);
  if (state.dirty && state.pages.length && !confirm('Der aktuelle Brief ist noch nicht gespeichert. Trotzdem den Antwortbrief öffnen?')) return;
  $('#replyDlg').close(); resetDoc();
  await importFiles([new File([bytes], replyName(v), { type: 'application/pdf' })]);
  status('Antwortbrief geöffnet – jetzt unterschreiben, digital signieren, teilen oder speichern.');
};

/* ---------- Vorlesen (Sprachausgabe des Browsers, lokal) ---------- */
let speaking = false;
const localVoice = (voices, lang) => {
  const own = voices.filter(v => v.localService), base = lang.slice(0, 2);
  return own.find(v => v.lang === lang) || own.find(v => v.lang.replace('_', '-').slice(0, 2) === base) || null;
};
try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; } catch {}
$('#readAloud').onclick = () => {
  const synth = window.speechSynthesis; if (!synth) return toast('Ihr Browser kann nicht vorlesen.', 4000);
  if (speaking) { synth.cancel(); speaking = false; $('#readAloud').lastChild.textContent = 'Vorlesen'; return; }
  const text = (cur() ? pageText(cur()) : '').trim(); if (!text) return toast('Auf dieser Seite ist noch kein Text erkannt.', 4000);
  const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, ' ')), lang = (cur().lang && I18N.byOcr(cur().lang)?.bcp) || 'de-DE';
  // Datenschutz: nur Stimmen, die auf dem Gerät laufen. Online-Stimmen (z. B. „Google Deutsch“ in Chrome) würden den Brieftext an einen fremden Server senden.
  const voice = localVoice(synth.getVoices(), lang);
  if (!voice) return toast('Für diese Sprache ist auf dem Gerät keine Offline-Stimme installiert. PDFMy liest nicht über Online-Dienste vor, damit der Brief das Gerät nicht verlässt. Stimmen lassen sich in den Spracheinstellungen des Systems hinzufügen.', 9000);
  u.lang = voice.lang; u.voice = voice; u.rate = 0.95;
  u.onend = u.onerror = () => { speaking = false; $('#readAloud').lastChild.textContent = 'Vorlesen'; };
  synth.cancel(); synth.speak(u); speaking = true; $('#readAloud').lastChild.textContent = 'Stopp';
};

// Textbausteine: Auswahl ersetzt den Text zwischen Anrede und Gruß
$('#rpTpl').innerHTML += Object.entries(Letter.TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('');
$('#rpTpl').onchange = () => {
  const k = $('#rpTpl').value, d = Letter.replyDraft(state.meta);
  if (!k) return;
  // Kündigung, Widerspruch → Betreff passend ergänzen
  const label = Letter.TEMPLATES[k].label;
  if (['objection', 'cancel', 'install', 'extend'].includes(k) && !$('#rpSubject').value.startsWith(label)) $('#rpSubject').value = `${label} – ${d.subject}`;
  $('#rpBody').value = `${d.salutation}\n\n${Letter.fillTemplate(k, state.meta)}\n\n${d.closing}`;
};


/* ---------- Formularfelder erkennen: aus einem „flachen“ Formular (Scan/PDF) ein ausfüllbares machen ---------- */
window.autoForm = async (fromIntent) => {
  closeMenu();
  const pages = docPages(); if (!pages.length) return;
  status('Suche Formularfelder …', 0.1);
  await waitForOcr(pages);
  const found = [];
  for (const [i, p] of pages.entries()) {
    status(`Suche Formularfelder: Seite ${i + 1} von ${pages.length} …`, (i + 1) / pages.length);
    const src = p.kind === 'image' ? p.processed : await renderPdf(p, 150);
    const k = Math.min(1, 1240 / src.width), c = Imaging.canvas(Math.round(src.width * k), Math.round(src.height * k)), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data, g = new Uint8Array(c.width * c.height);
    for (let j = 0; j < g.length; j++) g[j] = (d[j * 4] * 0.299 + d[j * 4 + 1] * 0.587 + d[j * 4 + 2] * 0.114) | 0;
    const words = p.ocr?.words || (p.kind === 'pdf' && p.native ? await nativeWords(p) : null) || [];
    for (const f of FormDetect.detectFields(g, c.width, c.height, words)) found.push({ ...f, page: i });
    c.width = 0;
  }
  if (!found.length) { status('Keine Schreiblinien, Kästen oder Ankreuzfelder gefunden.' + (fromIntent ? ' Mit dem Text-Werkzeug können Sie direkt auf die Seite schreiben.' : '')); if (fromIntent) setTool('text'); return; }
  const nT = found.filter(f => f.type === 'text').length, nC = found.length - nT;
  if (!confirm(`${nT} Eingabefeld(er) und ${nC} Ankreuzfeld(er) gefunden.\n\nDaraus ein ausfüllbares Formular machen? Es öffnet sich als neues Dokument – rechts ausfüllen, dann speichern.`)) return status('Abgebrochen.');
  const bytes = await buildPdf(pages, state.meta, { pdfa: false });
  const doc = await PDFDocument.load(bytes), form = doc.getForm(), seen = new Map();
  const uniq = n => { const k = (seen.get(n) || 0) + 1; seen.set(n, k); return k > 1 ? `${n} ${k}` : n; };
  for (const f of found) {
    const pg = doc.getPage(f.page), { width: PW, height: PH } = pg.getSize(), box = { x: f.x * PW, y: PH - (f.y + f.h) * PH, width: f.w * PW, height: f.h * PH, borderWidth: 0 };
    if (f.type === 'check') form.createCheckBox(uniq(f.name)).addToPage(pg, { ...box, borderWidth: 0 });
    else { const t = form.createTextField(uniq(f.name)); t.addToPage(pg, box); t.setFontSize(0); }
  }
  const out = await doc.save(), name = filename().replace(/\.pdf$/i, '') + '_ausfuellbar.pdf';
  resetDoc(); state.intent = 'form';
  await importFiles([new File([out], name, { type: 'application/pdf' })]);
  status(`Ausfüllbares Formular erstellt: ${nT + nC} Felder – rechts unter „Formular“ ausfüllen, dann speichern.`);
};
$('#btnAutoForm').onclick = () => window.autoForm(false);

/* ---------- E-Rechnung prüfen (EN 16931, XRechnung) ---------- */
function einvChkRender(r, name) {
  $('#einvChkInfo').textContent = r.format ? `${name ? name + ' · ' : ''}${r.format}` : (name || '');
  const items = r.items.filter(i => i.level !== 'ok' || r.ok);
  $('#einvChkList').innerHTML = items.map(i => `<li class="${i.level}"><span class="bi" aria-hidden="true">${BEA_ICON[i.level]}</span><span><span class="sr">${BEA_LABEL[i.level]}: </span>${esc(i.text)}${i.rule ? ` <small>(${esc(i.rule)})</small>` : ''}</span></li>`).join('');
}
// Knopf in den Briefdaten: Ergebnis auf einen Blick
window.einvChkShow = hide => {
  const b = $('#einvChkBtn'); if (!b) return;
  if (hide || !state.einv?.xml) { b.hidden = true; return; }
  const r = state.einv.check ||= EInvoice.check(state.einv.xml), n = r.items.filter(i => i.level === 'fehler').length;
  b.hidden = false; b.textContent = r.ok ? '✓ geprüft' : `${n} Fehler – anzeigen`; b.classList.toggle('bad', !r.ok);
  b.title = r.ok ? 'E-Rechnung: Pflichtangaben und Rechenregeln erfüllt – Details anzeigen' : 'E-Rechnung enthält Fehler – Details anzeigen';
};
function openEinvChk() {
  if (!state.einv?.xml) { $('#einvChkInfo').textContent = 'Keine E-Rechnung geöffnet.'; $('#einvChkList').innerHTML = ''; }
  else einvChkRender(state.einv.check ||= EInvoice.check(state.einv.xml), state.einv.xmlName);
  $('#einvChkDlg').showModal();
}
$('#einvChkBtn').onclick = openEinvChk;
$('#btnEinvChk').onclick = openEinvChk;
$('#einvChkClose').onclick = () => $('#einvChkDlg').close();
$('#einvChkOpen').onclick = () => $('#einvChkFile').click();
// Andere Datei prüfen, ohne sie zu öffnen: XML direkt, bei PDF das eingebettete XML (ZUGFeRD/Factur-X)
$('#einvChkFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    let xml = null;
    if (/\.xml$/i.test(f.name) || /xml/.test(f.type)) xml = await f.text();
    else { const js = await openPdf(new Uint8Array(await f.arrayBuffer())); for (const a of await pdfAttachments(js)) if (/\.xml$/i.test(a.filename || '') && a.content) { xml = new TextDecoder().decode(a.content); break; } }
    if (!xml) { einvChkRender({ ok: false, format: '', items: [{ level: 'fehler', rule: '', text: 'Keine E-Rechnung gefunden (kein XML eingebettet)' }] }, f.name); return; }
    einvChkRender(EInvoice.check(xml), f.name);
  } catch (err) { einvChkRender({ ok: false, format: '', items: [{ level: 'fehler', rule: '', text: 'Datei lässt sich nicht lesen: ' + err.message }] }, f.name); }
};

/* ---------- Für beA prüfen (ERVB 2025) ---------- */
const BEA_ICON = { ok: '✓', fehler: '✗', hinweis: 'i' };
const BEA_LABEL = { ok: 'erfüllt', fehler: 'nicht erfüllt', hinweis: 'Hinweis' };
function beaRender(groups) {
  $('#beaList').innerHTML = groups.map(g => (g.title ? `<li><h4>${esc(g.title)}</h4></li>` : '') + g.items.map(i =>
    `<li class="${i.level}"><span class="bi" aria-hidden="true">${BEA_ICON[i.level]}</span><span><span class="sr">${BEA_LABEL[i.level]}: </span>${esc(i.text)}</span></li>`).join('')).join('');
}
async function openBea() {
  if (!state.pages.length) return;
  const name = BeaCheck.checkName(filename()).suggestion;
  $('#beaName').value = name; $('#beaList').innerHTML = '<li>Prüfe …</li>'; $('#beaGo').disabled = false;
  $('#beaDlg').showModal();
  const groups = [], docs = [...new Set(state.pages.filter(p => p.kind === 'pdf').map(p => p.docIdx))];
  const textPages = state.pages.filter(p => (p.native || p.ocr?.text || '').trim()).length;
  for (const di of docs) {
    const d = state.docs[di]; if (!d) continue;
    const r = await BeaCheck.checkPdf(d.filled || d.bytes, { name: d.name });
    groups.push({ title: `Geöffnete Datei: ${d.name}`, items: r.items.filter(i => i.level !== 'ok' || i.key === 'druck') });
  }
  if (state.pages.some(p => p.kind === 'image')) groups.push({ title: 'Scans und Fotos', items: [{ level: 'ok', text: 'Werden als PDF/A erzeugt' }] });
  groups.push({ title: 'Beim Speichern', items: [
    ...(textPages < state.pages.length ? [{ level: 'hinweis', text: `${state.pages.length - textPages} von ${state.pages.length} Seite(n) ohne Text – Texterkennung empfohlen (keine Pflicht)` }] : [{ level: 'ok', text: 'Durchsuchbar (Text auf allen Seiten)' }]),
    ...BeaCheck.checkName($('#beaName').value).issues.map(t => ({ level: 'fehler', text: 'Dateiname: ' + t })) ] });
  beaRender(groups);
}
$('#btnBea').onclick = openBea;
$('#beaCancel').onclick = () => $('#beaDlg').close();
$('#beaName').oninput = () => { const r = BeaCheck.checkName($('#beaName').value); $('#beaName').setAttribute('aria-invalid', String(!r.ok)); $('#beaName').title = r.ok ? '' : r.issues.join(' · '); };
$('#beaForm').onsubmit = async e => {
  e.preventDefault();
  let name = $('#beaName').value.trim(); if (!/\.pdf$/i.test(name)) name += '.pdf';
  const n = BeaCheck.checkName(name); if (!n.ok) { name = n.suggestion; $('#beaName').value = name; }
  $('#beaGo').disabled = true; $('#beaList').innerHTML = '<li>Erzeuge PDF/A …</li>';
  try {
    const bytes = await buildPdf(state.pages, state.meta, { pdfa: true, bea: true });
    const r = await BeaCheck.checkPdf(bytes, { name, pages: state.pages.length, textPages: state.pages.filter(p => (p.native || p.ocr?.text || '').trim()).length });
    beaRender([{ title: r.ok ? 'Gespeicherte Datei erfüllt die Vorgaben' : 'Gespeicherte Datei – bitte prüfen', items: r.items }]);
    const where = await deliver(bytes, name, 'application/pdf', state.meta, true);
    status(where ? `beA-tauglich gespeichert: ${name}${r.ok ? '' : ' – mit Hinweisen, siehe Prüfung'}` : 'Speichern abgebrochen.');
  } catch (err) { console.error(err); status('Fehler beim Speichern: ' + err.message); }
  $('#beaGo').disabled = false;
};

/* ---------- Anlagen nummerieren (Anlage K 1, B 1 …), Verzeichnis, einzelne Dateien ---------- */
// Jede Datei (bzw. jeder Scan-Stapel) in der Reihenfolge der Seitenübersicht ist eine Anlage
function anlGroups() {
  const out = []; let key = null;
  for (const p of state.pages) {
    const k = p.kind === 'pdf' ? 'd' + p.docIdx : 'i' + (p.batch || p.label || p.id);
    if (k !== key) { out.push({ pages: [], title: p.kind === 'pdf' ? (state.docs[p.docIdx]?.name || 'Dokument') : (p.label || 'Scan') }); key = k; }
    out[out.length - 1].pages.push(p);
  }
  for (const g of out) g.title = g.title.replace(/\.(pdf|jpe?g|png|tiff?|heic)$/i, '').replace(/ S\. \d+$/, '').trim();
  return out;
}
let anlList = [];
function anlLabel(i) { const pre = $('#anlPre').value.trim(), n = (+$('#anlStart').value || 1) + i; return `Anlage ${pre ? pre + ' ' : ''}${n}`; }
function anlRender() {
  $('#anlRows').innerHTML = anlList.map((g, i) => {
    const a = state.pages.indexOf(g.pages[0]) + 1, b = state.pages.indexOf(g.pages[g.pages.length - 1]) + 1;
    return `<div class="ar"><b translate="no">${esc(anlLabel(i))}</b><input data-i="${i}" value="${esc(g.title)}" aria-label="Bezeichnung ${esc(anlLabel(i))}"><small>${a === b ? `S. ${a}` : `S. ${a}–${b}`}</small></div>`;
  }).join('');
  $('#anlRows').querySelectorAll('input').forEach(inp => inp.oninput = () => { anlList[+inp.dataset.i].title = inp.value; });
}
$('#btnAnl').onclick = () => {
  if (!state.pages.length) return;
  anlList = anlGroups();
  $('#anlPre').value = LS.get('anlPre', 'K'); anlRender(); $('#anlDlg').showModal();
};
['anlPre', 'anlStart'].forEach(id => $('#' + id).oninput = anlRender);
$('#anlCancel').onclick = () => $('#anlDlg').close();
async function anlIndexPdf(rows) {
  const doc = await PDFDocument.create(); doc.registerFontkit(await loadFontkit());
  const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true }), cs = new Set(font.getCharacterSet());
  const safe = s => [...String(s)].filter(ch => cs.has(ch.codePointAt(0))).join('');
  const W = 595.28, H = 841.89, L = mm(25), dark = rgb(0.1, 0.1, 0.1);
  let page = doc.addPage([W, H]), y = mm(30);
  const txt = (t, x, yy, s = 11) => page.drawText(safe(t), { x, y: H - yy, size: s, font, color: dark });
  txt('Anlagenverzeichnis', L, y, 16); y += 12;
  if (state.meta?.reference) { y += 14; txt('Aktenzeichen: ' + state.meta.reference, L, y, 10); }
  y += 26;
  for (const r of rows) {
    if (y > H - mm(25)) { page = doc.addPage([W, H]); y = mm(25); }
    txt(r.label, L, y, 11); const words = safe(r.title).split(/\s+/); let line = '', yy = y;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t, 11) > W - L - mm(35) - mm(20) - 60) { txt(line, L + mm(35), yy); yy += 14; line = w; } else line = t; }
    if (line) txt(line, L + mm(35), yy);
    txt(r.pages, W - mm(20) - 50, y, 9); y = yy + 22;
  }
  doc.setTitle('Anlagenverzeichnis'); doc.setLanguage('de-DE');
  return doc.save();
}
$('#anlForm').onsubmit = async e => {
  e.preventDefault();
  const pre = $('#anlPre').value.trim(); LS.set('anlPre', pre); $('#anlDlg').close();
  const start = +$('#anlStart').value || 1, width = String(start + anlList.length - 1).length;
  // Stempel: alte Anlagen-Stempel ersetzen
  await undoGroup(async () => {
    for (const p of state.pages) if (p.annots.some(a => a.anl)) { pushUndo(p); p.annots = p.annots.filter(a => !a.anl); }
    if ($('#anlStamp').checked) anlList.forEach((g, i) => {
      const p = g.pages[0], w = 0.2, ar = (p.w && p.h) ? p.w / p.h : 0.707, h = 0.05 * ar;
      pushUndo(p); p.annots.push({ id: ++uid, type: 'stamp', anl: true, text: anlLabel(i), color: '#111111', x: 1 - w - 0.04, y: 0.025, w, h });
    });
  });
  state.dirty = true; renderAnns(); renderThumbs();
  const rows = anlList.map((g, i) => { const a = state.pages.indexOf(g.pages[0]) + 1, b = state.pages.indexOf(g.pages[g.pages.length - 1]) + 1; return { label: anlLabel(i), title: g.title, pages: g.pages.length === 1 ? '1 S.' : `${g.pages.length} S.`, from: a, to: b }; });
  if ($('#anlEach').checked) {
    const files = [];
    if ($('#anlIndex').checked) files.push({ name: BeaCheck.safeName(`Anlage_${pre}${'0'.repeat(width)}_Anlagenverzeichnis`) + '.pdf', data: await anlIndexPdf(rows) });   // sortiert vor Anlage 1
    for (const [i, g] of anlList.entries()) {
      status(`Speichere ${anlLabel(i)} (${i + 1} von ${anlList.length}) …`, i / anlList.length);
      const num = String(start + i).padStart(width, '0'), stem = BeaCheck.safeName(`Anlage_${pre}${num}_${g.title}`, BeaCheck.MAX_NAME - 4);
      files.push({ name: stem + '.pdf', data: await buildPdf(g.pages, state.meta, { pdfa: true, bea: true, onPage: () => {}, noOcr: true }) });
    }
    const batch = BeaCheck.checkBatch(files.map(f => ({ name: f.name, size: f.data.length }))), bad = [];
    for (const f of files) { const r = await BeaCheck.checkPdf(f.data, { name: f.name }); if (!r.ok) bad.push(f.name); }
    let where;
    if (state.outDir) { for (const f of files) await writeUnique(state.outDir, f.name, f.data); where = state.outDir.name; }
    else where = await deliver(Tools.zip(files), BeaCheck.safeName(`Anlagen_${pre}_${baseName()}`) + '.zip', 'application/zip');
    status(!where ? 'Speichern abgebrochen.' : `${anlList.length} Anlage(n) gespeichert: ${where}${batch.ok && !bad.length ? ' – beA-tauglich (ERVB 2025).' : ' – bitte prüfen: ' + [...batch.items.map(i => i.text), ...bad].join('; ')}`);
  } else if ($('#anlIndex').checked) {
    const before = state.pages.length;
    await importFiles([new File([await anlIndexPdf(rows)], 'Anlagenverzeichnis.pdf', { type: 'application/pdf' })]);
    const added = state.pages.splice(before);   // Verzeichnis an den Anfang
    state.pages.unshift(...added); state.sel = 0; refresh();
    status(`${anlList.length} Anlage(n) nummeriert, Anlagenverzeichnis als erste Seite eingefügt.`);
  } else status(`${anlList.length} Anlage(n) nummeriert.`);
};


/* ---------- Barrierefreiheit prüfen (Prüfbericht) und barrierefrei speichern ---------- */
$('#btnA11y').onclick = async () => {
  closeMenu();
  const pdfPage = state.pages.find(p => p.kind === 'pdf'), d = pdfPage && state.docs[pdfPage.docIdx];
  $('#a11yList').innerHTML = ''; $('#a11yHint').textContent = '';
  if (!d) {
    $('#a11yWhat').textContent = 'Gescannte Seiten / Fotos';
    $('#a11yHint').textContent = 'Aus Scans und Fotos erstellt PDFMy beim Speichern als PDF/A automatisch ein barrierefreies PDF: Texterkennung, Lesereihenfolge, Sprache, Titel und Tags (PDF/UA-1).';
  } else {
    $('#a11yWhat').textContent = `Prüfung von „${d.name}“ (Original)`;
    const pages = state.pages.filter(p => p.kind === 'pdf' && state.docs[p.docIdx] === d);
    const r = await A11yCheck.check(d.filled || d.bytes, { pages: pages.length, pagesWithText: pages.filter(p => p.native).length });
    $('#a11yList').innerHTML = r.map(x => `<li class="${x.ok === true ? 'ok' : x.ok === false ? 'bad' : 'info'}"><span class="st" aria-hidden="true">${x.ok === true ? '✓' : x.ok === false ? '✗' : 'i'}</span><span><b>${esc(x.title)}</b><span class="sr-only">: ${x.ok === true ? 'erfüllt' : x.ok === false ? 'nicht erfüllt' : 'Hinweis'}</span><small>${esc(x.detail)}</small></span></li>`).join('');
    const bad = r.filter(x => x.ok === false).length;
    $('#a11yHint').textContent = bad ? `${bad} Punkt(e) nicht erfüllt. „Barrierefrei speichern“ erzeugt ein PDF/A, das zugleich PDF/UA-1 ist – mit Texterkennung, Tags, Sprache und Titel.` : 'Dieses PDF erfüllt alle geprüften Punkte.';
  }
  $('#a11yDlg').showModal();
};
$('#a11yClose').onclick = () => $('#a11yDlg').close();
// PDF/A-Kurzprüfung (js/pdfacheck.js): Bericht wie bei der Barrierefreiheit; „Als PDF/A speichern“ repariert (Schriften, Farbprofil, Skripte …)
$('#btnPdfaCheck').onclick = async () => {
  closeMenu();
  const pdfPage = state.pages.find(p => p.kind === 'pdf'), d = pdfPage && state.docs[pdfPage.docIdx];
  $('#pdfaList').innerHTML = ''; $('#pdfaHint').textContent = '';
  if (!d) {
    $('#pdfaWhat').textContent = 'Gescannte Seiten / Fotos';
    $('#pdfaHint').textContent = 'Aus Scans und Fotos erstellt PDFMy beim Speichern als PDF/A automatisch ein gültiges PDF/A-2b (geprüft mit veraPDF).';
  } else {
    $('#pdfaWhat').textContent = `Prüfung von „${d.name}“ (Original)`;
    const r = await PdfACheck.check(d.filled || d.bytes);
    $('#pdfaList').innerHTML = r.items.map(x => `<li class="${x.ok === true ? 'ok' : x.ok === false ? 'bad' : 'info'}"><span class="st" aria-hidden="true">${x.ok === true ? '✓' : x.ok === false ? '✗' : 'i'}</span><span><b>${esc(x.title)}</b><span class="sr-only">: ${x.ok === true ? 'erfüllt' : x.ok === false ? 'nicht erfüllt' : 'Hinweis'}</span><small>${esc(x.detail)}</small></span></li>`).join('');
    const bad = r.items.filter(x => x.ok === false).length;
    $('#pdfaHint').textContent = bad ? `${bad} Punkt(e) nicht erfüllt${r.claim ? ` – obwohl die Datei sich als ${r.claim} ausgibt` : ''}. „Als PDF/A speichern“ erzeugt ein gültiges PDF/A-2b (zugleich barrierefrei nach PDF/UA-1).` : `Keine Auffälligkeiten${r.claim ? ` – die Datei ist als ${r.claim} gekennzeichnet` : ''}.`;
  }
  $('#pdfaDlg').showModal();
};
$('#pdfaClose').onclick = () => $('#pdfaDlg').close();
$('#pdfaFix').onclick = () => { $('#pdfaDlg').close(); openExport(); setRadio('x-format', 'pdfa'); updateExportUi(); status('Format PDF/A gewählt – Schriften werden eingebettet, Farbprofil, Kennung und Struktur ergänzt, Skripte entfernt.'); };
$('#a11yFix').onclick = () => { $('#a11yDlg').close(); a11yMake(); };
$('#btnA11yMake').onclick = () => { closeMenu(); a11yMake(); };


/* ---------- Eingangsstempel mit fortlaufender Eingangsnummer (beim Ablegen) ---------- */
async function stampInNo(pages, meta) {
  if (!S.inStamp || !pages.length) return;
  const year = new Date().getFullYear(), inNo = Journal.nextInNo(await journalAll().catch(() => jLocal()), year, LS.get('inNoLast', ''));
  LS.set('inNoLast', inNo); meta.inNo = inNo;
  const p = pages[0], w = 0.3, h = w * 0.3 * p.w / p.h;
  // oben rechts, wo meist Platz ist (Briefkopf-Bereich wird überdeckt, darum leicht transparent wirkende Farbe)
  p.annots = p.annots.filter(a => !a.inNo);
  p.annots.push({ id: ++uid, type: 'stamp', inNo: true, text: `EINGANG ${new Date().toLocaleDateString('de-DE')}\nNr. ${inNo}`, color: '#1d4ed8', x: 1 - w - 0.035, y: 0.02, w, h });
}


/* ---------- Aufbewahrung abgelaufen: Belege in einen Unterordner verschieben (nichts wird gelöscht) ---------- */
$('#jRetainMove').onclick = async () => {
  const list = jList.filter(e => !e.extra && e.file && !e.retainMoved && Journal.retention(e).expired);
  if (!list.length || !state.outDir) return;
  if (!confirm(`${list.length} Beleg(e) haben die gesetzliche Aufbewahrungsfrist überschritten.\n\nIn den Unterordner „_Aufbewahrung abgelaufen“ verschieben? Es wird nichts gelöscht – dort können Sie die Dateien prüfen und selbst entsorgen.\n\nHinweis: Die Fristen (8 Jahre Buchungsbelege, 6 Jahre Geschäftsbriefe, 10 Jahre Bücher) sind eine Orientierung, keine Rechtsberatung. Bei laufenden Prüfungen oder Verfahren gelten längere Fristen.`)) return;
  const target = await state.outDir.getDirectoryHandle('_Aufbewahrung abgelaufen', { create: true });
  let moved = 0;
  for (const e of list) {
    try {
      const parts = e.file.split('\\'); let dir = state.outDir;
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
      const name = parts[parts.length - 1], f = await (await dir.getFileHandle(name)).getFile();
      const w = await (await target.getFileHandle(name, { create: true })).createWritable(); await w.write(await f.arrayBuffer()); await w.close();
      await dir.removeEntry(name);
      await updateEntry(e.id, { file: '_Aufbewahrung abgelaufen\\' + name, retainMoved: true });
      moved++;
    } catch (err) { console.warn('Verschieben', e.file, err); }
  }
  jList = await journalAll(); renderJournal(); renderDeadlines();
  status(`${moved} Beleg(e) nach „_Aufbewahrung abgelaufen“ verschoben.`);
};


/* ---------- Kontoauszug abgleichen: bezahlte Rechnungen im Posteingangsbuch erkennen ---------- */
$('#jBank').onclick = () => $('#jBankFile').click();
$('#jBankFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const buf = new Uint8Array(await f.arrayBuffer());
  let text = new TextDecoder('utf-8').decode(buf); if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buf);   // ältere CSV-Exporte
  const txs = Bank.parse(text, f.name);
  if (!txs.length) return toast('In der Datei wurden keine Umsätze gefunden. Bitte im Online-Banking „CSV“ oder „CAMT (XML)“ exportieren.', 7000);
  const matches = Bank.match(txs, await journalAll());
  const eur = n => I18N.fmtMoney(Math.abs(n)), de = d => d ? I18N.fmtDate(d) : '';
  $('#bankWhat').textContent = `${txs.length} Umsätze gelesen (${f.name}). ${matches.length ? `${matches.length} offene Rechnung(en) wurden bezahlt:` : 'Keine offene Rechnung aus dem Posteingangsbuch passt dazu.'}`;
  $('#bankList').innerHTML = matches.map((m, i) => `<label class="bankrow"><input type="checkbox" data-i="${i}" ${m.sure ? 'checked' : ''}>
    <span><b>${esc([m.entry.type, m.entry.sender].filter(Boolean).join(' · '))}</b>${m.sure ? '' : ' <span class="qbadge" style="background:#fff3c4;color:#7a5a00">prüfen</span>'}
    <small>bezahlt am ${de(m.tx.date)} an ${esc(m.tx.name || '–')} · ${esc(m.why)}${m.tx.purpose ? ` · „${esc(m.tx.purpose.slice(0, 60))}“` : ''}</small></span><span class="amt">${eur(m.tx.amount)}</span></label>`).join('');
  $('#bankOk').hidden = !matches.length;
  $('#bankOk').onclick = async () => {
    const pick = [...document.querySelectorAll('#bankList input:checked')].map(x => matches[+x.dataset.i]);
    for (const m of pick) await updateEntry(m.entry.id, { status: 'bezahlt', done: true, paidOn: m.tx.date });
    $('#bankDlg').close(); jList = await journalAll(); renderJournal(); renderDeadlines();
    status(`${pick.length} Rechnung(en) als bezahlt markiert.`);
  };
  $('#bankCancel').onclick = () => $('#bankDlg').close();
  $('#bankDlg').showModal();
};


/* ---------- Wiedervorlage: Brief erscheint am gewählten Tag wieder auf der Startseite ---------- */
const isoIn = days => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
$('#m-wv').addEventListener('input', e => { state.wv = e.target.value; });
$('#m-wvq').onchange = e => { if (!e.target.value) return; state.wv = $('#m-wv').value = isoIn(+e.target.value); e.target.value = ''; status(`Wiedervorlage am ${fmtDate(state.wv)} – der Brief erscheint dann wieder auf der Startseite.`); };
$('#jBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-wvclear]'); if (!b) return;
  e.stopPropagation(); await updateEntry(b.dataset.wvclear, { wv: '' }); jList = await journalAll(); renderJournal();
});


/* ---------- Ablage je Firma: mehrere Ablageordner, Zuordnung über den Empfänger im Anschriftfeld ---------- */
let routes = [];   // [{ key: 'Mentor GmbH', handle: FileSystemDirectoryHandle }]
idb.get('routes').then(r => { routes = Array.isArray(r) ? r.filter(x => x?.handle) : []; renderRoutes(); }).catch(() => {});
function renderRoutes() {
  $('#routeList').innerHTML = routes.map((r, i) => `<div class="routerow"><span><b>${esc(r.key)}</b> → ${esc(r.handle.name)}</span><button type="button" class="linkbtn" data-rdel="${i}">entfernen</button></div>`).join('');
  $('#routeAdd').hidden = !window.showDirectoryPicker;
}
$('#routeList').addEventListener('click', e => { const b = e.target.closest('[data-rdel]'); if (!b) return; routes.splice(+b.dataset.rdel, 1); idb.set('routes', routes); renderRoutes(); });
$('#routeAdd').onclick = async () => {
  const key = (prompt('Firmenname, wie er im Anschriftfeld der Briefe steht (z. B. „Mentor GmbH“ oder „Mertens GmbH“):') || '').trim();
  if (key.length < 3) return;
  try { const handle = await showDirectoryPicker({ id: 'mpdf-route', mode: 'readwrite' }); routes.push({ key, handle }); idb.set('routes', routes); renderRoutes(); status(`Briefe an „${key}“ werden in „${handle.name}“ abgelegt.`); }
  catch (e) { if (e.name !== 'AbortError') status(e.message); }
};
// Nach der Briefanalyse: passenden Ablageordner wählen (Rechte werden beim Ablegen – mit Klick – abgefragt)
let routeBase = null;
window.routeForLetter = () => {
  if (!routes.length || !state.pages.length) return;
  const i = Letter.pickRoute(pageText(state.pages.find(p => !p.blank)), routes);
  if (i < 0) { if (routeBase && state.outDir !== routeBase) { state.outDir = routeBase; } return; }
  if (!routeBase || !routes.some(r => r.handle === state.outDir)) routeBase = state.outDir;
  if (state.outDir !== routes[i].handle) { state.outDir = routes[i].handle; state.route = routes[i].key; status(`Brief an ${routes[i].key} – Ablage: ${routes[i].handle.name}`); }
};


/* ---------- E-Rechnung schreiben (ZUGFeRD-PDF / XRechnung nach EN 16931) – lokal erzeugt ---------- */
const EI_S = ['name', 'street', 'zip', 'city', 'vatId', 'taxNo', 'iban', 'bic', 'contact', 'phone', 'email'], EI_B = ['name', 'street', 'zip', 'city', 'email'];
const eur = n => I18N.fmtMoney(n);   // nur Anzeige im Formular; die Rechnung selbst formatiert deutsch (money)
function einvLine(l = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input data-k="name" aria-label="Bezeichnung" value="${esc(l.name || '')}" placeholder="z. B. Beratung"></td>
    <td><input data-k="qty" aria-label="Menge" type="number" min="0" step="any" value="${l.qty ?? 1}" style="width:80px"></td>
    <td><select data-k="unit" aria-label="Einheit">${['Stück', 'Std', 'Tag', 'Monat', 'Pauschale', 'kg', 'm', 'km', 'l'].map(u => `<option ${u === (l.unit || 'Stück') ? 'selected' : ''}>${u}</option>`).join('')}</select></td>
    <td><input data-k="price" aria-label="Einzelpreis netto in Euro" type="number" step="0.01" value="${l.price ?? ''}" placeholder="0,00" style="width:120px"></td>
    <td><select data-k="vat" aria-label="Umsatzsteuer"><option value="19">19 %</option><option value="7" ${l.vat == 7 ? 'selected' : ''}>7 %</option><option value="0" ${l.vat == 0 ? 'selected' : ''}>0 % (Kleinunternehmer)</option></select></td>
    <td class="num" data-sum></td><td><button type="button" class="linkbtn" data-del aria-label="Position entfernen" title="Position entfernen">✕</button></td>`;
  $('#ei-lines').append(tr);
}
function einvRead() {
  const v = id => $('#' + id).value.trim(), today = new Date(), days = +$('#ei-days').value;
  const due = (() => { const d = new Date(v('ei-date') || today); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); })();
  return {
    number: v('ei-no'), date: v('ei-date'), delivery: v('ei-deliv'), due: days ? due : '', buyerRef: v('ei-ref'),
    terms: days ? `Zahlbar ohne Abzug innerhalb von ${days} Tagen bis ${due.split('-').reverse().join('.')}` : 'Zahlbar sofort ohne Abzug',
    seller: Object.fromEntries(EI_S.map(k => [k, v('ei-s-' + k)])), buyer: Object.fromEntries(EI_B.map(k => [k, v('ei-b-' + k)])),
    lines: [...$('#ei-lines').children].map(tr => Object.fromEntries([...tr.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.dataset.k === 'name' || i.dataset.k === 'unit' ? i.value.trim() : i.value === '' ? '' : +i.value])))
      .filter(l => l.name || l.price),
  };
}
function einvRender() {
  const inv = einvRead(), t = EInvoiceOut.totals(inv);
  [...$('#ei-lines').children].forEach(tr => { const q = +tr.querySelector('[data-k=qty]').value || 0, p = +tr.querySelector('[data-k=price]').value || 0; tr.querySelector('[data-sum]').textContent = eur(Math.round(q * p * 100) / 100); });
  $('#ei-sum').innerHTML = `Netto ${eur(t.net)}<br>${t.taxes.map(x => x.cat === 'E' ? 'Keine USt (§ 19 UStG)' : `USt ${x.rate} % auf ${eur(x.basis)}: ${eur(x.tax)}`).join('<br>')}<br><b>Gesamt ${eur(t.gross)}</b>`;
}
function openEinv() {
  closeMenu();
  const s = LS.get('einvSeller', null), today = todayStr();   // lokaler Kalendertag (nicht UTC)
  for (const k of EI_S) $('#ei-s-' + k).value = s?.[k] || '';
  if (!s) { const own = (LS.get('ownAddress', '') || '').split('\n'); $('#ei-s-name').value = own[0] || ''; $('#ei-s-street').value = own[1] || ''; const m = (own[2] || '').match(/^(\d{5})\s+(.+)$/); if (m) { $('#ei-s-zip').value = m[1]; $('#ei-s-city').value = m[2]; } $('#ei-s-contact').value = LS.get('signName', '') || ''; }
  for (const k of EI_B) $('#ei-b-' + k).value = '';
  $('#ei-ref').value = ''; $('#ei-no').value = EInvoiceOut.nextNumber(LS.get('einvLast', ''), new Date().getFullYear());
  $('#ei-date').value = $('#ei-deliv').value = today;
  $('#ei-lines').innerHTML = ''; einvLine(); $('#ei-err').innerHTML = '';
  einvRender(); $('#einvDlg').showModal(); $(s ? '#ei-b-name' : '#ei-s-name').focus();
}
$('#tileEinv').onclick = openEinv; $('#btnEinv').onclick = openEinv;
$('#ei-add').onclick = () => { einvLine(); einvRender(); $('#ei-lines').lastElementChild.querySelector('input').focus(); };
$('#ei-lines').addEventListener('click', e => { if (e.target.closest('[data-del]')) { e.target.closest('tr').remove(); if (!$('#ei-lines').children.length) einvLine(); einvRender(); } });
$('#einvForm').addEventListener('input', einvRender);
$('#ei-cancel').onclick = () => $('#einvDlg').close();
$('#einvForm').onsubmit = async e => {
  e.preventDefault();
  const inv = einvRead(), xr = document.querySelector('input[name=ei-fmt]:checked').value === 'xrechnung';
  const r = EInvoiceOut.build(inv, { xrechnung: xr });
  if (r.errors.length) { $('#ei-err').innerHTML = r.errors.map(x => `<li>${esc(x)}</li>`).join(''); return; }
  LS.set('einvSeller', inv.seller); LS.set('einvLast', inv.number);
  const base = `${inv.number}_${(inv.buyer.name || 'Rechnung').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40)}`;
  const xmlBytes = new TextEncoder().encode(r.xml);
  $('#einvDlg').close();
  let where;
  if (xr) where = await deliver(xmlBytes, base + '_XRechnung.xml', 'application/xml', null, true);
  else { status('Erzeuge ZUGFeRD-PDF …'); where = await deliver(await buildInvoicePdf(inv, r.totals, xmlBytes), base + '.pdf', 'application/pdf', null, true); }
  status(where ? `E-Rechnung ${inv.number} (${xr ? 'XRechnung' : 'ZUGFeRD'}) gespeichert: ${where}` : 'Speichern abgebrochen.');
};
// Lesbare Rechnung (DIN 5008, Briefbogen) als PDF/A-3b mit eingebetteter factur-x.xml
async function buildInvoicePdf(inv, t, xmlBytes) {
  const doc = await PDFDocument.create(); doc.registerFontkit(await loadFontkit());
  const font = await doc.embedFont(await asset('font', 'vendor/DejaVuSans.ttf'), { subset: true }), cs = new Set(font.getCharacterSet());
  const safe = x => [...String(x ?? '')].filter(ch => cs.has(ch.codePointAt(0))).join('');
  const W = 595.28, H = 841.89, L = mm(25), R = W - mm(20), dark = rgb(0.1, 0.1, 0.1), grey = rgb(0.4, 0.4, 0.4), s = inv.seller, b = inv.buyer;
  let bg = null; if (letterhead) { try { [bg] = await doc.embedPdf(letterhead.bytes, [0]); } catch { bg = null; } }
  let page;
  const txt = (x, at, yTop, size = 10, bold = false, color = dark, right = false) => { const str = safe(x); const px = right ? at - font.widthOfTextAtSize(str, size) : at; page.drawText(str, { x: px, y: H - yTop, size, font, color }); if (bold) page.drawText(str, { x: px + 0.3, y: H - yTop, size, font, color }); };
  const footer = () => {
    const f = [s.name, s.street, `${s.zip} ${s.city}`, s.vatId && 'USt-IdNr. ' + s.vatId, s.taxNo && 'St.-Nr. ' + s.taxNo, s.iban && 'IBAN ' + s.iban, s.bic && 'BIC ' + s.bic].filter(Boolean).join(' · ');
    wrapLines(safe(f), R - L, x => font.widthOfTextAtSize(x, 7.5)).forEach((l, i) => txt(l, L, H - mm(14) + i * 10, 7.5, false, grey));
  };
  const newPage = () => { page = doc.addPage([W, H]); if (bg) page.drawPage(bg, { x: 0, y: 0, width: W, height: H }); for (const y of [105, 210]) page.drawLine({ start: { x: mm(3), y: H - mm(y) }, end: { x: mm(8), y: H - mm(y) }, thickness: 0.5, color: rgb(0.55, 0.55, 0.55) }); footer(); };
  newPage();
  if (!bg) { txt(s.name, L, mm(20), 15, true); txt([s.street, `${s.zip} ${s.city}`, s.phone, s.email].filter(Boolean).join(' · '), L, mm(26), 8.5, false, grey); }
  txt([s.name, s.street, `${s.zip} ${s.city}`].filter(Boolean).join(' · '), L, mm(60), 7, false, grey);
  [b.name, b.street, `${b.zip} ${b.city}`].filter(x => x && x.trim()).forEach((l, i) => txt(l, L, mm(66.5) + i * 13.5, 11));
  const de = d => d ? d.split('-').reverse().join('.') : '';
  [['Rechnungs-Nr.', inv.number], ['Datum', de(inv.date)], ['Leistungsdatum', de(inv.delivery)], ['Ihr Zeichen', inv.buyerRef], ['Ansprechpartner', s.contact]].filter(([, v]) => v)
    .forEach(([k, v], i) => { txt(k + ':', mm(125), mm(52) + i * 12.5, 9, false, grey); txt(v, mm(155), mm(52) + i * 12.5, 9); });
  txt(`Rechnung ${inv.number}`, L, mm(105), 15, true);
  // Positionen
  const cols = { pos: L, name: L + 26, qty: R - 215, unit: R - 175, price: R - 85, vat: R - 55, sum: R };
  let y = mm(118);
  const head = () => { [['Pos.', cols.pos], ['Bezeichnung', cols.name], ['Menge', cols.qty, 1], ['Einheit', cols.unit], ['Einzelpreis', cols.price, 1], ['USt', cols.vat, 1], ['Betrag', cols.sum, 1]].forEach(([h, x, r]) => txt(h, x, y, 8.5, true, grey, !!r)); y += 6; page.drawLine({ start: { x: L, y: H - y }, end: { x: R, y: H - y }, thickness: 0.6, color: grey }); y += 13; };
  head();
  const money = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const l of t.lines) {
    const nameLines = wrapLines(safe(l.name), cols.qty - 40 - cols.name, x => font.widthOfTextAtSize(x, 9.5));
    if (y + nameLines.length * 12 > H - mm(45)) { newPage(); y = mm(30); head(); }
    txt(String(l.n), cols.pos, y, 9.5); nameLines.forEach((nl, i) => txt(nl, cols.name, y + i * 12, 9.5));
    txt(String(l.qty).replace('.', ','), cols.qty, y, 9.5, false, dark, true); txt(l.unit || 'Stück', cols.unit, y, 9.5);
    txt(money(l.price), cols.price, y, 9.5, false, dark, true); txt(l.vat + ' %', cols.vat, y, 9.5, false, dark, true); txt(money(l.net), cols.sum, y, 9.5, false, dark, true);
    y += Math.max(1, nameLines.length) * 12 + 4;
  }
  page.drawLine({ start: { x: L, y: H - y + 6 }, end: { x: R, y: H - y + 6 }, thickness: 0.6, color: grey }); y += 10;
  if (y > H - mm(80)) { newPage(); y = mm(30); }
  const sumRow = (k, v, bold) => { txt(k, R - 200, y, 10, bold); txt(v, R, y, 10, bold, dark, true); y += 15; };
  sumRow('Nettobetrag', money(t.net) + ' €');
  for (const x of t.taxes) sumRow(x.cat === 'E' ? 'Umsatzsteuer' : `USt ${x.rate} % auf ${money(x.basis)} €`, money(x.tax) + ' €');
  sumRow('Gesamtbetrag', money(t.gross) + ' €', true);
  y += 10;
  const notes = [inv.terms + '.', `Bitte überweisen Sie ${money(t.gross)} € unter Angabe der Rechnungsnummer ${inv.number} auf: IBAN ${s.iban}${s.bic ? ', BIC ' + s.bic : ''}.`,
    t.taxes.some(x => x.cat === 'E') ? EInvoiceOut.KU_REASON + '.' : '', 'Diese Rechnung enthält die strukturierten Rechnungsdaten nach EN 16931 (ZUGFeRD/Factur-X) als eingebettete Datei „factur-x.xml“.'].filter(Boolean);
  for (const n of notes) for (const l of wrapLines(safe(n), R - L - 110, x => font.widthOfTextAtSize(x, 9))) { txt(l, L, y, 9); y += 12.5; }
  // GiroCode zum Bezahlen mit der Banking-App
  try {
    const pl = Letter.epcPayload({ sender: s.name, iban: s.iban, amount: money(t.gross) + ' EUR', invoiceNo: inv.number });
    if (pl) {
      await loadQrcode(); qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      const q = qrcode(0, 'M'); q.addData(pl, 'Byte'); q.make();
      const n = q.getModuleCount(), size = 82, cell = size / n, x0 = R - size, y0 = H - (y - 12.5 * notes.length) - size + 20;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) page.drawRectangle({ x: x0 + c * cell, y: y0 + size - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: rgb(0, 0, 0) });
      txt('GiroCode', x0, H - y0 + 9, 7, false, grey);
    }
  } catch (e) { console.warn('GiroCode', e); }
  const now = new Date(), title = `Rechnung ${inv.number}`;
  doc.setTitle(title); doc.setAuthor(s.name); doc.setSubject('Rechnung'); doc.setKeywords(['Rechnung', 'ZUGFeRD', 'Factur-X', inv.number]);
  doc.setLanguage('de-DE'); doc.setCreator(APP.name); doc.setProducer(APP.name + ' (pdf-lib)'); doc.setCreationDate(now); doc.setModificationDate(now);
  await makePdfA(doc, { title, author: s.name, subject: 'Rechnung', keywords: `Rechnung ZUGFeRD Factur-X ${inv.number}`, now, ua: false, part: 3, facturx: { xml: xmlBytes, level: 'EN 16931' } });
  return doc.save();
}


/* ---------- Präsentationsmodus: Seiten bildschirmfüllend (F5), Fernbedienung, Wischen, B = schwarz ---------- */
let pres = null;   // { i, cache: Map }
const presPages = () => state.pages.filter(p => !p.blank || p.keepBlank);
// Seite in Bildschirmauflösung vorbereiten (mit Anmerkungen), zwischengespeichert
async function presCanvas(p) {
  const key = p.id + ':' + p.rotation + ':' + p.annots.length;
  let c = pres.cache.get(key); if (c) return c;
  const W = innerWidth * devicePixelRatio, H = innerHeight * devicePixelRatio;
  if (p.kind === 'pdf') {
    const pg = await state.docs[p.docIdx].js.getPage(p.pageIdx + 1), vp = pg.getViewport({ scale: 1, rotation: p.rotation });
    c = await renderPdf(p, 72 * Math.min(W / vp.width, H / vp.height));
  } else { const src = p.processed, k = Math.min(W / src.width, H / src.height); c = Imaging.canvas(Math.round(src.width * k), Math.round(src.height * k)); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); }
  if (p.annots.length) { const k = Imaging.canvas(c.width, c.height), x = k.getContext('2d'); x.drawImage(c, 0, 0); await drawAnnotsCanvas(x, p, k.width, k.height); c = k; }
  if (pres) { pres.cache.set(key, c); if (pres.cache.size > 8) pres.cache.delete(pres.cache.keys().next().value); }
  return c;
}
async function presRender() {
  if (!pres) return;
  const pages = presPages(), i = pres.i, p = pages[i]; if (!p) return;
  $('#presNum').textContent = `${i + 1} / ${pages.length}`;
  const c = await presCanvas(p);
  if (!pres || pres.i !== i) return;   // inzwischen weitergeblättert
  const cv = $('#presCv'), k = Math.min(innerWidth * devicePixelRatio / c.width, innerHeight * devicePixelRatio / c.height);
  cv.width = c.width; cv.height = c.height;
  cv.style.width = Math.round(c.width * k / devicePixelRatio) + 'px'; cv.style.height = Math.round(c.height * k / devicePixelRatio) + 'px';
  cv.getContext('2d').drawImage(c, 0, 0);
  if (pages[i + 1]) presCanvas(pages[i + 1]).catch(() => {});   // nächste Seite schon vorbereiten
}
function presGo(d) {
  if (!pres) return;
  const n = presPages().length, i = Math.max(0, Math.min(n - 1, pres.i + d));
  $('#presBlack').hidden = true;
  if (i !== pres.i) { pres.i = i; presRender(); }
}
async function startPresent() {
  if (!state.pages.length) return toast('Zuerst ein PDF oder Bilder öffnen.', 4000);
  closeMenu();
  const visible = state.pages.filter(p => !p.blank || p.keepBlank);
  pres = { i: Math.max(0, visible.indexOf(cur())), cache: new Map() };
  $('#present').hidden = false; $('#presBlack').hidden = true; $('#present').focus();
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch {}
  await new Promise(r => setTimeout(r, 120));   // Vollbildgröße abwarten
  presRender();
}
function endPresent() {
  if (!pres) return;
  const visible = state.pages.filter(p => !p.blank || p.keepBlank), p = visible[pres.i];
  pres = null; $('#present').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (p) { state.sel = state.pages.indexOf(p); refresh(); }
}
$('#btnPresent').onclick = startPresent;

/* ---------- Dokumenteigenschaften (wie Acrobat, Strg+D): Beschreibung bearbeiten, Dateiangaben ansehen ---------- */
const pdfDate = v => {
  // PDF-Datum D:JJJJMMTThhmmss mit Zeitzone (Z, +hh'mm', -hh'mm') – Anzeige in Ortszeit
  const m = typeof v === 'string' && v.match(/^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/);
  if (!m) return '';
  const parts = [+m[1], (+m[2] || 1) - 1, +m[3] || 1, +m[4] || 0, +m[5] || 0, +m[6] || 0];
  let d;
  if (m[7]) { const off = m[7] === '+' || m[7] === '-' ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0; d = new Date(Date.UTC(...parts) - off * 60000); }
  else d = new Date(...parts);
  return isNaN(d) ? '' : I18N.fmtDateTime(d, { dateStyle: 'medium', timeStyle: m[4] ? 'short' : undefined });
};
function paperName(wmm, hmm) {
  const [a, b] = [Math.min(wmm, hmm), Math.max(wmm, hmm)], near = (x, y) => Math.abs(a - x) <= 2 && Math.abs(b - y) <= 2;
  const n = [['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['Letter', 216, 279], ['Legal', 216, 356]].find(([, x, y]) => near(x, y));
  return n ? n[0] + (wmm > hmm ? ' quer' : '') : '';
}
async function openProps() {
  if (!state.pages.length) return;
  const { title, author, subject, keywords } = await docProps(state.pages, state.meta);
  $('#pr-title').value = title; $('#pr-author').value = author || ''; $('#pr-subject').value = subject || ''; $('#pr-keywords').value = keywords.join(', ');
  const rows = [], add = (k, v) => { if (v !== '' && v != null) rows.push(`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`); };
  const ids = [...new Set(state.pages.map(p => p.kind === 'pdf' ? p.docIdx : -1))];
  const pdfIds = ids.filter(i => i >= 0), scans = state.pages.filter(p => p.kind !== 'pdf').length;
  add('Seiten', state.pages.length);
  if (pdfIds.length === 1 && !scans) {
    const d = state.docs[pdfIds[0]];
    d.meta ||= await d.js.getMetadata().catch(() => null);
    const info = d.meta?.info || {}, md = d.meta?.metadata;
    add('Datei', d.name); add('Dateigröße', Tools.formatBytes(d.bytes?.length || d.bytes?.byteLength || 0));
    let pdfa = ''; try { const part = md?.get('pdfaid:part'); if (part) pdfa = `PDF/A-${part}${(md.get('pdfaid:conformance') || '').toLowerCase()}`; } catch {}
    add('PDF-Version', [info.PDFFormatVersion, pdfa].filter(Boolean).join(' · '));
    add('Erstellt', pdfDate(info.CreationDate)); add('Geändert', pdfDate(info.ModDate));
    add('Erstellt mit', info.Creator); add('PDF-Erzeuger', info.Producer);
    add('Sicherheit', d.unlocked ? 'Passwortgeschützt (für diese Sitzung entsperrt)' : info.IsEncrypted ? 'Verschlüsselt (Rechte eingeschränkt)' : 'Kein Passwortschutz');
    if (info.IsAcroFormPresent) add('Formular', 'Ausfüllbare Felder vorhanden');
    if (d.repaired) add('Reparatur', 'Die Datei war beschädigt und wurde beim Öffnen repariert');
  } else {
    add('Zusammengestellt aus', [pdfIds.length && `${pdfIds.length} ${pdfIds.length === 1 ? 'PDF' : 'PDFs'}`, scans && `${scans} ${scans === 1 ? 'Scan/Bild' : 'Scans/Bildern'}`].filter(Boolean).join(' und '));
  }
  try {
    const p = state.pages[Math.max(0, state.sel)];
    let w, h;
    if (p.kind === 'pdf') { const vp = (await state.docs[p.docIdx].js.getPage(p.pageIdx + 1)).getViewport({ scale: 1, rotation: p.rotation || 0 }); w = vp.width * 25.4 / 72; h = vp.height * 25.4 / 72; }
    if (w) { const n = paperName(w, h); add('Seitengröße (diese Seite)', `${Math.round(w)} × ${Math.round(h)} mm${n ? ' (' + n + ')' : ''}`); }
  } catch {}
  add('Sprache', 'Deutsch (wird beim Speichern gesetzt)');
  $('#propInfo').innerHTML = rows.join('');
  document.querySelectorAll('dialog[open]').forEach(x => x.close()); closeMenu?.();
  $('#propDlg').showModal(); $('#pr-title').focus(); $('#pr-title').select();
}
$('#btnProps').onclick = openProps;

/* ---------- Unterschriftsstellen automatisch finden (wie „Hier unterschreiben“ bei DocuSign) ----------
   Sucht in Textebene bzw. Texterkennung: Beschriftungen („Unterschrift“, „Unterzeichner“, „Ort, Datum“) und Unterstrich-/Punktlinien
   daneben, darüber oder darunter. Nur kurze Beschriftungen zählen – Fließtext („… die Unterschrift des Kunden …“) nicht. */
const SPOT_SIGN = /(unterschrift|unterzeichne|signatur\b|signature|sign here|gez\.)/i, SPOT_DATE = /(ort\s*[,/]?\s*datum|^datum\b|\bdate\b)/i;
// „Ort“ allein (eigenes Feld neben „Datum“); lange Beschriftungen zählen, wenn sie mit „Unterschrift …“ beginnen
const SPOT_PLACE = /^(ort|place)\s*[:.]?$/i, SPOT_SIGN_START = /^(unterschrift|unterzeichne|signatur\b|signature|gez\.)/i;
async function spotsFor(p) {
  if (p.signSpots) return p.signSpots;
  let words = p.ocr?.words || p.nwords;
  if (!words && p.kind === 'pdf' && p.native) { p.nwords = await nativeWords(p).catch(() => null) || []; words = p.nwords; }
  words = words || [];
  const segs = [], labels = [];
  for (const w of words) {
    const t = w.t || '';
    // Linien „_____“ oder „.........“ innerhalb eines Textabschnitts – Lage anteilig aus der Zeichenposition
    for (const m of t.matchAll(/_{5,}|\.{8,}|…{3,}/g)) {
      const k = w.w / Math.max(1, t.length);
      segs.push({ x: w.x + m.index * k, y: w.y, w: m[0].length * k, h: w.h, before: t.slice(0, m.index) });
    }
    const clean = t.replace(/[_.…]{4,}/g, ' ').trim();
    if (clean && clean.length <= 40) {
      const kind = SPOT_PLACE.test(clean) ? 'place' : SPOT_DATE.test(clean) ? 'date' : SPOT_SIGN.test(clean) ? 'sign' : null;
      if (kind) labels.push({ ...w, kind, clean });
    } else if (clean && clean.length <= 160 && SPOT_SIGN_START.test(clean)) labels.push({ ...w, kind: 'sign' });   // „Unterschrift des Grundstückseigentümers …“
  }
  const near = (a, b) => Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) < Math.max(a.h, b.h) * 0.8;
  // „Ort“ allein gehört nur dann zur Unterschrift, wenn in derselben Zeile ein Datum verlangt wird (sonst: Anschrift → normales Formularfeld)
  for (let i = labels.length - 1; i >= 0; i--) if (labels[i].kind === 'place' && !labels.some(o => o.kind === 'date' && near(o, labels[i]))) labels.splice(i, 1);
  const spots = [];
  for (const sg of segs) {
    if (sg.w < 0.08) continue;
    // Beschriftung im selben Textabschnitt, links in derselben Zeile, direkt darunter oder darüber
    let kind = SPOT_DATE.test(sg.before) ? 'date' : SPOT_SIGN.test(sg.before) ? 'sign' : null;
    if (!kind) {
      const l = labels.filter(l => (near(l, sg) && l.x + l.w <= sg.x + 0.02) || (Math.abs(l.y - (sg.y + sg.h)) < 0.035 && l.x < sg.x + sg.w && l.x + l.w > sg.x - 0.02) || (Math.abs(sg.y - (l.y + l.h)) < 0.03 && l.x < sg.x + sg.w && l.x + l.w > sg.x - 0.02))
        .sort((a, b) => Math.abs(a.y - sg.y) - Math.abs(b.y - sg.y))[0];
      kind = l?.kind || null; if (l) l.used = true;
    }
    if (kind) spots.push({ kind, x: sg.x, y: sg.y, w: Math.min(sg.w, 0.45), h: sg.h, line: true });
  }
  // Beschriftung ohne Linie (Linie ist oft gezeichnet, nicht Text): Platz direkt darüber – bis zur nächsten Beschriftung derselben Zeile
  for (const l of labels) {
    // schon eine Stelle für genau diese Beschriftung? (gleiche Zeile UND waagerecht überlappend – Nachbarn wie „Datum“ zählen nicht)
    const overX = s => s.x < l.x + l.w && s.x + s.w > l.x;
    if (l.used || spots.some(s => (near(s, l) && overX(s)) || (Math.abs(l.y - (s.y + s.h)) < 0.035 && Math.abs(l.x - s.x) < 0.03))) continue;
    // Breite: bis zur nächsten Beschriftung derselben Zeile (so lang wie die gezeichnete Linie), sonst nach Art
    const next = labels.filter(o => o !== l && near(o, l) && o.x > l.x + 0.01).map(o => o.x - 0.015);
    const w = next.length ? Math.min(...next) - l.x : Math.min(1 - 0.02 - l.x, Math.max(Math.min(l.w, 0.45), l.kind === 'sign' ? 0.26 : 0.16));
    spots.push({ kind: l.kind, x: l.x, y: Math.max(0.01, l.y - 0.006), w: Math.max(0.06, Math.min(w, 0.6)), h: 0.004, line: false });
  }
  // Doppelte (gleiche Stelle) entfernen, von oben nach unten
  return p.signSpots = spots.filter((s, i) => !spots.some((o, j) => j < i && Math.abs(o.x - s.x) < 0.03 && Math.abs(o.y - s.y) < 0.02)).sort((a, b) => a.y - b.y || a.x - b.x);
}
// Oberkante für Text, der auf der Linie steht (Unterstrich-Linie im Text bzw. gezeichnete Linie über der Beschriftung)
const spotTextY = (p, s, fs) => Math.max(0, (s.line ? s.y + s.h * 0.9 : s.y + s.h) - fs * (p.w || 1) / (p.h || 1.414) * 1.2);
// Ist an der Stelle schon unterschrieben bzw. ein Datum gesetzt?
const spotDone = (p, s) => p.annots.some(a => (s.kind === 'sign' ? a.type === 'sign' : a.type === 'text') && a.x < s.x + s.w && a.x + (a.w || 0.15) > s.x && Math.abs((a.y + (a.h || 0.02)) - (s.y + s.h)) < 0.06);
let spotsBusy = null, spotsShownHere = false;
window.findSignSpots = () => spotsBusy ||= (async () => {
  try { for (const p of state.pages) await spotsFor(p); } catch (e) { console.warn('Unterschriftsstellen', e); }
  spotsBusy = null; spotsSummary(); if (state.tool === 'sign') renderAnns();
})();
function openSpots() { const out = []; state.pages.forEach((p, i) => (p.signSpots || []).forEach(s => { if (!spotDone(p, s)) out.push({ i, p, s }); })); return out; }
function spotsSummary() {
  const open = openSpots(), signs = open.filter(o => o.s.kind === 'sign');
  $('#signNextSpot').hidden = !open.length;
  $('#signNextSpot').textContent = open.length ? `Nächste Stelle (${open.length})` : 'Nächste Stelle';
  const sm = $('#smSpots'); if (sm) { sm.hidden = !open.length; const pages = [...new Set(open.map(o => o.i + 1))]; sm.textContent = open.length ? `${signs.length ? `${signs.length === 1 ? `${signs.length} Unterschriftsstelle` : `${signs.length} Unterschriftsstellen`}` : ''}${signs.length && open.length > signs.length ? ' und ' : ''}${open.length > signs.length ? `${open.length - signs.length}× Ort/Datum` : ''} gefunden (Seite ${pages.join(', ')}) – gelb markiert. Ein Klick auf „Hier unterschreiben“ setzt die Unterschrift genau dort.` : ''; }
}
window.renderSignSpots = (ov, p) => {
  if (state.tool !== 'sign' || !p.signSpots) return;
  p.signSpots.forEach((s, k) => {
    if (spotDone(p, s)) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'signspot' + (s.kind !== 'sign' ? ' date' : ''); b.dataset.spot = k;
    b.textContent = s.kind === 'date' ? '📅 Datum einsetzen' : s.kind === 'place' ? '📍 Ort einsetzen' : '✍ Hier unterschreiben';
    b.style.left = (s.x * 100) + '%'; b.style.top = (s.y * 100) + '%';
    b.setAttribute('aria-label', s.kind === 'date' ? 'Hier das Datum einsetzen' : s.kind === 'place' ? 'Hier den Ort einsetzen' : `Hier unterschreiben (${SIG_KINDS[$('#signKind').value] || 'Unterschrift'})`);
    ov.append(b);
    if (s.line) { const l = document.createElement('div'); l.className = 'spotline'; Object.assign(l.style, { left: s.x * 100 + '%', top: s.y * 100 + '%', width: s.w * 100 + '%', height: s.h * 100 + '%' }); ov.append(l); }
  });
};
// Klick auf ein Schild: Unterschrift passend auf die Linie setzen bzw. Datum einsetzen
$('#overlay').addEventListener('click', e => {
  const b = e.target.closest('.signspot'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const p = cur(), s = p?.signSpots?.[+b.dataset.spot]; if (!s) return;
  if (s.kind === 'place') {   // eigenes Feld „Ort“: gespeicherten Ort einsetzen (einmal fragen und merken)
    let place = (LS.get('signPlace', '') || '').trim();
    if (!place) { place = (prompt('Ort für Ihre Unterschriften (wird gespeichert):', '') || '').trim().slice(0, 60); if (!place) return; LS.set('signPlace', place); }
    pushUndo(p);
    const fs = 0.016;
    p.annots.push({ id: ++uid, type: 'text', x: s.x + 0.005, y: spotTextY(p, s, fs), w: 0, h: 0, text: place, fs, color: '#1B1D23' });
    state.dirty = true; renderAnns(); spotsSummary(); status(`Ort „${place}“ eingesetzt – Doppelklick ändert den Text.`); return;
  }
  if (s.kind === 'date') {
    pushUndo(p);
    const hasPlaceField = (p.signSpots || []).some(o => o.kind === 'place' && Math.abs(o.y - s.y) < 0.02);   // Ort steht im eigenen Feld daneben
    const mode = !hasPlaceField && (LS.get('signDate', '') === 'placedate' || LS.get('signDate', '') === true) ? 'placedate' : 'date', place = mode === 'placedate' ? (LS.get('signPlace', '') || '').trim() : '';
    const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }), fs = 0.016;
    p.annots.push({ id: ++uid, type: 'text', x: s.x + 0.005, y: spotTextY(p, s, fs), w: 0, h: 0, text: place ? `${place}, ${today}` : today, fs, color: '#1B1D23' });
    state.dirty = true; renderAnns(); spotsSummary(); status(`Datum eingesetzt${place ? ' mit Ort' : ''} – Doppelklick ändert den Text.`); return;
  }
  const kind = $('#signKind').value;
  const go = k => {
    const src = state.sigs[k], im = new Image();
    im.onload = () => {
      pushUndo(p);
      const ar = im.height / im.width, asp = (p.w || 1) / (p.h || 1.414);
      let w = Math.min(k === 'initials' ? 0.1 : 0.28, Math.max(0.12, s.w));
      const bottom = s.line ? s.y + s.h * 1.08 : s.y;   // Unterschrift steht auf der Linie und reicht leicht darunter – wie mit dem Stift
      // nicht in den Text darüber ragen: Höhe auf den freien Platz bis zur nächsten Textzeile oberhalb begrenzen (mind. ~1,5 Zeilen)
      const words = p.ocr?.words || p.nwords || [];
      const above = words.filter(o => o.y + o.h <= bottom - 0.004 && o.x < s.x + w && o.x + o.w > s.x).reduce((m, o) => Math.max(m, o.y + o.h), 0);
      if (above) { const free = Math.max(0.03, bottom - above - 0.004); if (w * ar * asp > free) w = Math.max(0.08, free / (ar * asp)); }
      const h = w * ar * asp;
      const a = { id: ++uid, type: 'sign', kind: k, img: src, ar, x: Math.min(1 - w, s.x + Math.max(0, (s.w - w) / 2)), y: Math.max(0, bottom - h), w, h };
      p.annots.push(a); state.annSel = a.id; state.dirty = true; renderAnns(); spotsSummary();
      const rest = openSpots().filter(o => o.s.kind === 'sign').length;
      status(`${SIG_KINDS[k]} gesetzt.` + (rest ? ` Noch ${rest === 1 ? `${rest} Stelle` : `${rest} Stellen`} offen – „Nächste Stelle“ springt hin.` : ' Alle Unterschriftsstellen erledigt.'));
    };
    im.src = src;
  };
  if (state.sigs[kind]) go(kind); else openSign(k => go(k), kind);
});
$('#signNextSpot').onclick = () => {
  const open = openSpots(); if (!open.length) return;
  // erst die aktuelle Seite (falls dort noch etwas offen ist), sonst die nächste – am Ende wieder von vorn
  const target = open.find(o => o.i === state.sel && !spotsShownHere) || open.find(o => o.i > state.sel) || open[0];
  spotsShownHere = target.i === state.sel ? !spotsShownHere : false;
  state.sel = target.i; setView('page');
  requestAnimationFrame(() => document.querySelector('#overlay .signspot')?.scrollIntoView({ block: 'center' }));
  status(`Seite ${target.i + 1}: ${target.s.kind === 'date' ? 'Ort/Datum' : 'Unterschriftsstelle'} – gelb markiert.`);
};

/* ---------- Digitale Signaturen prüfen (wie die Signaturleiste in Acrobat) ---------- */
window.checkSignatures = async (docIdx, file) => {
  const d = state.docs[docIdx]; if (!d || !file?.arrayBuffer) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!PdfVerify.hasSignature(bytes)) return;
    d.signed = true;   // sofort merken – die Warnung vor dem Ändern (js/app.js sigWarn) braucht die Prüfung nicht abzuwarten
    await loadForge();
    // Nutzungsrechte-Signaturen (technische Freischaltung von Formularfunktionen) werden als Information gezeigt, nicht als Unterschrift;
    // vor dem Bearbeiten wird nur bei echten Unterschriften gewarnt
    const sigs = await PdfVerify.verify(bytes);
    d.signed = sigs.some(r => !r.usageRights);
    if (sigs.length) { d.sigs = sigs; renderSigBar(); }
  } catch (e) { console.warn('Signaturprüfung', e); }
};
const sigOk = r => r.intact && r.valid && r.certValidAtTime !== false;
const fmtWhen = d => d instanceof Date && !isNaN(d) ? I18N.fmtDateTime(d) : '';
const sigWho = r => [r.signer?.cn || r.name, r.signer?.o].filter(Boolean).join(', ') || 'unbekannt';
function sigDocs() { const ids = new Set(state.pages.filter(p => p.kind === 'pdf').map(p => p.docIdx)); return [...ids].map(i => state.docs[i]).filter(d => d?.sigs?.length); }
function renderSigBar() {
  const bar = $('#sigBar'); if (!bar) return;
  const docs = sigDocs(); if (!docs.length) { bar.hidden = true; return; }
  const every = docs.flatMap(d => d.sigs), all = every.filter(r => !r.usageRights);
  if (!all.length) {   // nur Nutzungsrechte-Signatur: neutrale Information, keine Unterschrift
    const u = every[every.length - 1];
    bar.className = 'sigbar ok'; $('#sigCosign').hidden = true;
    $('#sigText').textContent = `Hinweis: Dieses Formular enthält eine technische Freischaltung für Formularfunktionen (Nutzungsrechte-Signatur von ${sigWho(u)}${fmtWhen(u.time || u.m) ? ', ' + fmtWhen(u.time || u.m) : ''}). Das ist keine Unterschrift einer Person – Sie können das Formular normal ausfüllen und unterschreiben.`;
    bar.hidden = false; return;
  }
  const last = all[all.length - 1], bad = all.filter(r => !sigOk(r)), appended = all.some(r => sigOk(r) && !r.wholeFile && !r.laterSigned);
  bar.className = 'sigbar ' + (bad.length ? 'bad' : appended ? 'warn' : 'ok');
  let t;
  if (bad.length) t = `Signatur ungültig: ${bad[0].problems[0] || 'nicht prüfbar'}${bad[0].signer ? ` (${sigWho(bad[0])})` : ''}.`;
  else if (appended) t = `Signiert von ${sigWho(last)}${fmtWhen(last.time || last.m) ? ' am ' + fmtWhen(last.time || last.m) : ''} – gültig, aber nach dem Signieren wurden Änderungen angehängt.`;
  else t = `${all.length > 1 ? `${all.length} Signaturen, alle gültig – zuletzt` : 'Signiert'} von ${sigWho(last)}${fmtWhen(last.time || last.m) ? ' am ' + fmtWhen(last.time || last.m) : ''}. Dokument seit der Signatur unverändert.`;
  // unverändert = dieselbe Prüfung wie beim Speichern (Original wird übernommen, Signatur angehängt)
  const unchanged = typeof signedOriginal === 'function' && !!signedOriginal(state.pages);
  if (!unchanged) t += ' Hinweis: Speichern mit Änderungen entfernt die Signatur – das Original bleibt gültig.';
  else if (!bad.length) t += ' Weitere Personen können mitunterzeichnen – die vorhandenen Signaturen bleiben gültig.';
  if ($('#sigText').textContent !== t) $('#sigText').textContent = t;
  bar.hidden = false;
  $('#sigCosign').hidden = !!bad.length || !unchanged;
}
window.renderSigBar = renderSigBar;
$('#sigMore').onclick = () => {
  const yn = (ok, yes, no, mid) => ok === true ? `<span class="y">✓</span> ${yes}` : ok === false ? `<span class="n">✗</span> ${no}` : `<span class="m">?</span> ${mid || no}`;
  $('#sigList').innerHTML = sigDocs().flatMap(d => d.sigs.map((r, k) => `<div class="sigcard"><h4>${esc(sigWho(r))}${d.sigs.length > 1 ? ` <small class="hint">(Signatur ${k + 1} von ${d.sigs.length})</small>` : ''}</h4>
    ${r.usageRights ? '<p class="hint"><b>Art:</b> Nutzungsrechte-Signatur – technische Freischaltung von Formularfunktionen durch den Hersteller der Erstellungssoftware, <b>keine Unterschrift einer Person</b>.</p>' : ''}
    <div class="hint">${[fmtWhen(r.time || r.m) && 'Zeitpunkt: ' + fmtWhen(r.time || r.m), r.reason && 'Grund: ' + esc(r.reason), r.location && 'Ort: ' + esc(r.location), r.signer?.email && 'E-Mail: ' + esc(r.signer.email)].filter(Boolean).join(' · ')}</div>
    <ul class="ck">
      <li>${yn(r.intact, 'Dokument seit der Signatur unverändert', 'Dokument wurde nach dem Signieren verändert')}</li>
      <li>${yn(r.valid, `Signatur passt zum Zertifikat (${esc(r.algorithm || '')})`, 'Signatur passt nicht zum Zertifikat', 'Signatur nicht prüfbar')}</li>
      <li>${yn(r.certValidAtTime, `Zertifikat zum Signaturzeitpunkt gültig${r.certFrom ? ` (${I18N.fmtDate(r.certFrom, { dateStyle: 'medium' })} – ${I18N.fmtDate(r.certTo, { dateStyle: 'medium' })})` : ''}`, 'Zertifikat war zum Signaturzeitpunkt nicht gültig')}</li>
      <li>${r.laterSigned ? '<span class="y">✓</span> Danach weiter signiert (normal bei mehreren Signaturen)' : yn(r.wholeFile, 'Umfasst das ganze Dokument', 'Nach dem Signieren wurden Änderungen angehängt', '')}</li>
      <li>Aussteller: ${esc([r.issuer?.cn, r.issuer?.o].filter(Boolean).join(', ') || '–')}${r.selfSigned ? ' <span class="m">(selbst ausgestellt – nur mit dem Unterzeichner abgleichen)</span>' : ''}</li>
      ${r.qualified ? '<li><span class="y">✓</span> Qualifiziertes Zertifikat (eIDAS-Kennzeichnung)</li>' : ''}
      ${r.timestamp ? '<li><span class="y">✓</span> Mit Zeitstempel</li>' : ''}
      ${r.problems.length ? `<li class="hint">${esc(r.problems.join(' · '))}</li>` : ''}
    </ul></div>`)).join('');
  $('#sigDlg').showModal(); $('#sigClose').focus();
};
$('#sigClose').onclick = () => $('#sigDlg').close();
// Mitunterzeichnen: Speichern-Dialog mit „Digital signieren“ – das Original wird übernommen und die Signatur angehängt
$('#sigCosign').onclick = () => {
  openExport({ format: 'pdf', pages: 'all' });
  const x = $('#x-sign'); if (x && !x.checked) { x.checked = true; x.dispatchEvent(new Event('change', { bubbles: true })); }
  status('Mitunterzeichnen: Zertifikat wählen und speichern – die vorhandenen Signaturen bleiben gültig.');
};

/* ---------- Kommentare und Markierungen (wie die Kommentarleiste in Acrobat): alle Anmerkungen auf einen Blick ---------- */
const CMT_KIND = { link: 'Link', note: 'Notiz', hl: 'Markierung', text: 'Text', stamp: 'Stempel', sign: 'Unterschrift', ink: 'Freihand', shape: 'Form', img: 'Bild', field: 'Formularfeld', rd: 'Schwärzung', wo: 'Abdeckung' };
let cmtRows = [];
async function cmtCollect() {
  const rows = [];
  for (const [i, p] of state.pages.entries()) {
    if (!p.annots.length) continue;
    let words = p.ocr?.words || p.nwords;
    if (!words && p.kind === 'pdf' && p.native && p.annots.some(a => a.type === 'hl')) { p.nwords = await nativeWords(p).catch(() => null) || []; words = p.nwords; }
    for (const a of p.annots) {
      if (!CMT_KIND[a.type]) continue;
      let t = '';
      if (a.type === 'note' || a.type === 'text') t = a.text || '';
      else if (a.type === 'stamp') t = (a.text || '').replace(/\n/g, ' · ');
      else if (a.type === 'link') t = linkLabel(a);
      else if (a.type === 'field') t = `${a.name} (${{ text: 'Textfeld', multi: 'mehrzeilig', date: 'Datum', check: 'Kontrollkästchen', select: 'Auswahlliste', radio: 'Optionsfeld' }[a.ftype] || ''})`;
      else if (a.type === 'hl') t = a.text || (words || []).filter(w => { const cx = w.x + w.w / 2, cy = w.y + w.h / 2; return cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h; }).map(w => w.t).join(' ');
      t = t.replace(/\s+/g, ' ').trim();
      rows.push({ i, p, a, kind: a.type, label: a.type === 'sign' && a.kind ? SIG_KINDS[a.kind] : CMT_KIND[a.type], text: t, by: a.type === 'note' ? [a.at, a.by].filter(Boolean).join(' · ') : '' });
    }
  }
  return rows;
}
function cmtRender() {
  const q = $('#cmtQ').value.trim().toLowerCase(), k = $('#cmtType').value;
  const list = cmtRows.filter(r => (!k || r.kind === k) && (!q || (r.text + ' ' + r.label + ' ' + r.by).toLowerCase().includes(q)));
  const by = {}; cmtRows.forEach(r => by[r.label] = (by[r.label] || 0) + 1);
  $('#cmtSum').textContent = cmtRows.length ? `${cmtRows.length} Einträge: ` + Object.entries(by).map(([l, n]) => `${n} × ${l}`).join(', ') + (list.length !== cmtRows.length ? ` – ${list.length} angezeigt` : '') : '';
  $('#cmtList').innerHTML = list.map(r => `<li><button type="button" class="tocgo" data-cmt="${r.a.id}"><span><span class="ckind">${esc(r.label)}</span>${esc(r.text || '–')}${r.by ? ` <small class="hint">(${esc(r.by)})</small>` : ''}</span><span class="pg">S. ${r.i + 1}</span></button><button type="button" class="tocact" data-cdel="${r.a.id}" title="Löschen" aria-label="${esc(r.label)} auf Seite ${r.i + 1} löschen">✕</button></li>`).join('')
    || `<li class="empty">${cmtRows.length ? 'Nichts gefunden.' : 'Dieses Dokument hat noch keine Kommentare oder Markierungen. Werkzeuge dafür: Notiz, Markieren, Text, Stempel, Unterschrift.'}</li>`;
}
async function openComments() {
  if (!state.pages.length) return;
  closeMenu?.(); cmtRows = await cmtCollect();
  $('#cmtQ').value = ''; $('#cmtType').value = ''; cmtRender();
  if (!$('#cmtDlg').open) $('#cmtDlg').showModal(); $('#cmtQ').focus();
}
$('#btnComments').onclick = openComments;
$('#cmtQ').oninput = cmtRender; $('#cmtType').onchange = cmtRender;
$('#cmtClose').onclick = () => $('#cmtDlg').close();
$('#cmtList').addEventListener('click', async e => {
  const del = e.target.closest('[data-cdel]'), go = e.target.closest('[data-cmt]');
  const r = cmtRows.find(x => x.a.id === +(del || go)?.dataset[del ? 'cdel' : 'cmt']); if (!r) return;
  if (del) {
    pushUndo(r.p); r.p.annots.splice(r.p.annots.indexOf(r.a), 1); state.dirty = true; refresh();
    cmtRows = await cmtCollect(); cmtRender(); status(`${r.label} auf Seite ${r.i + 1} gelöscht (Strg+Z macht es rückgängig).`);
    ($('#cmtList [data-cdel]') || $('#cmtQ')).focus(); return;
  }
  $('#cmtDlg').close(); state.sel = r.i; state.annSel = r.a.id; setView('page');
  status(`Seite ${r.i + 1}: ${r.label}${r.text ? ' – ' + r.text.slice(0, 80) : ''}`);
});
$('#cmtCopy').onclick = async () => {
  const name = (state.docs.length === 1 && state.docs[0].name) || filename();
  const txt = `Kommentare und Markierungen – ${name}\n\n` + cmtRows.map(r => `Seite ${r.i + 1} · ${r.label}${r.by ? ' (' + r.by + ')' : ''}: ${r.text || '–'}`).join('\n');
  try { await navigator.clipboard.writeText(txt); status(`${cmtRows.length} Einträge in die Zwischenablage kopiert.`); } catch { status('Kopieren nicht möglich.'); }
};

/* ---------- Suchen im Dokument (Strg+F, wie Acrobat/Word): Leiste über der Seite, „3 von 12“, Treffer für Treffer ---------- */
// Nutzt dieselbe Suche wie „Suche im Dokument“ rechts (state.query); Treffer je Seite zählt hitCount()
// Treffer je Seite: aus der Wortebene (wie die Markierungen), ohne schon ersetzte/abgedeckte Stellen; sonst aus dem Seitentext
function findHits() {
  const out = [], q = state.query;
  state.pages.forEach((p, i) => {
    const ws = p.ocr?.words || p.nwords, n = ws && q ? ws.filter(w => w.t.toLowerCase().includes(q) && !coveredWord(p, w)).length : hitCount(p);
    for (let k = 0; k < n; k++) out.push({ i, k });
  });
  return out;
}
function findShow(pos) {
  const hits = findHits(), q = state.query;
  if (!q || q.length < 2) { state.findCur = null; $('#findN').textContent = ''; renderAnns(); return; }
  if (!hits.length) {
    state.findCur = null; renderAnns();
    const anyText = state.pages.some(p => pageText(p).trim());
    $('#findN').textContent = anyText ? 'Keine Treffer' : 'Kein Text – erst Texterkennung';
    return;
  }
  pos = ((pos % hits.length) + hits.length) % hits.length;
  const h = hits[pos]; findShow.pos = pos;
  state.findCur = { id: state.pages[h.i].id, k: h.k };
  $('#findN').textContent = `${pos + 1} von ${hits.length}`;
  if (state.sel !== h.i) { state.sel = h.i; refresh(); } else renderAnns();
  requestAnimationFrame(() => document.querySelector('#overlay .found.cur')?.scrollIntoView({ block: 'center', inline: 'nearest' }));
}
// Ersten Treffer ab der aktuellen Seite wählen
function findFirst() {
  const hits = findHits(), at = hits.findIndex(h => h.i >= Math.max(0, state.sel));
  findShow(at < 0 ? 0 : at);
}
function findStep(d) { if (!state.findCur) return findFirst(); findShow((findShow.pos || 0) + d); }
function openFind() {
  if (!state.pages.length) return;
  const bar = $('#findBar'); bar.hidden = false;
  const f = $('#findQ'); if (!f.value && $('#q').value) f.value = $('#q').value;
  f.focus(); f.select();
  if (f.value.trim().length >= 2) findFirst();
}
function closeFind() {
  $('#findBar').hidden = true; state.findCur = null; $('#findRepl').hidden = true; $('#findReplT').setAttribute('aria-expanded', 'false');
  $('#findQ').value = ''; const q = $('#q'); if (q.value) { q.value = ''; q.dispatchEvent(new Event('input')); }
  renderAnns(); $('#viewer').focus({ preventScroll: true });
}
let findT = 0;
$('#findQ').addEventListener('input', () => {
  clearTimeout(findT);
  findT = setTimeout(() => { const q = $('#q'); q.value = $('#findQ').value; q.dispatchEvent(new Event('input')); findFirst(); }, 150);
});
$('#findQ').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === 'F3') { e.preventDefault(); clearTimeout(findT); if ($('#q').value !== $('#findQ').value) { $('#q').value = $('#findQ').value; $('#q').dispatchEvent(new Event('input')); findFirst(); } else findStep(e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
});
/* Suchen & Ersetzen: aktueller Treffer oder alle – originalgetreu wie „Text ändern“, mit Fälschungsschutz */
$('#findReplT').onclick = () => {
  const on = $('#findRepl').hidden; $('#findRepl').hidden = !on; $('#findReplT').setAttribute('aria-expanded', String(on));
  if (on) $('#replQ').focus();
};
async function replaceCurrent() {
  const q = $('#findQ').value.trim(), repl = $('#replQ').value;
  if (q.length < 2) return status('Bitte zuerst einen Suchbegriff mit mindestens 2 Zeichen eingeben.');
  if (!state.findCur) { findFirst(); if (!state.findCur) return; }
  const p = state.pages.find(x => x.id === state.findCur.id); if (!p) return;
  if (sigWarn(p, replaceCurrent)) return;
  const r = await replaceOnPage(p, q, repl, state.findCur.k);
  if (r.blocked) status(PROT_MSG.urkunde);
  else if (r.n) status(`Ersetzt: „${q}“ → „${repl}“${r.prot ? ' – ' + PROT_MSG[r.prot] : ''}`);
  renderAnns(); renderThumbs();
  findShow(findShow.pos || 0);   // gleiche Position = nächster Treffer (der ersetzte zählt nicht mehr)
}
async function replaceAll() {
  const q = $('#findQ').value.trim(), repl = $('#replQ').value;
  if (q.length < 2) return status('Bitte zuerst einen Suchbegriff mit mindestens 2 Zeichen eingeben.');
  const signed = state.pages.find(p => { const d = p.kind === 'pdf' && state.docs[p.docIdx]; return d && (d.sigs ? d.sigs.some(r => !r.usageRights) : d.signed) && !d.sigWarned; });
  if (signed && sigWarn(signed, replaceAll)) return;
  let n = 0, pages = 0, blocked = 0, marked = 0;
  await undoGroup(async () => {   // alle Seiten zusammen mit einem Strg+Z rückgängig
    for (const [i, p] of state.pages.entries()) {
      status(`Ersetze auf Seite ${i + 1} von ${state.pages.length} …`, i / state.pages.length);
      const r = await replaceOnPage(p, q, repl);
      if (r.blocked) blocked++;
      if (r.n) { n += r.n; pages++; if (r.prot) marked++; }
    }
  });
  renderAnns(); renderThumbs();
  status(n ? `${n}× „${q}“ ersetzt auf ${pages} Seite(n).${marked ? ` ${marked} Seite(n) als Nachweis markiert.` : ''}${blocked ? ` ${blocked} Seite(n) übersprungen (Urkunde/Bescheid – Schutz vor Fälschung).` : ''}`
           : blocked ? PROT_MSG.urkunde : `„${q}“ nicht gefunden.`);
  findFirst();
}
/* Alle Treffer markieren: jede Fundstelle (auch Wortgruppen wie „15. November“) wird eine Markierung in der Farbe/Art des Textmarkers */
async function markAll() {
  const q = $('#findQ').value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 2) return status('Bitte zuerst einen Suchbegriff mit mindestens 2 Zeichen eingeben.');
  const signed = state.pages.find(p => { const d = p.kind === 'pdf' && state.docs[p.docIdx]; return d && (d.sigs ? d.sigs.some(r => !r.usageRights) : d.signed) && !d.sigWarned; });
  if (signed && sigWarn(signed, markAll)) return;
  const toks = q.split(' '), norm = t => String(t).toLowerCase();
  // Treffer ab Wort i: ein Wort enthält den Begriff; bei Wortgruppen endet das erste Wort mit dem Anfang, mittlere stimmen, das letzte beginnt mit dem Ende
  const matchAt = (seq, i) => {
    if (toks.length === 1) return norm(seq[i].w.t).includes(q) ? i : -1;
    if (i + toks.length > seq.length || !norm(seq[i].w.t).endsWith(toks[0])) return -1;
    for (let k = 1; k < toks.length; k++) { const t = norm(seq[i + k].w.t); if (k < toks.length - 1 ? t !== toks[k] : !t.startsWith(toks[k])) return -1; }
    return i + toks.length - 1;
  };
  let n = 0, pages = 0, noText = 0, already = 0;
  await undoGroup(async () => {   // alles zusammen mit einem Strg+Z rückgängig
    for (const [pi, p] of state.pages.entries()) {
      status(`Markiere auf Seite ${pi + 1} von ${state.pages.length} …`, pi / state.pages.length);
      let items = p.ocr?.words;
      if (!items?.length && p.kind === 'pdf' && p.native) { if (!p.nwords) p.nwords = await nativeWords(p).catch(() => null) || []; items = p.nwords; }
      if (!items?.length) { noText++; continue; }
      const ix = hlIndex(items), covered = w => { const cx = w.x + w.w / 2, cy = w.y + w.h / 2; return coveredWord(p, w) || p.annots.some(a => a.type === 'hl' && cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h && (!a.rects || a.rects.some(r => { const rx = a.x + r.x * a.w, ry = a.y + r.y * a.h; return cx >= rx && cx <= rx + r.w * a.w && cy >= ry && cy <= ry + r.h * a.h; }))); };
      let added = 0;
      for (let i = 0; i < ix.seq.length; i++) {
        const j = matchAt(ix.seq, i); if (j < 0) continue;
        if (covered(ix.seq[i].w)) { already++; i = j; continue; }
        if (!added) pushUndo(p);
        const a = { id: ++uid, type: 'hl', color: S.hlColor, style: S.hlStyle }; hlSnap(a, ix, i, j); p.annots.push(a);
        added++; i = j;
      }
      if (added) { n += added; pages++; }
    }
  });
  if (n) state.dirty = true;
  renderAnns(); renderThumbs();
  status(n ? `${n}× „${$('#findQ').value.trim()}“ markiert auf ${pages} Seite(n) – Strg+Z nimmt alle zurück.`
           : already ? 'Alle Treffer sind schon markiert.' : noText === state.pages.length ? 'Kein Text – erst Texterkennung' : `„${$('#findQ').value.trim()}“ nicht gefunden.`);
}
$('#findMark').onclick = markAll;
$('#replOne').onclick = replaceCurrent;
$('#replAll').onclick = replaceAll;
$('#replQ').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); (e.ctrlKey || e.metaKey ? replaceAll : replaceCurrent)(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
});
$('#findNext').onclick = () => findStep(1);
$('#findPrev').onclick = () => findStep(-1);
$('#findClose').onclick = closeFind;
addEventListener('keydown', e => {
  if (!state.pages.length || document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); }
  else if (e.key === 'F3' && !$('#findBar').hidden && document.activeElement !== $('#findQ')) { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
});
// Hilfe-Fenster: Suchbegriff an die ausführliche Hilfe (pdfmy.de/hilfe.html) übergeben
const helpGo = () => { const v = $('#helpQ').value.trim(); window.open('hilfe.html' + (v ? '#suche=' + encodeURIComponent(v) : ''), '_blank', 'noopener'); };
$('#helpQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); helpGo(); } });
$('#helpQBtn').onclick = helpGo;
$('#prpCancel').onclick = () => $('#propDlg').close();
$('#propForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = id => $(id).value.trim();
  const next = { title: v('#pr-title'), author: v('#pr-author'), subject: v('#pr-subject'), keywords: v('#pr-keywords') };
  const cur = await docProps(state.pages, state.meta);
  $('#propDlg').close();
  if (next.title === cur.title && next.author === (cur.author || '') && next.subject === (cur.subject || '') && next.keywords === cur.keywords.join(', ')) return status('Dokumenteigenschaften unverändert.');
  state.meta.docProps = next; state.dirty = true; refresh();
  status('Dokumenteigenschaften übernommen – sie werden beim Speichern in die PDF geschrieben.');
});
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd' && state.pages.length && !document.querySelector('dialog[open]')) { e.preventDefault(); openProps(); } });

/* ---------- Mehrere Dokumente: hinzufügen, ersetzen oder parallel in einem neuen Fenster ---------- */
function askOpen(files) {
  return new Promise(res => {
    const d = $('#openDlg'), n = files.length;
    $('#openWhat').textContent = `${n === 1 ? `„${files[0].name}“` : `${n} Dateien`} öffnen – es ist bereits ein Dokument geöffnet.`;
    $('#openReplHint').textContent = state.dirty ? 'Achtung: Das geöffnete Dokument ist noch nicht gespeichert und wird geschlossen.' : 'Das geöffnete Dokument wird geschlossen.';
    d.onclick = e => { const b = e.target.closest('[data-open]'); if (!b) return; d.close(); res(b.dataset.open || null); };
    d.oncancel = () => res(null);
    d.showModal(); d.querySelector('[data-open="add"]').focus();
  });
}
window.openWithChoice = async files => {
  if (!files?.length) return;
  // Unverändert geöffnete PDFs gelten nicht als „ungespeichert“ (das Original liegt ja auf dem Rechner)
  const fresh = async () => { await importFiles(files); if (files.every(f => /\.pdf$/i.test(f.name))) { state.dirty = false; refresh(); } };
  if (!state.pages.length) return fresh();
  const c = await askOpen(files);
  if (c === 'add') return importFiles(files);
  if (c === 'window') { newTab(); return fresh(); }
  if (c === 'replace') { resetDoc(); await importFiles(files); state.dirty = false; }
};
// Datei an ein neues PDFMy-Fenster übergeben: nur zwischen Fenstern derselben Herkunft, nichts verlässt das Gerät
const pendingOpen = new Map();
function openInNewWindow(files) {
  const w = window.open(location.pathname + '#empfang', '_blank');
  if (!w) return toast('Der Browser hat das neue Fenster blockiert. Bitte Pop-ups für pdfmy.de erlauben.', 7000);
  if (files?.length) pendingOpen.set(w, files);
}
addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'pdfmy:empfang-bereit' && pendingOpen.has(e.source)) { e.source.postMessage({ type: 'pdfmy:dateien', files: pendingOpen.get(e.source) }, location.origin); pendingOpen.delete(e.source); }
  else if (e.data.type === 'pdfmy:dateien' && e.source === window.opener && Array.isArray(e.data.files)) importFiles(e.data.files.filter(f => f instanceof File));
});
if (location.hash === '#empfang') {
  history.replaceState(null, '', location.pathname + location.search);
  try { window.opener?.postMessage({ type: 'pdfmy:empfang-bereit' }, location.origin); } catch {}
}
$('#btnNewWin').onclick = () => newTab();

/* ---------- Reiter: mehrere Dokumente im selben Fenster (wie in Acrobat) ----------
   Jeder Reiter hält seinen eigenen Dokument-Zustand; beim Wechsel wird er ausgetauscht. */
const DOC_KEYS = ['marks', 'einv', 'assignee', 'pages', 'docs', 'sel', 'annSel', 'editing', 'crop', 'undo', 'touched', 'dirty', 'meta', 'picked', 'anchor', 'view', 'intent', 'inputBytes', 'fromScanner', 'scanDone', 'autoArmed', 'wv'];
const newRid = () => Math.random().toString(36).slice(2);
const tabs = [{ snap: null, rid: newRid() }]; let tabCur = 0;
const snapshot = () => Object.fromEntries(DOC_KEYS.map(k => [k, state[k]]));
function restoreTab(i) {
  tabCur = i; const s = tabs[i].snap;
  if (s) Object.assign(state, s); else { resetDoc(); return renderTabs(); }
  $('#assignee').value = state.assignee || ''; if ($('#m-wv')) $('#m-wv').value = state.wv || '';
  setLbl('#btnGrid', state.view === 'grid' ? 'Einzelseite' : 'Seitenübersicht');
  renderForm(); refresh(); renderTabs();
}
function switchTab(i) { if (i === tabCur || !tabs[i]) return; rescueFlush(); tabs[tabCur].snap = snapshot(); restoreTab(i); status(`Reiter: ${tabName(i)}`); }
function newTab() {
  rescueFlush(); tabs[tabCur].snap = snapshot();
  tabs.push({ snap: null, rid: newRid() }); tabCur = tabs.length - 1;
  resetDoc(); renderTabs(); status('Neuer Reiter – Datei öffnen, scannen oder hierher ziehen.');
}
function closeTab(i) {
  const s = i === tabCur ? snapshot() : tabs[i].snap;
  if (s && s.dirty && s.pages.length && !confirm(`„${tabName(i)}“ schließen? Es wurde noch nicht gespeichert.`)) return;
  if (tabs.length === 1) { resetDoc(); tabs[0].snap = null; renderTabs(); status('Bereit.'); return; }
  if (i !== tabCur) tabs[tabCur].snap = snapshot();
  rescueDrop(tabs[i].rid); tabs.splice(i, 1);
  const next = i < tabCur ? tabCur - 1 : i === tabCur ? Math.min(i, tabs.length - 1) : tabCur;
  restoreTab(next);
}
function tabName(i) {
  const s = i === tabCur ? state : tabs[i].snap;
  if (!s || !s.pages.length) return 'Neues Dokument';
  return (s.docs[0] && s.docs[0].name) || [s.meta && s.meta.type, s.meta && s.meta.sender].filter(Boolean).join(' – ') || 'Scan';
}
function renderTabs() {
  const box = $('#doctabs'); if (!box) return;
  box.hidden = tabs.length < 2;
  if (box.hidden) return;
  box.innerHTML = tabs.map((t, i) => {
    const s = i === tabCur ? state : t.snap, n = tabName(i), dirty = s && s.dirty && s.pages.length;
    return `<div class="dt${i === tabCur ? ' on' : ''}"><button type="button" class="dt-name" data-tab="${i}"${i === tabCur ? ' aria-current="page"' : ''} title="${esc(n)}">${esc(n)}${dirty ? '<span class="dt-dirty" aria-label="nicht gespeichert"> ●</span>' : ''}</button><button type="button" class="dt-close" data-close="${i}" aria-label="${esc(n)} schließen" title="Reiter schließen">✕</button></div>`;
  }).join('') + '<button type="button" class="dt-add" title="Neuer Reiter" aria-label="Neuer Reiter">+</button>';
}
$('#doctabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab != null) switchTab(+b.dataset.tab);
  else if (b.dataset.close != null) closeTab(+b.dataset.close);
  else if (b.classList.contains('dt-add')) newTab();
});
// „Schließen“ in der Kopfzeile schließt den aktuellen Reiter
$('#btnNew').onclick = () => closeTab(tabCur);
window.renderTabs = renderTabs;

/* ---------- Absturzschutz (wie Word): ungespeicherte Arbeit laufend lokal sichern und beim nächsten Start anbieten ----------
   Nur im Browser (IndexedDB), nichts verlässt das Gerät. Gelöscht beim Speichern oder Schließen, per „Verwerfen“ oder nach 7 Tagen. */
const SID = newRid(), RESCUE_DAYS = 7, RESCUE_MAX = 5, RESCUE_PAGES = 300;
// Solange dieses Fenster offen ist, hält es eine Sperre – andere Fenster bieten seine Sicherungen dann nicht an
navigator.locks?.request('pdfmy-sess-' + SID, () => new Promise(() => {})).catch(() => {});
let rescueTimer = null, rescueBusy = false, rescueSig = '', rescueUndo = null, rescueWasDirty = false;
const rescueList = async () => (await idb.get('rescue')) || [];
async function rescueDrop(rid) { const l = await rescueList(); if (l.some(x => x.rid === rid)) await idb.set('rescue', l.filter(x => x.rid !== rid)); }
const rescueJob = () => ({ rid: tabs[tabCur].rid, pages: state.pages.slice(), meta: state.meta, dirty: state.dirty && state.pages.length > 0, name: (state.docs.length === 1 && state.docs[0].name) || filename() });
async function rescueSave(job) {
  if (rescueBusy) { clearTimeout(rescueTimer); rescueTimer = setTimeout(() => rescueSave(job), 1500); return; }
  rescueBusy = true;
  try {
    if (!job.dirty) await rescueDrop(job.rid);
    else if (job.pages.length <= RESCUE_PAGES) {
      const bytes = await buildPdf(job.pages, job.meta, { noOcr: true, onPage: () => {} });
      let meta = null; try { meta = JSON.parse(JSON.stringify(job.meta)); } catch {}
      const l = (await rescueList()).filter(x => x.rid !== job.rid);
      l.unshift({ rid: job.rid, sid: SID, name: job.name, at: Date.now(), pages: job.pages.length, bytes, meta });
      await idb.set('rescue', l.slice(0, RESCUE_MAX));
    }
  } catch (e) { console.warn('Absturzschutz', e); }
  rescueBusy = false;
}
// Bei jeder Bildschirm-Auffrischung: hat sich am Dokument etwas geändert? Dann nach kurzer Ruhe sichern.
window.rescueTick = () => {
  const dirty = state.dirty && state.pages.length > 0;
  if (!dirty) { if (rescueWasDirty) { rescueWasDirty = false; rescueSig = ''; clearTimeout(rescueTimer); rescueTimer = null; rescueSave(rescueJob()); } return; }
  let sig = state.pages.map(p => `${p.id}:${p.rot || 0}:${p.annots ? p.annots.length : 0}`).join(',');
  try { sig += JSON.stringify(state.meta); } catch {}
  const u = state.undo[state.undo.length - 1];
  if (rescueWasDirty && sig === rescueSig && u === rescueUndo) return;
  rescueWasDirty = true; rescueSig = sig; rescueUndo = u;
  clearTimeout(rescueTimer); rescueTimer = setTimeout(() => { rescueTimer = null; rescueSave(rescueJob()); }, 3000);
};
function rescueFlush() { if (rescueTimer) { clearTimeout(rescueTimer); rescueTimer = null; rescueSave(rescueJob()); } }
addEventListener('pagehide', rescueFlush);
document.addEventListener('visibilitychange', () => { if (document.hidden) rescueFlush(); });

async function renderRescue() {
  const box = $('#rescue'); if (!box) return;
  let list = await rescueList();
  const fresh = list.filter(e => Date.now() - e.at < RESCUE_DAYS * 864e5);
  if (fresh.length !== list.length) { list = fresh; await idb.set('rescue', list); }
  let held = new Set();
  try { held = new Set(((await navigator.locks?.query())?.held || []).map(l => l.name)); } catch {}
  const show = list.filter(e => e.sid !== SID && !held.has('pdfmy-sess-' + e.sid));
  renderRescue.list = show;
  if (!show.length || state.pages.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="dl-head"><b id="rescueT">Nicht gespeicherte Arbeit</b></div>
    <p class="rs-hint">PDFMy wurde geschlossen, bevor gespeichert wurde. Ihre Änderungen sind hier sicher aufbewahrt – nur auf diesem Gerät.</p>
    <div class="rc-list">${show.map((e, i) => `<div class="rc"><button type="button" class="rc-open" data-rs="${i}" title="${esc(e.name)} wiederherstellen"><svg class="ic" aria-hidden="true"><use href="#i-file-text"/></svg><span class="rc-name">${esc(e.name)} <small>(${e.pages} ${e.pages === 1 ? 'Seite' : 'Seiten'})</small></span><span class="rc-when">${whenStr(e.at)}</span></button><button type="button" class="rs-go" data-rs="${i}">Wiederherstellen</button><button type="button" class="rc-del" data-rsdel="${i}" aria-label="${esc(e.name)} verwerfen" title="Verwerfen">✕</button></div>`).join('')}</div>`;
}
$('#rescue').addEventListener('click', async ev => {
  const b = ev.target.closest('button'); if (!b) return;
  const list = renderRescue.list || [];
  if (b.dataset.rsdel != null) {
    const e = list[+b.dataset.rsdel]; if (!e || !confirm(`Die gesicherten Änderungen an „${e.name}“ endgültig verwerfen?`)) return;
    await rescueDrop(e.rid); renderRescue(); status('Gesicherte Änderungen verworfen.'); return;
  }
  const e = list[+b.dataset.rs]; if (!e) return;
  $('#rescue').hidden = true;
  state.intent = null;
  await importFiles([new File([e.bytes], e.name, { type: 'application/pdf' })]);
  if (e.meta) { Object.assign(state.meta, e.meta); renderForm(); }
  tabs[tabCur].rid = e.rid;   // weitere Änderungen ersetzen diese Sicherung
  state.dirty = true; rescueWasDirty = false; refresh();
  status(`Wiederhergestellt: ${e.name} – bitte jetzt speichern.`);
});
// Vor dem Verlassen warnen, wenn irgendein Reiter ungespeichert ist
addEventListener('beforeunload', e => { if (tabs.some((t, i) => { const s = i === tabCur ? state : t.snap; return s && s.dirty && s.pages.length; })) { e.preventDefault(); e.returnValue = ''; } });
$('#btnAddDoc').onclick = () => { window.pdfmyAdd = true; $('#fileIn').click(); };
$('#mbAdd').onclick = () => { closeMenu(); $('#btnAddDoc').click(); };
$('#mbNewTab').onclick = () => { closeMenu(); $('#btnNewWin').click(); };

/* ---------- Sprung von den Werkzeug-Seiten (pdfmy.de/pdf-zusammenfuegen.html …): #werkzeug=merge hebt das Werkzeug hervor ---------- */
function showTool() {
  const m = location.hash.match(/^#werkzeug=([a-z0-9]+)$/); if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  // open: Knopf „Öffnen“ (Office, beliebige PDF bearbeiten), printer: Menü „Mehr“ aufklappen → „Drucker „PDFMy“ einrichten …“
  const special = { open: () => $('#fileIn')?.closest('label'), printer: () => { const d = $('#btnPrinter')?.closest('details'); if (d) d.open = true; return $('#btnPrinter'); } };
  const t = m[1] === 'einv' ? $('#tileEinv') : special[m[1]] ? special[m[1]]() : document.querySelector(`.tile[data-intent="${m[1]}"]`);
  if (!t || state.pages.length) return;
  t.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  t.classList.add('tile-hi'); setTimeout(() => t.classList.remove('tile-hi'), 6000);
  t.focus({ preventScroll: true });
  status(`Hier geht's los: auf „${(t.querySelector('b') || t.querySelector('span'))?.textContent || ''}“ klicken.`);
}
showTool(); addEventListener('hashchange', showTool);

/* ---------- Zuletzt geöffnet: Verweise auf die letzten Dateien (nur im Browser, keine Inhalte), Klick öffnet erneut ---------- */
const RECENT_MAX = 10, canRecent = !!window.showOpenFilePicker;
window.rememberRecent = async handles => {
  if (!canRecent || !handles?.length) return;
  let list = (await idb.get('recent')) || [];
  for (const h of [...handles].reverse()) {
    const keep = [];
    for (const e of list) { let same = false; try { same = await e.handle.isSameEntry(h); } catch {} if (!same) keep.push(e); }
    list = [{ name: h.name, handle: h, at: Date.now() }, ...keep];
  }
  await idb.set('recent', list.slice(0, RECENT_MAX));
  if (!state.pages.length) renderRecent();
};
const whenStr = t => {
  const d = new Date(t), now = new Date(), hm = I18N.fmtTime(d);
  if (d.toDateString() === now.toDateString()) return 'heute, ' + hm;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'gestern, ' + hm;
  return I18N.fmtDate(d, { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};
const fileIcon = n => /\.pdf$/i.test(n) ? '#i-file-text' : /\.(eml|msg)$/i.test(n) ? '#i-send' : /\.xml$/i.test(n) ? '#i-file-type-2' : '#i-image';
window.renderRecent = renderRecent;
async function renderRecent() {
  renderRescue();
  const box = $('#recent'); if (!box) return;
  const list = canRecent ? (await idb.get('recent')) || [] : [];
  if (!list.length || state.pages.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="dl-head"><b id="recentT">Zuletzt geöffnet</b><span><button type="button" class="linkbtn" data-clear>Liste leeren</button></span></div>
    <div class="rc-list">${list.map((e, i) => `<div class="rc"><button type="button" class="rc-open" data-i="${i}" title="${esc(e.name)} öffnen"><svg class="ic" aria-hidden="true"><use href="${fileIcon(e.name)}"/></svg><span class="rc-name">${esc(e.name)}</span><span class="rc-when">${whenStr(e.at)}</span></button><button type="button" class="rc-del" data-del="${i}" aria-label="${esc(e.name)} aus der Liste entfernen" title="Aus der Liste entfernen">✕</button></div>`).join('')}</div>`;
}
async function openRecent(i) {
  const list = (await idb.get('recent')) || [], e = list[i]; if (!e) return;
  try {
    let perm = await e.handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') perm = await e.handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') return toast('Ohne Ihre Erlaubnis kann PDFMy die Datei nicht öffnen.', 5000);
    const file = await (window.readLaunched || window.readNow)(e.handle);   // sofort lesen (Outlook-Anhänge sind nur kurz verfügbar)
    window.pdfmyHandles.set(file, e.handle);
    state.intent = null;
    await window.openWithChoice([file]);
    window.rememberRecent([e.handle]);
  } catch (err) {
    console.warn('Zuletzt geöffnet', err);
    list.splice(i, 1); await idb.set('recent', list); renderRecent();
    toast(err?.name === 'NotReadableError' ? window.unreadable(e.name, err) + ' Der Eintrag wurde aus der Liste entfernt.' : `„${e.name}“ ist nicht mehr vorhanden (verschoben oder gelöscht) und wurde aus der Liste entfernt.`, 9000);
  }
}
$('#recent').addEventListener('click', async ev => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.dataset.clear != null) { await idb.set('recent', []); renderRecent(); status('Liste „Zuletzt geöffnet“ geleert.'); return; }
  if (b.dataset.del != null) { const l = (await idb.get('recent')) || []; l.splice(+b.dataset.del, 1); await idb.set('recent', l); renderRecent(); return; }
  if (b.dataset.i != null) openRecent(+b.dataset.i);
});
// „Öffnen“ und „Dateien wählen“: in Chrome/Edge über den Dateidialog, der Verweise liefert (sonst wie bisher)
const PICK_TYPES = [{ description: 'PDF, Bilder, E-Mails, E-Rechnungen', accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.heic', '.gif', '.bmp'], 'message/rfc822': ['.eml'], 'application/vnd.ms-outlook': ['.msg'], 'application/xml': ['.xml'] } }];
let pickFallback = false;
for (const id of ['#fileIn', '#dropIn']) $(id).addEventListener('click', async e => {
  if (!canRecent || pickFallback) { pickFallback = false; return; }
  e.preventDefault();
  let hs; try { hs = await showOpenFilePicker({ multiple: true, id: 'mpdf-open', types: PICK_TYPES }); } catch (err) { if (err.name !== 'AbortError') { pickFallback = true; $(id).click(); } else window.pdfmyAdd = false; return; }
  const files = await Promise.all(hs.map(h => h.getFile()));
  files.forEach((f, i) => window.pdfmyHandles.set(f, hs[i]));
  if (id === '#dropIn' || !state.pages.length) state.intent = null;
  if (window.pdfmyAdd) { window.pdfmyAdd = false; importFiles(files); } else window.openWithChoice(files);
  window.rememberRecent(hs);
});
renderRecent();

/* ---------- Statuszeile: zu einer Seite springen (Klick auf „Seite X von Y“ oder Strg+G) ---------- */
function openPageGo() {
  if (!state.pages.length) return;
  const g = $('#pageGo'); g.max = state.pages.length; g.value = state.sel + 1;
  $('#pageInd').hidden = true; g.hidden = false; g.focus(); g.select();
}
function closePageGo(jump) {
  const g = $('#pageGo'); if (g.hidden) return;
  const n = Math.round(+g.value);
  g.hidden = true; $('#pageInd').hidden = false;
  if (jump && n >= 1 && n <= state.pages.length) {
    state.sel = n - 1; if (state.view === 'grid') setView('page'); else refresh(); status(`Seite ${n} von ${state.pages.length}`);
    $('#thumbs').children[state.sel]?.scrollIntoView({ block: 'nearest' });   // Seitenvorschau mitführen
  }
  else if (jump) status(`Bitte eine Seitenzahl von 1 bis ${state.pages.length} eingeben.`);
  $('#pageInd').focus();
}
$('#pageInd').onclick = openPageGo;
$('#pageGo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); closePageGo(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePageGo(false); } });
$('#pageGo').addEventListener('blur', () => closePageGo(false));
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'g' && state.pages.length && !document.querySelector('dialog[open]')) { e.preventDefault(); openPageGo(); } });

/* ---------- Seitenleisten ein-/ausklappen: links Seitenvorschau, rechts Briefdaten (gemerkt, Tasten [ und ]) ---------- */
const panels = LS.get('panels', { l: false, r: false });
const LEFT = '<path d="m15 18-6-6 6-6"/>', RIGHT = '<path d="m9 18 6-6-6-6"/>';
function applyPanels() {
  document.body.classList.toggle('hide-left', !!panels.l); document.body.classList.toggle('hide-right', !!panels.r);
  const set = (b, hidden, what, key, openDir, closeDir) => {
    b.setAttribute('aria-expanded', String(!hidden));
    const t = `${what} ${hidden ? 'einblenden' : 'ausblenden'} ( ${key} )`;
    b.title = t; b.querySelector('.sr-only').textContent = t.replace(/ \(.*\)$/, '');
    b.querySelector('svg').innerHTML = hidden ? openDir : closeDir;
  };
  set($('#tglLeft'), panels.l, 'Seitenvorschau', '[', RIGHT, LEFT);
  set($('#tglRight'), panels.r, 'Briefdaten', ']', LEFT, RIGHT);
  dispatchEvent(new Event('resize'));   // Seite an die neue Breite anpassen
}
const togglePanel = side => { panels[side] = !panels[side]; LS.set('panels', panels); applyPanels(); };
$('#tglLeft').onclick = () => togglePanel('l');
$('#tglRight').onclick = () => togglePanel('r');
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || !state.pages.length || document.querySelector('dialog[open]') || e.target.matches?.('input,textarea,select,[contenteditable="true"]')) return;
  if (e.key === '[') { e.preventDefault(); togglePanel('l'); } else if (e.key === ']') { e.preventDefault(); togglePanel('r'); }
});
applyPanels();

/* ---------- Bilder aus der PDF speichern: eingebettete Fotos, Logos, Grafiken in Originalauflösung (lokal, pdf.js) ---------- */
const objGet = (pg, id) => new Promise((res, rej) => {
  const store = id.startsWith('g_') ? pg.commonObjs : pg.objs;
  const t = setTimeout(() => rej(new Error('Zeitüberschreitung')), 8000);
  store.get(id, o => { clearTimeout(t); res(o); });
});
function imgToCanvas(o) {
  const w = o?.width, h = o?.height; if (!w || !h) return null;
  const c = Imaging.canvas(w, h), x = c.getContext('2d');
  if (o.bitmap) { x.drawImage(o.bitmap, 0, 0); return c; }
  if (!o.data) return null;
  const id = x.createImageData(w, h), d = id.data, src = o.data;
  if (o.kind === 3) d.set(src.subarray(0, d.length));
  else if (o.kind === 2) for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2]; d[i + 3] = 255; }
  else if (o.kind === 1) { const row = (w + 7) >> 3; for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const v = (src[y * row + (xx >> 3)] >> (7 - (xx & 7))) & 1 ? 255 : 0, i = (y * w + xx) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } }
  else return null;
  x.putImageData(id, 0, 0); return c;
}
const hasAlpha = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) return true; return false; };
const canvasToPng = c => new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/png'));
async function collectImages(pages, onPage) {
  const OPS = pdfjsLib.OPS, seen = new Set(), out = [];
  for (const [n, p] of pages.entries()) {
    onPage?.(n);
    if (p.kind !== 'pdf') continue;
    const pg = await state.docs[p.docIdx].js.getPage(p.pageIdx + 1), ops = await pg.getOperatorList();
    let k = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      let o = null, key = null;
      try {
        if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) { key = p.docIdx + ':' + args[0]; if (seen.has(key)) continue; o = await objGet(pg, args[0]); }
        else if (fn === OPS.paintInlineImageXObject) o = args[0];
        else continue;
      } catch { continue; }
      if (!o || o.width < 32 || o.height < 32) continue;   // Linien, Punkte, Mini-Symbole auslassen
      const c = imgToCanvas(o); if (!c) continue;
      if (key) seen.add(key);
      const alpha = hasAlpha(c), photo = !alpha && c.width * c.height > 600000;
      out.push({ page: n + 1, nr: ++k, w: c.width, h: c.height, data: photo ? await canvasToJpeg(c, 0.92) : await canvasToPng(c), ext: photo ? 'jpg' : 'png' });
    }
  }
  return out;
}
window.extractImages = async () => {
  closeMenu?.();
  const pages = state.pages; if (!pages.length) return;
  if (!pages.some(p => p.kind === 'pdf')) return toast('Hier gibt es keine eingebetteten Bilder: Fotos und Scans sind schon Bilder. Zum Speichern als JPG „Speichern unter → Bilder“ wählen.', 7000);
  status('Suche Bilder in der PDF …', 0);
  let imgs;
  try { imgs = await collectImages(pages, n => status(`Suche Bilder: Seite ${n + 1} von ${pages.length} …`, n / pages.length)); }
  catch (e) { console.error(e); return status('Bilder konnten nicht gelesen werden: ' + e.message); }
  if (!imgs.length) { status('Keine Bilder gefunden.'); return toast('In dieser PDF sind keine Fotos oder Grafiken eingebettet (nur Text und Linien).', 6000); }
  const base = baseName(), files = imgs.map(m => ({ name: `${base}_S${String(m.page).padStart(3, '0')}_Bild${m.nr}.${m.ext}`, data: m.data }));
  const single = files.length === 1;
  const where = await deliver(single ? files[0].data : Tools.zip(files), single ? files[0].name : base + '_Bilder_aus_PDF.zip', single ? (imgs[0].ext === 'png' ? 'image/png' : 'image/jpeg') : 'application/zip');
  if (where) status(`${single ? `${files.length} Bild` : `${files.length} Bilder`} in Originalauflösung gespeichert: ${where}`);
  else status(`${single ? `${files.length} Bild` : `${files.length} Bilder`} gefunden – Speichern abgebrochen.`);
};
$('#btnImgOut').onclick = () => window.extractImages();
// Strg+B: Lesezeichen für die aktuelle Seite (wie Acrobat)
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && state.pages.length && !document.querySelector('dialog[open]')) { e.preventDefault(); addMark(); } });

/* ---------- Inhalt: Lesezeichen (Gliederung) der geöffneten PDFs anzeigen und hinspringen ---------- */
window.readOutline = async docIdx => {
  const d = state.docs[docIdx]; if (!d?.js) return;
  try {
    const ol = await d.js.getOutline(); if (!ol?.length) return;
    const out = [];
    const walk = async (items, level) => {
      for (const it of items) {
        if (out.length >= 500) return;
        let pageIdx = null;
        try {
          const dest = typeof it.dest === 'string' ? await d.js.getDestination(it.dest) : it.dest;
          if (Array.isArray(dest) && dest[0]) pageIdx = typeof dest[0] === 'number' ? dest[0] : await d.js.getPageIndex(dest[0]);
        } catch {}
        const title = String(it.title || '').replace(/\s+/g, ' ').trim();
        if (title) out.push({ title, pageIdx, level: Math.min(level, 2) });
        if (it.items?.length) await walk(it.items, level + 1);
      }
    };
    await walk(ol, 0);
    if (out.some(e => e.pageIdx != null)) { d.outline = out; refresh(); }
  } catch (e) { console.warn('Inhalt', e); }
};
// Seitenposition im aktuellen Dokument (nach Sortieren/Löschen) zum Lesezeichen finden
const tocTarget = e => state.pages.findIndex(p => p.kind === 'pdf' && p.docIdx === e.docIdx && p.pageIdx === e.pageIdx);
/* Lesezeichen bearbeiten (wie Acrobat): beim ersten Bearbeiten wird die Gliederung, die beim Speichern entstünde,
   als eigene Liste übernommen (state.marks: Titel, Seite über die Seiten-ID, Ebene). Sortieren/Löschen von Seiten wirkt automatisch. */
const pageIdxOf = pid => state.pages.findIndex(p => p.id === pid);
function marksTake() {
  if (state.marks) return state.marks;
  const flat = [], walk = (list, level) => list.forEach(n => { const p = state.pages[n.pageIndex]; if (p) flat.push({ id: Math.random().toString(36).slice(2), title: n.title, pid: p.id, level: Math.min(level, 2) }); walk(n.children || [], level + 1); });
  walk(outlineFor(state.pages), 0);
  return state.marks = flat;
}
function marksSort() { state.marks = state.marks.map((m, k) => ({ m, k, i: pageIdxOf(m.pid) })).sort((a, b) => (a.i - b.i) || (a.k - b.k)).map(x => x.m); }
function marksChanged(msg) { state.dirty = true; renderToc(); refresh(); if (msg) status(msg); }
let tocEditId = null;
function pageTitle(p) {   // Vorschlag: erste sinnvolle Textzeile der Seite
  const line = (pageText(p) || '').split(/\n+/).map(s => s.replace(/\s+/g, ' ').trim()).find(s => s.length >= 4 && /[a-zäöü]{3}/i.test(s));
  return (line || '').slice(0, 80);
}
function addMark() {
  if (!state.pages.length) return;
  const i = Math.max(0, state.sel), p = state.pages[i];
  marksTake();
  const m = { id: Math.random().toString(36).slice(2), title: pageTitle(p) || `Seite ${i + 1}`, pid: p.id, level: 0 };
  state.marks.push(m); marksSort(); tocEditId = m.id;
  if (!$('#tocDlg').open) { $('#tocQ').value = ''; $('#tocDlg').showModal(); }
  marksChanged(`Lesezeichen für Seite ${i + 1} angelegt – Namen eintippen, Enter übernimmt.`);
}
function renderTocEdit() {
  const q = $('#tocQ').value.trim().toLowerCase(), rows = [];
  for (const m of state.marks) {
    const i = pageIdxOf(m.pid); if (i < 0) continue;
    if (q && !m.title.toLowerCase().includes(q)) continue;
    const lv = q ? 0 : m.level;
    if (m.id === tocEditId) { rows.push(`<li class="l${lv}"><input class="tocedit" data-edit="${m.id}" value="${esc(m.title)}" aria-label="Name des Lesezeichens auf Seite ${i + 1}" maxlength="120"></li>`); continue; }
    rows.push(`<li class="l${lv}"><button type="button" class="tocgo" data-i="${i}"><span>${esc(m.title)}</span><span class="pg">S. ${i + 1}</span></button>`
      + `<button type="button" class="tocact" data-lvl="${m.id}" title="${m.level ? 'Eine Ebene höher' : 'Als Unterpunkt einrücken'}" aria-label="${esc(m.title)}: ${m.level ? 'eine Ebene höher' : 'einrücken'}">${m.level ? '⇤' : '⇥'}</button>`
      + `<button type="button" class="tocact" data-ren="${m.id}" title="Umbenennen" aria-label="${esc(m.title)} umbenennen">✎</button>`
      + `<button type="button" class="tocact" data-del="${m.id}" title="Lesezeichen löschen" aria-label="${esc(m.title)} löschen">✕</button></li>`);
  }
  $('#tocList').innerHTML = rows.join('') || `<li class="empty">${q ? 'Kein Kapitel gefunden.' : 'Noch keine Lesezeichen. „Lesezeichen für Seite …“ legt eines für die aktuelle Seite an.'}</li>`;
  const inp = $('#tocList .tocedit'); if (inp) { inp.focus(); inp.select(); }
}
function renderToc() {
  $('#tocAddL').textContent = `Lesezeichen für Seite ${Math.max(0, state.sel) + 1}`;
  // Bearbeitete Liste – oder die Gliederung, die beim Speichern entsteht, sobald sie aus mehreren Teilen besteht
  if (state.marks) return renderTocEdit();
  const q = $('#tocQ').value.trim().toLowerCase(), multi = new Set(state.pages.filter(p => p.kind === 'pdf').map(p => p.docIdx)).size > 1;
  const rows = [];
  state.docs.forEach((d, docIdx) => {
    if (!d?.outline?.length || !state.pages.some(p => p.docIdx === docIdx)) return;
    if (multi) rows.push(`<li class="l0"><button type="button" disabled><b>${esc(d.name)}</b></button></li>`);
    for (const e of d.outline) {
      if (q && !e.title.toLowerCase().includes(q)) continue;
      const i = tocTarget({ ...e, docIdx });
      rows.push(`<li class="l${q ? 0 : e.level}"><button type="button" data-i="${i}"${i < 0 ? ' disabled title="Diese Seite ist nicht mehr im Dokument"' : ''}><span>${esc(e.title)}</span><span class="pg">${i < 0 ? '–' : 'S. ' + (i + 1)}</span></button></li>`);
    }
  });
  if (!rows.length && !q) { marksTake(); return renderTocEdit(); }   // keine Lesezeichen in der Datei: gleich bearbeitbar zeigen
  $('#tocList').innerHTML = rows.join('').replace(/<li class="(l\d)"><button type="button"/g, '<li class="$1"><button type="button" class="tocgo"') || '<li class="empty">Kein Kapitel gefunden.</li>';
  if (rows.length) $('#tocList').insertAdjacentHTML('beforeend', '<li class="empty"><button type="button" class="linkbtn" id="tocEditAll" style="width:auto;padding:0">Lesezeichen bearbeiten</button></li>');
}
window.openToc = () => { $('#tocQ').value = ''; tocEditId = null; renderToc(); $('#tocDlg').showModal(); $('#tocQ').focus(); };
$('#btnToc').onclick = window.openToc;
$('#tocQ').oninput = renderToc;
$('#tocQ').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#tocList button[data-i]:not([disabled])')?.click(); } };
$('#tocClose').onclick = () => $('#tocDlg').close();
$('#tocAdd').onclick = addMark;
const tocSave = (inp, keep) => {
  const m = state.marks?.find(x => x.id === inp.dataset.edit); tocEditId = null; if (!m) return renderToc();
  const t = inp.value.replace(/\s+/g, ' ').trim();
  if (keep && t && t !== m.title) { m.title = t.slice(0, 120); marksChanged('Lesezeichen umbenannt.'); } else renderToc();
  $('#tocList [data-ren="' + m.id + '"]')?.focus();
};
$('#tocList').addEventListener('keydown', e => {
  const inp = e.target.closest('.tocedit'); if (!inp) return;
  if (e.key === 'Enter') { e.preventDefault(); tocSave(inp, true); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tocSave(inp, false); }
});
$('#tocList').addEventListener('focusout', e => { const inp = e.target.closest?.('.tocedit'); if (inp && tocEditId) setTimeout(() => { if (tocEditId === inp.dataset.edit) tocSave(inp, true); }, 0); });
$('#tocList').addEventListener('click', e => {
  if (e.target.closest('#tocEditAll')) { marksTake(); return renderToc(); }
  const act = e.target.closest('button[data-ren],button[data-del],button[data-lvl]');
  if (act) {
    const id = act.dataset.ren || act.dataset.del || act.dataset.lvl, m = state.marks.find(x => x.id === id); if (!m) return;
    if (act.dataset.ren) { tocEditId = id; return renderToc(); }
    if (act.dataset.del) { state.marks = state.marks.filter(x => x !== m); marksChanged(`Lesezeichen „${m.title}“ gelöscht.`); $('#tocList .tocact')?.focus(); return; }
    m.level = m.level ? m.level - 1 : 1; marksChanged(m.level ? 'Als Unterpunkt eingerückt.' : 'Eine Ebene höher gesetzt.'); $(`#tocList [data-lvl="${id}"]`)?.focus(); return;
  }
  const b = e.target.closest('button[data-i]'); if (!b || b.disabled) return;
  state.sel = +b.dataset.i; $('#tocDlg').close(); setView('page');
  status(`Seite ${state.sel + 1}: ${b.firstElementChild.textContent}`);
});
$('#presPrev').onclick = e => { e.stopPropagation(); presGo(-1); };
$('#presNext').onclick = e => { e.stopPropagation(); presGo(1); };
$('#presExit').onclick = e => { e.stopPropagation(); endPresent(); };
$('#present').addEventListener('click', e => { if (e.target.closest('#presBar')) return; presGo(e.clientX < innerWidth * 0.25 ? -1 : 1); });
let presTimer = 0;
$('#present').addEventListener('mousemove', () => { $('#present').classList.add('ptr'); clearTimeout(presTimer); presTimer = setTimeout(() => $('#present').classList.remove('ptr'), 2000); });
let sx = null;
$('#present').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
$('#present').addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) presGo(dx < 0 ? 1 : -1); }, { passive: true });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && pres) endPresent(); });
addEventListener('resize', () => { if (pres) { pres.cache.clear(); presRender(); } });
let goTo = '';
addEventListener('keydown', e => {
  if (!pres) {
    if (e.key === 'F5' && state.pages.length && !document.querySelector('dialog[open]')) { e.preventDefault(); startPresent(); }
    return;
  }
  const k = e.key;
  e.preventDefault(); e.stopImmediatePropagation();
  if (/^[0-9]$/.test(k)) { goTo += k; return; }
  if (k === 'Enter' && goTo) { const n = +goTo; goTo = ''; presGo(n - 1 - pres.i); return; }
  goTo = '';
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) presGo(1);
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) presGo(-1);
  else if (k === 'Home') presGo(-1e6);
  else if (k === 'End') presGo(1e6);
  else if (k === 'b' || k === 'B' || k === '.') $('#presBlack').hidden = !$('#presBlack').hidden;
  else if (k === 'Escape' || k === 'F5') endPresent();
}, true);

/* ---------- Dateianhänge (wie „Anhänge“ in Acrobat): eingebettete Dateien anzeigen, speichern, entfernen, hinzufügen ---------- */
function attRender() {
  const list = state.files || [];
  $('#attNone').hidden = list.length > 0;
  $('#attList').hidden = !list.length;
  $('#attList').innerHTML = list.map((f, i) => `<li><span class="tocgo attname" id="attN${i}">${esc(f.name)} <small class="hint">${Tools.formatBytes(f.data.length)}</small></span>` +
    `<button type="button" class="linkbtn" data-att-save="${i}" aria-describedby="attN${i}">Speichern</button><button type="button" class="linkbtn" data-att-del="${i}" aria-describedby="attN${i}">Entfernen</button></li>`).join('');
  const n = list.length; $('#btnAttach .attn').textContent = n ? ` (${n})` : '';
}
window.attRefresh = () => { if ($('#attDlg').open) attRender(); else { const n = state.files?.length || 0; $('#btnAttach .attn').textContent = n ? ` (${n})` : ''; } };
$('#btnAttach').onclick = () => { if (!state.pages.length) return; closeMenu?.(); attRender(); $('#attDlg').showModal(); };
$('#attClose').onclick = () => $('#attDlg').close();
$('#attAdd').onclick = () => $('#attIn').click();
$('#attIn').onchange = async e => {
  for (const f of e.target.files) state.files.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()), desc: '', date: new Date(f.lastModified || Date.now()) });
  e.target.value = ''; state.filesDirty = true; state.dirty = true; attRender();
  status('Datei angehängt – sie wird beim Speichern in die PDF eingebettet.');
};
$('#attList').addEventListener('click', e => {
  const s = e.target.closest('[data-att-save]'), d = e.target.closest('[data-att-del]');
  if (s) { const f = state.files[+s.dataset.attSave]; download(f.data, f.name, mimeOf(f.name)); }
  if (d) { state.files.splice(+d.dataset.attDel, 1); state.filesDirty = true; state.dirty = true; attRender(); $('#attAdd').focus(); status('Anhang entfernt – wird beim nächsten Speichern nicht mehr eingebettet.'); }
});

/* ---------- Schnittstelle mysupermail.app (Protokoll „mysupermail-pdfmy“ Version 1) ----------
   mysupermail.app öffnet https://pdfmy.de/?quelle=mysupermail und reicht eine Datei von Fenster zu Fenster herein:
   1. PDFMy meldet sich: { type: 'pdfmy:bereit', version: 1 }
   2. mysupermail schickt: { type: 'mysupermail:datei', version: 1, name, contentType, bytes (ArrayBuffer) }
   3. „Zurück an mysupermail.app“ schickt: { type: 'pdfmy:ergebnis', version: 1, name, contentType, bytes }
      Abbrechen: { type: 'pdfmy:abbruch', version: 1 } · abgelehnte Datei: { type: 'pdfmy:fehler', version: 1, grund }
   Kein Server, kein Upload. Nur Nachrichten des öffnenden Fensters von diesen Herkünften werden angenommen;
   damit das Fenster überhaupt verbunden bleibt, sendet der Server für ?quelle=mysupermail kein COOP same-origin. */
(() => {
  const MSM_ORIGINS = ['https://app.mysupermail.app', 'https://tauri.localhost'];
  if (new URLSearchParams(location.search).get('quelle') !== 'mysupermail' || !window.opener) return;
  let from = null;      // Herkunft, von der die Datei kam – nur dorthin geht das Ergebnis
  let got = false;
  let origName = 'Dokument.pdf';   // Name der hereingereichten Datei – das Ergebnis heißt wieder so (als .pdf)
  const send = (msg) => { try { window.opener?.postMessage({ version: 1, ...msg }, from); } catch {} };

  const bar = document.createElement('div');
  bar.className = 'msm-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'mysupermail.app');
  bar.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;display:none;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;background:#1f2333;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);font:14px system-ui,sans-serif;max-width:calc(100vw - 32px);flex-wrap:wrap';
  bar.innerHTML = '<span class="msm-text"></span>' +
    '<button type="button" class="msm-back" style="border:0;border-radius:8px;padding:7px 14px;background:#f08c00;color:#fff;font-weight:600;cursor:pointer">Fertig – zurück an mysupermail.app</button>' +
    '<button type="button" class="msm-cancel" style="border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:6px 12px;background:transparent;color:#fff;cursor:pointer">Abbrechen</button>';
  document.body.appendChild(bar);
  const back = bar.querySelector('.msm-back');

  bar.querySelector('.msm-cancel').onclick = () => { send({ type: 'pdfmy:abbruch' }); bar.style.display = 'none'; window.close(); };
  back.onclick = async () => {
    if (!state.pages.length) return toast('Es ist kein Dokument geöffnet.');
    back.disabled = true; back.textContent = 'PDF wird erstellt …';
    try {
      if (typeof ocrRunning !== 'undefined' && ocrRunning) await runOcrAll();
      const bytes = await buildPdf(docPages(), state.meta, { noOcr: true, onPage: () => {} });
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      window.opener.postMessage({ type: 'pdfmy:ergebnis', version: 1, name: origName.replace(/\.[^.]+$/, '') + '.pdf', contentType: 'application/pdf', bytes: buf }, from, [buf]);
      state.dirty = false;
      bar.querySelector('.msm-text').textContent = 'An mysupermail.app übergeben ✓';
      back.hidden = true; bar.querySelector('.msm-cancel').hidden = true;
      setTimeout(() => window.close(), 1200);
    } catch (e) {
      console.error(e);
      back.disabled = false; back.textContent = 'Fertig – zurück an mysupermail.app';
      toast('Übergabe nicht möglich: ' + e.message);
    }
  };

  addEventListener('message', async (e) => {
    if (e.source !== window.opener || !MSM_ORIGINS.includes(e.origin)) return;
    const d = e.data;
    if (!d || d.version !== 1 || d.type !== 'mysupermail:datei' || got) return;
    from = e.origin;
    if (!(d.bytes instanceof ArrayBuffer) || !d.bytes.byteLength) return send({ type: 'pdfmy:fehler', grund: 'leer' });
    got = true;
    const name = String(d.name || 'Dokument.pdf').replace(/[\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180);
    origName = name;
    const type = typeof d.contentType === 'string' && d.contentType ? d.contentType : mimeOf(name);
    try {
      if (state.pages.length) resetDoc();
      await importFiles([new File([d.bytes], name, { type })]);
      state.dirty = false;
      bar.querySelector('.msm-text').textContent = `„${name}“ aus mysupermail.app`;
      bar.style.display = 'flex';
    } catch (err) {
      console.error(err);
      send({ type: 'pdfmy:fehler', grund: String(err?.message || err) });
    }
  });
  // Bereit melden – an jede erlaubte Herkunft (der Browser stellt nur bei passender Herkunft zu).
  // Mehrfach, falls mysupermail.app den Empfänger erst kurz nach dem Öffnen einrichtet.
  let tries = 0;
  const hello = () => {
    if (got || tries++ > 10 || !window.opener) return;
    for (const o of MSM_ORIGINS) { try { window.opener.postMessage({ type: 'pdfmy:bereit', version: 1 }, o); } catch {} }
    setTimeout(hello, 500);
  };
  hello();
})();

/* ---------- „Meine Angaben“: Formulare mit eigenen Daten ausfüllen (js/formprofile.js) ----------
   Die Angaben liegen nur in diesem Browser (localStorage) – kein Konto, keine Übertragung. */
const FP_AUTO = { anrede: 'honorific-prefix', vorname: 'given-name', nachname: 'family-name', geburtsdatum: 'bday', strasse: 'address-line1', plz: 'postal-code', ort: 'address-level2', land: 'country-name', telefon: 'tel', email: 'email', firma: 'organization' };
const fpDocs = () => state.docs.filter(d => d?.fields?.length && state.pages.some(p => p.kind === 'pdf' && state.docs[p.docIdx] === d));
function fpOpen(note) {
  closeMenu?.();
  const prof = LS.get('profile', {}) || {};
  $('#fpGrid').innerHTML = FormProfile.KEYS.map(([k, label]) =>
    `<label for="fp-${k}">${esc(I18N.t(label))}<input id="fp-${k}" data-k="${k}" autocomplete="${FP_AUTO[k] || 'off'}" value="${esc(prof[k] || '')}"${k === 'iban' ? ' spellcheck="false"' : ''}></label>`).join('');
  $('#fpLearn').hidden = !fpDocs().length;
  $('#fpDlg').returnValue = '';
  $('#fpDlg').showModal();
  if (note) status(note);
}
$('#fpDlg').addEventListener('close', () => {
  if ($('#fpDlg').returnValue !== 'save') return;
  const prof = {};
  for (const el of $('#fpGrid').querySelectorAll('input')) { const v = el.value.trim(); if (v) prof[el.dataset.k] = v; }
  Object.keys(prof).length ? LS.set('profile', prof) : LS.del('profile');
  status(Object.keys(prof).length ? 'Meine Angaben gespeichert – nur in diesem Browser.' : 'Meine Angaben gelöscht.');
  if (fpPending) { fpPending = false; if (Object.keys(prof).length) fpFill(); }
});
$('#fpClear').onclick = () => { for (const el of $('#fpGrid').querySelectorAll('input')) el.value = ''; };
$('#fpLearn').onclick = () => {
  let n = 0;
  for (const d of fpDocs()) for (const [k, v] of Object.entries(FormProfile.learn(d.fields, d.values))) { const el = $('#fp-' + k); if (el && el.value !== v) { el.value = v; n++; } }
  status(n ? `${n} Angabe(n) aus dem Formular übernommen – bitte prüfen und speichern.` : 'Im Formular sind keine passenden Angaben ausgefüllt.');
};
let fpPending = false;
function fpFill() {
  const prof = LS.get('profile', null);
  if (!prof || !Object.keys(prof).length) { fpPending = true; return fpOpen('Einmal Ihre Angaben eintragen – danach füllt PDFMy Formulare mit einem Klick aus.'); }
  let n = 0;
  for (const d of fpDocs()) {
    const cur = d.fields.map(f => ({ ...f, value: d.values[f.name] ?? f.value }));
    const r = FormProfile.fill(cur, prof);
    if (!r.n) continue;
    Object.assign(d.values, r.values); n += r.n; state.dirty = true;
    applyForm(d);
  }
  renderForm();
  status(n ? `${n} Feld(er) mit Ihren Angaben ausgefüllt – bitte prüfen.` : 'Keine passenden leeren Felder gefunden. Felder wie Name, Anschrift oder IBAN erkennt PDFMy an ihrer Beschriftung.');
}
$('#fpFill').onclick = fpFill;
$('#fpEdit').onclick = () => fpOpen();
$('#btnProfile').onclick = () => fpOpen();

/* ---------- Lesemodus: Text neu umbrechen (js/reflow.js) – bequem lesen auf dem Handy ---------- */
const readFont = () => Math.min(32, Math.max(12, LS.get('readFont', 18)));
async function readOpen() {
  closeMenu?.();
  if (!state.pages.length) return;
  const body = $('#readBody'), toc = $('#readToc'); body.textContent = ''; toc.textContent = '';
  body.style.setProperty('--rf', readFont());
  const multi = state.pages.length > 1; let heads = 0, empty = 0, start = null;
  toc.append(new Option(I18N.t('Springen zu …'), ''));
  for (const [i, p] of state.pages.entries()) {
    const blocks = await pageBlocks(p);
    const sec = document.createElement('section'); sec.id = 'rd-pg' + i;
    if (p.lang && I18N.byOcr?.(p.lang)?.bcp) sec.lang = I18N.byOcr(p.lang).bcp;
    if (multi) { const h = document.createElement('div'); h.className = 'rpg'; h.textContent = I18N.t(`Seite ${i + 1}`); sec.append(h); toc.append(new Option(I18N.t(`Seite ${i + 1}`), sec.id)); }
    if (!blocks.length) { empty++; const n = document.createElement('p'); n.className = 'rnone'; n.textContent = I18N.t('Auf dieser Seite ist noch kein Text erkannt („… Mehr → Texterkennung (OCR) für alle Seiten“).'); sec.append(n); }
    let list = null;
    for (const b of blocks) {
      if (b.type === 'li') { if (!list) sec.append(list = document.createElement('ul')); const li = document.createElement('li'); li.textContent = b.text.replace(/^[•·▪◦‣–\-*]\s*/, ''); list.append(li); continue; }
      list = null;
      if (b.type === 'table') {   // Tabelle: auf dem Handy waagrecht scrollbar statt zerquetscht
        const wrap = document.createElement('div'); wrap.className = 'rtbl'; wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', I18N.t('Tabelle'));
        const t = document.createElement('table');
        b.rows.forEach((r, ri) => { const tr = t.insertRow(); r.forEach(c => { const td = document.createElement(ri ? 'td' : 'th'); td.textContent = c; tr.append(td); }); });
        wrap.append(t); sec.append(wrap); continue;
      }
      const el = document.createElement(b.type === 'h' ? (b.level === 1 ? 'h2' : 'h3') : 'p'); el.textContent = b.text;
      if (b.type === 'h') { el.id = 'rd-h' + (++heads); toc.append(new Option('  ' + b.text.slice(0, 60), el.id)); }
      sec.append(el);
    }
    body.append(sec);
    if (p === cur()) start = sec;
  }
  toc.hidden = toc.options.length < 3;
  $('#readDlg').showModal();
  if (start && multi) start.scrollIntoView(); else body.scrollTop = 0;
  body.focus();
  if (empty === state.pages.length) status('Noch kein Text erkannt – zuerst die Texterkennung laufen lassen, dann zeigt der Lesemodus den Text.');
}
$('#readToc').onchange = e => { const t = document.getElementById(e.target.value); if (t) t.scrollIntoView({ behavior: 'smooth' }); e.target.value = ''; };
const readZoom = d => { const v = Math.min(32, Math.max(12, readFont() + d)); LS.set('readFont', v); $('#readBody').style.setProperty('--rf', v); };
$('#readSm').onclick = () => readZoom(-2); $('#readLg').onclick = () => readZoom(2);
$('#btnReader').onclick = readOpen; $('#readMode').onclick = readOpen;

/* ---------- In Cloud-Ordner speichern (Nextcloud, ownCloud, Seafile, Dropbox, OneDrive, Google Drive, iCloud) – wie „In Office-Programm öffnen“ ----------
   pdfmy Scan findet die Sync-Ordner der Programme, die der Nutzer selbst installiert hat, und legt die PDF im Unterordner „PDFMy“ ab.
   PDFMy baut keine Verbindung zur Cloud auf – das Hochladen übernimmt das Sync-Programm des Nutzers (KONZEPT.md, Entscheidung 23.10.2026). */
let cloudSaved = '';
$('#btnCloud').onclick = async () => {
  closeMenu();
  if (!state.pages.length) { status('Zuerst ein Dokument öffnen – dann lässt es sich im Cloud-Ordner speichern.'); return; }
  if (IS_MOBILE) { toast('Auf dem Handy: „Teilen …“ wählen und die App Ihres Cloud-Speichers (z. B. Nextcloud) antippen.', 7000); return; }
  const dl = f => (APP.edition === 'web' ? '' : 'https://pdfmy.de/') + 'download/' + f;
  const running = await scanHelperRunning(), need = state.scanMac ? '1.5.0' : '1.12.0';
  if (!running || verLess(state.scanVersion, need)) {
    const mac = IS_MAC || state.scanMac;
    if (confirm(mac ? 'Dafür wird „pdfmy Scan“ für Mac bzw. Linux ab Version 1.5.0 benötigt. Es findet die Ordner von Nextcloud, Dropbox & Co. auf Ihrem Rechner und legt die PDF dort ab – PDFMy selbst lädt nichts hoch.\n\nJetzt herunterladen?'
      : 'Dafür wird das kleine Windows-Programm „pdfmy Scan“ ab Version 1.12.0 benötigt. Es findet die Ordner von Nextcloud, Dropbox & Co. auf Ihrem Rechner und legt die PDF dort ab – PDFMy selbst lädt nichts hoch.\n\nJetzt herunterladen?')) location.href = dl(mac ? SCAN_FILE_UNIX() : SCAN_FILE);
    return;
  }
  const r = await fetch(SCAN_API + '/cloud', { headers: { 'X-Pdfmy': '1' }, cache: 'no-store' }).then(x => x.json()).catch(() => ({ folders: [] }));
  const fl = r.folders || [], list = $('#cloudList'), last = LS.get('cloudChoice', '');
  list.textContent = '';
  for (const [i, f] of fl.entries()) {
    const l = document.createElement('label'); l.className = 'prrow';
    const inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'cloudF'; inp.value = f.id; inp.checked = f.id === last || (!fl.some(x => x.id === last) && i === 0);
    const sp = document.createElement('span'), b = document.createElement('b'), sm = document.createElement('small');
    b.textContent = f.name; b.translate = false; sm.textContent = ' – ' + f.path; sm.translate = false;
    sp.append(b, sm); l.append(inp, ' ', sp); list.append(l);
  }
  cloudSaved = '';
  $('#cloudNone').hidden = fl.length > 0; $('#cloudSet').hidden = !fl.length; $('#cloudGo').hidden = !fl.length;
  $('#cloudDone').hidden = true; $('#cloudShow').hidden = true; $('#cloudClose').textContent = I18N.t('Abbrechen');
  $('#cloudDlg').showModal();
};
$('#cloudClose').onclick = () => $('#cloudDlg').close();
$('#cloudShow').onclick = () => fetch(SCAN_API + '/cloud/show', { method: 'POST', headers: { 'X-Pdfmy': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ path: cloudSaved }) }).catch(() => {});
$('#cloudForm').addEventListener('submit', async e => {
  e.preventDefault();
  const sel = $('#cloudDlg').querySelector('[name=cloudF]:checked'); if (!sel) return;
  const name = sel.closest('label').querySelector('b').textContent;
  LS.set('cloudChoice', sel.value); $('#cloudGo').disabled = true;
  status(`Wird in ${name} gespeichert …`);
  try {
    const bytes = await buildPdf(state.pages, state.meta, { onPage: () => {} });
    const res = await fetch(SCAN_API + '/cloud', { method: 'POST', headers: { 'X-Pdfmy': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sel.value, name: baseName() + '.pdf', data: b64Bytes(bytes) }) }).then(x => x.json());
    if (!res.ok) { status(res.error || 'Das hat nicht geklappt.'); alert(res.error || 'Das hat nicht geklappt.'); return; }
    cloudSaved = res.path || ''; state.dirty = false;
    const msg = I18N.t(`Gespeichert in ${name}: ${res.path} – Ihr Sync-Programm lädt die Datei hoch.`);
    $('#cloudDone').textContent = msg; $('#cloudDone').hidden = false; $('#cloudShow').hidden = false; $('#cloudGo').hidden = true;
    $('#cloudClose').textContent = I18N.t('Schließen'); status(msg);
  } catch { status('pdfmy Scan antwortet nicht. Bitte prüfen, ob es läuft (Symbol unten rechts), und noch einmal versuchen.'); }
  finally { $('#cloudGo').disabled = false; }
});

/* ---------- Barrierefrei: Bilder finden und beschreiben (Alternativtexte) ----------
   DocDetect.findFigures sucht auf jeder Seite Fotos, Logos und Grafiken (ohne die erkannten Wörter). Der Nutzer beschreibt sie kurz
   oder markiert sie als Schmuck; beim Speichern als PDF/UA werden beschriebene Bilder zu „Figure“ mit Alternativtext (buildPdf). */
async function a11yFigures() {
  const pages = state.pages.slice(0, 60);
  const img = pages.filter(p => p.kind === 'image' && !p.ocr && !p.blank && !p.photo);
  if (img.length) { status('Texterkennung für die Bildsuche …'); await waitForOcr(img); }
  const found = [];
  for (const [i, p] of pages.entries()) {
    if (p.blank) continue;
    status(`Suche Bilder auf Seite ${i + 1} von ${pages.length} …`, i / pages.length);
    const src = p.kind === 'image' ? p.processed : await renderPdf(p, 110).catch(() => null); if (!src) continue;
    const s = Imaging.scaled(src, 1000), words = p.ocr?.words || await pageWords(p).catch(() => null) || [];
    const figs = p.photo ? [{ x: 0, y: 0, w: 1, h: 1 }] : DocDetect.findFigures(s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height).data, s.width, s.height, words);
    for (const f of figs) {
      const old = (p.figs || []).find(o => Math.abs(o.x - f.x) < 0.02 && Math.abs(o.y - f.y) < 0.02);
      found.push({ p, page: i + 1, f: { ...f, alt: old?.alt ?? (f.y < 0.15 && f.w * f.h < 0.05 && state.meta?.sender ? I18N.t(`Logo ${state.meta.sender}`) : ''), deco: old?.deco ?? false }, src });
    }
  }
  status(found.length ? `${found.length} Bild(er) gefunden – bitte kurz beschreiben.` : 'Keine Bilder gefunden.');
  if (!found.length) return;
  const list = $('#figList'); list.textContent = '';
  for (const [k, x] of found.entries()) {
    const li = document.createElement('li'), c = document.createElement('canvas'), sc = Math.min(1, 240 / Math.max(x.f.w * x.src.width, x.f.h * x.src.height));
    c.width = Math.max(1, Math.round(x.f.w * x.src.width * sc)); c.height = Math.max(1, Math.round(x.f.h * x.src.height * sc));
    c.getContext('2d').drawImage(x.src, x.f.x * x.src.width, x.f.y * x.src.height, x.f.w * x.src.width, x.f.h * x.src.height, 0, 0, c.width, c.height);
    c.setAttribute('aria-hidden', 'true');
    const box = document.createElement('div');
    box.innerHTML = `<label for="fig-${k}">${esc(I18N.t(`Bild ${k + 1} (Seite ${x.page}) – Beschreibung`))}<input type="text" id="fig-${k}" maxlength="250"></label>
      <label class="deco"><input type="checkbox" id="figd-${k}"> ${esc(I18N.t('Nur Schmuck – nicht vorlesen'))}</label>`;
    box.querySelector('input[type=text]').value = x.f.alt; box.querySelector('input[type=checkbox]').checked = x.f.deco;
    li.append(c, box); list.append(li);
  }
  const dlg = $('#figDlg'); dlg.returnValue = ''; dlg.showModal();
  await new Promise(r => dlg.addEventListener('close', r, { once: true }));
  if (dlg.returnValue !== 'ok') { status('Bilder nicht beschrieben – sie bleiben Teil des Seitenbilds und werden nicht vorgelesen.'); return; }
  for (const p of new Set(found.map(x => x.p))) p.figs = [];
  let n = 0;
  found.forEach((x, k) => { const alt = $('#fig-' + k).value.trim(), deco = $('#figd-' + k).checked; x.p.figs.push({ ...x.f, alt, deco }); if (alt && !deco) n++; });
  status(`${n} Bild(er) beschrieben – sie werden beim Speichern mit Alternativtext gekennzeichnet.`);
}
