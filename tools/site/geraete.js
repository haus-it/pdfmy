// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Geräteliste: Sofortsuche nach Modell (lokal im Browser). Bindestriche/Leerzeichen egal: „MFC L2710“ findet „MFC-L2710DW“.
(() => {
  const q = document.getElementById('gq'), count = document.getElementById('gcount'), none = document.getElementById('gnone');
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\-_/]+/g, '');
  const rows = [...document.querySelectorAll('.gt tr')].filter(r => r.querySelector('td'));
  const secs = [...document.querySelectorAll('.gsec')];
  // Markenname mitsuchen, wo er nicht in der Zeile steht (Abschnitte Brother, Epson, HP, Canon)
  rows.forEach(r => { const id = r.closest('.gsec').id; r.dataset.k = norm(r.textContent + ' ' + (['brother', 'epson', 'hp', 'canon'].includes(id) ? id : '')); });
  function run() {
    const words = q.value.trim().split(/\s+/).filter(w => w.length > 1).map(norm);
    let n = 0;
    for (const r of rows) { const ok = !words.length || words.every(w => r.dataset.k.includes(w)); r.classList.toggle('ghidden', !ok); if (ok) n++; }
    for (const s of secs) { if (s.id === 'nicht') continue; s.classList.toggle('ghidden', !!words.length && !s.querySelector('tr:not(.ghidden) td')); }
    none.hidden = !words.length || n > 0;
    count.textContent = words.length ? (n ? `${n} passende Modellreihe${n === 1 ? '' : 'n'}` : 'Nichts gefunden') : '';
    try { history.replaceState(null, '', words.length ? '#suche=' + encodeURIComponent(q.value.trim()) : location.pathname); } catch {}
  }
  let t = 0; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 100); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { q.value = ''; run(); } });
  const m = location.hash.match(/^#suche=(.*)$/); if (m) { q.value = decodeURIComponent(m[1]); run(); }
})();
