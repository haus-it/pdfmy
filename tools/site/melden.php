<?php
// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
/* Meldungen aus PDFMy (Fehlerbericht / Verbesserungsvorschlag) – app-v329, Entscheidung GF 22.11.2026.
   Nimmt den Bericht an, den der Nutzer in PDFMy sieht und selbst mit „Direkt senden“ abschickt (ohne Dokumente, Dateinamen und
   Absender unkenntlich gemacht, wenn so gewählt). Gespeichert wird je Meldung eine Datei im gesperrten Ordner „meldungen“ –
   ohne IP-Adresse. Gegen Missbrauch zählt eine Begrenzung je Stunde mit einem täglich wechselnden, nicht umkehrbaren Kürzel
   der Adresse (nur im Arbeitsordner, nach 24 Stunden gelöscht). Die E-Mail-Adresse ist freiwillig und dient nur der Rückmeldung.
   Abruf und Status nur mit dem Schlüssel des Betreibers (hier steht nur sein SHA-256-Hash). Erledigte Meldungen: Text und
   E-Mail-Adresse werden nach 90 Tagen gelöscht, nur der Stand für die Abfrage bleibt.

   POST  melden.php                 {art, betreff, text, email?, app?, sprache?}   → {ok, id, token}
   GET   melden.php?id=…&t=…        → {id, status, version, antwort, aktualisiert}  (nur mit dem Token der Meldung)
   POST  melden.php?admin=liste|status|loeschen  Kopf X-Melde-Key  (Betreiber) */
declare(strict_types=1);

const ADMIN_HASH = '613bac7a76ccfebd403b7ee7e655ed243861c6e16dd7c89019d09ad4ffb42f39';
const MAX_BODY = 65536, MAX_TEXT = 60000, MAX_JE_STUNDE = 10, AUFBEWAHREN_TAGE = 90;
const STATUS = ['neu', 'in Arbeit', 'in Prüfung', 'erledigt', 'kein Fehler', 'beantwortet'];

$DIR = getenv('PDFMY_MELDUNGEN_DIR') ?: __DIR__ . '/meldungen';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function antwort(int $code, array $daten): void { http_response_code($code); echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function ordner(string $d): void {
  if (!is_dir($d)) { @mkdir($d, 0700, true); }
  if (!is_file("$d/.htaccess")) { file_put_contents("$d/.htaccess", "Require all denied\nDeny from all\n"); }
  if (!is_file("$d/index.html")) { file_put_contents("$d/index.html", ''); }
}
function sauber(string $s, int $max): string { $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? ''; return mb_substr(trim($s), 0, $max); }
function idOk(string $id): bool { return (bool)preg_match('/^\d{4}-\d{4,6}$/', $id); }
function lesen(string $f): ?array { $j = @file_get_contents($f); if ($j === false) return null; $d = json_decode($j, true); return is_array($d) ? $d : null; }
function schreiben(string $f, array $d): void { $t = "$f.tmp"; file_put_contents($t, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX); rename($t, $f); }
function oeffentlich(array $m): array { return ['id' => $m['id'], 'status' => $m['status'], 'version' => $m['version'] ?? '', 'antwort' => $m['antwort'] ?? '', 'aktualisiert' => $m['aktualisiert'] ?? $m['eingang']]; }

function mailSenden(string $an, string $betreff, string $text): bool {
  if (!filter_var($an, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $an)) return false;
  $kopf = "From: PDFMy <noreply@pdfmy.de>\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\nAuto-Submitted: auto-generated\r\nX-Auto-Response-Suppress: All";
  return @mail($an, '=?UTF-8?B?' . base64_encode($betreff) . '?=', $text, $kopf, '-fnoreply@pdfmy.de');
}
function mailEingang(array $m): void {
  if (empty($m['email'])) return;
  $vorschlag = ($m['art'] ?? '') === 'idea';
  $text = "Guten Tag,\n\nDanke für Ihre Unterstützung! Ihr " . ($vorschlag ? 'Verbesserungsvorschlag' : 'Fehlerbericht') . " zu PDFMy ist angekommen.\n\n"
    . "Meldung: {$m['id']}\n\nWir kümmern uns darum – meist noch am selben Tag. Sobald er erledigt ist, bekommen Sie eine kurze Nachricht. "
    . "Den Stand sehen Sie auch in PDFMy unter „Problem melden“ → „Meine Meldungen“.\n\nViele Grüße\nIhr PDFMy-Team\nMentor GmbH, Am Hoppenhof 30a, 33104 Paderborn · https://pdfmy.de\n\n"
    . "(Diese Nachricht wurde automatisch gesendet, weil Sie bei Ihrer Meldung diese Adresse angegeben haben.)\n";
  mailSenden($m['email'], "Danke für Ihre Unterstützung – PDFMy-Meldung {$m['id']}", $text);
}
function mailErledigt(array $m): bool {
  if (empty($m['email'])) return false;
  $was = $m['status'] === 'erledigt' ? ('Ihre Meldung ist erledigt' . (!empty($m['version']) ? " – enthalten in PDFMy {$m['version']}" : '') . '.') : 'Wir haben uns Ihre Meldung angesehen.';
  $text = "Guten Tag,\n\nnoch einmal danke für Ihre Unterstützung! $was\n\n" . (!empty($m['antwort']) ? $m['antwort'] . "\n\n" : '')
    . "Meldung: {$m['id']}\n\nPDFMy aktualisiert sich von selbst; sonst die Seite einmal neu laden.\n\nViele Grüße\nIhr PDFMy-Team\nMentor GmbH, Am Hoppenhof 30a, 33104 Paderborn · https://pdfmy.de\n";
  return mailSenden($m['email'], "Erledigt: PDFMy-Meldung {$m['id']} – danke für Ihre Unterstützung", $text);
}

// Begrenzung je Stunde: Kürzel aus Adresse + täglich wechselndem Zufallswert, nur im Arbeitsordner, nach 24 h gelöscht
function begrenzen(string $DIR): bool {
  $r = "$DIR/.rate"; if (!is_dir($r)) @mkdir($r, 0700, true);
  $salzDatei = "$r/salz-" . gmdate('Ymd');
  if (!is_file($salzDatei)) { foreach (glob("$r/salz-*") ?: [] as $alt) @unlink($alt); file_put_contents($salzDatei, bin2hex(random_bytes(16))); }
  foreach (glob("$r/z-*") ?: [] as $z) if (filemtime($z) < time() - 86400) @unlink($z);
  $kuerzel = hash('sha256', file_get_contents($salzDatei) . ($_SERVER['REMOTE_ADDR'] ?? ''));
  $f = "$r/z-" . substr($kuerzel, 0, 24) . '-' . gmdate('YmdH');
  $n = (int)@file_get_contents($f) + 1; file_put_contents($f, (string)$n, LOCK_EX);
  return $n <= MAX_JE_STUNDE;
}
function neueId(string $DIR): string {
  $f = fopen("$DIR/.zaehler", 'c+'); flock($f, LOCK_EX);
  $z = json_decode((string)stream_get_contents($f), true) ?: []; $jahr = gmdate('Y');
  $n = ($z[$jahr] ?? 0) + 1; $z[$jahr] = $n;
  ftruncate($f, 0); rewind($f); fwrite($f, json_encode($z)); fflush($f); flock($f, LOCK_UN); fclose($f);
  return sprintf('%s-%04d', $jahr, $n);
}
function aufraeumen(string $DIR): void {
  foreach (glob("$DIR/*.json") ?: [] as $f) {
    $m = lesen($f); if (!$m || !in_array($m['status'], ['erledigt', 'kein Fehler', 'beantwortet'], true)) continue;
    if (strtotime($m['aktualisiert'] ?? $m['eingang']) < time() - AUFBEWAHREN_TAGE * 86400 && (isset($m['text']) || isset($m['email']))) { unset($m['text'], $m['email'], $m['betreff']); schreiben($f, $m); }
  }
}

$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
ordner($DIR);

/* ---------- Betreiber: Liste, Status setzen, löschen ---------- */
if (isset($_GET['admin'])) {
  $key = (string)($_SERVER['HTTP_X_MELDE_KEY'] ?? '');
  if ($methode !== 'POST' || !hash_equals(ADMIN_HASH, hash('sha256', $key))) antwort(403, ['ok' => false]);
  $ein = json_decode((string)file_get_contents('php://input'), true) ?: [];
  $was = (string)$_GET['admin'];
  if ($was === 'liste') {
    $nurOffen = !empty($ein['offen']); $out = [];
    foreach (glob("$DIR/*.json") ?: [] as $f) { $m = lesen($f); if (!$m) continue; unset($m['token']); if ($nurOffen && in_array($m['status'], ['erledigt', 'kein Fehler', 'beantwortet'], true)) continue; $out[] = $m; }
    usort($out, fn($a, $b) => strcmp($a['id'], $b['id']));
    aufraeumen($DIR);
    antwort(200, ['ok' => true, 'meldungen' => $out]);
  }
  $id = (string)($ein['id'] ?? ''); if (!idOk($id) || !is_file("$DIR/$id.json")) antwort(404, ['ok' => false, 'fehler' => 'unbekannte Meldung']);
  $m = lesen("$DIR/$id.json");
  if ($was === 'status') {
    $s = (string)($ein['status'] ?? ''); if (!in_array($s, STATUS, true)) antwort(400, ['ok' => false, 'fehler' => 'Status']);
    $vorher = $m['status']; $m['status'] = $s; $m['aktualisiert'] = gmdate('c');
    if (isset($ein['version'])) $m['version'] = sauber((string)$ein['version'], 40);
    if (isset($ein['antwort'])) $m['antwort'] = sauber((string)$ein['antwort'], 1500);
    if (isset($ein['notiz'])) $m['notiz'] = sauber((string)$ein['notiz'], 4000);
    schreiben("$DIR/$id.json", $m);
    $gemailt = false;
    if ($vorher !== $s && in_array($s, ['erledigt', 'kein Fehler', 'beantwortet'], true) && !empty($m['email'])) $gemailt = mailErledigt($m);
    antwort(200, ['ok' => true, 'id' => $id, 'mail' => $gemailt]);
  }
  if ($was === 'loeschen') { @unlink("$DIR/$id.json"); antwort(200, ['ok' => true]); }
  antwort(400, ['ok' => false]);
}

/* ---------- Stand einer eigenen Meldung abfragen ---------- */
if ($methode === 'GET') {
  $id = (string)($_GET['id'] ?? ''); $t = (string)($_GET['t'] ?? '');
  if (!idOk($id) || !is_file("$DIR/$id.json")) antwort(404, ['ok' => false]);
  $m = lesen("$DIR/$id.json");
  if (!$m || !hash_equals($m['token'], hash('sha256', $t))) antwort(404, ['ok' => false]);
  antwort(200, ['ok' => true] + oeffentlich($m));
}

/* ---------- Neue Meldung ---------- */
if ($methode !== 'POST') antwort(405, ['ok' => false]);
$roh = (string)file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if (strlen($roh) > MAX_BODY) antwort(413, ['ok' => false, 'fehler' => 'zu groß']);
$ein = json_decode($roh, true);
if (!is_array($ein)) antwort(400, ['ok' => false, 'fehler' => 'ungültig']);
$text = sauber((string)($ein['text'] ?? ''), MAX_TEXT);
if (mb_strlen($text) < 10) antwort(400, ['ok' => false, 'fehler' => 'leer']);
$email = trim((string)($ein['email'] ?? ''));
if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 200)) antwort(400, ['ok' => false, 'fehler' => 'email']);
if (!begrenzen($DIR)) antwort(429, ['ok' => false, 'fehler' => 'zu viele']);
$token = bin2hex(random_bytes(16));
$m = ['id' => neueId($DIR), 'token' => hash('sha256', $token), 'eingang' => gmdate('c'), 'art' => ($ein['art'] ?? '') === 'idea' ? 'idea' : 'bug',
  'betreff' => sauber((string)($ein['betreff'] ?? ''), 200), 'text' => $text, 'email' => $email, 'app' => sauber((string)($ein['app'] ?? ''), 60),
  'sprache' => sauber((string)($ein['sprache'] ?? ''), 10), 'status' => 'neu'];
schreiben("$DIR/{$m['id']}.json", $m);
mailEingang($m);
antwort(200, ['ok' => true, 'id' => $m['id'], 'token' => $token]);
