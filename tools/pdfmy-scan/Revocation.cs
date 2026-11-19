// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;

namespace PdfmyScan
{
    /* Langzeitprüfdaten (PAdES B-LT, seit 1.23.0): Sperrauskunft (OCSP) bzw. Sperrliste (CRL) der Zertifizierungsstelle holen, deren
       Adresse im eigenen Signaturzertifikat steht. Browser dürfen diese Dienste nicht direkt abfragen (kein CORS). Übertragen wird nur
       die OCSP-Anfrage (Prüfwerte des Ausstellers und Seriennummer des Zertifikats), nie das Dokument.
       Kein offener Proxy: nur http/https auf Port 80/443, nur öffentliche IP-Adressen (nicht 127.x, 10.x, 192.168.x, fe80:: …),
       Weiterleitungen höchstens 3 und jede neu geprüft, Größen begrenzt. */
    static class Revocation
    {
        public static bool PublicAddress(IPAddress a)
        {
            if (a.IsIPv4MappedToIPv6) a = a.MapToIPv4();
            var b = a.GetAddressBytes();
            if (a.AddressFamily == AddressFamily.InterNetwork)
                return !(b[0] == 0 || b[0] == 10 || b[0] == 127 || (b[0] == 100 && b[1] >= 64 && b[1] < 128) || (b[0] == 169 && b[1] == 254)
                    || (b[0] == 172 && b[1] >= 16 && b[1] < 32) || (b[0] == 192 && b[1] == 168) || (b[0] == 192 && b[1] == 0 && b[2] == 0) || b[0] >= 224
                    || (b[0] == 198 && (b[1] == 18 || b[1] == 19)));
            if (a.AddressFamily == AddressFamily.InterNetworkV6)
                return !(IPAddress.IsLoopback(a) || a.IsIPv6LinkLocal || a.IsIPv6SiteLocal || a.IsIPv6Multicast || (b[0] & 0xfe) == 0xfc || a.Equals(IPAddress.IPv6None) || a.Equals(IPAddress.IPv6Any));
            return false;
        }

        // Adresse zulässig? → null oder Fehlertext
        public static string Check(Uri u)
        {
            if (u == null || (u.Scheme != "http" && u.Scheme != "https")) return "Nur http- und https-Adressen";
            if (!u.IsDefaultPort && u.Port != 80 && u.Port != 443) return "Nur die Standard-Ports 80 und 443";
            if (!string.IsNullOrEmpty(u.UserInfo)) return "Adresse mit Zugangsdaten nicht erlaubt";
            if (Environment.GetEnvironmentVariable("PDFMY_TEST_REVOCATION_LOCAL") == "1" && u.IsLoopback) return null;   // nur für Tests
            IPAddress[] ips;
            try { ips = IPAddress.TryParse(u.DnsSafeHost, out var ip) ? new[] { ip } : Dns.GetHostAddresses(u.DnsSafeHost); }
            catch { return "Name nicht auflösbar: " + u.Host; }
            if (ips.Length == 0 || !ips.All(PublicAddress)) return "Adresse im eigenen Netz – aus Sicherheitsgründen nicht abgefragt";
            return null;
        }

        // kind = "ocsp" (POST der Anfrage) oder "crl" (GET); liefert die Antwort oder wirft mit verständlicher Meldung
        public static byte[] Fetch(string kind, string url, byte[] req)
        {
            bool ocsp = kind == "ocsp";
            if (ocsp && (req == null || req.Length == 0 || req.Length > 4096)) throw new Exception("Ungültige OCSP-Anfrage");
            Uri u; try { u = new Uri(url); } catch { throw new Exception("Ungültige Adresse"); }
            using (var h = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(20), MaxResponseContentBufferSize = ocsp ? 1_000_000 : 30_000_000 })
            {
                for (int hop = 0; hop < 4; hop++)
                {
                    string bad = Check(u); if (bad != null) throw new Exception(bad);
                    HttpResponseMessage r;
                    if (ocsp) { var c = new ByteArrayContent(req); c.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/ocsp-request"); r = h.PostAsync(u, c).Result; }
                    else r = h.GetAsync(u).Result;
                    int code = (int)r.StatusCode;
                    if (code >= 300 && code < 400 && r.Headers.Location != null) { u = new Uri(u, r.Headers.Location); continue; }
                    if (!r.IsSuccessStatusCode) throw new Exception((ocsp ? "OCSP-Dienst" : "Sperrliste") + " antwortet mit " + code);
                    var d = r.Content.ReadAsByteArrayAsync().Result;
                    if (d.Length < 8 || d[0] != 0x30) throw new Exception("Antwort ist keine " + (ocsp ? "OCSP-Antwort" : "Sperrliste"));
                    Program.Log((ocsp ? "OCSP" : "Sperrliste") + " von " + u.Host + " (" + d.Length / 1024 + " KB)");
                    return d;
                }
                throw new Exception("Zu viele Weiterleitungen");
            }
        }
    }
}
