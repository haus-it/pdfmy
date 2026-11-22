// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Beiträge per Überweisung – app-v327.
   Für Mitglieder ohne SEPA-Lastschrift: je Mitglied eine Beitragsaufforderung mit GiroCode (EPC-QR, mit der Banking-App scannen)
   und eindeutiger Zahlungsreferenz im Verwendungszweck. Danach der Abgleich mit dem Kontoauszug (CSV oder CAMT, über js/bank.js
   gelesen): bezahlt, teilweise bezahlt, offen – als Übersicht (PDF) und auf Wunsch Zahlungserinnerungen nur für die Offenen.
   Erkannt wird zuerst an der Referenz im Verwendungszweck, sonst am Namen und am Betrag. Alles lokal – Mitgliederliste und
   Kontoauszug verlassen das Gerät nicht. Keine Skripte im PDF (Leitplanke 6). */
(function (root) {
  'use strict';

  const norm = s => String(s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const key = s => norm(s).replace(/[^a-z0-9]/g, '');
  const zahl = v => { if (typeof v === 'number') return v; const s = String(v ?? '').replace(/[€\s]|EUR/gi, ''); if (!s) return NaN; const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, '')); return isFinite(n) ? n : NaN; };
  const r2 = n => Math.round(n * 100) / 100;
  // GiroCode/Verwendungszweck: SEPA-Zeichensatz (Banken kürzen oder ersetzen sonst Umlaute unterschiedlich)
  const sepa = s => norm(s).replace(/[^a-z0-9/\-?:().,'+ ]/gi, ' ').replace(/\s+/g, ' ').trim();
  const sepaKlar = s => String(s ?? '').replace(/[äöüÄÖÜß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' })[c]).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------- Mitgliederliste ---------- */
  // Spalten: Name bzw. Vorname/Nachname, Betrag/Beitrag, optional Mitgliedsnummer, Straße, PLZ, Ort, E-Mail
  function ausTabelle(rows, { praefix = 'B' } = {}) {
    rows = (rows || []).filter(r => r && r.some(c => String(c ?? '').trim()));
    const hi = rows.findIndex((r, i) => i < 15 && r.some(c => /^(name|nachname|mitglied|vorname)$/.test(key(c))));
    if (hi < 0) return { mitglieder: [], fehler: ['In der Liste wurde keine Spalte „Name“ bzw. „Vorname“/„Nachname“ gefunden.'] };
    const head = rows[hi].map(key), col = (...k) => { for (const x of k) { const i = head.findIndex(h => x.startsWith('=') ? h === x.slice(1) : h.includes(x)); if (i >= 0) return i; } return -1; };
    const c = { name: col('=name', '=mitglied', 'kontoinhaber'), vor: col('vorname'), nach: col('nachname', 'familienname'), nr: col('mitgliedsnummer', 'mitgliedsnr', 'mitgliednr', '=nr', '=nummer'),
      betrag: col('=betrag', 'beitrag', 'betrag', 'summe'), str: col('strasse', 'anschrift', 'adresse'), plz: col('plz', 'postleitzahl'), ort: col('=ort', 'wohnort', 'stadt'), mail: col('email', 'mail') };
    if (c.betrag < 0) return { mitglieder: [], fehler: ['In der Liste fehlt die Spalte „Betrag“ bzw. „Beitrag“.'] };
    const out = [], fehler = [], seen = new Set(), cell = (r, i) => i >= 0 ? String(r[i] ?? '').trim() : '';
    rows.slice(hi + 1).forEach((r, i) => {
      const name = cell(r, c.name) || [cell(r, c.vor), cell(r, c.nach)].filter(Boolean).join(' ');
      if (!name) return;
      const betrag = r2(zahl(c.betrag >= 0 ? r[c.betrag] : ''));
      if (!(betrag > 0)) return fehler.push(`Zeile ${hi + i + 2} (${name}): Betrag fehlt oder ist ungültig.`);
      let ref = sepaKlar(cell(r, c.nr)).replace(/ /g, '');
      ref = `${sepaKlar(praefix).replace(/ /g, '')}${ref ? '-' + ref : '-' + String(out.length + 1).padStart(3, '0')}`;
      while (seen.has(ref)) ref += 'X';
      seen.add(ref);
      out.push({ name, betrag, ref, nr: cell(r, c.nr), strasse: cell(r, c.str), plzOrt: [cell(r, c.plz), cell(r, c.ort)].filter(Boolean).join(' '), email: cell(r, c.mail) });
    });
    return { mitglieder: out, fehler: out.length || fehler.length ? fehler : ['Die Liste enthält keine Mitglieder mit Betrag.'] };
  }
  // Verwendungszweck: Referenz zuerst (Banken kürzen hinten), dann Zweck und Name – höchstens 140 Zeichen
  const zweckVon = (m, zweck) => sepaKlar(`${m.ref} ${zweck || 'Mitgliedsbeitrag'} ${m.name}`).slice(0, 140).trim();

  /* ---------- Abgleich mit dem Kontoauszug ----------
     txs: [{ date, amount, name, purpose }] (js/bank.js). Nur Eingänge. Je Mitglied: Referenz im Zweck (sicher), sonst Name
     (alle Namensteile ab 3 Zeichen im Namen oder Zweck der Buchung). Mehrere Teilzahlungen werden addiert. */
  function abgleich(mitglieder, txs) {
    const ein = (txs || []).map((t, i) => ({ ...t, i, p: key(t.purpose), n: norm(t.name) + ' ' + norm(t.purpose) })).filter(t => t.amount > 0);
    const used = new Set();
    const res = mitglieder.map(m => ({ ...m, zahlungen: [], bezahlt: 0, sicher: false }));
    // 1) Referenz im Verwendungszweck (eindeutig)
    for (const m of res) {
      const rk = key(m.ref);
      for (const t of ein) if (!used.has(t.i) && rk.length >= 4 && t.p.includes(rk)) { used.add(t.i); m.zahlungen.push(t); m.sicher = true; }
    }
    // 2) Name (alle Teile) – nur wenn genau ein Mitglied mit diesem Namen passt
    const teile = m => norm(m.name).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    for (const t of ein) {
      if (used.has(t.i)) continue;
      const passt = res.filter(m => { const w = teile(m); return w.length && w.every(x => new RegExp(`(^|[^a-z0-9])${x}([^a-z0-9]|$)`).test(t.n)); });
      if (passt.length === 1) { used.add(t.i); passt[0].zahlungen.push(t); }
    }
    for (const m of res) {
      m.bezahlt = r2(m.zahlungen.reduce((s, t) => s + t.amount, 0));
      m.status = m.bezahlt >= m.betrag - 0.005 ? 'bezahlt' : m.bezahlt > 0 ? 'teilweise' : 'offen';
      m.offen = r2(Math.max(0, m.betrag - m.bezahlt));
      m.datum = m.zahlungen.map(t => t.date).sort().pop() || '';
    }
    const sum = st => r2(res.filter(m => !st || m.status === st).reduce((s, m) => s + (st === 'bezahlt' || !st ? m.betrag : m.offen), 0));
    return { mitglieder: res, summe: { soll: sum(), offen: r2(res.reduce((s, m) => s + m.offen, 0)), eingang: r2(res.reduce((s, m) => s + m.bezahlt, 0)) },
      anzahl: { bezahlt: res.filter(m => m.status === 'bezahlt').length, teilweise: res.filter(m => m.status === 'teilweise').length, offen: res.filter(m => m.status === 'offen').length },
      nichtZugeordnet: ein.filter(t => !used.has(t.i)).length };
  }

  /* ---------- PDF ---------- */
  const A4 = [595.28, 841.89], M = 70, W = A4[0] - M - 56, mm = v => v / 25.4 * 72;
  const deDatum = d => { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? String(d || '') : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const deEuro = n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const ibanGrp = s => String(s || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
  async function fonts(L, doc, opts) {
    if (opts.fontkit && opts.regular) { doc.registerFontkit(opts.fontkit); return [await doc.embedFont(opts.regular, { subset: true }), opts.bold ? await doc.embedFont(opts.bold, { subset: true }) : await doc.embedFont(opts.regular, { subset: true })]; }
    return [await doc.embedFont(L.StandardFonts.Helvetica), await doc.embedFont(L.StandardFonts.HelveticaBold)];
  }

  /* Beitragsaufforderung bzw. Zahlungserinnerung je Mitglied.
     v: { verein, anschrift, iban, bic, kontakt, zweck, faellig (Date|ISO), unterzeichner }  opts: { qr: payload → { n, dark(r, c) }, epc, fontkit, regular, bold, heute, erinnerung } */
  async function aufforderung(L, v, mitglieder, opts = {}) {
    if (!mitglieder.length) throw new Error('Keine Mitglieder.');
    const doc = await L.PDFDocument.create(), [R, B] = await fonts(L, doc, opts);
    const ink = L.rgb(0.1, 0.1, 0.12), grey = L.rgb(0.42, 0.45, 0.5), line = L.rgb(0.75, 0.77, 0.8), verein = v.verein || 'Verein';
    const erinnerung = !!opts.erinnerung, titel = erinnerung ? 'Zahlungserinnerung' : 'Beitragsrechnung', heute = opts.heute || new Date();
    const absender = [verein, String(v.anschrift || '').replace(/\s*\n\s*/g, ' · ')].filter(Boolean).join(' · ');
    const ortZeile = String(v.anschrift || '').split(/\n|,/).pop().replace(/^\s*\d{5}\s*/, '').trim();
    doc.setTitle(`${titel} – ${v.zweck || 'Mitgliedsbeitrag'} – ${verein}`); doc.setLanguage('de-DE'); doc.setProducer('PDFMy (pdfmy.de)'); doc.setSubject(titel);
    for (const m of [...mitglieder].sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
      const betrag = erinnerung && m.offen != null ? m.offen : m.betrag, zweck = zweckVon(m, v.zweck);
      const page = doc.addPage(A4); let y = A4[1] - mm(45) + 6;
      const T = (t, { x = M, size = 10.5, font = R, color = ink } = {}) => page.drawText(String(t), { x, y, size, font, color });
      const wrap = (t, { size = 10.5, font = R, lead = 1.4, w = W } = {}) => { let ln = ''; for (const wd of String(t).split(/\s+/)) { const tt = ln ? ln + ' ' + wd : wd; if (font.widthOfTextAtSize(tt, size) > w && ln) { T(ln, { size, font }); y -= size * lead; ln = wd; } else ln = tt; } if (ln) { T(ln, { size, font }); y -= size * lead; } };
      T(absender.length > 95 ? absender.slice(0, 94) + '…' : absender, { x: mm(20) + 6, size: 7, color: grey }); y -= 16;
      for (const z of [m.name, m.strasse, m.plzOrt].filter(Boolean)) { T(z, { x: mm(20) + 6 }); y -= 14; }
      y = A4[1] - mm(97);
      const dz = `${ortZeile ? ortZeile + ', ' : ''}${deDatum(heute)}`; page.drawText(dz, { x: M + W - R.widthOfTextAtSize(dz, 10), y, size: 10, font: R, color: ink }); y -= 30;
      T(`${titel}: ${v.zweck || 'Mitgliedsbeitrag'}`, { size: 13.5, font: B }); y -= 24;
      wrap(`Guten Tag ${m.name},`); y -= 4;
      wrap(erinnerung
        ? `bei unserem Abgleich haben wir Ihren Beitrag ${m.bezahlt > 0 ? 'noch nicht vollständig' : 'noch nicht'} gefunden. Vielleicht ist er Ihnen durchgerutscht – bitte überweisen Sie den offenen Betrag bis ${deDatum(v.faellig)}. Haben Sie inzwischen gezahlt, betrachten Sie dieses Schreiben bitte als gegenstandslos.`
        : `wir bitten um Überweisung Ihres Beitrags bis ${deDatum(v.faellig)}. Am einfachsten scannen Sie den GiroCode mit Ihrer Banking-App – Empfänger, Betrag und Verwendungszweck sind dann schon ausgefüllt.`);
      y -= 8;
      const top = y, rows = [[erinnerung ? 'Offener Betrag' : 'Betrag', deEuro(betrag)], ['Zahlbar bis', deDatum(v.faellig)], ['Empfänger', verein], ['IBAN', ibanGrp(v.iban)], ...(v.bic ? [['BIC', String(v.bic).toUpperCase()]] : []), ['Verwendungszweck', zweck]];
      const tw = W - 150;   // rechts Platz für den GiroCode
      for (const [k, val] of rows) {
        page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + tw, y: y + 12 }, thickness: 0.4, color: line });
        T(k, { size: 9.5, color: grey });
        let s = String(val); const f = k === 'Betrag' || k === 'Offener Betrag' || k === 'Zahlbar bis' ? B : R;
        if (f.widthOfTextAtSize(s, 10.5) > tw - 120) { const words = s.split(' '); let ln = ''; const out = []; for (const w of words) { const tt = ln ? ln + ' ' + w : w; if (f.widthOfTextAtSize(tt, 10) > tw - 120 && ln) { out.push(ln); ln = w; } else ln = tt; } out.push(ln); out.forEach((l, j) => { page.drawText(l, { x: M + 120, y: y - j * 12, size: 10, font: f, color: ink }); }); y -= 12 * (out.length - 1); }
        else T(s, { x: M + 120, font: f });
        y -= 18;
      }
      page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + tw, y: y + 12 }, thickness: 0.4, color: line });
      // GiroCode (EPC-QR) rechts neben der Tabelle; Fehler beim Erzeugen → ohne Code, Daten stehen ja in der Tabelle
      if (opts.qr && opts.epc) {
        try {
          const q = opts.qr(opts.epc({ name: verein, iban: v.iban, bic: v.bic, amount: betrag, purpose: zweck }).payload), n = q.n, size = 118, cell = size / n, x0 = M + W - size, y0 = top + 14 - size;
          page.drawRectangle({ x: x0 - 6, y: y0 - 6, width: size + 12, height: size + 12, color: L.rgb(1, 1, 1) });
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.dark(r, c)) page.drawRectangle({ x: x0 + c * cell, y: y0 + size - (r + 1) * cell, width: cell + 0.3, height: cell + 0.3, color: ink });   // leicht überlappend: keine Haarlinien zwischen den Modulen
          page.drawText('GiroCode', { x: x0 + size / 2 - R.widthOfTextAtSize('GiroCode', 8) / 2, y: y0 - 16, size: 8, font: R, color: grey });
          if (y > y0 - 26) y = y0 - 26;
        } catch (e) { /* ohne GiroCode */ }
      }
      y -= 10;
      wrap('Bitte geben Sie den Verwendungszweck unverändert an – so können wir Ihre Zahlung sicher zuordnen.', { size: 9.5 });
      if (v.kontakt) wrap(`Fragen oder Ratenzahlung bitte an: ${v.kontakt}`, { size: 9.5 });
      y -= 16; wrap('Mit freundlichen Grüßen'); y -= 6; wrap(v.unterzeichner ? `${v.unterzeichner}, ${verein}` : verein);
      page.drawText('Dieses Schreiben wurde maschinell erstellt und ist ohne Unterschrift gültig.', { x: M, y: 40, size: 7, font: R, color: grey });
    }
    return doc.save();
  }

  /* Übersicht nach dem Abgleich (für den Kassenwart; enthält Namen – nicht für die Mitgliederversammlung gedacht) */
  async function uebersicht(L, v, a, opts = {}) {
    const doc = await L.PDFDocument.create(), [R, B] = await fonts(L, doc, opts);
    const ink = L.rgb(0.1, 0.1, 0.12), grey = L.rgb(0.42, 0.45, 0.5), line = L.rgb(0.8, 0.82, 0.85), tint = L.rgb(0.95, 0.96, 0.97);
    const farbe = { bezahlt: L.rgb(0.1, 0.5, 0.25), teilweise: L.rgb(0.7, 0.45, 0.05), offen: L.rgb(0.7, 0.12, 0.12) };
    const wort = { bezahlt: 'bezahlt', teilweise: 'teilweise', offen: 'offen' };
    const titel = `Beitragsübersicht: ${v.zweck || 'Mitgliedsbeitrag'}`, M2 = 50, W2 = A4[0] - 2 * M2;
    doc.setTitle(`${titel} – ${v.verein || ''}`.replace(/ – $/, '')); doc.setLanguage('de-DE'); doc.setProducer('PDFMy (pdfmy.de)'); doc.setSubject('Abgleich der Beitragszahlungen mit dem Kontoauszug');
    let page, y;
    const neu = () => { page = doc.addPage(A4); y = A4[1] - 56; };
    const T = (t, x, { size = 9.5, font = R, color = ink } = {}) => page.drawText(String(t), { x, y, size, font, color });
    const rechts = (t, xr, o = {}) => T(t, xr - (o.font || R).widthOfTextAtSize(String(t), o.size || 9.5), o);
    const cut = (t, w, f = R, s = 9.5) => { t = String(t); while (t && f.widthOfTextAtSize(t + '…', s) > w) t = t.slice(0, -1); return t; };
    neu();
    T(titel, M2, { size: 16, font: B }); y -= 18; T(v.verein || '', M2, { size: 10.5 }); y -= 14;
    T(`Stand: ${deDatum(opts.heute || new Date())} · nur für den Kassenwart (enthält Namen)`, M2, { size: 8.5, color: grey }); y -= 22;
    const kz = [[`Bezahlt: ${a.anzahl.bezahlt}`, farbe.bezahlt], [`Teilweise: ${a.anzahl.teilweise}`, farbe.teilweise], [`Offen: ${a.anzahl.offen}`, farbe.offen]];
    let x = M2; for (const [t, c] of kz) { T(t, x, { size: 11, font: B, color: c }); x += B.widthOfTextAtSize(t, 11) + 28; }
    y -= 16; T(`Soll ${deEuro(a.summe.soll)} · eingegangen ${deEuro(a.summe.eingang)} · offen ${deEuro(a.summe.offen)}`, M2, { size: 10 }); y -= 14;
    if (a.nichtZugeordnet) { T(`${a.nichtZugeordnet} Gutschrift(en) im Kontoauszug ließen sich keinem Mitglied zuordnen – bitte von Hand prüfen.`, M2, { size: 9, color: grey }); y -= 14; }
    y -= 10;
    const cx = [M2, M2 + 190, M2 + 270, M2 + 350, M2 + 420], head = () => { page.drawRectangle({ x: M2, y: y - 5, width: W2, height: 16, color: tint }); [['Mitglied', 0], ['Referenz', 1]].forEach(([t, i]) => T(t, cx[i] + 3, { size: 8.5, font: B })); rechts('Soll', cx[3] - 6, { size: 8.5, font: B }); rechts('Eingang', cx[4] - 6, { size: 8.5, font: B }); T('Stand', cx[4] + 4, { size: 8.5, font: B }); y -= 18; };
    head();
    const order = { offen: 0, teilweise: 1, bezahlt: 2 };
    for (const m of [...a.mitglieder].sort((p, q) => order[p.status] - order[q.status] || p.name.localeCompare(q.name, 'de'))) {
      if (y < 60) { neu(); head(); }
      T(cut(m.name, cx[1] - cx[0] - 8), cx[0] + 3); T(cut(m.ref, cx[2] - cx[1] - 6), cx[1] + 3, { color: grey });
      rechts(deEuro(m.betrag), cx[3] - 6); rechts(m.bezahlt ? deEuro(m.bezahlt) : '–', cx[4] - 6);
      T(wort[m.status] + (m.status !== 'offen' && !m.sicher ? ' *' : ''), cx[4] + 4, { font: B, color: farbe[m.status] });
      page.drawLine({ start: { x: M2, y: y - 4 }, end: { x: M2 + W2, y: y - 4 }, thickness: 0.3, color: line }); y -= 15;
    }
    y -= 6; if (y < 60) neu();
    T('* zugeordnet über den Namen, nicht über die Referenz – bitte kurz prüfen.', M2, { size: 8, color: grey });
    const ps = doc.getPages(); ps.forEach((p, i) => p.drawText(`${titel} · Seite ${i + 1} von ${ps.length}`, { x: M2, y: 30, size: 7.5, font: R, color: grey }));
    return doc.save();
  }
  // Liste der Offenen zum Weiterbearbeiten in Excel (Formel-Eingaben entschärft)
  const zelle = s => { s = String(s ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const offenCsv = a => '﻿' + ['Name;Referenz;Soll;Eingang;Offen;Stand;E-Mail', ...a.mitglieder.filter(m => m.status !== 'bezahlt')
    .map(m => [m.name, m.ref, m.betrag.toFixed(2).replace('.', ','), m.bezahlt.toFixed(2).replace('.', ','), m.offen.toFixed(2).replace('.', ','), m.status, m.email].map(zelle).join(';'))].join('\r\n') + '\r\n';

  const api = { ausTabelle, zweckVon, abgleich, aufforderung, uebersicht, offenCsv };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Beitrag = api;
})(typeof self !== 'undefined' ? self : globalThis);
