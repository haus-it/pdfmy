// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sprachen: Erkennung der Dokumentsprache (Texterkennung) und Übersetzung der Oberfläche
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const Letter = require('../js/letter.js');
const I18N = require('../js/i18n.js');

const SAMPLES = {
  eng: 'Dear customer, thank you for your order. Please find the invoice for the services we provided in March attached to this letter. We kindly ask you to pay the amount within fourteen days to the account shown below. If you have any questions, please do not hesitate to contact us. With kind regards from the team.',
  fra: 'Madame, Monsieur, nous vous remercions pour votre commande. Veuillez trouver ci-joint la facture pour les prestations du mois de mars. Nous vous prions de bien vouloir régler le montant dans un délai de quatorze jours sur le compte indiqué ci-dessous. Pour toute question, notre service est à votre disposition. Avec nos salutations distinguées.',
  por: 'Prezado cliente, agradecemos a sua encomenda. Em anexo encontra a fatura dos serviços prestados no mês de março. Pedimos que pague o valor no prazo de catorze dias para a conta indicada abaixo. Se tiver alguma questão, não hesite em contactar o nosso serviço. Com os melhores cumprimentos da equipa que está ao seu dispor para o que for preciso.',
  ces: 'Vážený zákazníku, děkujeme za vaši objednávku. V příloze najdete fakturu za služby, které jsme pro vás provedli v březnu. Prosíme, abyste částku uhradili do čtrnácti dnů na účet uvedený níže. Pokud máte jakékoli dotazy, jsme vám k dispozici a rádi vám pomůžeme. S pozdravem tým, který je pro vás vždy k dispozici a který se o vše postará.',
  hun: 'Tisztelt Ügyfelünk! Köszönjük a megrendelését. Mellékelten küldjük a márciusi szolgáltatásokról szóló számlát. Kérjük, hogy az összeget tizennégy napon belül utalja át az alábbi számlára. Ha kérdése van, ügyfélszolgálatunk szívesen áll rendelkezésére, és mint mindig, minden kérdésre választ ad. Üdvözlettel a csapat, amely már régóta az ön szolgálatában van és segít is.',
  swe: 'Bästa kund, tack för din beställning. Här bifogar vi fakturan för de tjänster som vi har utfört åt dig i mars. Vi ber dig att betala beloppet inom fjorton dagar till det konto som anges nedan. Om du har frågor är du välkommen att kontakta oss när det passar dig, vi har öppet varje dag. Med vänliga hälsningar från hela teamet som står till din tjänst och för det mesta svarar snabbt.',
  fin: 'Hyvä asiakas, kiitos tilauksestasi. Liitteenä on lasku maaliskuussa tehdyistä palveluista. Pyydämme, että maksat summan neljäntoista päivän kuluessa alla olevalle tilille. Jos sinulla on kysyttävää, ota meihin yhteyttä, ja me autamme mielellämme, mutta myös verkkosivuilta löytyy tietoa. Ystävällisin terveisin tiimi, joka on aina valmis auttamaan ja joka on myös tavoitettavissa puhelimitse sekä sähköpostitse.',
  tur: 'Sayın müşterimiz, siparişiniz için teşekkür ederiz. Mart ayında verdiğimiz hizmetler için faturayı ekte bulabilirsiniz. Tutarı on dört gün içinde aşağıda belirtilen hesaba ödemenizi rica ederiz. Herhangi bir sorunuz olursa bizimle iletişime geçmekten çekinmeyin, size daha çok yardımcı olmak için buradayız ve bu konuda her zaman destek veriyoruz. Saygılarımızla, ekibimiz ile birlikte.',
};

test('Dokumentsprache: lateinische Schrift (Stoppwörter)', () => {
  for (const [lang, text] of Object.entries(SAMPLES)) assert.strictEqual(Letter.detectLang(text), lang, lang);
  const de = 'Sehr geehrte Damen und Herren, vielen Dank für Ihre Bestellung. Anbei erhalten Sie die Rechnung für die Leistungen im März. Bitte überweisen Sie den Betrag innerhalb von vierzehn Tagen auf das unten genannte Konto. Bei Fragen stehen wir Ihnen gern zur Verfügung. Mit freundlichen Grüßen aus dem Team, das Ihnen sehr gern hilft.';
  assert.strictEqual(Letter.detectLang(de), null, 'Deutsch bleibt Deutsch');
  assert.strictEqual(Letter.detectLang(de, 'eng'), 'deu', 'Deutsch, wenn mit Englisch erkannt');
});

test('Dokumentsprache: Schrift und kyrillische Sprachen', () => {
  const ru = 'Уважаемый клиент, благодарим вас за заказ. В приложении вы найдёте счёт за услуги, которые мы оказали в марте. Просим оплатить сумму в течение четырнадцати дней.';
  const uk = 'Шановний клієнте, дякуємо за ваше замовлення. У додатку ви знайдете рахунок за послуги, які ми надали в березні. Просимо сплатити суму протягом чотирнадцяти днів. Є питання?';
  const bg = 'Уважаеми клиенти, благодарим ви за поръчката. В приложение ще намерите фактурата за услугите, които ви предоставихме през март. Молим да платите сумата в срок от четиринадесет дни.';
  const sr = 'Поштовани кориснику, хвала вам на поруџбини. У прилогу ћете наћи рачун за услуге које смо пружили у марту. Молимо вас да износ уплатите у року од четрнаест дана. Љубазно вас поздрављамо.';
  const mk = 'Почитуван клиенту, ви благодариме за нарачката. Во прилог ќе ја најдете фактурата за услугите што ги дадовме во март. Ве молиме износот да го платите во рок од четиринаесет дена. Ѕвонете ни.';
  const be = 'Паважаны кліент, дзякуем вам за заказ. У дадатку вы знойдзеце рахунак за паслугі, якія мы аказалі ў сакавіку. Просім аплаціць суму на працягу чатырнаццаці дзён. Усяго добрага.';
  const el = 'Αγαπητέ πελάτη, σας ευχαριστούμε για την παραγγελία σας. Στο συνημμένο θα βρείτε το τιμολόγιο για τις υπηρεσίες του Μαρτίου.';
  assert.strictEqual(Letter.scriptOf(ru), 'cyrl'); assert.strictEqual(Letter.scriptOf(el), 'grek'); assert.strictEqual(Letter.scriptOf(SAMPLES.eng), 'latn');
  assert.strictEqual(Letter.cyrLang(ru), 'rus'); assert.strictEqual(Letter.cyrLang(uk), 'ukr'); assert.strictEqual(Letter.cyrLang(bg), 'bul');
  assert.strictEqual(Letter.cyrLang(sr), 'srp'); assert.strictEqual(Letter.cyrLang(mk), 'mkd'); assert.strictEqual(Letter.cyrLang(be), 'bel');
  assert.strictEqual(Letter.detectLang(ru), null, 'kyrillischer Text ist keine lateinische Sprache');
});

test('Sprachliste: Oberfläche, Texterkennung, Sprachdaten vorhanden', () => {
  const codes = I18N.LANGS.map(l => l.code);
  for (const c of ['de', 'en-GB', 'en-US', 'tr', 'ru', 'uk', 'fr', 'pl', 'el', 'ga', 'mt', 'is', 'lb']) assert.ok(codes.includes(c), c);
  assert.strictEqual(new Set(codes).size, codes.length, 'keine doppelten Codes');
  for (const l of [...I18N.LANGS, ...I18N.OCR_EXTRA]) assert.ok(fs.existsSync(path.join(__dirname, '..', 'vendor', 'tesseract', 'lang', l.ocr + '.traineddata.gz')), 'Sprachdaten ' + l.ocr);
  assert.strictEqual(I18N.ocrName('ukr'), 'Ukrainisch');
});

test('Sprachwahl aus der Browsersprache', () => {
  assert.strictEqual(I18N.pick(['en-US']), 'en-US');
  assert.strictEqual(I18N.pick(['en-AU']), 'en-GB');
  assert.strictEqual(I18N.pick(['de-AT']), 'de');
  assert.strictEqual(I18N.pick(['nn-NO']), 'nb');
  assert.strictEqual(I18N.pick(['uk-UA', 'ru']), 'uk');
  assert.strictEqual(I18N.pick(['pt-BR']), 'pt');
  assert.strictEqual(I18N.pick(['zh-CN', 'tr']), 'tr');
  assert.strictEqual(I18N.pick(['zh-CN']), null);
});

test('Übersetzen: exakt, mit Platzhaltern und eingesetzten Teilen', () => {
  I18N._compile({ 'Speichern': 'Save', 'Seite {0} von {1} …': 'Page {0} of {1} …', '{0} erkannt': '{0} detected', 'Englisch': 'English', 'Hallo {1}, {0}': '{0}! Hello {1}' });
  assert.strictEqual(I18N.t('Speichern'), 'Save');
  assert.strictEqual(I18N.t('  Speichern '), 'Save');
  assert.strictEqual(I18N.t('Seite 3 von 12 …'), 'Page 3 of 12 …');
  assert.strictEqual(I18N.t('Englisch erkannt'), 'English detected');
  assert.strictEqual(I18N.t('Hallo Welt, Tag'), 'Tag! Hello Welt');
  assert.strictEqual(I18N.t('Unbekannt'), 'Unbekannt');
});

test('Wörterbücher: Platzhalter und HTML stimmen mit dem Deutschen überein', () => {
  const dir = path.join(__dirname, '..', 'i18n');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f)) : [];
  const ph = s => (s.match(/\{\d+\}/g) || []).sort().join(',');
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(I18N.byCode(f.replace('.json', '')), 'Sprache bekannt: ' + f);
    for (const [k, v] of Object.entries(d)) assert.strictEqual(ph(v), ph(k), `${f}: ${k.slice(0, 60)}`);
  }
});

test('Datum und Zahlen: Format der Oberflächensprache (ohne Browser: Deutsch)', () => {
  assert.strictEqual(I18N.info.bcp, 'de-DE');
  assert.strictEqual(I18N.fmtDate('2026-10-18'), '18.10.2026', 'ISO-Datum als Ortsdatum, ohne Zeitzonenversatz');
  assert.strictEqual(I18N.fmtDate(new Date(2026, 0, 5)), '05.01.2026');
  assert.strictEqual(I18N.fmtTime(new Date(2026, 0, 5, 9, 7)), '09:07');
  assert.strictEqual(I18N.fmtNum(1234.5, { minimumFractionDigits: 2 }), '1.234,50');
  assert.strictEqual(I18N.fmtMoney(12.5).replace(/\s/g, ' '), '12,50 €');
  assert.strictEqual(I18N.fmtDate('kein Datum'), '');
  assert.strictEqual(I18N.fmtNum(''), '');
  // Andere Sprachen nutzen dieselben Intl-Optionen mit info.bcp – z. B. britisch und amerikanisch
  assert.strictEqual(new Date(2026, 9, 18).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }), '18/10/2026');
  assert.strictEqual(new Date(2026, 9, 18).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }), '10/18/2026');
});

test('Webseiten-Wörterbücher (Hilfe, Scanner): Platzhalter, HTML, Vollständigkeit', () => {
  const dir = path.join(__dirname, '..', 'i18n', 'site');
  const keys = JSON.parse(fs.readFileSync(path.join(dir, '_keys.json'), 'utf8'));
  const ph = s => (s.match(/\{\d+\}/g) || []).sort().join(',');
  const tags = s => (s.match(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi) || []).map(t => t.replace(/\s(title|aria-label|alt|placeholder|aria-description)="[^"]*"/gi, '').replace(/\s+/g, ' ').toLowerCase()).sort().join('|');
  const files = fs.readdirSync(dir).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f));
  assert.strictEqual(files.length, I18N.LANGS.length - 1, 'alle Sprachen außer Deutsch');
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const k of keys) assert.ok(typeof d[k] === 'string' && d[k].trim(), `${f}: fehlt ${k.slice(0, 60)}`);
    for (const [k, v] of Object.entries(d)) { assert.strictEqual(ph(v), ph(k), `${f}: ${k.slice(0, 60)}`); assert.strictEqual(tags(v), tags(k), `${f} HTML: ${k.slice(0, 60)}`); }
  }
});

test('Webseiten: wechselnde Werte als Platzhalter, keine Erwähnung von /mentor, Rechtstexte deutsch', () => {
  const { volatile } = require('../tools/i18n-extract.js');
  assert.strictEqual(volatile('pdfmy Scan für Mac 1.4.2<br><small>macOS · ZIP, ca. 37 KB</small>'), 'pdfmy Scan für Mac {0}<br><small>macOS · ZIP, ca. {1} KB</small>');
  assert.strictEqual(volatile('läuft über 127.0.0.1 – Stand 18.10.2026'), 'läuft über 127.0.0.1 – Stand 18.10.2026');
  I18N._compile({ 'pdfmy Scan für Windows {0}': 'pdfmy Scan for Windows {0}' });
  assert.strictEqual(I18N.t('pdfmy Scan für Windows 1.9.0'), 'pdfmy Scan for Windows 1.9.0', 'neue Version ohne neues Wörterbuch');
  const root = path.join(__dirname, '..');
  const texts = [fs.readFileSync(path.join(root, 'tools', 'site', 'hilfe.html'), 'utf8'), fs.readFileSync(path.join(root, 'i18n', 'site', '_keys.json'), 'utf8')];
  for (const f of fs.readdirSync(path.join(root, 'i18n', 'site')).filter(f => f.endsWith('.json'))) texts.push(fs.readFileSync(path.join(root, 'i18n', 'site', f), 'utf8'));
  for (const t of texts) assert.ok(!/pdfmy\.de\/mentor|\/mentor\b/.test(t), 'keine Seite erwähnt /mentor');
  const build = fs.readFileSync(path.join(root, 'tools', 'build-web.js'), 'utf8');
  for (const p of ['impressum.html', 'datenschutz.html', 'barrierefreiheit.html']) {
    const i = build.indexOf(`write('${p}', page(`), seg = build.slice(i, build.indexOf('\nwrite(', i + 10));
    assert.ok(i > 0 && !/,\s*true\)\);/.test(seg), p + ' ohne Sprachwahl (nur deutsch)');
  }
  assert.match(build, /write\('hilfe\.html', page\('Hilfe', [^\n]*, '', true\)\)/, 'Hilfe mehrsprachig');
});
