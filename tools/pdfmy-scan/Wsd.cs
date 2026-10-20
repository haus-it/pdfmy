// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: AGPL-3.0-or-later
// pdfmy Scan – WSD-Scan (Web Services for Devices) ohne Treiber, wie pdfmy Scan für Mac/Linux.
// Viele Epson-, Dell-, Brother- und Kyocera-Geräte scannen im Netzwerk über WSD statt (oder zusätzlich zu) eSCL.
// Ablauf: WS-Discovery (UDP 3702, Multicast über jede Netzwerkkarte oder direkt an eine IP) → Gerätebeschreibung (WS-Transfer Get)
// → Scan-Dienst → GetScannerElements → CreateScanJob → RetrieveImage (MTOM/XOP, das Bild ist der Binärteil).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace PdfmyScan
{
    static class Net
    {
        // Alle aktiven IPv4-Adressen dieses PCs (ohne Loopback) – Multicast muss über jede Netzwerkkarte einzeln raus,
        // sonst geht er bei VPN, Hyper-V oder WLAN+LAN oft über die falsche Karte
        public static List<IPAddress> LocalIPv4()
        {
            var l = new List<IPAddress>();
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                        if (ua.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ua.Address)) l.Add(ua.Address);
                }
            }
            catch { }
            return l;
        }
        public static string Describe()
        {
            try
            {
                return string.Join("; ", NetworkInterface.GetAllNetworkInterfaces()
                    .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    .Select(n => n.Name + " " + string.Join(",", n.GetIPProperties().UnicastAddresses.Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork).Select(a => a.Address + "/" + a.PrefixLength))));
            }
            catch { return "?"; }
        }
        // UDP-Anfrage per Multicast über jede Netzwerkkarte (oder direkt an Ziele) senden und Antworten sammeln
        public static List<KeyValuePair<IPEndPoint, byte[]>> Ask(IEnumerable<byte[]> queries, IPAddress group, int port, IEnumerable<IPAddress> direct, int waitMs)
        {
            var socks = new List<UdpClient>(); var replies = new List<KeyValuePair<IPEndPoint, byte[]>>();
            try
            {
                if (direct == null)
                {
                    foreach (var local in LocalIPv4())
                    {
                        try
                        {
                            var u = new UdpClient(new IPEndPoint(local, 0));
                            u.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastInterface, local.GetAddressBytes());
                            u.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastTimeToLive, 4);
                            for (int i = 0; i < 2; i++) foreach (var query in queries) u.Send(query, query.Length, new IPEndPoint(group, port));
                            socks.Add(u);
                        }
                        catch { }
                    }
                }
                else
                {
                    var u = new UdpClient(new IPEndPoint(IPAddress.Any, 0));
                    foreach (var t in direct.Where(a => a.AddressFamily == AddressFamily.InterNetwork)) for (int i = 0; i < 2; i++) foreach (var query in queries) try { u.Send(query, query.Length, new IPEndPoint(t, port)); } catch { }
                    socks.Add(u);
                }
                var until = DateTime.UtcNow.AddMilliseconds(waitMs);
                while (DateTime.UtcNow < until)
                {
                    bool any = false;
                    foreach (var u in socks)
                    {
                        try
                        {
                            while (u.Available > 0) { var ep = new IPEndPoint(IPAddress.Any, 0); var b = u.Receive(ref ep); replies.Add(new KeyValuePair<IPEndPoint, byte[]>(ep, b)); any = true; }
                        }
                        catch { }
                    }
                    if (!any) Thread.Sleep(30);
                }
            }
            finally { foreach (var u in socks) try { u.Close(); } catch { } }
            return replies;
        }
    }

    class WsdDevice : ScanDevice
    {
        const string NS = "xmlns:soap=\"http://www.w3.org/2003/05/soap-envelope\" xmlns:wsa=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\" xmlns:wsd=\"http://schemas.xmlsoap.org/ws/2005/04/discovery\" xmlns:sca=\"http://schemas.microsoft.com/windows/2006/08/wdp/scan\" xmlns:wscn=\"http://schemas.microsoft.com/windows/2006/08/wdp/scan\"";
        const string SCA = "http://schemas.microsoft.com/windows/2006/08/wdp/scan";
        public static int Port = int.TryParse(Environment.GetEnvironmentVariable("PDFMY_WSD_PORT"), out var p) ? p : 3702;   // nur für Tests änderbar
        public string Svc; public bool Platen; public string LastMime = "image/jpeg";
        public List<string> Formats = new List<string>(), Modes = new List<string>(); public List<int> Resolutions = new List<int>();
        static readonly HttpClient http = new HttpClient { Timeout = TimeSpan.FromSeconds(200) };

        static string Esc(string s) => System.Security.SecurityElement.Escape(s ?? "");
        static string Tag(string x, string t) { var m = Regex.Match(x ?? "", @"<(?:[\w-]+:)?" + t + @"\b[^>]*>\s*([^<]*?)\s*<", RegexOptions.Singleline); return m.Success ? m.Groups[1].Value : null; }
        static string Uuid() => "urn:uuid:" + Guid.NewGuid();
        static bool IsFault(string x) => (x ?? "").Contains("addressing/fault") || Regex.IsMatch(x ?? "", @"<(?:[\w-]+:)?Fault\b");
        static string Soap(string to, string action, string body) =>
            $"<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope {NS}><soap:Header><wsa:To>{Esc(to)}</wsa:To><wsa:Action>{action}</wsa:Action><wsa:MessageID>{Uuid()}</wsa:MessageID><wsa:ReplyTo><wsa:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo></soap:Header><soap:Body>{body}</soap:Body></soap:Envelope>";

        class Reply { public int Code; public HttpResponseMessage Res; public byte[] Data = new byte[0]; public string Text = ""; }
        static Reply Call(string url, string to, string action, string body, int timeoutMs)
        {
            using (var cts = new CancellationTokenSource(timeoutMs))
            {
                try
                {
                    var c = new ByteArrayContent(Encoding.UTF8.GetBytes(Soap(to, action, body)));
                    c.Headers.ContentType = System.Net.Http.Headers.MediaTypeHeaderValue.Parse("application/soap+xml; charset=utf-8");
                    var res = http.PostAsync(url, c, cts.Token).Result;
                    var data = res.Content.ReadAsByteArrayAsync().Result;
                    return new Reply { Code = (int)res.StatusCode, Res = res, Data = data, Text = Encoding.UTF8.GetString(data) };
                }
                catch { return new Reply(); }
            }
        }

        // WS-Discovery: (Endpunkt, Geräteadresse) – Multicast über alle Netzwerkkarten oder direkt an die angegebenen Adressen
        public static List<KeyValuePair<string, string>> Discover(IEnumerable<IPAddress> direct, int waitMs)
        {
            string probe = $"<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope {NS}><soap:Header><wsa:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To><wsa:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action><wsa:MessageID>{Uuid()}</wsa:MessageID></soap:Header><soap:Body><wsd:Probe><wsd:Types>wscn:ScanDeviceType</wsd:Types></wsd:Probe></soap:Body></soap:Envelope>";
            var found = new Dictionary<string, string>();
            foreach (var r in Net.Ask(new[] { Encoding.UTF8.GetBytes(probe) }, IPAddress.Parse("239.255.255.250"), Port, direct, waitMs))
            {
                string x = Encoding.UTF8.GetString(r.Value);
                if (!x.Contains("ProbeMatch")) continue;
                string epr = (Tag(x, "Address") ?? "").Trim();
                var xs = (Tag(x, "XAddrs") ?? "").Split(new[] { ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Where(a => a.StartsWith("http://")).ToList();
                var u = xs.FirstOrDefault(a => !a.Contains("[")) ?? xs.FirstOrDefault();   // IPv4 bevorzugen
                if (u != null && !found.ContainsKey(epr)) found[epr] = u;
            }
            return found.ToList();
        }

        // Gerätebeschreibung holen, Scan-Dienst und Fähigkeiten bestimmen
        public static WsdDevice Probe(string epr, string xaddr)
        {
            var r = Call(xaddr, string.IsNullOrEmpty(epr) ? xaddr : epr, "http://schemas.xmlsoap.org/ws/2004/09/transfer/Get", "", 6000);
            if (r.Code != 200) return null;
            string svc = null;
            foreach (Match h in Regex.Matches(r.Text, @"<(?:[\w-]+:)?Hosted>(.*?)</(?:[\w-]+:)?Hosted>", RegexOptions.Singleline))
            {
                if (!h.Groups[1].Value.Contains("ScannerServiceType")) continue;
                var addrs = Regex.Matches(h.Groups[1].Value, @"<(?:[\w-]+:)?Address>([^<]+)<").Cast<Match>().Select(m => m.Groups[1].Value.Trim()).Where(a => a.StartsWith("http")).ToList();
                svc = addrs.FirstOrDefault(a => !a.Contains("[")) ?? addrs.FirstOrDefault();
                if (svc != null) break;
            }
            if (svc == null) return null;
            string name = string.Join(" ", new[] { Tag(r.Text, "Manufacturer"), Tag(r.Text, "ModelName") }.Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
            if (name.Length < 3) name = (Tag(r.Text, "FriendlyName") ?? "").Trim();
            var d = new WsdDevice { Kind = "wsd", Svc = svc, Id = "wsd:" + svc, Name = name.Length > 0 ? name : "Scanner " + new Uri(svc).Host };
            var e = Call(svc, svc, SCA + "/GetScannerElements",
                "<sca:GetScannerElementsRequest><sca:RequestedElements><sca:Name>sca:ScannerDescription</sca:Name><sca:Name>sca:ScannerConfiguration</sca:Name></sca:RequestedElements></sca:GetScannerElementsRequest>", 8000);
            if (e.Code == 200)
            {
                string x = e.Text;
                if (name.Length == 0 && Tag(x, "ScannerName") != null) d.Name = Tag(x, "ScannerName").Trim();
                d.Feeder = Regex.IsMatch(x, @"<(?:[\w-]+:)?ADF\b");
                d.Duplex = Regex.IsMatch(x, @"<(?:[\w-]+:)?ADFSupportsDuplex>\s*(true|1)\s*<", RegexOptions.IgnoreCase) || Regex.IsMatch(x, @"<(?:[\w-]+:)?ADFBack\b");
                d.Platen = Regex.IsMatch(x, @"<(?:[\w-]+:)?Platen\b");
                d.Formats = Regex.Matches(x, @"<(?:[\w-]+:)?FormatValue>([^<]+)<").Cast<Match>().Select(m => m.Groups[1].Value.Trim()).Distinct().ToList();
                d.Modes = Regex.Matches(x, @"<(?:[\w-]+:)?ColorEntry>([^<]+)<").Cast<Match>().Select(m => m.Groups[1].Value.Trim()).Distinct().ToList();
                foreach (Match rb in Regex.Matches(x, @"<(?:[\w-]+:)?(?:Platen|ADF|ADFFront)Resolutions>(.*?)</(?:[\w-]+:)?(?:Platen|ADF|ADFFront)Resolutions>", RegexOptions.Singleline))
                    foreach (Match w in Regex.Matches(rb.Groups[1].Value, @"<(?:[\w-]+:)?Width>\s*(\d+)\s*<"))
                        if (int.TryParse(w.Groups[1].Value, out int v) && v >= 75 && v <= 1200 && !d.Resolutions.Contains(v)) d.Resolutions.Add(v);
            }
            if (!d.Feeder && !d.Platen) d.Platen = true;
            return d;
        }

        int PickDpi(int want) => Resolutions.Count == 0 ? want : Resolutions.OrderBy(r => Math.Abs(r - want)).ThenByDescending(r => r).First();
        string PickMode(string color)
        {
            string want = color == "color" ? "RGB24" : color == "bw" ? "BlackAndWhite1" : "Grayscale8";
            if (Modes.Count == 0 || Modes.Contains(want)) return want;
            foreach (var alt in new[] { "Grayscale8", "RGB24", "BlackAndWhite1" }) if (Modes.Contains(alt)) return alt;
            return Modes[0];
        }
        static string Ticket(string src, string fmt, string mode, int dpi, bool back, bool simple, bool ricoh = false)
        {
            string side = $"<sca:ColorProcessing>{mode}</sca:ColorProcessing><sca:Resolution><sca:Width>{dpi}</sca:Width><sca:Height>{dpi}</sca:Height></sca:Resolution>";
            var t = new StringBuilder("<sca:CreateScanJobRequest><sca:ScanTicket><sca:JobDescription><sca:JobName>PDFMy</sca:JobName><sca:JobOriginatingUserName>PDFMy</sca:JobOriginatingUserName><sca:JobInformation>PDFMy</sca:JobInformation></sca:JobDescription><sca:DocumentParameters>");
            t.Append($"<sca:Format>{fmt}</sca:Format>");
            if (!simple) t.Append($"<sca:ImagesToTransfer>{(src == "Platen" ? 1 : ricoh ? 100 : 0)}</sca:ImagesToTransfer>");   // RICOH Aficio MP 201 versteht 0 nicht
            t.Append($"<sca:InputSource>{src}</sca:InputSource>");
            if (!simple) t.Append("<sca:InputSize><sca:InputMediaSize><sca:Width>8268</sca:Width><sca:Height>11693</sca:Height></sca:InputMediaSize></sca:InputSize>");   // A4 in 1/1000 Zoll
            t.Append($"<sca:MediaSides><sca:MediaFront>{side}</sca:MediaFront>{(back ? $"<sca:MediaBack>{side}</sca:MediaBack>" : "")}</sca:MediaSides>");
            return t.Append("</sca:DocumentParameters></sca:ScanTicket></sca:CreateScanJobRequest>").ToString();
        }
        // Mehrteilige Antwort (MTOM/XOP) zerlegen: das Bild ist der größte Nicht-XML-Teil
        static byte[] Image(Reply r)
        {
            var ct = r.Res?.Content.Headers.ContentType;
            var bd = ct?.Parameters.FirstOrDefault(x => x.Name.Equals("boundary", StringComparison.OrdinalIgnoreCase))?.Value?.Trim('"');
            if (!string.IsNullOrEmpty(bd))
            {
                var sep = Encoding.ASCII.GetBytes("--" + bd); var idx = new List<int>();
                for (int i = 0; i + sep.Length <= r.Data.Length; i++)
                {
                    int k = 0; while (k < sep.Length && r.Data[i + k] == sep[k]) k++;
                    if (k == sep.Length) { idx.Add(i); i += sep.Length - 1; }
                }
                byte[] best = null;
                for (int j = 0; j + 1 < idx.Count; j++)
                {
                    int s = idx[j] + sep.Length, e = idx[j + 1];
                    int he = -1; for (int i = s; i + 3 < e; i++) if (r.Data[i] == 13 && r.Data[i + 1] == 10 && r.Data[i + 2] == 13 && r.Data[i + 3] == 10) { he = i; break; }
                    if (he < 0) continue;
                    string head = Encoding.ASCII.GetString(r.Data, s, he - s);
                    if (Regex.IsMatch(head, @"application/(?:soap\+)?xop\+xml|text/xml|application/soap\+xml", RegexOptions.IgnoreCase)) continue;
                    int bs = he + 4, be = e; if (be - 2 >= bs && r.Data[be - 2] == 13 && r.Data[be - 1] == 10) be -= 2;
                    if (best == null || be - bs > best.Length) { best = new byte[be - bs]; Buffer.BlockCopy(r.Data, bs, best, 0, be - bs); }
                }
                return best;
            }
            var m = Regex.Match(r.Text, @"<(?:[\w-]+:)?ScanData>\s*([A-Za-z0-9+/=\s]{200,})\s*<");   // eingebettet statt Anhang
            return m.Success ? Convert.FromBase64String(Regex.Replace(m.Groups[1].Value, @"\s", "")) : null;
        }

        public override List<byte[]> Scan(ScanRequest r, Action<byte[]> onPage, CancellationToken ct)
        {
            var trace = new List<string>(); var pages = new List<byte[]>(); bool notAccepting = false;
            var sources = r.source == "platen" ? new List<string> { "Platen" } : r.source == "feeder" ? new List<string> { "ADF" } : new List<string>();
            if (sources.Count == 0) { if (Feeder) sources.Add("ADF"); if (Platen) sources.Add("Platen"); }
            if (sources.Count == 0) sources.Add("Platen");
            string fmt = new[] { "jfif", "exif" }.FirstOrDefault(Formats.Contains) ?? Formats.FirstOrDefault(f => f.Contains("pdf")) ?? (Formats.Contains("png") ? "png" : "jfif");
            LastMime = fmt.Contains("pdf") ? "application/pdf" : fmt == "png" ? "image/png" : "image/jpeg";
            string mode = PickMode(r.color); int dpi = PickDpi(r.dpi);
            foreach (var src0 in sources)
            {
                string src = src0 == "ADF" && r.duplex && Duplex ? "ADFDuplex" : src0, id = null, tok = null;
                for (int simple = 0; simple < 2 && id == null; simple++)
                    for (int attempt = 0; attempt < 3; attempt++)
                    {
                        var c = Call(Svc, Svc, SCA + "/CreateScanJob", Ticket(src, fmt, mode, dpi, src == "ADFDuplex", simple == 1, Name == "RICOH Aficio MP 201"), 20000);
                        string fault = (Tag(c.Text, "Subcode") != null ? Tag(c.Text, "Value") : null) ?? Tag(c.Text, "Value") ?? "";
                        trace.Add($"{src} {fmt} {(simple == 1 ? "einfach" : "voll")} {dpi}dpi {mode} → {c.Code}" + (c.Code == 200 ? "" : " " + Regex.Match(c.Text, @"(?:ClientError|ServerError)\w*").Value));
                        // Lexmark/Xerox melden Fehler auch mit HTTP 200 – nur mit Auftragsnummer und ohne Fault ist es ein Erfolg
                        var jid = (Tag(c.Text, "JobId") ?? "").Trim();
                        if (c.Code == 200 && jid.Length > 0 && !IsFault(c.Text)) { id = jid; tok = (Tag(c.Text, "JobToken") ?? "").Trim(); break; }
                        if (Regex.IsMatch(c.Text, "NotAcceptingJobs", RegexOptions.IgnoreCase)) notAccepting = true;
                        if (!Regex.IsMatch(c.Text, "Busy|NotAccepting|ServerErrorTemporary|Calibrating|LampWarming", RegexOptions.IgnoreCase)) break;
                        Thread.Sleep(2000);
                    }
                if (id == null) continue;
                int busy = 0, n0 = pages.Count;
                while (!ct.IsCancellationRequested)
                {
                    var g = Call(Svc, Svc, SCA + "/RetrieveImage", $"<sca:RetrieveImageRequest><sca:JobId>{Esc(id)}</sca:JobId><sca:JobToken>{Esc(tok)}</sca:JobToken><sca:DocumentDescription><sca:DocumentName>PDFMy-{pages.Count + 1}</sca:DocumentName></sca:DocumentDescription></sca:RetrieveImageRequest>", 180000);
                    if (g.Code != 200 || IsFault(g.Text))
                    {
                        if (Regex.IsMatch(g.Text, "NoImagesAvailable|JobCompleted|ClientErrorNoImages", RegexOptions.IgnoreCase) || (src0 == "Platen" && pages.Count > n0)) break;
                        if (Regex.IsMatch(g.Text, "Busy|Temporary|NotReady", RegexOptions.IgnoreCase) && busy++ < 60) { Thread.Sleep(1000); continue; }
                        trace.Add($"RetrieveImage → {g.Code}"); break;
                    }
                    var img = Image(g);
                    if (img == null || img.Length < 100) { trace.Add("kein Bild in der Antwort"); break; }
                    pages.Add(img); onPage(img); busy = 0;
                    if (src0 == "Platen") break;
                }
                if (pages.Count > 0) break;
                trace.Add($"{src}: keine Seiten");
            }
            LastTrace = string.Join(" | ", trace);
            Program.Log($"Scan {Name}: {pages.Count} Seite(n) · {LastTrace}");
            if (pages.Count == 0 && notAccepting) throw new Exception("Der Scanner nimmt gerade keine Aufträge an. Bei Kyocera, Ricoh und manchen anderen Geräten muss WSD-Scan am Gerät gestartet werden: am Bedienfeld „Senden“ bzw. „Scanner“ → „WSD-Scan“ → „Vom Computer“ wählen und dann hier erneut „Scannen“ klicken.");
            if (pages.Count == 0) throw new Exception("Der Scanner hat keine Seiten geliefert. Liegt Papier im Einzug oder auf dem Glas? Ist das Gerät gerade frei (kein Kopier- oder Druckauftrag)?");
            return pages;
        }
    }
}
