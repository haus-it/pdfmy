// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Zuwendungsbestätigung (Spendenquittung) für gemeinnützige Vereine – app-v314.
   Wortlaut und Reihenfolge exakt nach den amtlichen Mustern des BMF-Schreibens vom 07.11.2013 (BStBl I S. 1333), ergänzt am
   26.03.2014 (BStBl I S. 791), weiterhin gültig laut EStH 2025, Anhang 37 I: Anlage 3 (Einzelbestätigung Geldzuwendung/
   Mitgliedsbeitrag an Körperschaften nach § 5 Abs. 1 Nr. 9 KStG) und Anlage 14 (Sammelbestätigung mit Anlage).
   „Die Wortwahl und die Reihenfolge der vorgegebenen Textpassagen in den Mustern sind beizubehalten, Umformulierungen sind
   unzulässig.“ Höchstens eine DIN-A4-Seite, keine Werbung oder Danksagung auf der Vorderseite. Betrag in Ziffern und Buchstaben.
   Alles lokal – die Spenderdaten verlassen das Gerät nicht. */
(function (root) {
  'use strict';

  /* ---------- Betrag in Buchstaben ---------- */
  const EINS = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
  const ZEHN = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
  function unter1000(n) {
    const h = Math.floor(n / 100), r = n % 100;
    let s = h ? EINS[h] + 'hundert' : '';
    if (r < 20) s += EINS[r]; else s += (r % 10 ? EINS[r % 10] + 'und' : '') + ZEHN[Math.floor(r / 10)];
    return s;
  }
  // ganze Zahl → Wort (bis 999.999.999), „eins“ allein, sonst „ein…“ (einhundert, eintausend)
  function zahlWort(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'null';
    if (n === 1) return 'eins';
    const mio = Math.floor(n / 1e6), tsd = Math.floor((n % 1e6) / 1000), rest = n % 1000;
    let s = '';
    if (mio) s += (mio === 1 ? 'eine Million' : unter1000(mio) + ' Millionen') + (tsd || rest ? ' ' : '');
    if (tsd) s += unter1000(tsd) + 'tausend';
    if (rest) s += unter1000(rest) + (rest % 100 === 1 ? 's' : '');   // …eins: einhunderteins, eintausendeins
    return s;
  }
  // 150 → „einhundertfünfzig Euro“, 12.5 → „zwölf Euro fünfzig Cent“
  function betragWorte(betrag) {
    const c = Math.round(Number(betrag) * 100); if (!isFinite(c) || c < 0) return '';
    const e = Math.floor(c / 100), ct = c % 100;
    const w = n => n === 1 ? 'ein' : zahlWort(n);   // „ein Euro“, „ein Cent“
    return (e ? w(e) + ' Euro' : '') + (ct ? (e ? ' ' : '') + w(ct) + ' Cent' : '') || 'null Euro';
  }
  const euro = b => Number(b).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  /* ---------- Fristen nach § 63 Abs. 5 AO ---------- */
  // Freistellungsbescheid höchstens 5 Jahre, Feststellung nach § 60a AO höchstens 3 Jahre vor Ausstellung → sonst kein Nachweis
  function fristOk(art, bescheidVom, ausgestellt = new Date()) {
    const b = bescheidVom instanceof Date ? bescheidVom : new Date(bescheidVom); if (isNaN(b)) return { ok: false, grund: 'Datum des Bescheids fehlt.' };
    const jahre = art === '60a' ? 3 : 5, grenze = new Date(b); grenze.setFullYear(grenze.getFullYear() + jahre);
    return ausgestellt > grenze ? { ok: false, grund: `Der Bescheid ist älter als ${jahre} Jahre – die Bestätigung würde nicht als Nachweis anerkannt (§ 63 Abs. 5 AO). Bitte einen aktuellen Bescheid beim Finanzamt anfordern.` } : { ok: true };
  }

  /* ---------- Amtlicher Wortlaut ---------- */
  const T = {
    aussteller: 'Aussteller (Bezeichnung und Anschrift der steuerbegünstigten Einrichtung)',
    titel1: 'Bestätigung über Geldzuwendungen/Mitgliedsbeitrag',
    titelS: 'Sammelbestätigung über Geldzuwendungen/Mitgliedsbeiträge',
    untertitel: 'im Sinne des § 10b des Einkommensteuergesetzes an eine der in § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes bezeichneten Körperschaften, Personenvereinigungen oder Vermögensmassen',
    zuwendender: 'Name und Anschrift des Zuwendenden:',
    ziffern: 'Betrag der Zuwendung – in Ziffern –', zifS: 'Gesamtbetrag der Zuwendung – in Ziffern –', buchstaben: '– in Buchstaben –', tag: 'Tag der Zuwendung:', zeitraum: 'Zeitraum der Sammelbestätigung:',
    verzicht: 'Es handelt sich um den Verzicht auf Erstattung von Aufwendungen',
    frei: (z, fa, st, vom, vz) => [['Wir sind wegen Förderung (Angabe des begünstigten Zwecks/der begünstigten Zwecke) ', 0], [z, 0, 1], [' ', 0], ['nach dem', 1], [' Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamtes ', 0], [fa, 0, 1], [' StNr. ', 0], [st, 0, 1], [' , vom ', 0], [vom, 0, 1], [' ', 0], ['für den letzten Veranlagungszeitraum', 1], [' ', 0], [vz, 0, 1], [' nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes von der Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer befreit.', 0]],
    f60a: (fa, st, vom, z) => [['Die Einhaltung der satzungsmäßigen Voraussetzungen nach den §§ 51, 59, 60 und 61 AO wurde vom Finanzamt ', 1], [fa, 1, 1], [' , StNr. ', 1], [st, 1, 1], [' mit Bescheid vom ', 1], [vom, 1, 1], [' nach § 60a AO gesondert festgestellt. Wir fördern nach unserer Satzung (Angabe des begünstigten Zwecks/der begünstigten Zwecke) ', 1], [z, 1, 1], [' .', 1]],
    bestaetigt1: 'Es wird bestätigt, dass die Zuwendung nur zur Förderung (Angabe des begünstigten Zwecks/der begünstigten Zwecke)',
    bestaetigt2: 'verwendet wird.',
    nurFuer: 'Nur für steuerbegünstigte Einrichtungen, bei denen die Mitgliedsbeiträge steuerlich nicht abziehbar sind:',
    mitglied: 'Es wird bestätigt, dass es sich nicht um einen Mitgliedsbeitrag handelt, dessen Abzug nach § 10b Abs. 1 des Einkommensteuergesetzes ausgeschlossen ist.',
    keineWeiteren: 'Es wird bestätigt, dass über die in der Gesamtsumme enthaltenen Zuwendungen keine weiteren Bestätigungen, weder formelle Zuwendungsbestätigungen noch Beitragsquittungen oder Ähnliches ausgestellt wurden und werden.',
    verzichtAnlage: 'Ob es sich um den Verzicht auf Erstattung von Aufwendungen handelt, ist der Anlage zur Sammelbestätigung zu entnehmen.',
    unterschrift: '(Ort, Datum und Unterschrift des Zuwendungsempfängers)',
    hinweis: 'Hinweis:',
    h1: 'Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung erstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestätigung angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene Steuer (§ 10b Abs. 4 EStG, § 9 Abs. 3 KStG, § 9 Nr. 5 GewStG).',
    h2: [['Diese Bestätigung wird nicht als Nachweis für die steuerliche Berücksichtigung der Zuwendung anerkannt, wenn das Datum des Freistellungsbescheides länger als 5 Jahre bzw. ', 0], ['das Datum der Feststellung der Einhaltung der satzungsmäßigen Voraussetzungen nach § 60a Abs. 1 AO länger als 3 Jahre seit Ausstellung des Bescheides zurückliegt (§ 63 Abs. 5 AO)', 1], ['.', 0]],
    anlage: 'Anlage zur Sammelbestätigung',
    spalten: ['Datum der Zuwendung', 'Art der Zuwendung (Geldzuwendung/Mitgliedsbeitrag)', 'Verzicht auf die Erstattung von Aufwendungen (ja/nein)', 'Betrag'],
    summe: 'Gesamtsumme',
  };

  /* ---------- Satz mit pdf-lib ---------- */
  const A4 = [595.28, 841.89], M = 56, W = A4[0] - 2 * M;
  // Fließtext aus Stücken [Text, fett, ausgefüllt] mit Zeilenumbruch; ausgefüllte Angaben in Blau, damit sie sich vom Muster abheben
  function flow(ctx, parts, x, y, w, size = 9.5, lead = 1.32) {
    const { page, R, B } = ctx, words = [];
    for (const [t, bold, filled] of parts) for (const m of String(t ?? '').matchAll(/\S+|\s+/g)) words.push({ t: m[0], f: bold ? B : R, c: filled });
    let line = [], lw = 0;
    const flush = () => {
      let cx = x; while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
      for (const p of line) { if (!/^\s+$/.test(p.t)) page.drawText(p.t, { x: cx, y, size, font: p.f, color: p.c ? ctx.blue : ctx.ink }); cx += p.f.widthOfTextAtSize(p.t, size); }
      y -= size * lead; line = []; lw = 0;
    };
    for (const p of words) {
      const pw = p.f.widthOfTextAtSize(p.t, size);
      if (/^\s+$/.test(p.t)) { if (line.length) { line.push(p); lw += pw; } continue; }
      if (lw + pw > w && line.length && !/^[.,;:)]/.test(p.t)) flush();   // Satzzeichen nie allein in eine neue Zeile
      line.push(p); lw += pw;
    }
    if (line.length) flush();
    return y;
  }
  const box = (ctx, x, y, w, h) => ctx.page.drawRectangle({ x, y, width: w, height: h, borderColor: ctx.ink, borderWidth: 0.6 });
  function check(ctx, x, y, on) {
    ctx.page.drawRectangle({ x, y, width: 8, height: 8, borderColor: ctx.ink, borderWidth: 0.6 });
    if (on) { ctx.page.drawLine({ start: { x: x + 1.5, y: y + 1.5 }, end: { x: x + 6.5, y: y + 6.5 }, thickness: 1, color: ctx.blue }); ctx.page.drawLine({ start: { x: x + 1.5, y: y + 6.5 }, end: { x: x + 6.5, y: y + 1.5 }, thickness: 1, color: ctx.blue }); }
  }
  const label = (ctx, t, x, y, size = 8.5) => ctx.page.drawText(t, { x, y, size, font: ctx.R, color: ctx.ink });
  const value = (ctx, t, x, y, size = 10) => ctx.page.drawText(String(t ?? ''), { x, y, size, font: ctx.R, color: ctx.blue });
  const lines = (ctx, text, x, y, size = 10) => { for (const l of String(text ?? '').split(/\r?\n/).slice(0, 4)) { value(ctx, l, x, y, size); y -= size * 1.25; } };
  const dt = d => { if (!d) return ''; const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? String(d) : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };

  // gemeinsamer Teil beider Muster; sammel = Anlage 14
  function vorderseite(ctx, d, sammel) {
    const { page, B } = ctx; let y = A4[1] - 60;
    if (d.nummer) page.drawText(String(d.nummer), { x: A4[0] - M - ctx.R.widthOfTextAtSize(String(d.nummer), 8.5), y: y + 14, size: 8.5, font: ctx.R, color: ctx.ink });
    box(ctx, M, y - 62, W, 62); label(ctx, T.aussteller, M + 6, y - 11); lines(ctx, [d.aussteller?.name, d.aussteller?.anschrift].filter(Boolean).join('\n'), M + 6, y - 25);
    y -= 82; page.drawText(sammel ? T.titelS : T.titel1, { x: M, y, size: 12, font: B, color: ctx.ink });
    y = flow(ctx, [[T.untertitel, 0]], M, y - 16, W, 10);
    y -= 4; box(ctx, M, y - 62, W, 62); label(ctx, T.zuwendender, M + 6, y - 11); lines(ctx, [d.zuwendender?.name, d.zuwendender?.anschrift].filter(Boolean).join('\n'), M + 6, y - 25);
    y -= 72; const c1 = W * 0.33, c2 = W * 0.33;
    box(ctx, M, y - 40, c1, 40); box(ctx, M + c1, y - 40, c2 + W * 0.0, 40); box(ctx, M + c1 + c2, y - 40, W - c1 - c2, 40);
    flow(ctx, [[sammel ? T.zifS : T.ziffern, 0]], M + 6, y - 11, c1 - 12, 8.5, 1.15); label(ctx, T.buchstaben, M + c1 + 6, y - 11); flow(ctx, [[sammel ? T.zeitraum : T.tag, 0]], M + c1 + c2 + 6, y - 11, W - c1 - c2 - 12, 8.5, 1.15);
    value(ctx, euro(d.betrag), M + 6, y - 30);
    flow(ctx, [[betragWorte(d.betrag), 0, 1]], M + c1 + 6, y - 24, c2 - 12, 9, 1.15);
    value(ctx, sammel ? `${dt(d.von)} – ${dt(d.bis)}` : dt(d.datum), M + c1 + c2 + 6, y - 30);
    y -= 56;
    if (!sammel) { label(ctx, T.verzicht, M, y, 9.5); label(ctx, 'Ja', M + W - 120, y, 9.5); check(ctx, M + W - 104, y - 1, d.verzicht === true); label(ctx, 'Nein', M + W - 70, y, 9.5); check(ctx, M + W - 46, y - 1, d.verzicht !== true); y -= 20; }
    const fa = d.finanzamt || '……………', st = d.stnr || '……………', vom = dt(d.bescheidVom) || '……………', z = d.zwecke || '……………';
    check(ctx, M, y - 1, d.art !== '60a'); y = flow(ctx, T.frei(d.art !== '60a' ? z : '……………', d.art !== '60a' ? fa : '……………', d.art !== '60a' ? st : '……………', d.art !== '60a' ? vom : '……………', d.art !== '60a' ? (d.vz || '……………') : '……………'), M + 16, y, W - 16) - 4;
    check(ctx, M, y - 1, d.art === '60a'); y = flow(ctx, T.f60a(d.art === '60a' ? fa : '……………', d.art === '60a' ? st : '……………', d.art === '60a' ? vom : '……………', d.art === '60a' ? z : '……………'), M + 16, y, W - 16) - 6;
    // eingerahmter Teil
    const top = y; let yy = flow(ctx, [[T.bestaetigt1, 0]], M + 6, y - 12, W - 12);
    yy = flow(ctx, [[d.zwecke || '', 0, 1]], M + 6, yy - 4, W - 12, 10); yy -= 6; label(ctx, T.bestaetigt2, M + 6, yy, 9.5); yy -= 18;
    yy = flow(ctx, [[T.nurFuer, 1]], M + 6, yy, W - 12); check(ctx, M + 6, yy - 1, d.keinMitgliedsbeitragAusschluss === true);
    yy = flow(ctx, [[T.mitglied, 0]], M + 20, yy, W - 26) - 2;
    box(ctx, M, yy, W, top - yy); y = yy - 14;
    if (sammel) { y = flow(ctx, [[T.keineWeiteren, 0]], M, y, W) - 4; y = flow(ctx, [[T.verzichtAnlage, 0]], M, y, W) - 6; }
    // Unterschrift
    y -= 16; value(ctx, [d.ort, dt(d.ausgestellt || new Date())].filter(Boolean).join(', '), M, y + 4);
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: M + W, y: y - 2 }, thickness: 0.6, color: ctx.ink }); label(ctx, T.unterschrift, M, y - 13);
    y -= 34; page.drawText(T.hinweis, { x: M, y, size: 9, font: B, color: ctx.ink });
    y = flow(ctx, [[T.h1, 0]], M, y - 13, W, 8.5) - 4; flow(ctx, T.h2, M, y, W, 8.5);
  }

  // opts: { fontkit, regular, bold } – eingebettete Unicode-Schrift (DejaVu Sans) für Namen wie „Şahin“, „Yılmaz“, „Łukasz“;
  // ohne Angabe Helvetica (WinAnsi), wie in den Tests
  async function erzeugen(L, d, opts = {}) {
    const doc = await L.PDFDocument.create(), sammel = Array.isArray(d.zuwendungen) && d.zuwendungen.length > 0;
    let R, B;
    if (opts.fontkit && opts.regular) { doc.registerFontkit(opts.fontkit); R = await doc.embedFont(opts.regular, { subset: true }); B = opts.bold ? await doc.embedFont(opts.bold, { subset: true }) : R; }
    else { R = await doc.embedFont(L.StandardFonts.Helvetica); B = await doc.embedFont(L.StandardFonts.HelveticaBold); }
    const ink = L.rgb(0.1, 0.1, 0.12), blue = L.rgb(0.05, 0.2, 0.55);
    doc.setTitle(sammel ? T.titelS : T.titel1); doc.setLanguage('de-DE'); doc.setProducer('PDFMy (pdfmy.de)');
    const dd = sammel ? { ...d, betrag: d.zuwendungen.reduce((s, z) => s + Number(z.betrag || 0), 0), von: d.von || d.zuwendungen[0].datum, bis: d.bis || d.zuwendungen[d.zuwendungen.length - 1].datum } : d;
    vorderseite({ page: doc.addPage(A4), R, B, ink, blue }, dd, sammel);
    if (sammel) {   // Anlage 14, Seite 2
      const page = doc.addPage(A4), ctx = { page, R, B, ink, blue }; let y = A4[1] - 70;
      page.drawText(T.anlage, { x: M, y, size: 12, font: B, color: ink }); y -= 22;
      const cw = [W * 0.2, W * 0.34, W * 0.28, W * 0.18], cx = cw.map((_, i) => M + cw.slice(0, i).reduce((a, b) => a + b, 0));
      const head = 30; T.spalten.forEach((s, i) => { box(ctx, cx[i], y - head, cw[i], head); flow(ctx, [[s, 1]], cx[i] + 4, y - 10, cw[i] - 8, 7.5, 1.2); }); y -= head;
      for (const z of d.zuwendungen) {
        if (y < 90) break;   // eine Seite Anlage (bei sehr vielen Zuwendungen: Hinweis in der Oberfläche)
        cw.forEach((w, i) => box(ctx, cx[i], y - 16, w, 16));
        value(ctx, dt(z.datum), cx[0] + 4, y - 11, 9); value(ctx, z.art === 'mitglied' ? 'Mitgliedsbeitrag' : 'Geldzuwendung', cx[1] + 4, y - 11, 9);
        value(ctx, z.verzicht ? 'ja' : 'nein', cx[2] + 4, y - 11, 9); const b = euro(z.betrag); value(ctx, b, cx[3] + cw[3] - 4 - R.widthOfTextAtSize(b, 9), y - 11, 9); y -= 16;
      }
      box(ctx, M, y - 18, W, 18); page.drawText(T.summe, { x: M + 4, y: y - 12, size: 9.5, font: B, color: ink });
      const s = euro(dd.betrag); page.drawText(s, { x: M + W - 4 - B.widthOfTextAtSize(s, 9.5), y: y - 12, size: 9.5, font: B, color: blue });
    }
    return doc.save();
  }

  /* ---------- Serie aus einer Tabelle (Spenderliste) ---------- */
  // Spalten werden am Namen erkannt: Name, Anschrift (oder Straße + PLZ + Ort), Betrag, Datum, Verzicht, Art (Mitgliedsbeitrag)
  const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
  function spalten(header) {
    const find = (...keys) => header.findIndex(h => keys.some(k => norm(h).includes(k)));
    return { name: find('name', 'spender', 'zuwendend'), anschrift: find('anschrift', 'adresse'), strasse: find('strasse', 'str'), plz: find('plz', 'postleitzahl'), ort: find('ort', 'wohnort', 'stadt'),
      betrag: find('betrag', 'summe', 'euro', 'spende'), datum: find('datum', 'tag'), verzicht: find('verzicht', 'aufwand'), art: find('art', 'mitglied') };
  }
  const zahl = v => { const s = String(v ?? '').replace(/[€\s]/g, ''); const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s.replace(/,/g, '')); return isFinite(n) ? n : NaN; };
  const datum = v => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(String(v ?? '').trim()); if (m) return new Date(+(m[3].length === 2 ? '20' + m[3] : m[3]), m[2] - 1, +m[1]); const d = new Date(v); return isNaN(d) ? null : d; };
  const JA = /^(ja|j|yes|x|1|true|wahr)$/i;
  // Zeilen → Datensätze; je Person (Name + Anschrift) zusammengefasst, damit pro Person eine Sammelbestätigung entsteht, wenn mehrere Zeilen
  function ausTabelle(rows) {
    const [header, ...data] = rows, c = spalten(header), fehler = [], personen = new Map();
    if (c.name < 0 || c.betrag < 0) return { personen: [], fehler: ['Die Tabelle braucht mindestens die Spalten „Name“ und „Betrag“.'] };
    data.forEach((r, i) => {
      if (!r.some(x => String(x ?? '').trim())) return;
      const name = String(r[c.name] ?? '').trim(), betrag = zahl(r[c.betrag]);
      const anschrift = c.anschrift >= 0 ? String(r[c.anschrift] ?? '').trim() : [c.strasse >= 0 ? r[c.strasse] : '', [c.plz >= 0 ? r[c.plz] : '', c.ort >= 0 ? r[c.ort] : ''].filter(Boolean).join(' ')].filter(x => String(x).trim()).join('\n');
      if (!name || !(betrag > 0)) { fehler.push(`Zeile ${i + 2}: Name oder Betrag fehlt.`); return; }
      const key = name + '|' + anschrift; if (!personen.has(key)) personen.set(key, { name, anschrift, zuwendungen: [] });
      personen.get(key).zuwendungen.push({ betrag, datum: c.datum >= 0 ? datum(r[c.datum]) : null, verzicht: c.verzicht >= 0 && JA.test(String(r[c.verzicht] ?? '').trim()), art: c.art >= 0 && /mitglied/i.test(String(r[c.art] ?? '')) ? 'mitglied' : 'geld' });
    });
    for (const p of personen.values()) p.zuwendungen.sort((a, b) => (a.datum || 0) - (b.datum || 0));
    return { personen: [...personen.values()], fehler };
  }
  // Datensatz einer Person + Vereinsdaten → Daten für erzeugen(): eine Zuwendung = Einzelbestätigung, mehrere = Sammelbestätigung
  function fuerPerson(verein, p) {
    const base = { ...verein, zuwendender: { name: p.name, anschrift: p.anschrift } };
    if (p.zuwendungen.length === 1) { const z = p.zuwendungen[0]; return { ...base, betrag: z.betrag, datum: z.datum, verzicht: z.verzicht }; }
    return { ...base, zuwendungen: p.zuwendungen };
  }

  const api = { zahlWort, betragWorte, fristOk, erzeugen, ausTabelle, fuerPerson, T };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Zuwendung = api;
})(typeof self !== 'undefined' ? self : globalThis);
