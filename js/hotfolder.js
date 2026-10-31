// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* ---------- Ordner überwachen („Hot Folder“ wie bei ABBYY) – ohne Server ----------
   Jede neue Datei im Eingangsordner (PDF, Foto, Scan, Word, Excel …) wird automatisch verarbeitet: durchsuchbar machen, als PDF/A
   archivieren, verkleinern, eigener Ablauf oder als Brief ins Posteingangsbuch ablegen. Name wie das Original oder aus dem Inhalt
   (Datum_Absender_Betreff), Original danach in „_erledigt“. Läuft in einem eigenen PDFMy-Fenster (?automatik=1), damit es dem
   Dokument, an dem man gerade arbeitet, nie in die Quere kommt – solange dieses Fenster offen ist (Edge/Chrome: Ordnerzugriff). */
(() => {
  const SUPPORTED = /\.(pdf|jpe?g|png|webp|bmp|gif|tiff?|heic|heif|docx|xlsx|odt|ods|epub|txt|md|csv)$/i;
  const DONE = '_erledigt', FAIL = '_fehler', TICK = 5000;
  const HOT = new URLSearchParams(location.search).get('automatik') === '1';
  window.HOT_MODE = HOT;
  const ACTS = { ocr: 'Durchsuchbar machen', pdfa: 'Archivieren (PDF/A)', small: 'Verkleinern', file: 'Briefe ablegen' };
  const actLabel = c => c.act.startsWith('flow:') ? (flows()[+c.act.slice(5)]?.name || 'Eigener Ablauf') : ACTS[c.act] || c.act;

  /* ---------- Einrichten (Hauptfenster) ---------- */
  let cfg = null;
  async function openHot() {
    if (!window.showDirectoryPicker) return status('„Ordner überwachen“ braucht Edge oder Chrome am Computer (Ordnerzugriff).');
    cfg = { act: 'ocr', name: 'auto', move: true, ...((await idb.get('hot').catch(() => null)) || {}) };
    const d = $('#hotDlg');
    $('#hotFlows').replaceChildren(...flows().map((f, i) => [f, i]).filter(([f]) => f.o.format === 'pdf' || f.o.format === 'pdfa').map(([f, i]) => {
      const l = document.createElement('label'); l.className = 'prrow';
      l.innerHTML = `<input type="radio" name="hotAct" value="flow:${i}"> <span><b translate="no"></b> <small>– eigener Ablauf</small></span>`;
      l.querySelector('b').textContent = f.name; return l;
    }));
    (d.querySelector(`[name=hotAct][value="${cfg.act}"]`) || d.querySelector('[name=hotAct][value=ocr]')).checked = true;
    d.querySelector(`[name=hotName][value="${cfg.name}"]`).checked = true;
    $('#hotMove').checked = cfg.move !== false;
    sync(); $('#hotErr').textContent = '';
    if (!d.open) d.showModal();
  }
  function sync() {
    const act = $('#hotDlg').querySelector('[name=hotAct]:checked')?.value || 'ocr';
    $('#hotInName').textContent = cfg.inDir ? cfg.inDir.name : I18N.t('noch nicht gewählt');
    $('#hotOutRow').hidden = act === 'file'; $('#hotNameSet').hidden = act === 'file';
    $('#hotOutName').textContent = cfg.outDir ? cfg.outDir.name : I18N.t('noch nicht gewählt');
    $('#hotFileNote').hidden = act !== 'file';
    $('#hotFileNote').textContent = state.outDir ? `Abgelegt wird wie gewohnt im Ablageordner „${state.outDir.name}“, mit Eintrag im Posteingangsbuch.` : 'Für „Briefe ablegen“ bitte zuerst unter „Mehr → Einrichtung“ einen Ablageordner wählen.';
  }
  const pick = async (id) => { try { return await showDirectoryPicker({ id, mode: 'readwrite' }); } catch (e) { if (e.name !== 'AbortError') status(`Ordner nicht verfügbar: ${e.message}`); return null; } };
  $('#hotDlg').addEventListener('change', sync);
  $('#hotIn').onclick = async () => { const h = await pick('mpdf-hot-in'); if (h) { cfg.inDir = h; sync(); } };
  $('#hotOut').onclick = async () => { const h = await pick('mpdf-hot-out'); if (h) { cfg.outDir = h; sync(); } };
  $('#hotCancel').onclick = () => $('#hotDlg').close();
  $('#hotGo').onclick = async () => {
    const d = $('#hotDlg'); cfg.act = d.querySelector('[name=hotAct]:checked').value; cfg.name = d.querySelector('[name=hotName]:checked').value; cfg.move = $('#hotMove').checked;
    const err = !cfg.inDir ? 'Bitte den Eingangsordner wählen.' : cfg.act === 'file' ? (!state.outDir ? 'Bitte zuerst einen Ablageordner einrichten (Mehr → Einrichtung).' : '')
      : !cfg.outDir ? 'Bitte den Zielordner wählen.' : (await cfg.inDir.isSameEntry(cfg.outDir) ? 'Eingangs- und Zielordner müssen verschieden sein – sonst würde jedes Ergebnis wieder verarbeitet.' : '');
    if (err) { $('#hotErr').textContent = err; return; }
    await idb.set('hot', cfg); await idb.set('hotDone', []);
    d.close();
    const w = window.open(location.pathname + '?automatik=1', 'pdfmy-ordner', 'width=620,height=760');
    status(w ? `Ordner „${cfg.inDir.name}“ wird jetzt im eigenen Fenster überwacht – ${actLabel(cfg)}. Das Fenster bitte offen lassen.` : 'Das Fenster wurde blockiert – bitte Pop-ups für PDFMy erlauben und erneut starten.');
  };
  $('#tileHot')?.addEventListener('click', openHot);
  $('#batchHot')?.addEventListener('click', () => { $('#batchDlg').close(); openHot(); });
  window.openHot = openHot;

  /* ---------- Überwachung (eigenes Fenster) ---------- */
  if (!HOT) return;
  let busy = false, paused = false, timer = null, okN = 0, badN = 0, doneKeys = new Set();
  const sizes = new Map(), fails = new Map();
  const panel = $('#hotPanel'), stateEl = $('#hotState'), log = $('#hotLog');
  document.body.classList.add('hotmode'); panel.hidden = false;
  document.title = 'PDFMy – Ordner überwachen';
  const say = t => { stateEl.textContent = t; };
  const row = (name, text, cls) => {
    const li = document.createElement('li'); li.innerHTML = '<span class="bn"></span><span class="bs"></span>';
    li.querySelector('.bn').textContent = name; li.querySelector('.bs').textContent = text; if (cls) li.querySelector('.bs').classList.add(cls);
    log.prepend(li); while (log.children.length > 200) log.lastChild.remove(); return li;
  };
  const setRow = (li, text, cls) => { const s = li.querySelector('.bs'); s.textContent = text; s.className = 'bs' + (cls ? ' ' + cls : ''); };
  async function ready() {
    cfg = await idb.get('hot').catch(() => null);
    if (!cfg?.inDir) { say('Keine Einstellungen gefunden – im PDFMy-Hauptfenster „Ordner überwachen“ wählen.'); return false; }
    doneKeys = new Set((await idb.get('hotDone').catch(() => null)) || []);
    $('#hotInfo').textContent = `Eingang: „${cfg.inDir.name}“ · ${actLabel(cfg)}` + (cfg.act === 'file' ? (state.outDir ? ` · Ablage: „${state.outDir.name}“` : '') : ` · Ziel: „${cfg.outDir.name}“`) + (cfg.move ? ` · Originale nach „${DONE}“` : '');
    const need = [[cfg.inDir, cfg.move ? 'readwrite' : 'read'], ...(cfg.act === 'file' ? [[state.outDir || (await idb.get('outDir')), 'readwrite']] : [[cfg.outDir, 'readwrite']])];
    for (const [h, mode] of need) if (!h || !(await permitted(h, mode, false).catch(() => false))) { $('#hotGrant').hidden = false; say('Bitte einmal auf „Ordner freigeben“ klicken – der Browser fragt nach dem Zugriff.'); return false; }
    if (cfg.act === 'file' && !state.outDir) useOutDir(await idb.get('outDir'));
    $('#hotGrant').hidden = true; return true;
  }
  $('#hotGrant').onclick = async () => {
    const need = [[cfg.inDir, cfg.move ? 'readwrite' : 'read'], [cfg.act === 'file' ? (state.outDir || await idb.get('outDir')) : cfg.outDir, 'readwrite']];
    for (const [h, mode] of need) if (h && !(await permitted(h, mode, true).catch(() => false))) return say('Ohne Freigabe kann PDFMy den Ordner nicht lesen.');
    if (await ready()) run();
  };
  $('#hotPause').onclick = () => { paused = !paused; $('#hotPause').textContent = paused ? 'Fortsetzen' : 'Anhalten'; say(paused ? 'Angehalten.' : 'Überwacht …'); if (!paused) tick(); };
  function run() { clearInterval(timer); timer = setInterval(tick, TICK); tick(); }
  const keyOf = f => `${f.name}|${f.size}|${f.lastModified}`;
  async function tick() {
    if (busy || paused) return; busy = true;
    try {
      const fresh = [];
      for await (const [name, h] of cfg.inDir.entries()) {
        if (h.kind !== 'file' || !SUPPORTED.test(name) || /^[.~]/.test(name)) continue;
        const f = await h.getFile(), k = keyOf(f);
        if (doneKeys.has(k)) continue;
        if (sizes.get(name) !== f.size) { sizes.set(name, f.size); continue; }   // wird noch geschrieben (Scanner, Kopie) – beim nächsten Durchgang
        fresh.push({ h, f, k });
      }
      fresh.sort((a, b) => a.f.lastModified - b.f.lastModified);
      for (const it of fresh) { if (paused) break; await one(it); }
      say(paused ? 'Angehalten.' : `Überwacht … ${okN} verarbeitet${badN ? `, ${badN} mit Fehler` : ''} · zuletzt geprüft ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
    } catch (e) { console.warn(e); say('Ordner nicht erreichbar: ' + e.message + ' – neuer Versuch in wenigen Sekunden.'); }
    finally { busy = false; }
  }
  async function moveTo(h, f, sub) {
    const dir = await cfg.inDir.getDirectoryHandle(sub, { create: true });
    try { if (h.move) { let n = f.name, k = 2; while (await exists(dir, n)) n = f.name.replace(/(\.[^.]+)$/, ` (${k++})$1`); await h.move(dir, n); return; } } catch {}
    await writeUnique(dir, f.name, new Uint8Array(await f.arrayBuffer()));
    await cfg.inDir.removeEntry(f.name);
  }
  async function one({ h, f, k }) {
    const li = row(f.name, 'wird verarbeitet …');
    say(`Verarbeite „${f.name}“ …`);
    resetDoc(); state.intent = null; state.dirty = false;
    try {
      await importFiles([f]);
      let pages = docPages(); if (!pages.length) throw new Error('keine Seiten');
      let result;
      if (cfg.act === 'file') {
        await waitForOcr(pages); analyze();
        const meta = { ...state.meta }, dup = findDuplicate(meta, await journalAll());
        if (dup) result = `übersprungen – schon abgelegt (${dup.file.split('\\').pop()})`;
        else {
          const data = einvOriginal(pages) || await buildPdf(pages, meta, { pdfa: S.pdfa && allScans(), onPage: () => {} });
          const where = `${state.outDir.name}\\${await saveToOutDir(data, filename(), meta)}`;
          await journalAdd(meta, where, pages.length); result = '→ ' + where;
        }
      } else {
        const flow = cfg.act.startsWith('flow:') ? flows()[+cfg.act.slice(5)] : null, base = f.name.replace(/\.[^.]+$/, '');
        let data;
        if (flow) {
          const fo = flow.o;
          if (fo.dropBlank) pages = pages.filter(p => !(p.blank && !p.keepBlank));
          if (fo.format === 'pdfa' || cfg.name === 'auto') await waitForOcr(pages);
          data = await buildPdf(pages, state.meta, { ...stampOpts({ ...fo, letterhead: fo.letterhead && fo.format === 'pdf' }, base), size: fo.size || 'balanced', pdfa: fo.format === 'pdfa', noOcr: fo.format !== 'pdfa', bookmarks: true, onPage: () => {} });
          if (fo.sheet && fo.sheet !== '1' && fo.format === 'pdf') data = await sheetLayout(data, fo.sheet);
        } else {
          if (cfg.act !== 'small' || cfg.name === 'auto') await waitForOcr(pages);
          const o = n => ({ onPage: () => {}, size: n || (cfg.act === 'small' ? 'small' : 'balanced'), pdfa: cfg.act === 'pdfa', noOcr: cfg.act === 'small', bookmarks: true });
          data = await buildPdf(pages, state.meta, o());
          if (cfg.act === 'small') { const alt = await buildPdf(pages, state.meta, o('balanced')); if (alt.length < data.length) data = alt; if (/\.pdf$/i.test(f.name) && f.size <= data.length) data = new Uint8Array(await f.arrayBuffer()); }
        }
        let name = base + '.pdf';
        if (cfg.name === 'auto') { analyze(); const n = filename(); if (n && !/^Scan(_|\.)/i.test(n)) name = n; }
        result = '→ ' + await writeUnique(cfg.outDir, name, data);
      }
      if (cfg.move) await moveTo(h, f, DONE); else { doneKeys.add(k); await idb.set('hotDone', [...doneKeys].slice(-5000)); }
      okN++; setRow(li, result, 'ok');
    } catch (e) {
      console.error(e);
      const n = (fails.get(k) || 0) + 1; fails.set(k, n);
      if (n >= 2) {   // zweimal gescheitert: beiseitelegen, damit die Schlange nicht hängen bleibt
        try { if (cfg.move) await moveTo(h, f, FAIL); else { doneKeys.add(k); await idb.set('hotDone', [...doneKeys]); } } catch {}
        badN++; setRow(li, `Fehler: ${e.message || e}` + (cfg.move ? ` – nach „${FAIL}“ gelegt` : ''), 'bad');
      } else setRow(li, `Fehler: ${e.message || e} – neuer Versuch`, 'bad');
    } finally { resetDoc(); state.dirty = false; }
  }
  // Kein automatisches Update-Neuladen im Überwachungsfenster (busyNow in js/app.js) – es blieb sonst an „Seite verlassen?“ hängen
  window.hotfolderActive = true;
  // Fenster schließen: Hinweis, dass die Überwachung dann endet
  addEventListener('beforeunload', e => { if (timer && !paused) { e.preventDefault(); e.returnValue = ''; } });
  (async () => {
    document.querySelectorAll('dialog[open]').forEach(dl => dl.close());
    say('Starte …');
    await new Promise(r => setTimeout(r, 800));   // gemerkte Ordner (Ablage) sind dann verbunden
    if (await ready()) run();
  })();
})();
