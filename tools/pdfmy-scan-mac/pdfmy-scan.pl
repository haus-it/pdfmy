#!/usr/bin/perl
# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: AGPL-3.0-or-later
# pdfmy Scan für Mac und Linux – macht Scanner für PDFMy (pdfmy.de) im Browser verfügbar.
# Spricht dieselbe Schnittstelle wie pdfmy Scan für Windows (http://127.0.0.1:52880), nur vom eigenen Rechner erreichbar.
# Protokolle: eSCL/AirScan (fast alle Geräte ab ca. 2015) und WSD-Scan (z. B. Dell Color MFP E525w, viele ältere Geräte) – ohne Treiber.
# Linux zusätzlich: SANE (scanimage) für USB- und ältere Geräte, sofern installiert.
# Nutzt nur Bordmittel: Perl, curl, dns-sd (Mac) bzw. avahi-browse (Linux). Scans gehen direkt an PDFMy im Browser – nichts ins Internet.
use File::Copy (); use Unicode::Normalize ();
use strict; use warnings; use utf8; use Encode qw(decode);
use IO::Socket::INET; use IO::Select; use Socket qw(sockaddr_in inet_aton AF_INET6 SOCK_DGRAM getaddrinfo unpack_sockaddr_in6); use JSON::PP; use MIME::Base64;
use POSIX qw(strftime :sys_wait_h); use Time::HiRes qw(time); use File::Path qw(make_path remove_tree); use File::Temp qw(tempfile);

our $VERSION = '1.1.7';
my $IS_MAC = $^O eq 'darwin';
my $OS = $IS_MAC ? 'Mac' : 'Linux';
my $PORT = $ENV{PDFMY_PORT} || 52880;
my $WSD_PORT = $ENV{PDFMY_WSD_PORT} || 3702;
my $DIR = $ENV{PDFMY_DIR} || ($IS_MAC ? "$ENV{HOME}/Library/Application Support/pdfmy-scan" : ($ENV{XDG_DATA_HOME} || "$ENV{HOME}/.local/share") . '/pdfmy-scan');
my @ALLOWED = ('https://pdfmy.de', 'https://www.pdfmy.de', 'http://localhost:8765', 'http://localhost:8766', 'http://127.0.0.1:8765', 'http://127.0.0.1:8766');
my $J = JSON::PP->new->utf8->canonical;
make_path("$DIR/jobs");
$SIG{CHLD} = 'IGNORE'; $SIG{PIPE} = 'IGNORE';

# ---------------- Hilfen ----------------
sub logl { my $m = shift; $m =~ s/\s+/ /g; if (open my $f, '>>:utf8', "$DIR/log.txt") { print $f strftime('%Y-%m-%d %H:%M:%S ', localtime) . "$m\n"; close $f; } }
sub slurp { my $f = shift; open my $h, '<:raw', $f or return undef; local $/; my $d = <$h>; close $h; return $d; }
sub spit { my ($f, $d) = @_; open my $h, '>:raw', "$f.tmp" or return; print $h $d; close $h; rename "$f.tmp", $f; }
sub trim { my $s = shift // ''; $s =~ s/^\s+|\s+$//g; return $s; }
sub esc { my $s = shift // ''; $s =~ s/&/&amp;/g; $s =~ s/</&lt;/g; $s =~ s/>/&gt;/g; return $s; }
sub tagv { my ($x, $t) = @_; return $x =~ /<(?:[\w-]+:)?$t\b[^>]*>\s*([^<]*?)\s*</s ? $1 : undef; }
sub host_of { my $u = shift; return $u =~ m{^\w+://(?:\[([^\]]+)\]|([^/:]+))} ? ($1 // $2) : $u; }
# Adresse für URLs: IPv6 in eckigen Klammern, Zonen-Kennung (%eth0) als %25eth0
sub hosturl { my $h = shift; $h =~ s/^\[|\]$//g; return $h unless $h =~ /:/; $h =~ s/%(?!25)/%25/; return "[$h]"; }
# IPv4 bevorzugen, IPv6 nur, wenn das Gerät keine IPv4-Adresse nennt
sub pick_url { my @u = grep { m{^https?://} } @_; my ($v4) = grep { !m{^\w+://\[} } @u; return $v4 // $u[0]; }
sub uuid { return sprintf 'urn:uuid:%08x-%04x-4%03x-%04x-%06x%06x', int(rand(2**32)), int(rand(65536)), int(rand(4096)), 0x8000 | int(rand(16384)), int(rand(2**24)), int(rand(2**24)); }
sub alive { my $pid = shift; return $pid && kill(0, $pid); }
sub which { my $c = shift; for (split(/:/, $ENV{PATH} // ''), '/usr/bin', '/usr/local/bin', '/bin', '/usr/sbin') { return "$_/$c" if length && -x "$_/$c"; } return undef; }

# Log beim Start kürzen (letzte 400 Zeilen)
if (my $l = slurp("$DIR/log.txt")) { my @z = split /\n/, $l; spit("$DIR/log.txt", join("\n", @z[($#z > 399 ? $#z - 399 : 0) .. $#z]) . "\n") if @z > 400; }

# HTTP-Client über curl (auf jedem Mac vorhanden). Gibt (Statuscode, Kopfzeilen, Inhalt) zurück.
sub http {
  my %o = @_;
  my ($bf, $bn) = tempfile(DIR => $DIR); close $bf;
  my ($hf, $hn) = tempfile(DIR => $DIR); close $hf;
  my @a = ('curl', '-s', '-m', ($o{timeout} || 30), '--connect-timeout', ($o{connect} || 5), '-o', $bn, '-D', $hn, '-w', '%{http_code}', '-H', 'Expect:', '-X', ($o{method} || 'GET'));
  push @a, '-H', "Content-Type: $o{ctype}" if $o{ctype};
  push @a, '-k' if $o{url} =~ m{^https://};   # Scanner im eigenen Netz haben selbstsignierte Zertifikate
  push @a, '-H', "Host: $o{hosthdr}" if $o{hosthdr};
  if (!$o{hosthdr} && $o{porthost} && $o{url} =~ m{^(https?)://(\[[^\]]+\]|[^/:]+)(?::(\d+))?}) { push @a, '-H', "Host: $2:" . ($3 // ($1 eq 'https' ? 443 : 80)); }   # Epson: Port im Host-Kopf
  my $qn;
  if (defined $o{body}) { my $qf; ($qf, $qn) = tempfile(DIR => $DIR); binmode $qf; print $qf $o{body}; close $qf; push @a, '--data-binary', "\@$qn"; }
  push @a, $o{url};
  my $code = 0;
  if (open my $p, '-|', @a) { local $/; $code = <$p> // 0; close $p; }
  my $body = slurp($bn) // ''; my $hdr = slurp($hn) // '';
  unlink grep { defined } $bn, $hn, $qn;
  $code =~ s/\D//g;
  return (($code || 0) + 0, $hdr, $body);
}
sub hdr { my ($h, $name) = @_; my @m = $h =~ /^\Q$name\E:[ \t]*([^\r\n]*)/mig; return $m[-1]; }

# Befehl mit Zeitlimit ausführen und die Ausgabe sammeln (für dns-sd, das sonst endlos läuft)
sub run_for {
  my ($secs, @cmd) = @_;
  my $pid = open(my $fh, '-|', @cmd) or return '';
  my $sel = IO::Select->new($fh); my $out = ''; my $end = time + $secs;
  while ((my $left = $end - time) > 0) { last unless $sel->can_read($left); my $n = sysread($fh, my $buf, 65536); last unless $n; $out .= $buf; }
  kill 'TERM', $pid; close $fh;
  return $out;
}

# Eigene IPv4-Adressen aller aktiven Netzwerkkarten (WLAN, LAN, VPN …) – für die Suche über jede Karte
sub local_ipv4 {
  my $o = run_for(2, $IS_MAC ? ('/sbin/ifconfig') : (which('ip') ? (which('ip'), '-4', '-o', 'addr', 'show') : ('hostname', '-I')));
  my @a = $o =~ /\binet\s/ ? ($o =~ /\binet\s+(?:addr:)?(\d{1,3}(?:\.\d{1,3}){3})/g) : ($o =~ /(\d{1,3}(?:\.\d{1,3}){3})/g);   # ifconfig/ip: nur die Adresse nach „inet“
  my %ip = map { $_ => 1 } grep { !/^127\./ && !/^169\.254\./ } @a;
  return sort keys %ip;
}

# Netzsuche: welche Adressen im eigenen Netz (privat, /24) haben Port 80 oder 443 offen? Gleichzeitig, in Gruppen (macOS erlaubt nur 256 offene Dateien)
sub subnet_hosts {
  my %t;
  for my $lip (local_ipv4()) {
    my @b = split /\./, $lip;
    next unless $b[0] == 10 || ($b[0] == 192 && $b[1] == 168) || ($b[0] == 172 && $b[1] >= 16 && $b[1] <= 31);
    $t{"$b[0].$b[1].$b[2].$_"} = 1 for grep { "$b[0].$b[1].$b[2].$_" ne $lip } 1 .. 254;
  }
  my @targets = map { my $ip = $_; map { [$ip, $_] } 80, 443, 631, 5357, 9100 } sort keys %t; my %open;   # Web und Druckerports (IPP, WSD, RAW)
  while (my @batch = splice @targets, 0, 150) {
    my %pending;
    for my $tp (@batch) { my $s = IO::Socket::INET->new(PeerAddr => $tp->[0], PeerPort => $tp->[1], Proto => 'tcp', Blocking => 0) or next; $pending{fileno $s} = [$s, @$tp]; }
    my $sel = IO::Select->new(map { $_->[0] } values %pending); my $end = time + 1.2;
    while ($sel->count && (my $left = $end - time) > 0) {
      for my $s ($sel->can_write($left)) {
        my $e = getsockopt($s, Socket::SOL_SOCKET(), Socket::SO_ERROR()); my ($ip, $port) = @{ $pending{fileno $s} }[1, 2];
        $open{$ip}{$port} = 1 if $e && unpack('i', $e) == 0 && $s->connected;
        $sel->remove($s); close $s;
      }
    }
    close $_->[0] for values %pending;
  }
  return \%open;   # IP → { 80 => 1, 443 => 1, 631 => 1, … }
}

# ---------------- Geräteliste (Datei, damit alle Prozesse dieselbe sehen) ----------------
sub devices { my $d = slurp("$DIR/devices.json"); my $l = $d ? eval { $J->decode($d) } : undef; return ref $l eq 'ARRAY' ? $l : []; }
sub save_devices { spit("$DIR/devices.json", $J->encode($_[0])); }
sub added_ips { my $d = slurp("$DIR/added.json"); my $l = $d ? eval { $J->decode($d) } : undef; return ref $l eq 'ARRAY' ? $l : []; }
sub find_dev { my $id = shift; for (@{ devices() }) { return $_ if $_->{id} eq $id; } return undef; }

# ---------------- eSCL / AirScan ----------------
sub escl_probe {
  my $base = shift; $base =~ s{/+$}{};
  my ($c, $h, $x) = http(url => "$base/ScannerCapabilities", timeout => 5, connect => 3);
  return undef unless $c == 200 && $x =~ /<(?:[\w-]+:)?ScannerCapabilities\b/;
  $x = decode('UTF-8', $x);
  my %d = (kind => 'escl', base => $base, id => "escl:$base");
  $d{name} = trim(tagv($x, 'MakeAndModel')) || 'Scanner ' . host_of($base);
  $d{feeder} = $x =~ /<(?:[\w-]+:)?Adf\b/ ? 1 : 0;
  $d{duplex} = $x =~ /AdfDuplexInputCaps/ ? 1 : 0;
  $d{platen} = $x =~ /<(?:[\w-]+:)?Platen\b/ ? 1 : 0;
  $d{platen} = 1 unless $d{feeder} || $d{platen};
  $d{jpeg} = $x =~ m{image/jpeg} ? 1 : 0; $d{pdf} = $x =~ m{application/pdf} ? 1 : 0;
  $d{ver} = trim(tagv($x, 'Version')) || '2.0';
  my %r; $r{$1} = 1 while $x =~ /<(?:[\w-]+:)?DiscreteResolution>.*?<(?:[\w-]+:)?XResolution>(\d+)</gs; $d{res} = [sort { $a <=> $b } keys %r];
  my %m; $m{trim($1)} = 1 while $x =~ /<(?:[\w-]+:)?ColorMode>([^<]+)</g; $d{modes} = [sort keys %m];
  # Geräte-Eigenheiten (Quelle: sane-airscan)
  $d{fmtext} = $x =~ /DocumentFormatExt/ ? 1 : 0;   # nur senden, wenn das Gerät es kennt
  $d{localhost} = ($d{name} eq 'HP LaserJet MFP M630' || $d{name} eq 'HP Color LaserJet FlowMFP M578' || (hdr($h, 'Server') // '') =~ /HP_Compact_Server/) ? 1 : 0;   # HP Enterprise: „Host: localhost“
  if ($d{name} eq 'Canon iR2625/2630') { $d{res} = [grep { $_ <= 300 } @{ $d{res} }]; $d{res} = [300] unless @{ $d{res} }; }   # nennt 600, kann nur 300
  return \%d;
}
sub pick_dpi { my ($d, $want) = @_; my @r = @{ $d->{res} || [] }; return $want unless @r; my ($b) = sort { abs($a - $want) <=> abs($b - $want) || $b <=> $a } @r; return $b; }
sub pick_mode {
  my ($modes, $color, @map) = @_;
  my $want = $color eq 'color' ? $map[0] : $color eq 'bw' ? $map[2] : $map[1];
  return $want if !@$modes || grep { $_ eq $want } @$modes;
  for my $alt ($map[1], $map[0], $map[2]) { return $alt if grep { $_ eq $alt } @$modes; }
  return $modes->[0];
}
sub escl_settings {
  my ($d, $source, $mode, $dpi, $fmt, $duplex, $full) = @_;
  my $s = qq{<?xml version="1.0" encoding="UTF-8"?>\n<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">\n<pwg:Version>$d->{ver}</pwg:Version>\n};
  $s .= qq{<scan:Intent>Document</scan:Intent>\n<pwg:ScanRegions><pwg:ScanRegion><pwg:Height>3508</pwg:Height><pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits><pwg:Width>2480</pwg:Width><pwg:XOffset>0</pwg:XOffset><pwg:YOffset>0</pwg:YOffset></pwg:ScanRegion></pwg:ScanRegions>\n} if $full;
  $s .= qq{<pwg:InputSource>$source</pwg:InputSource>\n};
  $s .= '<scan:Duplex>' . ($duplex ? 'true' : 'false') . "</scan:Duplex>\n" if $source eq 'Feeder';
  $s .= qq{<scan:ColorMode>$mode</scan:ColorMode>\n<scan:XResolution>$dpi</scan:XResolution><scan:YResolution>$dpi</scan:YResolution>\n<pwg:DocumentFormat>$fmt</pwg:DocumentFormat>\n};
  $s .= qq{<scan:DocumentFormatExt>$fmt</scan:DocumentFormatExt>\n} if $full && $d->{fmtext};
  return $s . '</scan:ScanSettings>';
}
# Geräte-Eigenheiten (wie sane-airscan): Epson verlangt den Port im Host-Kopf, Brother braucht beim Einzug eine Pause zwischen den Seiten
sub epson { my $d = shift; return ($d->{name} // '') =~ /^EPSON/i ? 1 : 0; }
sub escl_status { my $d = shift; my ($c, $h, $x) = http(url => "$d->{base}/ScannerStatus", timeout => 5, porthost => epson($d)); return $c == 200 ? $x : ''; }
sub escl_jobs { my $st = shift // ''; my @l; while ($st =~ /<(?:\w+:)?JobInfo>(.*?)<\/(?:\w+:)?JobInfo>/gs) { my $b = $1; my $u = tagv($b, 'JobUri'); push @l, [trim($u), trim(tagv($b, 'JobState') // '')] if $u; } return @l; }

sub escl_scan {
  my ($d, $r, $page, $trace) = @_;
  my @sources;
  if ($r->{source} eq 'platen') { @sources = ('Platen'); }
  elsif ($r->{source} eq 'feeder') { @sources = ('Feeder'); }
  else {
    # automatisch: Papier im Einzug → Einzug, sonst Glas (manche Geräte melden den Einzug nicht in den Fähigkeiten)
    my $st = escl_status($d); my $adf = tagv($st, 'AdfState');
    my $loaded = !defined $adf ? undef : $adf =~ /Loaded/ ? 1 : $adf =~ /Empty/ ? 0 : undef;
    push @$trace, "Einzug: $adf" if defined $adf;
    push @sources, 'Feeder' if ($loaded // 0) || (!defined $loaded && $d->{feeder});
    push @sources, 'Platen' if $d->{platen} || !($loaded // 0);
  }
  @sources = ('Platen') unless @sources;
  my $dpi = pick_dpi($d, $r->{dpi} || 300);
  my $mode = pick_mode($d->{modes}, $r->{color} || 'gray', 'RGB24', 'Grayscale8', 'BlackAndWhite1');
  my @formats = (($d->{jpeg} ? 'image/jpeg' : ()), ($d->{pdf} ? 'application/pdf' : ())); @formats = ('image/jpeg') unless @formats;
  my $n = 0;
  SOURCE: for my $source (@sources) {
    my ($loc, $fmt);
    VARIANT: for my $f (@formats) { for my $full (1, 0) {
      for my $try (1 .. 4) {
        my %before = map { $_->[0] => 1 } escl_jobs(escl_status($d));
        my ($c, $h, $b) = http(method => 'POST', url => "$d->{base}/ScanJobs", ctype => 'text/xml', body => escl_settings($d, $source, $mode, $dpi, $f, $r->{duplex} && $d->{duplex}, $full), timeout => 30, porthost => epson($d), hosthdr => ($d->{localhost} && host_of($d->{base}) !~ /^(?:127\.|::1$|localhost$)/ ? 'localhost' : undef));
        push @$trace, "$source $f " . ($full ? 'voll' : 'einfach') . " ${dpi}dpi $mode → $c";
        if ($c == 503 || $c == 409) { sleep 2; next; }
        last unless $c >= 200 && $c < 300;
        $loc = hdr($h, 'Location') || hdr($h, 'Content-Location');
        if (!$loc && $b =~ m{((?:https?://[^\s<"']+)?/eSCL/ScanJobs/[\w.\-]+)}) { $loc = $1; push @$trace, 'Adresse aus Antwort'; }
        if (!$loc) { for (1 .. 4) { sleep 1; my @fresh = grep { !$before{ $_->[0] } } escl_jobs(escl_status($d)); if (@fresh) { $loc = $fresh[-1][0]; push @$trace, 'Adresse aus ScannerStatus'; last; } } }
        if (!$loc) { push @$trace, 'keine Auftragsadresse'; last; }
        $fmt = $f; last VARIANT;
      }
    } }
    next SOURCE unless $loc;
    my ($root) = $d->{base} =~ m{^(\w+://[^/]+)};
    unless ($loc =~ m{^https?://}) { $loc = $loc =~ m{^/} ? "$root$loc" : "$d->{base}/$loc"; }
    $loc =~ s{^\w+://[^/]+}{$root};   # immer über den Weg, auf dem wir das Gerät erreichen (HP meldet „localhost“)
    $loc =~ s{/+$}{};
    escl_status($d);   # Ricoh: ohne Statusabfrage vor der ersten Seite bleibt der Auftrag „wartend“
    my $xeroxb = ($d->{name} eq 'B205' || $d->{name} eq 'B215') ? 1 : 0; my $r404 = 0;   # Xerox B205/B215: 404/410 nur vorübergehend
    my $busy = 0; my $last = 0;
    while (1) {
      if ($source eq 'Feeder' && $n && ($d->{name} // '') =~ /^Brother /i) { my $w = $last + 1 - time; select(undef, undef, undef, $w > 1 ? 1 : $w) if $w > 0; }   # Brother: mind. ca. 1 s zwischen den Seiten
      $last = time;
      my ($c, $h, $data) = http(url => "$loc/NextDocument", timeout => 120, porthost => epson($d));
      if ($c == 503 && $busy++ < 90) { sleep 1; next; }
      if (($c == 404 || $c == 410) && $source eq 'Feeder' && !$n && $busy++ < 20) { sleep 1; next; }   # zieht noch ein
      if (($c == 404 || $c == 410) && $xeroxb && $r404++ < 5) { sleep 1; next; }
      last if $c == 404 || $c == 410;
      if ($c != 200) { push @$trace, "NextDocument → $c"; last; }
      if (length($data) < 100) { push @$trace, 'leere Seite vom Gerät'; last; }
      $page->($data, $fmt); $n++; $busy = 0;
      last if $source eq 'Platen';
    }
    last SOURCE if $n;
    push @$trace, "$source: keine Seiten";
  }
  return $n;
}

# ---------------- WSD-Scan (Web Services for Devices, z. B. Dell E525w) ----------------
my $NS = 'xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:wsd="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:sca="http://schemas.microsoft.com/windows/2006/08/wdp/scan" xmlns:wscn="http://schemas.microsoft.com/windows/2006/08/wdp/scan"';
my $SCA = 'http://schemas.microsoft.com/windows/2006/08/wdp/scan';
sub soap {
  my ($to, $action, $body) = @_;
  return qq{<?xml version="1.0" encoding="utf-8"?><soap:Envelope $NS><soap:Header><wsa:To>} . esc($to) . qq{</wsa:To><wsa:Action>$action</wsa:Action><wsa:MessageID>} . uuid() . qq{</wsa:MessageID><wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo></soap:Header><soap:Body>$body</soap:Body></soap:Envelope>};
}
sub wsd_call { my ($url, $action, $body, $timeout) = @_; return http(method => 'POST', url => $url, ctype => 'application/soap+xml; charset=utf-8', body => soap($url, $action, $body), timeout => $timeout || 15); }

# WS-Discovery: Probe per Multicast (oder direkt an eine IP), Antwort enthält die Geräteadresse(n)
sub wsd_discover {
  my ($target, $secs) = @_;
  if (ref $target eq 'ARRAY') {   # mehrere IPv4-Adressen über einen Socket
    my $s = IO::Socket::INET->new(Proto => 'udp', LocalAddr => '0.0.0.0', LocalPort => 0) or return ();
    my $probe = qq{<?xml version="1.0" encoding="utf-8"?><soap:Envelope $NS><soap:Header><wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To><wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action><wsa:MessageID>} . uuid() . qq{</wsa:MessageID></soap:Header><soap:Body><wsd:Probe><wsd:Types>wscn:ScanDeviceType</wsd:Types></wsd:Probe></soap:Body></soap:Envelope>};
    for my $ip (@$target) { my $a = inet_aton($ip) or next; send($s, $probe, 0, sockaddr_in($WSD_PORT, $a)); }
    return wsd_collect([$s], $secs);
  }
  $target =~ s/^\[|\]$//g if defined $target;
  my $v6 = defined $target && $target =~ /:/;
  my @socks;
  my $sock = $v6 ? undef : IO::Socket::INET->new(Proto => 'udp', LocalAddr => '0.0.0.0', LocalPort => 0);
  my $probe = qq{<?xml version="1.0" encoding="utf-8"?><soap:Envelope $NS><soap:Header><wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To><wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action><wsa:MessageID>} . uuid() . qq{</wsa:MessageID></soap:Header><soap:Body><wsd:Probe><wsd:Types>wscn:ScanDeviceType</wsd:Types></wsd:Probe></soap:Body></soap:Envelope>};
  if ($sock) { my $ip = inet_aton($target || '239.255.255.250'); if ($ip) { send($sock, $probe, 0, sockaddr_in($WSD_PORT, $ip)) for 1 .. 2; push @socks, $sock; } }
  # Ohne Ziel: zusätzlich über jede Netzwerkkarte (sonst nur über die Standardroute – Scanner im WLAN wird bei aktivem LAN/VPN nicht gefunden)
  if (!defined $target && (my $mif = eval { Socket::IP_MULTICAST_IF() })) {
    for my $lip (local_ipv4()) {
      my $s = IO::Socket::INET->new(Proto => 'udp', LocalAddr => $lip, LocalPort => 0) or next;
      setsockopt($s, Socket::IPPROTO_IP(), $mif, inet_aton($lip)) or next;
      send($s, $probe, 0, sockaddr_in($WSD_PORT, inet_aton('239.255.255.250'))) for 1 .. 2; push @socks, $s;
    }
  }
  # IPv6: an die Adresse bzw. an die WSD-Gruppe ff02::c (Netze ohne IPv4 oder Geräte, die nur über IPv6 antworten)
  if ($v6 || !defined $target) {
    my ($err, @ai) = getaddrinfo($v6 ? $target : 'ff02::c', $WSD_PORT, { family => AF_INET6, socktype => SOCK_DGRAM });
    if (!$err && @ai && socket(my $s6, AF_INET6, SOCK_DGRAM, 0)) { send($s6, $probe, 0, $ai[0]{addr}) for 1 .. 2; push @socks, $s6; }
  }
  return () unless @socks;
  return wsd_collect(\@socks, $secs);
}
sub wsd_collect {
  my ($socks, $secs) = @_; my @socks = @$socks;
  my $sel = IO::Select->new(@socks); my %found; my $end = time + ($secs || 3);
  while ((my $left = $end - time) > 0) {
    my @r = $sel->can_read($left); last unless @r;
    for my $sk (@r) {
      my $from = recv($sk, my $buf, 65535, 0); next unless defined $from;
      next unless $buf =~ /ProbeMatch/;
      my $epr = trim(tagv($buf, 'Address')) // '';
      my @x = grep { m{^http://} } split /\s+/, (tagv($buf, 'XAddrs') // '');
      # Link-lokale IPv6-Adresse (fe80::) braucht die Netzwerkschnittstelle – aus dem Absender übernehmen
      if (length $from > 16) { my (undef, undef, $scope) = eval { unpack_sockaddr_in6($from) }; s{^http://\[(fe80:[^\]%]+)\]}{http://[$1%25$scope]}i for grep { $scope } @x; }
      my $u = pick_url(@x);
      $found{$epr} //= { epr => $epr, xaddr => $u } if $u;
      $found{$epr}{xaddr} = $u if $u && $found{$epr}{xaddr} =~ m{^\w+://\[} && $u !~ m{^\w+://\[};   # IPv4 ersetzt IPv6
    }
  }
  return values %found;
}
# Gerätebeschreibung holen (WS-Transfer Get) und den Scan-Dienst finden
sub wsd_probe {
  my $m = shift;
  my ($c, $h, $x) = http(method => 'POST', url => $m->{xaddr}, ctype => 'application/soap+xml; charset=utf-8', timeout => 6, connect => 3,
    body => soap($m->{epr} || $m->{xaddr}, 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Get', ''));
  return undef unless $c == 200;
  $x = decode('UTF-8', $x);
  my $svc;
  while ($x =~ /<(?:[\w-]+:)?Hosted>(.*?)<\/(?:[\w-]+:)?Hosted>/gs) {
    my $hb = $1; next unless $hb =~ /ScannerServiceType/;
    my $a = pick_url(map { trim($_) } ($hb =~ /<(?:[\w-]+:)?Address>([^<]+)</g));
    if ($a) { ($svc = $a) =~ s{^(http://\[fe80:[^\]%]+)\]}{my $z = ($m->{xaddr} =~ /%25([\w.]+)\]/)[0]; $z ? "$1%25$z]" : "$1]"}ie; last; }
  }
  return undef unless $svc;
  my $name = trim(join ' ', grep { defined && length } (tagv($x, 'Manufacturer'), tagv($x, 'ModelName')));
  $name = trim(tagv($x, 'FriendlyName')) if !$name || length $name < 3;
  my %d = (kind => 'wsd', id => "wsd:$svc", svc => $svc, name => ($name || 'Scanner ' . host_of($svc)));
  # Fähigkeiten: Einzug, beidseitig, Glas, Formate, Farben, Auflösungen
  my ($c2, $h2, $e) = wsd_call($svc, "$SCA/GetScannerElements",
    '<sca:GetScannerElementsRequest><sca:RequestedElements><sca:Name>sca:ScannerDescription</sca:Name><sca:Name>sca:ScannerConfiguration</sca:Name></sca:RequestedElements></sca:GetScannerElementsRequest>', 8);
  if ($c2 == 200) {
    $e = decode('UTF-8', $e);
    $d{name} = trim(tagv($e, 'ScannerName')) if $name eq '' && tagv($e, 'ScannerName');
    $d{feeder} = $e =~ /<(?:[\w-]+:)?ADF\b/ ? 1 : 0;
    $d{duplex} = ($e =~ /<(?:[\w-]+:)?ADFSupportsDuplex>\s*(true|1)\s*</i || $e =~ /<(?:[\w-]+:)?ADFBack\b/) ? 1 : 0;
    $d{platen} = $e =~ /<(?:[\w-]+:)?Platen\b/ ? 1 : 0;
    my %f; $f{trim($1)} = 1 while $e =~ /<(?:[\w-]+:)?FormatValue>([^<]+)</g; $d{formats} = [sort keys %f];
    my %m; $m{trim($1)} = 1 while $e =~ /<(?:[\w-]+:)?ColorEntry>([^<]+)</g; $d{modes} = [sort keys %m];
    my %r; while ($e =~ /<(?:[\w-]+:)?(?:Platen|ADF|ADFFront)Resolutions>(.*?)<\/(?:[\w-]+:)?(?:Platen|ADF|ADFFront)Resolutions>/gs) { my $rb = $1; $r{$1} = 1 while $rb =~ /<(?:[\w-]+:)?Width>\s*(\d+)\s*</g; } $d{res} = [sort { $a <=> $b } grep { $_ >= 75 && $_ <= 1200 } keys %r];
  }
  $d{platen} = 1 unless $d{feeder} || $d{platen};
  return \%d;
}
# Mehrteilige Antwort (MTOM/XOP) zerlegen: das Bild ist der Binärteil
sub wsd_image {
  my ($h, $b) = @_;
  my $ct = hdr($h, 'Content-Type') // '';
  if ($ct =~ /boundary="?([^";]+)"?/i) {
    my $bd = $1; my ($best, $bestlen) = (undef, 0);
    for my $part (split /--\Q$bd\E/, $b) {
      my ($ph, $pb) = split /\r?\n\r?\n/, $part, 2; next unless defined $pb;
      next if $ph =~ m{application/(?:soap\+)?xop\+xml|text/xml|application/soap\+xml}i;
      $pb =~ s/\r?\n$//;
      ($best, $bestlen) = ($pb, length $pb) if length $pb > $bestlen;
    }
    return $best;
  }
  if ($b =~ /<(?:[\w-]+:)?ScanData>\s*([A-Za-z0-9+\/=\s]{200,})\s*</) { return decode_base64($1); }   # eingebettet statt Anhang
  return undef;
}
sub wsd_ticket {
  my ($d, $src, $fmt, $mode, $dpi, $back, $simple) = @_;
  my $itt = $src eq 'Platen' ? 1 : ($d->{name} // '') eq 'RICOH Aficio MP 201' ? 100 : 0;   # Ricoh MP 201 versteht 0 nicht
  my $side = "<sca:ColorProcessing>$mode</sca:ColorProcessing><sca:Resolution><sca:Width>$dpi</sca:Width><sca:Height>$dpi</sca:Height></sca:Resolution>";
  my $t = '<sca:CreateScanJobRequest><sca:ScanTicket><sca:JobDescription><sca:JobName>PDFMy</sca:JobName><sca:JobOriginatingUserName>PDFMy</sca:JobOriginatingUserName><sca:JobInformation>PDFMy</sca:JobInformation></sca:JobDescription><sca:DocumentParameters>';
  $t .= "<sca:Format>$fmt</sca:Format>";
  $t .= "<sca:ImagesToTransfer>$itt</sca:ImagesToTransfer>" unless $simple;
  $t .= "<sca:InputSource>$src</sca:InputSource>";
  $t .= '<sca:InputSize><sca:InputMediaSize><sca:Width>8268</sca:Width><sca:Height>11693</sca:Height></sca:InputMediaSize></sca:InputSize>' unless $simple;   # A4 in 1/1000 Zoll
  $t .= "<sca:MediaSides><sca:MediaFront>$side</sca:MediaFront>" . ($back ? "<sca:MediaBack>$side</sca:MediaBack>" : '') . '</sca:MediaSides>';
  return $t . '</sca:DocumentParameters></sca:ScanTicket></sca:CreateScanJobRequest>';
}
sub wsd_scan {
  my ($d, $r, $page, $trace) = @_;
  my @sources = $r->{source} eq 'platen' ? ('Platen') : $r->{source} eq 'feeder' ? ('ADF') : (($d->{feeder} ? 'ADF' : ()), ($d->{platen} ? 'Platen' : ()));
  @sources = ('Platen') unless @sources;
  my @f = @{ $d->{formats} || [] };
  my ($fmt) = (grep({ $_ eq 'jfif' } @f), grep({ $_ eq 'exif' } @f), grep({ /pdf/ } @f), grep({ $_ eq 'png' } @f), 'jfif');
  my $mime = $fmt =~ /pdf/ ? 'application/pdf' : $fmt eq 'png' ? 'image/png' : 'image/jpeg';
  my $mode = pick_mode($d->{modes} || [], $r->{color} || 'gray', 'RGB24', 'Grayscale8', 'BlackAndWhite1');
  my $dpi = pick_dpi($d, $r->{dpi} || 300);
  my $n = 0; my $notacc = 0;
  SOURCE: for my $src0 (@sources) {
    my $src = $src0 eq 'ADF' && $r->{duplex} && $d->{duplex} ? 'ADFDuplex' : $src0;
    my ($id, $tok);
    for my $simple (0, 1) {
      for my $try (1 .. 3) {
        my ($c, $h, $x) = wsd_call($d->{svc}, "$SCA/CreateScanJob", wsd_ticket($d, $src, $fmt, $mode, $dpi, $src eq 'ADFDuplex', $simple), 20);
        my $fault = trim(tagv($x, 'Value') // ''); $fault = trim(tagv($x, 'Subcode') // $fault) if $x =~ /Subcode/;
        push @$trace, "$src $fmt " . ($simple ? 'einfach' : 'voll') . " ${dpi}dpi $mode → $c" . ($c == 200 ? '' : " $fault");
        # Lexmark/Xerox melden Fehler auch mit HTTP 200 – nur mit Auftragsnummer und ohne Fault ist es ein Erfolg
        my $jid = trim(tagv($x, 'JobId') // '');
        if ($c == 200 && length $jid && !wsd_fault($x)) { $id = $jid; $tok = trim(tagv($x, 'JobToken')); last; }
        $notacc = 1 if $x =~ /NotAcceptingJobs/i;
        last unless $x =~ /Busy|NotAccepting|ServerErrorTemporary|Calibrating|LampWarming/i; sleep 2;
      }
      last if $id;
    }
    next SOURCE unless $id;
    my $busy = 0;
    while (1) {
      my ($c, $h, $b) = wsd_call($d->{svc}, "$SCA/RetrieveImage",
        "<sca:RetrieveImageRequest><sca:JobId>$id</sca:JobId><sca:JobToken>" . esc($tok) . '</sca:JobToken><sca:DocumentDescription><sca:DocumentName>PDFMy-' . ($n + 1) . '</sca:DocumentName></sca:DocumentDescription></sca:RetrieveImageRequest>', 180);
      if ($c != 200 || wsd_fault($b)) {
        last if $b =~ /NoImagesAvailable|JobCompleted|ClientErrorNoImages/i || ($src0 eq 'Platen' && $n);
        if ($b =~ /Busy|Temporary|NotReady/i && $busy++ < 60) { sleep 1; next; }
        push @$trace, "RetrieveImage → $c " . trim(tagv($b, 'Text') // tagv($b, 'Value') // ''); last;
      }
      my $img = wsd_image($h, $b);
      if (!$img || length $img < 100) { push @$trace, 'kein Bild in der Antwort'; last; }
      $page->($img, $mime); $n++; $busy = 0;
      last if $src0 eq 'Platen';
    }
    last SOURCE if $n;
    push @$trace, "$src: keine Seiten";
  }
  die "Der Scanner nimmt gerade keine Aufträge an. Bei Kyocera, Ricoh und manchen anderen Geräten muss WSD-Scan am Gerät gestartet werden: am Bedienfeld „Senden“ bzw. „Scanner“ → „WSD-Scan“ → „Vom Computer“ wählen und dann erneut „Scannen“ klicken.\n" if !$n && $notacc;
  return $n;
}
sub wsd_fault { my $x = shift // ''; return $x =~ m{addressing/fault|<(?:[\w-]+:)?Fault\b} ? 1 : 0; }

# ---------------- SANE (nur Linux): USB- und ältere Geräte über scanimage ----------------
sub sane_caps {
  my ($si, $dev) = @_;
  my $o = run_for(12, $si, '-d', $dev, '-A');
  my %d;
  my $list = sub { my $k = shift; return () unless $o =~ /--\Q$k\E\s+([^\[\n]+?)\s*(?:\[|\n)/; my $v = $1; $v =~ s/\s*dpi\s*$//i; return map { trim($_) } split /\|/, $v; };
  $d{sources} = [$list->('source')]; $d{modes} = [$list->('mode')];
  my @r = $list->('resolution');
  if (@r == 1 && $r[0] =~ /^(\d+)\.\.(\d+)/) { $d{range} = [$1 + 0, $2 + 0]; $d{res} = [grep { $_ >= $1 && $_ <= $2 } 75, 100, 150, 200, 300, 400, 600]; }
  else { $d{res} = [sort { $a <=> $b } grep { /^\d+$/ } @r]; }
  return \%d;
}
sub sane_discover {
  my $known = shift;   # bereits über eSCL/WSD gefundene Geräte – nicht doppelt anzeigen
  my $si = which('scanimage') or return ();
  my @l;
  for (split /\n/, run_for(15, $si, '-f', "%d\t%v %m\n")) {
    my ($dev, $name) = split /\t/; next unless $dev && $dev =~ /^[\w-]+:/;
    next if $dev =~ /^(?:v4l|test|pnm|net):/;   # Webcams, Testtreiber
    $name = trim($name); $name =~ s/^Unknown\s+//i;
    if ($dev =~ /^(?:airscan|escl):/) { my $n = lc $name; next if grep { my $k = lc $_->{name}; index($k, $n) >= 0 || index($n, $k) >= 0 } @$known; }
    my $caps = sane_caps($si, $dev);
    my @s = @{ $caps->{sources} };
    my %d = (kind => 'sane', id => "sane:$dev", dev => $dev, name => $name || $dev, %$caps);
    $d{feeder} = (grep { /adf|feeder|einzug|automatic|document/i } @s) ? 1 : 0;
    $d{duplex} = (grep { /duplex/i } @s) ? 1 : 0;
    $d{platen} = (grep { /flatbed|platen|glas|normal/i } @s) || !@s ? 1 : 0;
    push @l, \%d;
  }
  return @l;
}
sub sane_mode {
  my ($modes, $color) = @_;
  return undef unless @$modes;
  my @pref = $color eq 'color' ? (qr/colou?r|rgb|farb/i) : $color eq 'bw' ? (qr/lineart|binary|black|halftone|s\/w/i, qr/gr[ae]y/i) : (qr/gr[ae]y|grau/i, qr/colou?r/i);
  for my $re (@pref) { my ($m) = grep { $_ =~ $re } @$modes; return $m if defined $m; }
  return $modes->[0];
}
sub sane_scan {
  my ($d, $r, $page, $trace) = @_;
  my $si = which('scanimage') or do { push @$trace, 'scanimage fehlt'; return 0; };
  my @s = @{ $d->{sources} || [] };
  my ($flat) = grep { /flatbed|platen|glas|normal/i } @s;
  my ($dup) = grep { /duplex/i } @s;
  my ($adf) = grep { /adf|feeder|einzug|automatic|document/i && !/duplex|back|rück/i } @s;
  my $feed = $r->{duplex} && $dup ? $dup : ($adf // $dup);
  my @try = $r->{source} eq 'platen' ? ($flat) : $r->{source} eq 'feeder' ? ($feed) : (($feed // ()), ($flat // ()));
  @try = (undef) unless grep { defined } @try;
  my $dpi = $r->{dpi} || 300;
  if ($d->{range}) { $dpi = $d->{range}[0] if $dpi < $d->{range}[0]; $dpi = $d->{range}[1] if $dpi > $d->{range}[1]; } else { $dpi = pick_dpi($d, $dpi); }
  my $mode = sane_mode($d->{modes} || [], $r->{color} || 'gray');
  my $n = 0;
  SRC: for my $src (@try) {
    my $isflat = !defined $src || (defined $flat && $src eq $flat);
    for my $fmt ('jpeg', 'png') {
      my $dir = "$DIR/jobs/sane-$$"; remove_tree($dir); make_path($dir);
      my @cmd = ($si, '-d', $d->{dev}, "--format=$fmt", '--resolution', $dpi, (defined $mode ? ('--mode', $mode) : ()), (defined $src ? ('--source', $src) : ()),
        "--batch=$dir/p%04d.$fmt", '--batch-print', ($isflat ? ('--batch-count=1') : ()));
      my $pid = open(my $fh, '-|');
      if (!defined $pid) { push @$trace, 'scanimage startet nicht'; return $n; }
      if ($pid == 0) { open STDERR, '>', "$dir/err.txt"; { exec @cmd }; POSIX::_exit(127); }
      my $got = 0;
      while (my $line = <$fh>) { chomp $line; next unless -f $line; my $data = slurp($line); unlink $line; next unless defined $data && length $data > 100; $page->($data, $fmt eq 'png' ? 'image/png' : 'image/jpeg'); $n++; $got++; }
      close $fh;
      my $err = trim(slurp("$dir/err.txt") // ''); $err =~ s/\s+/ /g; remove_tree($dir);
      push @$trace, 'SANE ' . ($src // 'Standard') . " $fmt ${dpi}dpi " . ($mode // '') . " → $got Seite(n)" . ($err ? ' · ' . substr($err, 0, 160) : '');
      last unless !$got && $err =~ /format|unrecognized|not supported|unbekannt/i;   # nur bei fehlendem JPEG-Format mit PNG wiederholen
    }
    last SRC if $n;
  }
  return $n;
}

# ---------------- Suche ----------------
# Einzelne Geräteabfrage absichern: ein Fehler (z. B. ungewöhnliche WSD-Antwort) darf die Suche nicht abbrechen
sub safe { my $r = eval { $_[0]->() }; if ($@) { (my $e = "$@") =~ s/\s+$//; logl("Suche: $e"); } return $r; }
# Schlafende Geräte wecken: kurze Verbindungsversuche an die bekannten Adressen (Web, IPP, RAW-Druck, WSD) und Wake-on-LAN,
# wenn die Hardware-Adresse im ARP-Speicher steht. Viele Drucker/MFP antworten im Tiefschlaf nicht auf den WSD-Rundruf.
sub mac_of {
  my $ip = shift; return undef unless $ip =~ /^\d+\.\d+\.\d+\.\d+$/;
  my $o = $IS_MAC ? run_for(2, '/usr/sbin/arp', '-n', $ip) : (slurp('/proc/net/arp') // '');
  if (!$IS_MAC) { for (split /\n/, $o) { my @f = split ' '; return $f[3] if @f > 3 && $f[0] eq $ip && $f[3] =~ /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i && $f[3] ne '00:00:00:00:00:00'; } return undef; }
  my ($m) = $o =~ /\bat\s+([0-9a-f]{1,2}(?::[0-9a-f]{1,2}){5})\b/i; return undef unless $m;
  return join ':', map { sprintf '%02x', hex } split /:/, $m;
}
sub wake_host {
  my $h = shift; $h =~ s/^\[|\]$//g;
  for my $port (80, 443, 631, 9100, 5357, 8080) { my $s = IO::Socket::INET->new(PeerAddr => $h, PeerPort => $port, Proto => 'tcp', Timeout => 0.4); close $s if $s; }
  my $mac = mac_of($h) or return;
  my $pkt = ("\xFF" x 6) . (pack('H12', join '', split /:/, $mac) x 16);
  for my $to ('255.255.255.255', $h) { my $u = IO::Socket::INET->new(Proto => 'udp', PeerAddr => $to, PeerPort => 9, Broadcast => 1); if ($u) { $u->send($pkt); close $u; } }
}
sub wake_known {
  my %h;
  for my $d (@{ devices() }) { my $x = host_of($d->{base} // $d->{svc} // $d->{xaddr} // ''); $h{$x} = 1 if $x; }
  for (@{ added_ips() }) { my ($ip) = split /\|/; $h{$ip} = 1 if $ip; }
  delete @h{ '127.0.0.1', 'localhost', '' };
  my @l = sort keys %h; return 0 unless @l;
  my @kids; for my $x (@l) { my $k = fork(); if (defined $k && $k == 0) { eval { wake_host($x) }; POSIX::_exit(0); } push @kids, $k if $k; }
  waitpid($_, 0) for @kids;
  logl('Wecken: ' . scalar(@l) . ' Gerät(e) angesprochen (' . join(', ', @l) . ')');
  return scalar @l;
}
sub discover {
  my %dev; my @t;
  select(undef, undef, undef, 1.5) if !$ENV{PDFMY_WOKEN} && safe(sub { wake_known() });   # schlafende Geräte zuerst wecken (nicht doppelt nach /wake)
  # eSCL über Bonjour (macOS: dns-sd)
  if ($IS_MAC && -x '/usr/bin/dns-sd') {
    my %names;
    for my $type ('_uscan._tcp') {
      for (split /\n/, run_for(2.5, '/usr/bin/dns-sd', '-B', $type, 'local.')) { $names{$1} = $type if /\sAdd\s+\d+\s+\d+\s+\S+\s+\Q$type\E\.\s+(.+?)\s*$/; }
    }
    for my $inst (keys %names) {
      my $o = run_for(2, '/usr/bin/dns-sd', '-L', $inst, $names{$inst}, 'local.');
      my ($host, $port) = $o =~ /can be reached at\s+(\S+?)\.?:(\d+)/; next unless $host;
      my ($rs) = $o =~ /\brs=([^\s"\\]+)/; $rs //= 'eSCL';
      my $d = safe(sub { escl_probe("http://$host:$port/$rs") }); $dev{ $d->{id} } = $d if $d;
    }
  }
  my @diag; push @diag, 'Netz: ' . (join(', ', local_ipv4()) || 'keine IPv4-Adresse');
  push @diag, 'Bonjour: ' . scalar(keys %dev) if $IS_MAC;
  # eSCL über Avahi (Linux): -r auflösen, -p maschinenlesbar, -t nach dem ersten Durchlauf beenden
  push @diag, 'avahi-browse fehlt (Paket avahi-utils)' if !$IS_MAC && !which('avahi-browse');
  if (!$IS_MAC && (my $ab = which('avahi-browse'))) {
    my (%svc, %seen);
    for my $type ('_uscan._tcp', '_uscans._tcp') {
      for (split /\n/, run_for(5, $ab, '-rpt', $type)) {
        my @f = split /;/, $_, 10; next unless @f >= 9 && $f[0] eq '=';
        my ($if, $fam, $name, $addr, $port, $txt) = @f[1, 2, 3, 7, 8, 9]; $txt //= '';
        $addr .= "%$if" if $addr =~ /^fe80:/i && $if;   # link-lokal: Schnittstelle angeben
        my ($rs) = $txt =~ /"rs=([^"]*)"/; $rs = 'eSCL' unless defined $rs && length $rs;
        push @{ $svc{"$type|$name"} }, [$fam, (($type eq '_uscans._tcp' ? 'https' : 'http') . '://' . hosturl($addr) . ":$port/$rs")];
      }
    }
    # je Gerät: IPv4 zuerst, IPv6 nur als Rückfall; http vor https
    for my $k (sort keys %svc) {
      my ($name) = $k =~ /\|(.*)$/; next if $seen{$name};
      for my $u (map { $_->[1] } sort { ($a->[0] eq 'IPv4' ? 0 : 1) <=> ($b->[0] eq 'IPv4' ? 0 : 1) } @{ $svc{$k} }) { my $d = safe(sub { escl_probe($u) }); if ($d) { $dev{ $d->{id} } = $d; $seen{$name} = 1; last; } }
    }
  }
  push @diag, 'avahi: ' . scalar(keys %dev) if !$IS_MAC && which('avahi-browse');
  # WSD (Multicast)
  my @wm = @{ safe(sub { [wsd_discover(undef, 3)] }) || [] }; push @diag, 'WSD-Rundruf: ' . scalar(@wm) . ' Antwort(en)';
  for my $m (@wm) { my $d = safe(sub { wsd_probe($m) }); $dev{ $d->{id} } = $d if $d && !grep { lc $_->{name} eq lc $d->{name} && $_->{kind} eq 'escl' } values %dev; }
  # Netzsuche (wie pdfmy Scan für Windows): jede Adresse im eigenen Netz direkt fragen – findet Geräte, wenn Bonjour/avahi fehlen
  # oder eine Firewall die Antworten auf den Rundruf verwirft (unter Linux häufig: firewalld/ufw)
  my %known = map { host_of($_->{base} // $_->{svc} // $_->{xaddr} // '') => 1 } values %dev;
  my $open = safe(sub { subnet_hosts() }) || {}; my @hosts = grep { !$known{$_} } sort keys %$open; my @wsdHosts;
  for my $ip (@hosts) {
    my $d; for my $base (($open->{$ip}{80} ? "http://$ip/eSCL" : ()), ($open->{$ip}{443} ? "https://$ip/eSCL" : ())) { $d = safe(sub { escl_probe($base) }) and last; }
    if ($d) { $dev{ $d->{id} } = $d; } else { push @wsdHosts, $ip; }
  }
  my @wu = @wsdHosts ? @{ safe(sub { [wsd_discover(\@wsdHosts, 2)] }) || [] } : ();
  for my $m (@wu) { my $d = safe(sub { wsd_probe($m) }); $dev{ $d->{id} } = $d if $d && !grep { lc $_->{name} eq lc $d->{name} } values %dev; }
  push @diag, 'Netzsuche: ' . scalar(keys %$open) . ' Gerät(e) mit Web-/Druckerport' . (@hosts ? ' (' . join(', ', @hosts[0 .. ($#hosts > 11 ? 11 : $#hosts)]) . ')' : '') . ', WSD direkt: ' . scalar(@wu);
  # Von Hand hinzugefügte Geräte (IP-Adresse)
  for my $ip (@{ added_ips() }) { my $d = safe(sub { probe_ip($ip) }); $dev{ $d->{id} } = $d if $d; }
  # Linux: SANE für USB- und ältere Geräte (nur was nicht schon über eSCL/WSD gefunden wurde)
  if (!$IS_MAC) { for my $d (@{ safe(sub { [sane_discover([values %dev])] }) || [] }) { $dev{ $d->{id} } = $d; } }
  my @l = sort { ($a->{kind} cmp $b->{kind}) || ($a->{name} cmp $b->{name}) } values %dev;
  save_devices(\@l);
  logl('Suche: ' . scalar(@l) . ' Scanner – ' . join(', ', map { "$_->{name} ($_->{kind})" } @l) . ' · ' . join(' · ', @diag));
  return \@l;
}
sub probe_ip {
  my ($ip, $port) = split /\|/, shift;
  # Gerätename ohne Punkt (z. B. EPSON2CBBCB): Windows löst ihn selbst auf, Mac/Linux nur als Name.local (Bonjour)
  if ($ip =~ /^[A-Za-z][\w-]*$/ && !gethostbyname($ip)) { my $l = "$ip.local"; my $r = gethostbyname($l) ? $l : undef;
    if (!$r && (my $o = $IS_MAC ? run_for(2, '/usr/bin/dscacheutil', '-q', 'host', '-a', 'name', $l) : (which('avahi-resolve') ? run_for(3, which('avahi-resolve'), '-4', '-n', $l) : ''))) { ($r) = $o =~ /(\d{1,3}(?:\.\d{1,3}){3})/; }
    $ip = $r if $r; logl("Gerätename $l → " . ($r // 'nicht gefunden')); }
  my $h = hosturl($ip);
  for my $base ($port ? ("http://$h:$port/eSCL", "https://$h:$port/eSCL") : ("http://$h/eSCL", "https://$h/eSCL", "http://$h:8080/eSCL")) { my $d = escl_probe($base); return $d if $d; }
  for my $m (wsd_discover($ip, 2)) { my $d = wsd_probe($m); return $d if $d; }
  return undef;
}

# ---------------- Scanaufträge (laufen in eigenem Prozess, Zustand als Dateien) ----------------
sub job_state { my $id = shift; my $s = slurp("$DIR/jobs/$id/state.json"); return $s ? eval { $J->decode($s) } : undef; }
sub start_scan {
  my ($d, $r) = @_;
  my $lock = slurp("$DIR/busy"); return (409, { error => 'Es läuft bereits ein Scan.' }) if $lock && alive(trim($lock));
  for my $old (glob "$DIR/jobs/*") { remove_tree($old) if -M $old > 0.02; }   # älter als ca. 30 Minuten
  my $id = substr(join('', map { sprintf '%02x', int rand 256 } 1 .. 8), 0, 12);
  make_path("$DIR/jobs/$id");
  my $mime = $d->{kind} eq 'escl' && !$d->{jpeg} && $d->{pdf} ? 'application/pdf' : 'image/jpeg';   # SANE/WSD melden das Format je Seite
  spit("$DIR/jobs/$id/state.json", $J->encode({ state => 'running', pages => 0, mime => $mime }));
  my $pid = fork();
  return (500, { error => 'Scan konnte nicht gestartet werden.' }) unless defined $pid;
  if ($pid == 0) {
    spit("$DIR/busy", $$);
    my @trace; my $n = 0;
    my $page = sub { my ($data, $m) = @_; spit("$DIR/jobs/$id/$n.bin", $data); $n++; spit("$DIR/jobs/$id/state.json", $J->encode({ state => 'running', pages => $n, mime => $m || $mime })); $mime = $m || $mime; };
    my $ok = eval { $d->{kind} eq 'wsd' ? wsd_scan($d, $r, $page, \@trace) : $d->{kind} eq 'sane' ? sane_scan($d, $r, $page, \@trace) : escl_scan($d, $r, $page, \@trace) };
    my $err = $@ ? "$@" : '';
    my $trace = join ' | ', @trace;
    logl("Scan $d->{name}: $n Seite(n) · $trace" . ($err ? " · Fehler: $err" : ''));
    my %s = (state => 'done', pages => $n, mime => $mime, detail => $trace);
    if (!$n) { %s = (%s, state => 'error', error => $err || 'Der Scanner hat keine Seiten geliefert. Liegt Papier im Einzug oder auf dem Glas? Ist das Gerät gerade frei (kein Kopier- oder Druckauftrag)?'); }
    spit("$DIR/jobs/$id/state.json", $J->encode(\%s));
    unlink "$DIR/busy";
    POSIX::_exit(0);
  }
  return (200, { job => $id, device => $d->{name} });
}

# ---------------- PDFs per Doppelklick (Finder bzw. Dateimanager) in PDFMy öffnen ----------------
# Die App „PDFMy“ (vom Installer angelegt) schickt den Dateipfad an /open-local. Die Datei bekommt ein Einmal-Kennwort
# (5 Minuten gültig), der Browser öffnet pdfmy.de#open=<Kennwort> und holt sie über 127.0.0.1 ab. Die Datei verlässt den Rechner nicht.
# Linux: Der Dienst hat keinen Zugriff auf die Bildschirmsitzung – die Adresse geht an das Startskript zurück, das den Browser öffnet.
my $BUNDLE = 'de.pdfmy.open';
sub app_url { my $u = trim(slurp("$DIR/appurl.txt") // ''); return (grep { $u =~ /^\Q$_\E\// } @ALLOWED) ? $u : 'https://pdfmy.de/'; }
# Ist PDFMy in Chrome oder Edge als App installiert (macOS legt sie unter ~/Applications/… Apps.localized ab),
# öffnet die PDF direkt im App-Fenster – der Browser übergibt die Datei an PDFMy (launchQueue).
sub pwa_app {
  for my $d ('Chrome Apps.localized', 'Microsoft Edge Apps.localized', 'Edge Apps.localized', 'Chromium Apps.localized') { my $a = "$ENV{HOME}/Applications/$d/PDFMy.app"; return $a if -d $a; }
  return undef;
}
# Anhänge aus Outlook/Mail liegen im geschützten Ordner der jeweiligen App (~/Library/Containers/…, den Chrome nicht lesen darf)
# oder in Temp-Ordnern, die die App bald wieder leert. Sofort eine Kopie im eigenen Ordner anlegen
# (je Kopie ein Unterordner, der Dateiname bleibt; nach einem Tag entfernt).
sub volatile { my $p = shift; return $p =~ m{/Library/(?:Group )?Containers/|^(?:/private)?/var/folders/|^(?:/private)?/tmp/} || (length($ENV{TMPDIR} // '') && index($p, $ENV{TMPDIR}) == 0); }
sub secure_copy {
  my $path = shift; my $base = "$DIR/open-copies";
  return $path if !volatile($path) || index($path, "$base/") == 0;
  make_path($base); for my $old (glob "\"$base\"/*") { remove_tree($old) if -M $old > 1; }
  my $dir = "$base/" . int(time) . "-$$"; make_path($dir);
  my ($nm) = $path =~ m{([^/]+)$}; my $dst = "$dir/$nm";
  if (File::Copy::copy($path, $dst) && -s $dst) { logl("Kopie für PDFMy: $dst"); return $dst; }
  logl("Kopie nicht möglich: $path ($!)"); return $path;
}
# PDFMy (Browser-App) durfte eine übergebene Datei nicht lesen – z. B. weil die Chrome-App „PDFMy“ selbst Standard für PDFs ist und
# Outlook ihr den Pfad im geschützten Ordner gibt: frisch abgelegte Datei gleichen Namens in den Anhang-Ordnern suchen
# (eigene Kopien, Outlook, Apple Mail, Thunderbird, Temp) – nur PDF/Bilder, höchstens 30 Minuten alt.
sub find_recent {
  my $name = shift // ''; $name =~ s{.*/}{};
  return undef unless length $name && $name =~ /\.(?:pdf|jpe?g|png|tiff?|webp|bmp)$/i;
  my $nfc = sub { my $s = shift; utf8::decode($s); return Unicode::Normalize::NFC($s); };   # macOS legt Namen oft zerlegt (NFD) ab
  my $want = $nfc->($name); my $H = $ENV{HOME} // '';
  # Nur Ordner, in denen Mail-Programme Anhänge zum Öffnen ablegen – nicht das Postfach selbst (zu groß); [Ordner, Tiefe]
  my $O = "$H/Library/Containers/com.microsoft.Outlook/Data";
  my @roots = (["$DIR/open-copies", 2]);
  if ($IS_MAC) { push @roots, ["$O/tmp", 6], ["$O/Library/Caches", 6], ["$O/Downloads", 3], ["$H/Library/Containers/com.apple.mail/Data/Library/Mail Downloads", 3], ["$H/Library/Mail Downloads", 3], [$ENV{TMPDIR} // '', 4]; }
  else { push @roots, (map { [$_, 4] } glob('/tmp/mozilla_*')), ["$H/.cache/thunderbird", 4], [$ENV{TMPDIR} // '', 3], ['/tmp', 3]; }
  my $cut = time - 1800; my ($best, $bt); my %seen; my $stop = time + 8; my $n = 0;   # Zeitgrenze: höchstens 8 Sekunden suchen
  my $walk; $walk = sub {
    my ($d, $left) = @_; return if time > $stop || ++$n > 100000;
    opendir(my $dh, $d) or return; my @e = grep { $_ ne '.' && $_ ne '..' } readdir $dh; closedir $dh;
    for my $e (@e) {
      last if time > $stop;
      next if $left <= 0 && $nfc->($e) ne $want;   # unterste Ebene: nur der gesuchte Name zählt (spart Dateiabfragen)
      my $p = "$d/$e"; next if -l $p;
      if (-d _) { $walk->($p, $left - 1) if $left > 0; next; }
      next unless $nfc->($e) eq $want;
      my @s = stat $p; ($best, $bt) = ($p, $s[9]) if @s && $s[9] >= $cut && $s[7] > 0 && (!$bt || $s[9] > $bt);
    }
  };
  for my $r (grep { length $_->[0] && -d $_->[0] && !$seen{ $_->[0] }++ } @roots) { $walk->(@$r); last if $best; }   # Ordner nach Wahrscheinlichkeit: erster Treffer genügt
  logl("Anhang für PDFMy nachgereicht: $best") if $best;
  return $best;
}
sub open_local {
  my $path = shift;
  return 0 unless defined $path && -f $path && -r _;
  $path = secure_copy($path);
  if ($IS_MAC && -x '/usr/bin/open' && !$ENV{PDFMY_TEST_NOBROWSER} and my $app = pwa_app()) {
    if (system('/usr/bin/open', '-a', $app, $path) == 0) { logl("Öffnen in der PDFMy-App: $path"); return 'app'; }
  }
  make_path("$DIR/open");
  for my $old (glob "$DIR/open/*") { unlink $old if -M $old > 0.0035; }   # älter als 5 Minuten
  my $tok = join '', map { sprintf '%02x', int rand 256 } 1 .. 16;
  spit("$DIR/open/$tok", $path);
  my $url = app_url() . "#open=$tok";
  system('/usr/bin/open', $url) if $IS_MAC && -x '/usr/bin/open';
  logl("Öffnen: $path");
  return $url;
}
sub take_file {
  my $tok = shift; my $f = "$DIR/open/$tok";
  return (undef, 'Der Link ist abgelaufen – bitte die Datei noch einmal doppelt anklicken.') unless $tok =~ /^[0-9a-f]{32}$/ && -f $f && -M $f <= 0.0035;
  my $path = slurp($f); unlink $f;
  utf8::decode($path);
  my $data = slurp($path); return (undef, 'Die Datei ist nicht mehr vorhanden.') unless defined $data;
  my ($name) = $path =~ m{([^/]+)$};
  return ($data, $name);
}
# Ist PDFMy das Standardprogramm für PDFs? (macOS LaunchServices, über JavaScript for Automation; 60 Sekunden zwischengespeichert)
# Linux: Freedesktop-Standard ~/.config/mimeapps.list, Abschnitt [Default Applications] (gilt für GNOME, KDE, Xfce, Cinnamon …)
my $DESKTOP = 'pdfmy.desktop';
sub mimeapps { return ($ENV{XDG_CONFIG_HOME} || "$ENV{HOME}/.config") . '/mimeapps.list'; }
sub linux_default {
  my $f = slurp(mimeapps()) // ''; my $sec = '';
  for (split /\n/, $f) { if (/^\s*\[(.+)\]/) { $sec = $1; next; } return (trim((split /;/, $1)[0] // '') eq $DESKTOP ? 1 : 0) if $sec eq 'Default Applications' && /^\s*application\/pdf\s*=\s*(.*)$/; }
  return 0;
}
sub linux_set_default {
  my $p = mimeapps(); my @l = split /\n/, (slurp($p) // ''); my ($sec, $done, @out) = ('', 0);
  for (@l) {
    if (/^\s*\[(.+)\]/) { push @out, "application/pdf=$DESKTOP;" if $sec eq 'Default Applications' && !$done++; $sec = $1; push @out, $_; next; }
    if ($sec eq 'Default Applications' && /^\s*application\/pdf\s*=/) { push @out, "application/pdf=$DESKTOP;" unless $done++; next; }
    push @out, $_;
  }
  push @out, "application/pdf=$DESKTOP;" if $sec eq 'Default Applications' && !$done++;
  push @out, (@out ? '' : ()), '[Default Applications]', "application/pdf=$DESKTOP;" unless $done;
  make_path(($p =~ m{^(.*)/[^/]+$})[0]); spit($p, join("\n", @out) . "\n");
  return linux_default();
}
sub pdf_default {
  my $c = "$DIR/pdfdefault.txt";
  return trim(slurp($c)) eq '1' if -f $c && -M $c < 0.0007;
  if (!$IS_MAC) { my $is = linux_default(); spit($c, $is); return $is; }
  return 0 unless -x '/usr/bin/osascript';
  my $o = run_for(3, '/usr/bin/osascript', '-l', 'JavaScript', '-e', 'ObjC.import("CoreServices"); ObjC.unwrap($.LSCopyDefaultRoleHandlerForContentType($("com.adobe.pdf"), 0xFFFFFFFF)) || ""');
  my $is = lc(trim($o)) eq $BUNDLE ? 1 : 0; spit($c, $is); return $is;
}
sub set_pdf_default {
  if (!$IS_MAC) { my $ok = linux_set_default(); spit("$DIR/pdfdefault.txt", $ok); logl('Standard für PDFs setzen (mimeapps.list): ' . ($ok ? 'ok' : 'fehlgeschlagen')); return $ok; }
  return 0 unless -x '/usr/bin/osascript';
  my $o = run_for(5, '/usr/bin/osascript', '-l', 'JavaScript', '-e', qq{ObjC.import("CoreServices"); \$.LSSetDefaultRoleHandlerForContentType(\$("com.adobe.pdf"), 0xFFFFFFFF, \$("$BUNDLE"))});
  unlink "$DIR/pdfdefault.txt";
  logl('Standard für PDFs setzen: ' . trim($o));
  return pdf_default();
}

# ---------------- HTTP-Server (nur 127.0.0.1) ----------------
sub send_resp {
  my ($c, $code, $type, $data, $extra) = @_;
  my %txt = (200 => 'OK', 204 => 'No Content', 403 => 'Forbidden', 404 => 'Not Found', 409 => 'Conflict');
  my $h = "HTTP/1.1 $code " . ($txt{$code} || 'Error') . "\r\n";
  $h .= "Content-Type: $type\r\n" if $type;
  $h .= 'Content-Length: ' . length($data) . "\r\nCache-Control: no-store\r\nConnection: close\r\n";
  $h .= "$_: $extra->{$_}\r\n" for sort keys %{ $extra || {} };
  print $c $h, "\r\n", $data;
}
sub send_json { my ($c, $code, $o, $extra) = @_; send_resp($c, $code, 'application/json; charset=utf-8', $J->encode($o), $extra); }

our %CORS_NOW;
sub handle {
  my $c = shift; binmode $c;
  local $SIG{ALRM} = sub { die "timeout\n" }; alarm 15;
  my $head = '';
  while ($head !~ /\r\n\r\n/) { my $n = sysread($c, my $b, 4096); last unless $n; $head .= $b; return if length $head > 32768; }
  my ($hdrs, $rest) = split /\r\n\r\n/, $head, 2; $rest //= '';
  my ($line, @hl) = split /\r\n/, $hdrs; my ($method, $path) = split / /, $line // '';
  return unless $method;
  my %h; for (@hl) { $h{ lc $1 } = $2 if /^([^:]+):\s*(.*)$/; }
  my $len = $h{'content-length'} || 0; return if $len > 1_000_000;
  my $body = $rest; while (length $body < $len) { my $n = sysread($c, my $b, $len - length $body); last unless $n; $body .= $b; }
  alarm 0;
  my $origin = $h{origin};
  my $ok = !defined $origin || grep { lc $_ eq lc $origin } @ALLOWED;
  my %cors; if (defined $origin && $ok) { %cors = ('Access-Control-Allow-Origin' => $origin, 'Vary' => 'Origin'); }
  %CORS_NOW = %cors;
  if ($method eq 'OPTIONS') {
    return send_resp($c, 403, 'text/plain', 'forbidden') unless $ok;
    return send_resp($c, 204, undef, '', { %cors, 'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers' => 'Content-Type, X-Pdfmy', 'Access-Control-Allow-Private-Network' => 'true', 'Access-Control-Max-Age' => '600' });
  }
  my ($p) = split /\?/, $path;
  # Doppelklick im Finder: nur vom eigenen Mac (ohne Origin, also nicht aus einer Webseite)
  if ($p eq '/open-local' && $method eq 'POST' && !defined $origin) {
    my $path = $body =~ /^\s*\{/ ? (eval { $J->decode($body)->{path} } // '') : $body; $path =~ s/[\r\n]+$//;
    my $url = open_local($path);
    return send_json($c, $url ? 200 : 404, $url ? { ok => JSON::PP::true, url => $url } : { error => 'Datei nicht gefunden' });
  }
  # Schutz: nur PDFMy (Origin) und nur mit eigenem Kopf – fremde Seiten können nichts auslösen oder lesen
  return send_resp($c, 403, 'text/plain', 'forbidden', \%cors) if !$ok || ($p ne '/status' && !exists $h{'x-pdfmy'});
  my $in = sub { my $o = eval { $J->decode($body) }; return ref $o eq 'HASH' ? $o : {}; };

  if ($p eq '/status') {
    # PDFMy meldet seine Adresse (pdfmy.de oder Testversion): dorthin öffnet ein Doppelklick die PDF
    if ($path =~ /[?&]app=([^&]+)/) { my $u = $1; $u =~ s/%([0-9A-Fa-f]{2})/chr hex $1/ge; spit("$DIR/appurl.txt", $u) if grep { $u =~ /^\Q$_\E\// } @ALLOWED; }
    my $l = devices();
    # /status muss sofort antworten: Standard-PDF-Programm nur aus dem Zwischenspeicher, Auffrischen im Hintergrund
    my $cf = "$DIR/pdfdefault.txt"; my $def = -f $cf && trim(slurp($cf)) eq '1';
    if (!-f $cf || -M $cf >= 0.0007) { my $k = fork(); if (defined $k && $k == 0) { pdf_default(); POSIX::_exit(0); } }
    return send_json($c, 200, { app => 'pdfmy-scan', version => $VERSION, platform => lc $OS, searching => JSON::PP::false, devices => scalar(@$l), pdfDefault => $def ? JSON::PP::true : JSON::PP::false }, \%cors);
  }
  if ($p =~ m{^/file/(\w+)$} && $method eq 'GET') {
    my ($data, $name) = take_file($1);
    return send_json($c, 404, { error => $name }, \%cors) unless defined $data;
    my $enc = $name; utf8::encode($enc); $enc =~ s/([^A-Za-z0-9._~-])/sprintf '%%%02X', ord $1/ge;
    return send_resp($c, 200, 'application/pdf', $data, { %cors, 'Access-Control-Expose-Headers' => 'X-Pdfmy-Name', 'X-Pdfmy-Name' => $enc });
  }
  if ($p eq '/attachment' && $method eq 'GET') {   # PDFMy durfte eine übergebene Datei nicht lesen (z. B. Outlook-Anhang): hier nachreichen
    my ($q) = $path =~ /[?&]name=([^&]*)/; $q //= ''; $q =~ s/\+/ /g; $q =~ s/%([0-9A-Fa-f]{2})/chr hex $1/ge;
    my $f = safe(sub { find_recent($q) });
    return send_json($c, 404, { error => 'Datei nicht gefunden' }, \%cors) unless $f;
    return send_json($c, 413, { error => 'Die Datei ist zu groß (über 300 MB).' }, \%cors) if -s $f > 300 * 1024 * 1024;
    my ($name) = $f =~ m{([^/]+)$}; my $enc = $name; $enc =~ s/([^A-Za-z0-9._~-])/sprintf '%%%02X', ord $1/ge;
    return send_resp($c, 200, 'application/octet-stream', slurp($f), { %cors, 'Access-Control-Expose-Headers' => 'X-Pdfmy-Name', 'X-Pdfmy-Name' => $enc });
  }
  if ($p eq '/defaultapps' && $method eq 'POST') { my $ok = set_pdf_default(); return send_json($c, 200, { ok => JSON::PP::true, registered => $ok ? JSON::PP::true : JSON::PP::false, isDefault => $ok ? JSON::PP::true : JSON::PP::false }, \%cors); }
  if ($p eq '/wake' && $method eq 'POST') {   # „Scanner aufwecken“: wecken, kurz warten, neu suchen
    my $n = safe(sub { wake_known() }) || 0; sleep 3 if $n;
    my $l = eval { local $ENV{PDFMY_WOKEN} = 1; discover() } || devices();
    return send_json($c, 200, { woken => $n, devices => scalar(@$l) }, \%cors);
  }
  if ($p eq '/scanners' && $method eq 'GET') {
    my $l = devices(); my $err;
    if ($path =~ /refresh=1/ || !@$l) { my $n = eval { discover() }; if ($n) { $l = $n; } else { ($err = "$@") =~ s/\s+$//; logl("Suche fehlgeschlagen: $err"); } }
    return send_json($c, 200, { searching => JSON::PP::false, ($err ? (error => "Die Scannersuche ist abgebrochen: $err") : ()), scanners => [map { { id => $_->{id}, name => $_->{name}, kind => $_->{kind}, feeder => $_->{feeder} ? JSON::PP::true : JSON::PP::false, duplex => $_->{duplex} ? JSON::PP::true : JSON::PP::false, platen => $_->{platen} ? JSON::PP::true : JSON::PP::false } } @$l] }, \%cors);
  }
  if ($p eq '/scanners/add' && $method eq 'POST') {
    # IPv4, IPv6 (auch [fe80::1%eth0]) oder Gerätename (z. B. EPSON2CBBCB oder EPSON2CBBCB.local)
    my $ip = trim($in->()->{ip} // ''); $ip =~ s{^\w+://}{}; $ip =~ s{^(\[[^\]]+\][^/]*|[^/]+)/.*$}{$1};
    my $port;
    if ($ip =~ /^\[([^\]]+)\](?::(\d+))?$/) { ($ip, $port) = ($1, $2); }   # [IPv6] oder [IPv6]:Port
    elsif ($ip =~ /^([^:]+):(\d+)$/) { ($ip, $port) = ($1, $2); }        # IPv4/Name:Port
    return send_json($c, 404, { error => 'Bitte eine gültige IP-Adresse oder einen Gerätenamen angeben.' }, \%cors) unless $ip =~ /^[\w.\-]+$/ || $ip =~ /^[0-9a-f:.]+(?:%[\w.\-]+)?$/i;
    $ip .= "|$port" if $port;
    my $d = probe_ip($ip);
    return send_json($c, 404, { error => 'Unter dieser Adresse antwortet kein Scanner (eSCL oder WSD). Bitte am Gerät „AirPrint/eSCL/Mopria“ oder „WSD-Scan“ aktivieren.' . ($IS_MAC ? '' : ' Für USB-Scanner unter Linux: SANE installieren (z. B. sudo apt install sane-utils sane-airscan ipp-usb).') }, \%cors) unless $d;
    my $a = added_ips(); push @$a, $ip unless grep { $_ eq $ip } @$a; spit("$DIR/added.json", $J->encode($a));
    my $l = [grep { $_->{id} ne $d->{id} } @{ devices() }]; push @$l, $d; save_devices($l);
    logl("Hinzugefügt: $ip → $d->{name} ($d->{kind})");
    return send_json($c, 200, { id => $d->{id}, name => $d->{name}, kind => $d->{kind}, feeder => $d->{feeder} ? JSON::PP::true : JSON::PP::false, duplex => $d->{duplex} ? JSON::PP::true : JSON::PP::false }, \%cors);
  }
  if ($p eq '/scan' && $method eq 'POST') {
    my $r = $in->(); my $d = find_dev($r->{id} // '');
    return send_json($c, 404, { error => 'Kein Scanner gefunden.' }, \%cors) unless $d;
    my ($code, $o) = start_scan($d, { source => $r->{source} || 'auto', duplex => $r->{duplex} ? 1 : 0, color => $r->{color} || 'gray', dpi => $r->{dpi} || 300 });
    return send_json($c, $code, $o, \%cors);
  }
  if ($p =~ m{^/scan/([0-9a-f]{6,16})(?:/page/(\d+))?$}) {
    my ($id, $idx) = ($1, $2); my $s = job_state($id);
    return send_json($c, 404, { error => 'Unbekannter Scanauftrag.' }, \%cors) unless $s;
    return send_json($c, 200, { state => $s->{state}, pages => $s->{pages} + 0, error => $s->{error}, mime => $s->{mime}, detail => $s->{detail}, note => '' }, \%cors) unless defined $idx;
    my $data = slurp("$DIR/jobs/$id/$idx.bin");
    return send_json($c, 404, { error => 'Seite nicht vorhanden.' }, \%cors) unless defined $data;
    return send_resp($c, 200, $s->{mime} || 'image/jpeg', $data, \%cors);
  }
  if ($p eq '/log') { my @z = split /\n/, decode('UTF-8', slurp("$DIR/log.txt") // ''); return send_json($c, 200, { version => $VERSION, lines => [@z[($#z > 39 ? $#z - 39 : 0) .. $#z]] }, \%cors); }
  if ($p eq '/certs') { return send_json($c, 200, { certs => [] }, \%cors); }
  return send_json($c, 404, { error => 'Nicht gefunden' }, \%cors);
}

my $srv = IO::Socket::INET->new(LocalAddr => '127.0.0.1', LocalPort => $PORT, Proto => 'tcp', Listen => 20, ReuseAddr => 1)
  or do { logl("Start nicht möglich (Port $PORT belegt?): $!"); die "pdfmy Scan: Port $PORT belegt\n"; };
logl("pdfmy Scan für $OS $VERSION gestartet (Port $PORT)");
while (1) {
  my $c = $srv->accept or next;
  my $pid = fork();
  if (!defined $pid) { eval { handle($c) }; close $c; next; }
  if ($pid == 0) {
    close $srv; eval { handle($c) };
    # Unerwarteter Fehler: verständliche Antwort statt abgebrochener Verbindung (Browser: „Failed to fetch“)
    if ($@ && $@ ne "timeout\n") { (my $e = "$@") =~ s/\s+$//; logl("HTTP: $e"); eval { send_json($c, 500, { error => "pdfmy Scan: interner Fehler – $e" }, \%CORS_NOW) }; }
    close $c; POSIX::_exit(0);
  }
  close $c;
}
