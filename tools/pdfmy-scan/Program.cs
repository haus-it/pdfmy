// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// pdfmy Scan – macht Scanner für pdfmy.de im Browser verfügbar.
// Läuft im Infobereich, lauscht nur auf 127.0.0.1:52880 (ist der Port von einem anderen Benutzer belegt: 52881–52889)
// und akzeptiert nur Anfragen von pdfmy – und nur von Prozessen des eigenen Benutzers in der eigenen Sitzung (Peer.cs).
// Netzwerkgeräte: eSCL ("AirScan"/"Mopria", ohne Treiber). USB/Treiber-Geräte: Windows WIA.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Xml;
using Microsoft.Win32;
using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;

namespace PdfmyScan
{
    static class Program
    {
        // Mehrere Benutzer auf einem Rechner (Terminalserver): jeder Benutzer bekommt den ersten freien Port ab 52880.
        // Die Web-App sucht 52880–52889 ab – die Helfer anderer Benutzer antworten 403 (KONZEPT.md, 25.10.2026).
        public const int PortFirst = 52880, PortLast = 52889;
        public static int Port = PortFirst;   // tatsächlich belegter Port dieses Benutzers
        public static string PortFile => Path.Combine(DataDir, "port.txt");
        public const string Version = "1.15.0";
        public static readonly string AppDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "pdfmy Scan");
        public static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "pdfmy Scan");

        [STAThread]
        // Gerät im eigenen Netz? (private bzw. lokale IP-Adresse, Name ohne Punkt oder mit „.local“) – nur dort sind selbstsignierte Zertifikate erlaubt
        static bool LocalHost(string host)
        {
            host = (host ?? "").Trim('[', ']').ToLowerInvariant();
            if (!host.Contains(".") || host.EndsWith(".local") || host.EndsWith(".lan") || host.EndsWith(".home") || host.EndsWith(".fritz.box")) return true;
            if (!IPAddress.TryParse(host, out var ip)) return false;
            if (IPAddress.IsLoopback(ip)) return true;
            var b = ip.GetAddressBytes();
            if (ip.AddressFamily == AddressFamily.InterNetwork)
                return b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254);
            return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || (b[0] & 0xFE) == 0xFC;
        }

        static void Main(string[] args)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            // Geräte nutzen oft selbstsignierte Zertifikate – das gilt nur für Scanner im eigenen Netz. Verbindungen ins Internet
            // (Updates von pdfmy.de) werden normal geprüft, sonst könnte ein Angreifer im Netz Update-Angaben unterschieben.
            ServicePointManager.ServerCertificateValidationCallback = (s, c, ch, e) =>
                e == System.Net.Security.SslPolicyErrors.None || (s is HttpWebRequest wr && LocalHost(wr.RequestUri.Host));
            Directory.CreateDirectory(DataDir);
            int vi = Array.IndexOf(args, "--verify-update");   // Prüfung einer Update-Datei (Support und Test): Exit-Code 0 = vertrauenswürdig
            if (vi >= 0 && vi + 1 < args.Length)
            {
                string why = UpdateTrust.Check(args[vi + 1], vi + 2 < args.Length ? args[vi + 2] : null);
                File.WriteAllText(Path.Combine(DataDir, "verify-update.txt"), why ?? "OK");
                Environment.Exit(why == null ? 0 : 1); return;
            }
            if (args.Contains("--uninstall")) { Installer.Uninstall(); return; }
            if (args.Length > 1 && args[0] == "--printer") { Environment.Exit(PdfPrinter.Elevated(args)); return; }   // erhöhte Kopie: Drucker „PDFMy“ einrichten/entfernen
            if (args.Contains("--register")) { FileAssoc.Register(Application.ExecutablePath); return; }     // Support: PDF-Zuordnung erneuern
            if (args.Contains("--unregister")) { FileAssoc.Unregister(); return; }
            if (args.Contains("--twain-test"))   // Support: TWAIN-Manager und -Quellen ins Protokoll schreiben (scannt nicht)
            {
                var tr = new List<string> { $"TWAIN-Test ({(IntPtr.Size == 4 ? "32" : "64")} Bit): {Twain.Probe()}" };
                Twain.TryScan("(--keine--)", new ScanRequest(), b => { }, tr, CancellationToken.None);
                Log(string.Join(" | ", tr)); return;
            }   // aus „Installierte Apps“ – vor der Einzelinstanz-Prüfung
            if (args.Contains("--peer-test")) { Log("Peer-Test: " + Peer.SelfTest()); return; }   // Support: Besitzerprüfung gegen alle laufenden Prozesse (Terminalserver)

            // Doppelklick auf eine PDF im Explorer: "pdfmy-Scan.exe --open <Datei>"
            int oi = Array.IndexOf(args, "--open");
            string openPath = oi >= 0 && oi + 1 < args.Length ? args[oi + 1] : null;
            if (openPath != null && FileOpen.HandOver(openPath)) return;   // läuft schon → Datei an die laufende Instanz geben

            bool first;
            var mutex = new Mutex(true, "pdfmy-scan-single", out first);
            if (!first && args.Contains("--installed")) first = WaitMutex(mutex, 15000);   // gerade installiert: warten, bis der Installer fertig ist
            if (!first && ReplaceOlderInstance()) first = WaitMutex(mutex, 15000);        // ältere Version läuft → beenden lassen
            if (!first) Log("Start: läuft bereits (gleiche oder neuere Version)");
            using (mutex)
            {
                if (!first) { OpenPdfmy(); return; }   // gleiche/neuere Version läuft schon → nur pdfmy öffnen
                // --portable: ohne Installation/Autostart laufen (z. B. für Tests)
                if (!args.Contains("--portable") && Installer.InstallIfNeeded()) return; // Erstinstallation: Kopie wurde gestartet
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                var hub = new ScannerHub();
                var server = new LocalServer(hub);
                server.Start();
                PdfPrinter.Watch();
                if (openPath != null) FileOpen.Open(openPath);
                _ = hub.RefreshAsync();
                Application.Run(new TrayContext(hub, args.Contains("--installed")));
                server.Stop();
            }
        }

        static bool WaitMutex(Mutex m, int ms)
        {
            try { return m.WaitOne(ms); }
            catch (AbandonedMutexException) { return true; }   // Vorgänger wurde hart beendet – Mutex gehört jetzt uns
        }

        // Läuft eine ältere Version? Dann bitten wir sie, sich zu beenden, damit die neue sich installieren kann
        static bool ReplaceOlderInstance()
        {
            try
            {
                int port = RunningPort(); if (port == 0) return false;
                using (var h = new HttpClient { Timeout = TimeSpan.FromSeconds(3) })
                {
                    var st = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(h.GetStringAsync($"http://127.0.0.1:{port}/status").Result);
                    if (new System.Version(Convert.ToString(st["version"])) >= new System.Version(Version)) return false;
                    var req = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}/quit");
                    req.Headers.Add("X-Pdfmy", "1");
                    h.SendAsync(req).Wait(3000);
                    return true;
                }
            }
            catch { return false; }
        }

        // Port des eigenen, bereits laufenden pdfmy Scan (gleicher Benutzer, gleiche Sitzung) – 0, wenn keiner läuft.
        // Geprüft wird der Besitzer des lauschenden Ports, nicht die Antwort: so wird nie der Helfer eines anderen Benutzers angesprochen.
        public static int RunningPort()
        {
            var ports = new List<int>();
            try { if (int.TryParse(File.ReadAllText(PortFile).Trim(), out int p) && p >= PortFirst && p <= PortLast) ports.Add(p); } catch { }
            for (int p = PortFirst; p <= PortLast; p++) if (!ports.Contains(p)) ports.Add(p);
            foreach (int p in ports) if (Peer.ListenerIsOwn(p)) return p;
            return 0;
        }

        public static void OpenPdfmy() { try { Process.Start(FileOpen.AppUrl); } catch { } }

        public static void Log(string msg)
        {
            try { File.AppendAllText(Path.Combine(DataDir, "log.txt"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {msg}\r\n"); } catch { }
        }
    }

    // ---------------- Einrichtung: in den Benutzerordner kopieren, Autostart, Startmenü ----------------
    static class Installer
    {
        public static bool InstallIfNeeded()
        {
            string self = Application.ExecutablePath;
            string target = Path.Combine(Program.AppDir, "pdfmy-Scan.exe");
            if (string.Equals(Path.GetFullPath(self), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
            {
                try { File.Delete(target + ".alt"); } catch { }   // Rest eines Updates aufräumen
                SetAutostart(true, target); Register(target); return false;
            }
            // Dieselbe Version ist schon installiert (z. B. Download ein zweites Mal geöffnet)? Dann nicht überschreiben –
            // die installierte Datei kann gerade laufen und gesperrt sein.
            try
            {
                if (File.Exists(target) && FileVersionInfo.GetVersionInfo(target).ProductVersion?.StartsWith(Program.Version) == true)
                {
                    SetAutostart(true, target); Register(target);
                    Program.Log($"Installation: {Program.Version} ist bereits installiert – starte die installierte Version");
                    Process.Start(new ProcessStartInfo(target, "--installed") { UseShellExecute = true });
                    return true;
                }
            }
            catch (Exception e) { Program.Log("Installation (Prüfung): " + e.Message); }
            try
            {
                Directory.CreateDirectory(Program.AppDir);
                for (int i = 0; ; i++)
                {
                    try { File.Copy(self, target, true); break; }
                    catch (Exception ce) when ((ce is IOException || ce is UnauthorizedAccessException) && i < 12)
                    {
                        // Datei noch gesperrt oder schreibgeschützt: nach kurzer Wartezeit die alte Datei umbenennen
                        // (geht auch, solange sie läuft) und die neue an ihren Platz kopieren
                        if (i >= 6)
                        {
                            try { File.SetAttributes(target, FileAttributes.Normal); } catch { }
                            try { string old = target + ".alt"; if (File.Exists(old)) File.Delete(old); File.Move(target, old); } catch { }
                        }
                        System.Threading.Thread.Sleep(500);
                    }
                }
                SetAutostart(true, target);
                CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "pdfmy Scan.lnk"), target);
                Register(target);
                Program.Log($"Installiert: {Program.Version} nach {target}");
                Process.Start(new ProcessStartInfo(target, "--installed") { UseShellExecute = true });
                return true;
            }
            catch (Exception e)
            {
                Program.Log("Installation: " + e.Message);
                // Nicht still scheitern: von hier aus weiterlaufen (funktioniert sofort) und Bescheid geben
                try
                {
                    MessageBox.Show("pdfmy Scan konnte nicht in den Programmordner kopiert werden:\n" + e.Message +
                        "\n\npdfmy Scan läuft trotzdem und kann sofort genutzt werden. Für den automatischen Start mit Windows die Datei bitte später erneut öffnen.",
                        "pdfmy Scan", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                catch { }
                return false;
            }
        }

        const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\pdfmy-scan";
        // Eintrag in Windows „Installierte Apps“ – dort steht immer die installierte Version (und „Deinstallieren“)
        static void Register(string target)
        {
            try
            {
                using (var k = Registry.CurrentUser.CreateSubKey(UninstallKey))
                {
                    k.SetValue("DisplayName", "pdfmy Scan");
                    k.SetValue("DisplayVersion", Program.Version);
                    k.SetValue("Publisher", "Mentor GmbH – PDFMy");
                    k.SetValue("DisplayIcon", target);
                    k.SetValue("InstallLocation", Path.GetDirectoryName(target));
                    k.SetValue("UninstallString", "\"" + target + "\" --uninstall");
                    k.SetValue("URLInfoAbout", "https://pdfmy.de/scanner.html");
                    k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
                    k.SetValue("EstimatedSize", (int)(new FileInfo(target).Length / 1024), RegistryValueKind.DWord);
                    k.SetValue("NoModify", 1, RegistryValueKind.DWord); k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                }
            }
            catch (Exception e) { Program.Log("Registrierung: " + e.Message); }
            FileAssoc.Register(target);
        }
        public static void Uninstall()
        {
            try { int port = Program.RunningPort(); if (port > 0) using (var h = new HttpClient { Timeout = TimeSpan.FromSeconds(3) }) { var q = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}/quit"); q.Headers.Add("X-Pdfmy", "1"); h.SendAsync(q).Wait(3000); } } catch { }
            SetAutostart(false);
            try { File.Delete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "pdfmy Scan.lnk")); } catch { }
            try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }
            FileAssoc.Unregister();
            if (!PdfPrinter.TerminalServer && PdfPrinter.Installed()) PdfPrinter.Setup(false);   // eigenen Drucker „PDFMy“ wieder entfernen (eine Windows-Bestätigung)
            // Die laufende Datei kann sich nicht selbst löschen – das erledigt kurz danach ein unsichtbarer Befehl
            try { Process.Start(new ProcessStartInfo("cmd.exe", $"/c timeout /t 3 /nobreak >nul & rmdir /s /q \"{Program.AppDir}\"") { CreateNoWindow = true, UseShellExecute = false }); } catch { }
            try { MessageBox.Show("pdfmy Scan wurde entfernt.", "pdfmy Scan", MessageBoxButtons.OK, MessageBoxIcon.Information); } catch { }
        }

        public static bool AutostartEnabled()
        {
            using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")) return k?.GetValue("pdfmy Scan") != null;
        }

        public static void SetAutostart(bool on, string exe = null)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                if (on) k.SetValue("pdfmy Scan", "\"" + (exe ?? Application.ExecutablePath) + "\"");
                else k.DeleteValue("pdfmy Scan", false);
            }
        }

        static void CreateShortcut(string lnk, string target)
        {
            try
            {
                dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
                dynamic s = shell.CreateShortcut(lnk);
                s.TargetPath = target; s.Description = "Scanner für pdfmy.de"; s.Save();
            }
            catch (Exception e) { Program.Log("Verknüpfung: " + e.Message); }
        }
    }

    // ---------------- Infobereich (Tray) ----------------
    class TrayContext : ApplicationContext
    {
        readonly NotifyIcon icon;
        readonly ScannerHub hub;
        readonly ToolStripMenuItem devicesItem, autostartItem, updateItem;
        readonly System.Windows.Forms.Timer updateTimer;
        string offered;   // Version, für die schon ein Hinweis kam
        Action onBalloon;  // was ein Klick auf die aktuelle Meldung auslöst (sonst: Update)
        readonly System.Windows.Forms.Timer assocTimer;

        public TrayContext(ScannerHub hub, bool justInstalled)
        {
            this.hub = hub;
            var menu = new ContextMenuStrip();
            menu.Items.Add(new ToolStripMenuItem($"pdfmy Scan {Program.Version}") { Enabled = false, Font = new Font(menu.Font, FontStyle.Bold) });
            updateItem = new ToolStripMenuItem("Update installieren") { Visible = false, Font = new Font(menu.Font, FontStyle.Bold) };
            updateItem.Click += (s, e) => _ = Updater.InstallAsync((string)updateItem.Tag, msg => icon.ShowBalloonTip(6000, "pdfmy Scan", msg, ToolTipIcon.Warning));
            menu.Items.Add(updateItem);
            menu.Items.Add("Nach Updates suchen", null, async (s, e) => await CheckUpdate(true));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("PDFMy öffnen", null, (s, e) => Program.OpenPdfmy());
            menu.Items.Add("PDFMy als Standard für PDFs festlegen …", null, (s, e) =>
            {
                FileAssoc.OpenDefaultAppsSettings();
                icon.ShowBalloonTip(10000, "PDFMy als Standard festlegen", "In den Windows-Einstellungen bei „.pdf“ auf das Programm klicken und „PDFMy (pdfmy Scan)“ wählen.", ToolTipIcon.Info);
            });
            var printerItem = new ToolStripMenuItem("Drucker „PDFMy“ einrichten …");
            printerItem.Click += (s, e) =>
            {
                bool on = !PdfPrinter.Installed();
                ThreadPool.QueueUserWorkItem(_ =>
                {
                    string err = PdfPrinter.Setup(on);
                    try { menu.BeginInvoke((Action)(() => icon.ShowBalloonTip(9000, "Drucker „PDFMy“", err ?? (on ? "Eingerichtet: In jedem Programm „Drucken“ → Drucker „" + PdfPrinter.Name + "“ wählen – das Dokument öffnet sich in PDFMy." : "Der Drucker wurde entfernt."), err == null ? ToolTipIcon.Info : ToolTipIcon.Warning))); } catch { }
                });
            };
            menu.Items.Add(printerItem);
            menu.Opening += (s, e) => { printerItem.Visible = !PdfPrinter.TerminalServer; printerItem.Text = PdfPrinter.Installed() ? "Drucker „PDFMy“ entfernen …" : "Drucker „PDFMy“ einrichten …"; };
            devicesItem = new ToolStripMenuItem("Scanner werden gesucht …") { Enabled = false };
            menu.Items.Add(devicesItem);
            menu.Items.Add("Scanner neu suchen", null, async (s, e) => { await hub.RefreshAsync(); });
            menu.Items.Add(new ToolStripSeparator());
            autostartItem = new ToolStripMenuItem("Mit Windows starten") { Checked = Installer.AutostartEnabled(), CheckOnClick = true };
            autostartItem.CheckedChanged += (s, e) => Installer.SetAutostart(autostartItem.Checked);
            menu.Items.Add(autostartItem);
            menu.Items.Add("Beenden", null, (s, e) => { icon.Visible = false; Application.Exit(); });

            Icon ico;
            using (var st = typeof(Program).Assembly.GetManifestResourceStream("app.ico")) ico = st != null ? new Icon(st) : SystemIcons.Application;
            icon = new NotifyIcon { Icon = ico, Text = $"pdfmy Scan {Program.Version} – bereit", ContextMenuStrip = menu, Visible = true };
            icon.DoubleClick += (s, e) => Program.OpenPdfmy();
            hub.Changed += () => { try { menu.BeginInvoke((Action)UpdateDevices); } catch { } };
            if (justInstalled)
                icon.ShowBalloonTip(8000, $"pdfmy Scan {Program.Version} ist bereit", "Zurück zu pdfmy.de und auf „Scannen“ klicken.", ToolTipIcon.Info);
            // Regelmäßig nachsehen, ob es eine neue Version gibt – kurz nach dem Start und dann alle 6 Stunden
            icon.BalloonTipClicked += (s, e) => { var a = onBalloon; onBalloon = null; if (a != null) a(); else if (updateItem.Visible && updateItem.Tag != null) updateItem.PerformClick(); };
            icon.BalloonTipClosed += (s, e) => onBalloon = null;
            // PDF-Zuordnung: Browser-App aus „Öffnen mit“ ausblenden und auf die falsche Standard-App hinweisen – kurz nach dem Start, dann alle 30 Minuten
            assocTimer = new System.Windows.Forms.Timer { Interval = 20 * 1000 };
            assocTimer.Tick += (s, e) => { assocTimer.Interval = 30 * 60 * 1000; CheckAssoc(); };
            assocTimer.Start();
            // Prüfzeitpunkte mit Zufallsversatz: bei 100.000 Installationen fragen nicht alle gleichzeitig nach (z. B. alle um 8 Uhr beim Hochfahren)
            var jitter = new Random();
            updateTimer = new System.Windows.Forms.Timer { Interval = (60 + jitter.Next(0, 15 * 60)) * 1000 };   // erste Prüfung 1–16 Minuten nach dem Start
            updateTimer.Tick += async (s, e) => { updateTimer.Interval = (6 * 60 + jitter.Next(-45, 46)) * 60 * 1000; await CheckUpdate(false); };   // dann alle 6 h ± 45 min
            updateTimer.Start();
        }

        void CheckAssoc()
        {
            FileAssoc.HideBrowserApp();
            if (!FileAssoc.BrowserAppIsDefault()) return;
            string f = Path.Combine(Program.DataDir, "hinweis-standard.txt"), today = DateTime.Now.ToString("yyyy-MM-dd");
            try { if (File.Exists(f) && File.ReadAllText(f).Trim() == today) return; File.WriteAllText(f, today); } catch { }
            onBalloon = () => FileAssoc.OpenDefaultAppsSettings();
            icon.ShowBalloonTip(15000, "PDF-Dateien ohne PDFMy-Logo", "Bei „.pdf“ ist die Browser-App eingestellt. Hier klicken und „PDFMy (pdfmy Scan)“ wählen – dann mit PDFMy-Logo, geöffnet wird weiter im App-Fenster.", ToolTipIcon.Info);
            Program.Log("Hinweis: Browser-App ist Standard für PDF");
        }

        async Task CheckUpdate(bool manual)
        {
            string latest = await Updater.LatestAsync();
            if (latest == null) { if (manual) icon.ShowBalloonTip(5000, "pdfmy Scan", "Update-Prüfung nicht möglich (keine Verbindung zu pdfmy.de).", ToolTipIcon.Warning); return; }
            // Gestaffelte Verteilung: version.json „rollout“ (0–100 %) – automatisch sieht das Update nur der freigegebene Teil der Installationen
            // (stabile Zufallszahl je Installation); „Nach Updates suchen“ von Hand bekommt es immer
            if (!manual && new System.Version(latest) > new System.Version(Program.Version) && Updater.Bucket >= Updater.Rollout)
            { Program.Log($"Update {latest} noch nicht für diese Installation freigegeben ({Updater.Rollout} % – hier {Updater.Bucket})"); return; }
            if (new System.Version(latest) > new System.Version(Program.Version))
            {
                updateItem.Text = $"Update auf {latest} installieren"; updateItem.Tag = latest; updateItem.Visible = true;
                icon.Text = $"pdfmy Scan {Program.Version} – Update {latest} verfügbar".Substring(0, Math.Min(63, $"pdfmy Scan {Program.Version} – Update {latest} verfügbar".Length));
                if (manual || offered != latest)
                    icon.ShowBalloonTip(10000, $"pdfmy Scan {latest} ist verfügbar", $"Installiert ist {Program.Version}. Hier klicken, um jetzt zu aktualisieren.", ToolTipIcon.Info);
                offered = latest;
                Program.Log($"Update verfügbar: {latest}");
            }
            else { updateItem.Visible = false; if (manual) icon.ShowBalloonTip(5000, "pdfmy Scan", $"Sie haben die aktuelle Version ({Program.Version}).", ToolTipIcon.Info); }
        }

        void UpdateDevices()
        {
            var list = hub.Devices;
            devicesItem.Text = list.Count == 0 ? (hub.Searching ? "Scanner werden gesucht …" : "Kein Scanner gefunden") : $"{list.Count} Scanner: " + string.Join(", ", list.Select(d => d.Name).Take(3));
            string tip = $"pdfmy Scan {Program.Version} – " + (list.Count == 0 ? "kein Scanner" : list.Count + " Scanner");
            icon.Text = tip.Substring(0, Math.Min(63, tip.Length));
        }
    }

    // ---------------- Updates: Version bei pdfmy.de abfragen, neue Version laden und starten (sie ersetzt diese) ----------------
    static class Updater
    {
        const string Base = "https://pdfmy.de/download/";
        static string ExpectedSha = "";
        public static int Rollout = 100;   // Anteil der Installationen in %, die das Update automatisch angeboten bekommen (version.json „rollout“)
        // Stabile Zufallszahl 0–99 je Installation (einmal erzeugt, in %AppData%\pdfmy Scan\update-bucket.txt) – entscheidet über die Freigabestufe
        public static int Bucket
        {
            get
            {
                string f = Path.Combine(Program.DataDir, "update-bucket.txt");
                try { if (int.TryParse(File.ReadAllText(f).Trim(), out int b) && b >= 0 && b < 100) return b; } catch { }
                int n = new Random().Next(0, 100);
                try { File.WriteAllText(f, n.ToString()); } catch { }
                return n;
            }
        }
        public static async Task<string> LatestAsync()
        {
            try
            {
                using (var h = new HttpClient { Timeout = TimeSpan.FromSeconds(15) })
                {
                    h.DefaultRequestHeaders.Add("User-Agent", "pdfmy-Scan/" + Program.Version);
                    var d = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(await h.GetStringAsync(Base + "version.json?t=" + DateTime.UtcNow.Ticks));
                    string v = Convert.ToString(d["pdfmyScan"]);
                    ExpectedSha = d.ContainsKey("sha256") ? Convert.ToString(d["sha256"]).ToLowerInvariant() : "";
                    Rollout = d.ContainsKey("rollout") && int.TryParse(Convert.ToString(d["rollout"]), out int ro) ? Math.Max(0, Math.Min(100, ro)) : 100;
                    return System.Text.RegularExpressions.Regex.IsMatch(v ?? "", @"^\d+\.\d+\.\d+$") ? v : null;
                }
            }
            catch (Exception e) { Program.Log("Update-Prüfung: " + e.Message); return null; }
        }
        public static async Task InstallAsync(string version, Action<string> fail)
        {
            try
            {
                string file = Path.Combine(Path.GetTempPath(), $"pdfmy-Scan-{version}.exe");
                using (var h = new HttpClient { Timeout = TimeSpan.FromMinutes(2) })
                {
                    var data = await h.GetByteArrayAsync(Base + $"pdfmy-Scan-{version}.exe");
                    if (data.Length < 50000 || data[0] != (byte)'M' || data[1] != (byte)'Z') throw new Exception("Download unvollständig");
                    // Integrität (ISO 27001 A.8.32): nur starten, wenn die SHA-256-Prüfsumme zur veröffentlichten passt
                    string sha;
                    using (var h256 = System.Security.Cryptography.SHA256.Create()) sha = BitConverter.ToString(h256.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
                    if (ExpectedSha.Length == 64 && sha != ExpectedSha) throw new Exception("Prüfsumme stimmt nicht – Update abgebrochen");
                    Program.Log($"Update {version}: Prüfsumme {(ExpectedSha.Length == 64 ? "bestätigt" : "nicht veröffentlicht")} ({sha.Substring(0, 12)}…)");
                    File.WriteAllBytes(file, data);
                }
                // Signatur prüfen (Mentor GmbH, gültig, neuere Version) – sonst nicht starten und die Datei löschen
                string why = UpdateTrust.Check(file, version);
                if (why != null) { try { File.Delete(file); } catch { } throw new Exception("Signaturprüfung: " + why + " – Update abgebrochen"); }
                Program.Log($"Update {version}: Signatur „Mentor GmbH“ gültig");
                Program.Log($"Update {version} geladen – starte Installation");
                Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });   // die neue Version beendet diese und installiert sich
            }
            catch (Exception e) { Program.Log("Update: " + e.Message); fail("Update fehlgeschlagen: " + e.Message + " – bitte auf pdfmy.de neu herunterladen."); }
        }

    }

    // ---------------- Geräte ----------------
    abstract class ScanDevice
    {
        public string Id, Name, Kind, LastTrace = "", Note = "";
        public bool Feeder, Duplex;
        public abstract List<byte[]> Scan(ScanRequest r, Action<byte[]> onPage, CancellationToken ct);
    }

    class ScanRequest
    {
        public string id; public bool duplex; public string color = "gray"; public int dpi = 300; public string source = "auto";
    }

    // eSCL: Netzwerkscanner ohne Treiber
    class EsclDevice : ScanDevice
    {
        public string BaseUrl, Uuid; public bool Jpeg, Pdf, Platen, FmtExt, LocalhostHost; public string EsclVersion = "2.0";
        public List<int> Resolutions = new List<int>(); public List<string> ColorModes = new List<string>();
        static readonly HttpClient http = new HttpClient { Timeout = TimeSpan.FromSeconds(120) };

        public static async Task<EsclDevice> ProbeAsync(string baseUrl, int timeoutMs = 2500)
        {
            try
            {
                using (var cts = new CancellationTokenSource(timeoutMs))
                {
                    var res = await http.GetAsync(baseUrl.TrimEnd('/') + "/ScannerCapabilities", cts.Token);
                    if (!res.IsSuccessStatusCode) return null;
                    string xml = await res.Content.ReadAsStringAsync();
                    var doc = new XmlDocument(); doc.LoadXml(xml);
                    // Nur echte eSCL-Geräte: manche Weboberflächen antworten auf jede Adresse mit „OK“ (dann wäre es kein Scanner)
                    if (doc.DocumentElement == null || doc.DocumentElement.LocalName != "ScannerCapabilities") return null;
                    var ns = new XmlNamespaceManager(doc.NameTable);
                    ns.AddNamespace("pwg", "http://www.pwg.org/schemas/2010/12/sm");
                    ns.AddNamespace("scan", "http://schemas.hp.com/imaging/escl/2011/05/03");
                    string model = doc.SelectSingleNode("//pwg:MakeAndModel", ns)?.InnerText?.Trim();
                    var host = new Uri(baseUrl).Host;
                    var d = new EsclDevice
                    {
                        Kind = "escl", BaseUrl = baseUrl.TrimEnd('/'), Id = "escl:" + baseUrl.TrimEnd('/'),
                        Name = string.IsNullOrEmpty(model) ? "Scanner " + host : model,
                        Feeder = doc.SelectSingleNode("//scan:Adf", ns) != null,
                        Duplex = doc.SelectSingleNode("//scan:Adf/scan:AdfDuplexInputCaps", ns) != null,
                        Platen = doc.SelectSingleNode("//scan:Platen", ns) != null,
                        Jpeg = xml.Contains("image/jpeg"), Pdf = xml.Contains("application/pdf"),
                        EsclVersion = doc.SelectSingleNode("//pwg:Version", ns)?.InnerText?.Trim() ?? "2.0",
                        Uuid = doc.SelectSingleNode("//scan:UUID", ns)?.InnerText?.Trim().ToLowerInvariant()   // eindeutige Gerätekennung: dasselbe Gerät unter Name und IP nur einmal
                    };
                    foreach (XmlNode n in doc.SelectNodes("//scan:DiscreteResolution/scan:XResolution", ns)) if (int.TryParse(n.InnerText, out int r) && !d.Resolutions.Contains(r)) d.Resolutions.Add(r);
                    foreach (XmlNode n in doc.SelectNodes("//scan:ColorMode", ns)) if (!d.ColorModes.Contains(n.InnerText.Trim())) d.ColorModes.Add(n.InnerText.Trim());
                    if (!d.Feeder && !d.Platen) d.Platen = true;
                    // Geräte-Eigenheiten (Quelle: sane-airscan)
                    d.FmtExt = xml.Contains("DocumentFormatExt");   // DocumentFormatExt nur senden, wenn das Gerät es kennt
                    d.LocalhostHost = model == "HP LaserJet MFP M630" || model == "HP Color LaserJet FlowMFP M578" || (res.Headers.Server?.ToString() ?? "").Contains("HP_Compact_Server");   // HP Enterprise: „Host: localhost“ beim Auftrag
                    if (model == "Canon iR2625/2630") d.Resolutions = d.Resolutions.Where(r => r <= 300).DefaultIfEmpty(300).ToList();   // nennt 600 dpi, kann nur 300
                    return d;
                }
            }
            catch { return null; }
        }

        // Geräte-Eigenheiten (wie sane-airscan): Epson verlangt den Port im Host-Kopf; Brother bricht den Einzug ab,
        // wenn die nächste Seite sofort nach der vorigen angefordert wird (meldet dann 404 und „Einzug leer“)
        bool PortInHost => (Name ?? "").StartsWith("EPSON", StringComparison.OrdinalIgnoreCase);
        bool IsBrother => (Name ?? "").StartsWith("Brother ", StringComparison.OrdinalIgnoreCase);
        HttpResponseMessage Send(HttpMethod m, string url, CancellationToken ct, HttpContent c = null)
        {
            var q = new HttpRequestMessage(m, url) { Content = c };
            q.Headers.ConnectionClose = true;   // Kyocera: sonst bleibt der Auftrag ca. 10 s „in Bearbeitung“
            var u = new Uri(url);
            if (PortInHost) q.Headers.Host = u.Host + ":" + u.Port;
            if (LocalhostHost && m == HttpMethod.Post && url.EndsWith("/ScanJobs") && !u.IsLoopback) q.Headers.Host = "localhost";
            return http.SendAsync(q, ct).Result;
        }
        string GetText(string url) { try { var r = Send(HttpMethod.Get, url, CancellationToken.None); return r.IsSuccessStatusCode ? r.Content.ReadAsStringAsync().Result : null; } catch { return null; } }

        int PickDpi(int want) => Resolutions.Count == 0 ? want : Resolutions.OrderBy(r => Math.Abs(r - want)).ThenByDescending(r => r).First();
        string PickMode(string color)
        {
            string want = color == "color" ? "RGB24" : color == "bw" ? "BlackAndWhite1" : "Grayscale8";
            if (ColorModes.Count == 0 || ColorModes.Contains(want)) return want;
            foreach (var alt in new[] { "Grayscale8", "RGB24", "BlackAndWhite1" }) if (ColorModes.Contains(alt)) return alt;
            return ColorModes[0];
        }

        string Settings(string source, string mode, int dpi, string fmt, bool duplex, bool full)
        {
            var sb = new StringBuilder();
            sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<scan:ScanSettings xmlns:scan=\"http://schemas.hp.com/imaging/escl/2011/05/03\" xmlns:pwg=\"http://www.pwg.org/schemas/2010/12/sm\">\n");
            sb.Append($"<pwg:Version>{EsclVersion}</pwg:Version>\n");
            if (full) sb.Append("<scan:Intent>Document</scan:Intent>\n<pwg:ScanRegions><pwg:ScanRegion><pwg:Height>3508</pwg:Height><pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits><pwg:Width>2480</pwg:Width><pwg:XOffset>0</pwg:XOffset><pwg:YOffset>0</pwg:YOffset></pwg:ScanRegion></pwg:ScanRegions>\n");
            sb.Append($"<pwg:InputSource>{source}</pwg:InputSource>\n");
            if (source == "Feeder") sb.Append($"<scan:Duplex>{(duplex ? "true" : "false")}</scan:Duplex>\n");
            sb.Append($"<scan:ColorMode>{mode}</scan:ColorMode>\n<scan:XResolution>{dpi}</scan:XResolution><scan:YResolution>{dpi}</scan:YResolution>\n");
            sb.Append($"<pwg:DocumentFormat>{fmt}</pwg:DocumentFormat>\n");
            if (full && FmtExt) sb.Append($"<scan:DocumentFormatExt>{fmt}</scan:DocumentFormatExt>\n");
            sb.Append("</scan:ScanSettings>");
            return sb.ToString();
        }

        // Auftrag anlegen; lehnt das Gerät ab, schrittweise einfachere Einstellungen probieren
        string CreateJob(string source, ScanRequest r, List<string> trace, CancellationToken ct, out string fmt)
        {
            int dpi = PickDpi(r.dpi); string mode = PickMode(r.color);
            var formats = new List<string>(); if (Jpeg) formats.Add("image/jpeg"); if (Pdf) formats.Add("application/pdf"); if (formats.Count == 0) formats.Add("image/jpeg");
            var variants = new List<(string f, bool full)>();
            foreach (var f in formats) { variants.Add((f, true)); variants.Add((f, false)); }
            foreach (var v in variants)
            {
                for (int attempt = 0; attempt < 4; attempt++)
                {
                    var before = JobUris();
                    var content = new StringContent(Settings(source, mode, dpi, v.f, r.duplex && Duplex, v.full), Encoding.UTF8);
                    content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("text/xml");   // manche Geräte lehnen "; charset" ab
                    var post = Send(HttpMethod.Post, BaseUrl + "/ScanJobs", ct, content);
                    int code = (int)post.StatusCode;
                    trace.Add($"{source} {v.f} {(v.full ? "voll" : "einfach")} {dpi}dpi {mode} → {code}");
                    if (code == 503 || code == 409) { Thread.Sleep(2000); continue; }   // beschäftigt / Einzug noch nicht bereit
                    if (!post.IsSuccessStatusCode) break;
                    string loc = post.Headers.Location?.ToString() ?? post.Content.Headers.ContentLocation?.ToString();
                    if (string.IsNullOrEmpty(loc)) loc = FindJobUri(post, before, trace, ct);
                    if (string.IsNullOrEmpty(loc)) { trace.Add("keine Auftragsadresse"); break; }
                    fmt = v.f;
                    var abs = loc.StartsWith("http") ? new Uri(loc) : new Uri(new Uri(BaseUrl), loc);
                    // Adresse immer über den Weg, auf dem wir das Gerät erreichen (HP meldet „localhost“, manche Geräte einen falschen Namen)
                    var b0 = new Uri(BaseUrl); return new UriBuilder(abs) { Scheme = b0.Scheme, Host = b0.Host, Port = b0.Port }.Uri.ToString();
                }
            }
            fmt = null; return null;
        }

        // Manche Geräte (z. B. ältere Samsung/HP) senden keine Location: Adresse aus der Antwort oder aus dem Gerätestatus lesen
        // Alle Aufträge aus dem Gerätestatus: (Adresse, Zustand) in der Reihenfolge des Geräts
        List<KeyValuePair<string, string>> StatusJobs(string status)
        {
            var list = new List<KeyValuePair<string, string>>();
            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(status ?? "", @"<(?:\w+:)?JobInfo>([\s\S]*?)</(?:\w+:)?JobInfo>"))
            {
                var u = System.Text.RegularExpressions.Regex.Match(m.Groups[1].Value, @"<(?:\w+:)?JobUri>([^<]+)<");
                var st = System.Text.RegularExpressions.Regex.Match(m.Groups[1].Value, @"<(?:\w+:)?JobState>([^<]+)<");
                if (u.Success) list.Add(new KeyValuePair<string, string>(u.Groups[1].Value.Trim(), st.Success ? st.Groups[1].Value.Trim() : ""));
            }
            return list;
        }
        string Status() => GetText(BaseUrl + "/ScannerStatus");
        HashSet<string> JobUris() => new HashSet<string>(StatusJobs(Status()).Select(j => j.Key));
        // Liegt Papier im Einzug? (eSCL ScannerStatus/AdfState) – null = Gerät sagt es nicht
        public bool? AdfLoaded(List<string> trace)
        {
            var m = System.Text.RegularExpressions.Regex.Match(Status() ?? "", @"<(?:\w+:)?AdfState>([^<]+)<");
            if (!m.Success) return null;
            trace.Add("Einzug: " + m.Groups[1].Value.Trim());
            return m.Groups[1].Value.Contains("Loaded") ? true : m.Groups[1].Value.Contains("Empty") ? false : (bool?)null;
        }

        string FindJobUri(HttpResponseMessage post, HashSet<string> before, List<string> trace, CancellationToken ct)
        {
            try
            {
                string body = post.Content.ReadAsStringAsync().Result ?? "";
                var m = System.Text.RegularExpressions.Regex.Match(body, @"(?:https?://[^\s<""']+)?/eSCL/ScanJobs/[A-Za-z0-9\-_.]+");
                if (m.Success) { trace.Add("Adresse aus Antwort"); return m.Value; }
                if (body.Trim().Length > 0) trace.Add("Antwort: " + System.Text.RegularExpressions.Regex.Replace(body.Trim(), @"\s+", " ").Substring(0, Math.Min(120, body.Trim().Length)));
                for (int i = 0; i < 4; i++)   // der neue Auftrag erscheint manchmal erst nach einem Moment im Gerätestatus
                {
                    Thread.Sleep(800);
                    var fresh = StatusJobs(Status()).Where(j => !before.Contains(j.Key)).ToList();
                    if (fresh.Count > 0) { trace.Add("Adresse aus ScannerStatus (neuer Auftrag, " + fresh.Last().Value + ")"); return fresh.Last().Key; }
                }
                string status = Status() ?? "";
                var jobs = System.Text.RegularExpressions.Regex.Matches(status, @"<(?:\w+:)?JobUri>([^<]+)</(?:\w+:)?JobUri>[\s\S]*?<(?:\w+:)?JobState>([^<]+)</");
                for (int i = jobs.Count - 1; i >= 0; i--)
                {
                    string st = jobs[i].Groups[2].Value;
                    if (st == "Processing" || st == "Pending" || st == "Pending-Held") { trace.Add("Adresse aus ScannerStatus"); return jobs[i].Groups[1].Value.Trim(); }
                }
                if (jobs.Count > 0) { trace.Add("Adresse aus ScannerStatus (letzter Auftrag)"); return jobs[jobs.Count - 1].Groups[1].Value.Trim(); }
            }
            catch (Exception e) { trace.Add("ScannerStatus: " + e.Message); }
            return null;
        }

        public override List<byte[]> Scan(ScanRequest r, Action<byte[]> onPage, CancellationToken ct)
        {
            var trace = new List<string>();
            var sources = new List<string>();
            if (r.source == "platen") sources.Add("Platen");
            else if (r.source == "feeder") sources.Add("Feeder");
            else
            {
                // automatisch: Papier im Einzug → Einzug, sonst Glas. Manche Geräte (Samsung) melden den Einzug nicht in den Fähigkeiten
                bool? loaded = AdfLoaded(trace);
                if (loaded == true || (loaded == null && Feeder)) sources.Add("Feeder");
                if (Platen || loaded != true) sources.Add("Platen");
            }
            if (sources.Count == 0) sources.Add("Platen");
            var pages = new List<byte[]>();
            foreach (var source in sources)
            {
                string loc = CreateJob(source, r, trace, ct, out string fmt);
                if (loc == null) continue;
                Status();   // Ricoh: ohne Statusabfrage vor der ersten Seite bleibt der Auftrag „wartend“
                bool xeroxB = Name == "B205" || Name == "B215"; int retry404 = 0;   // Xerox B205/B215: 404/410 ist dort nur vorübergehend
                int busy = 0; var lastLoad = DateTime.MinValue;
                while (!ct.IsCancellationRequested)
                {
                    if (IsBrother && source == "Feeder" && pages.Count > 0) { int wait = 1000 - (int)(DateTime.UtcNow - lastLoad).TotalMilliseconds; if (wait > 0) Thread.Sleep(wait); }
                    lastLoad = DateTime.UtcNow;
                    var res = Send(HttpMethod.Get, loc.TrimEnd('/') + "/NextDocument", ct);
                    int code = (int)res.StatusCode;
                    if (code == 503 && busy++ < 90) { Thread.Sleep(1000); continue; }
                    if ((code == 404 || code == 410) && source == "Feeder" && pages.Count == 0 && busy++ < 20) { Thread.Sleep(1000); continue; }   // zieht noch ein
                    if ((code == 404 || code == 410) && xeroxB && retry404++ < 5) { Thread.Sleep(1000); continue; }
                    if (code == 404 || code == 410) break;
                    if (!res.IsSuccessStatusCode) { trace.Add($"NextDocument → {code}"); break; }
                    var data = res.Content.ReadAsByteArrayAsync().Result;
                    if (data.Length < 100) { trace.Add("leere Seite vom Gerät"); break; }
                    LastFormat = fmt; pages.Add(data); onPage(data); busy = 0;
                    if (source == "Platen") break;
                }
                if (pages.Count > 0) break;
                trace.Add($"{source}: keine Seiten");
            }
            LastTrace = string.Join(" | ", trace);
            Program.Log($"Scan {Name}: {pages.Count} Seite(n) · {LastTrace}");
            if (pages.Count == 0)
                throw new Exception("Der Scanner hat keine Seiten geliefert. Liegt Papier im Einzug oder auf dem Glas? Ist das Gerät gerade frei (kein Kopier- oder Druckauftrag)?");
            return pages;
        }
        public string LastFormat = "image/jpeg";
    }

    // WIA: Scanner mit Windows-Treiber (USB oder Netzwerk)
    class WiaDevice : ScanDevice
    {
        const string JPEG = "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}";
        const string BMP = "{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}";   // Standardformat, kann jeder WIA-Treiber
        public string DeviceId;

        public static List<WiaDevice> Enumerate()
        {
            var list = new List<WiaDevice>();
            dynamic dm = Activator.CreateInstance(Type.GetTypeFromProgID("WIA.DeviceManager"));
            int n = dm.DeviceInfos.Count;
            for (int i = 1; i <= n; i++)
            {
                dynamic d = dm.DeviceInfos.Item(i);
                if ((int)d.Type != 1) continue;   // 1 = Scanner
                var w = new WiaDevice { Kind = "wia", DeviceId = d.DeviceID, Id = "wia:" + d.DeviceID, Name = (string)d.Properties.Item("Name").Value };
                // Einzug/beidseitig erkennen (z. B. Epson DS-730N über Epson Scan 2): Gerät und WIA-2.0-Einzugsquelle befragen
                dynamic dev = null;
                try
                {
                    dev = d.Connect();
                    int caps = GetProp(dev.Properties, 3086);
                    for (int k = 1; k <= (int)dev.Items.Count; k++) { dynamic it = dev.Items.Item(k); caps |= GetProp(it.Properties, 3086); Release(it); }
                    w.Feeder = (caps & 1) != 0; w.Duplex = (caps & 4) != 0;
                }
                catch (Exception e) { Program.Log($"WIA {w.Name}: Fähigkeiten nicht lesbar ({e.Message})"); }
                finally { Release(dev); GC.Collect(); GC.WaitForPendingFinalizers(); }
                list.Add(w);
            }
            return list;
        }

        static void SetProp(dynamic props, int id, object value)
        {
            foreach (dynamic p in props)
            {
                if ((int)p.PropertyID != id) continue;
                try { p.Value = value; } catch { try { object v = value; p.set_Value(ref v); } catch { } }
                return;
            }
        }
        static void Release(object o) { try { if (o != null && Marshal.IsComObject(o)) Marshal.FinalReleaseComObject(o); } catch { } }
        static int GetProp(dynamic props, int id) { try { foreach (dynamic p in props) if ((int)p.PropertyID == id) return Convert.ToInt32(p.Value); } catch { } return 0; }
        // Einzug beidseitig: FEEDER|DUPLEX|FRONT_FIRST (13), falls abgelehnt FEEDER|DUPLEX (5). Liefert true, wenn der Treiber Duplex übernommen hat.
        // Einzug beidseitig mit genau diesem Wert setzen: 5 = FEEDER|DUPLEX, 13 = zusätzlich FRONT_FIRST. true, wenn der Treiber Duplex übernommen hat.
        static bool SetDuplex(dynamic props, int v)
        {
            SetProp(props, 3088, v); return (GetProp(props, 3088) & 4) != 0;
        }

        public override List<byte[]> Scan(ScanRequest r, Action<byte[]> onPage, CancellationToken ct)
        {
            // Beidseitig: zuerst über TWAIN (manche WIA-Treiber, z. B. Epson DS-730N, lehnen Duplex über WIA grundsätzlich ab)
            var twainTrace = new List<string>();
            if (r.duplex && r.source != "platen")
            {
                var tw = Twain.TryScan(Name, r, onPage, twainTrace, ct);
                if (tw.Count > 0) { Note = ""; LastTrace = string.Join(" | ", twainTrace); Program.Log($"Scan {Name}: {tw.Count} Seite(n) · {LastTrace}"); return tw; }
            }
            List<byte[]> pages = null; Exception err = null;
            var t = new Thread(() =>   // WIA braucht einen STA-Thread
            {
                try
                {
                    dynamic dm = Activator.CreateInstance(Type.GetTypeFromProgID("WIA.DeviceManager"));
                    dynamic info = null;
                    for (int i = 1; i <= (int)dm.DeviceInfos.Count; i++) { dynamic d = dm.DeviceInfos.Item(i); if ((string)d.DeviceID == DeviceId) info = d; }
                    if (info == null) throw new Exception("Scanner nicht mehr erreichbar.");
                    dynamic dev = info.Connect();
                    int caps = GetProp(dev.Properties, 3086);
                    pages = new List<byte[]>();
                    var trace = new List<string>();
                    trace.AddRange(twainTrace);

                    // WIA 2.0 (z. B. Brother): Glas und Einzug sind getrennte Quellen (Items). Ältere Treiber: eine Quelle + Umschalter 3088.
                    dynamic feedItem = null, flatItem = null, firstItem = null;
                    int count = (int)dev.Items.Count;
                    for (int i = 1; i <= count; i++)
                    {
                        dynamic it = dev.Items.Item(i);
                        if (firstItem == null) firstItem = it;
                        string nm = GetPropString(it.Properties, 4098) + " " + GetPropString(it.Properties, 4099);   // Item Name, Full Item Name
                        string cat = GetPropString(it.Properties, 4125).ToUpperInvariant();                          // Item Category (WIA 2.0)
                        trace.Add($"Quelle {i}: {nm.Trim()}");
                        bool isFeed = cat.Contains("FE131934") || System.Text.RegularExpressions.Regex.IsMatch(nm, "feed|adf|einzug|zuf", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                        bool isFlat = cat.Contains("FB607B1F") || System.Text.RegularExpressions.Regex.IsMatch(nm, "flat|glas|platen|vorlagenglas", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                        if (isFeed && feedItem == null) feedItem = it; else if (isFlat && flatItem == null) flatItem = it;
                    }
                    if (flatItem == null && !ReferenceEquals(firstItem, feedItem)) flatItem = firstItem;
                    bool canFeed = feedItem != null || (caps & 1) != 0, canFlat = flatItem != null;

                    // automatisch: erst Einzug, ist er leer, das Glas
                    var modes = new List<bool>();
                    if (r.source == "platen") modes.Add(false); else if (r.source == "feeder") modes.Add(true);
                    else { if (canFeed) modes.Add(true); if (canFlat) modes.Add(false); }
                    if (modes.Count == 0) modes.Add(false);
                    Note = ""; bool stopAll = false;
                    try {
                    foreach (bool feeder in modes)
                    {
                        if (stopAll) break;
                        dynamic item = feeder ? (feedItem ?? firstItem) : flatItem;
                        if (item == null) continue;
                        // Versuche: beidseitig (JPEG, dann Standardformat) → falls der Treiber das nicht kann: einseitig.
                        // Einseitig wird wie in 1.2.0 nichts an der Einzugs-Betriebsart verändert (bewährt mit Brother & Co.).
                        // Item1 = beidseitig, Item2 = JPEG, Item3 = Seitenanzahl je Abruf (WIA_DPS_PAGES)
                        // Item4 = Einzugs-Betriebsart bei beidseitig (5 = beidseitig, 13 = beidseitig + Vorderseite zuerst)
                        var attempts = new List<Tuple<bool, bool, int, int>>();
                        if (feeder && r.duplex)
                            foreach (int mode in new[] { 5, 13 }) foreach (int pg in new[] { 0, 2, 1 })
                            { attempts.Add(Tuple.Create(true, true, pg, mode)); attempts.Add(Tuple.Create(true, false, pg, mode)); }
                        attempts.Add(Tuple.Create(false, true, 1, 1)); attempts.Add(Tuple.Create(false, false, 1, 1));
                        // Einzug einseitig, Treiber meldet trotz Papier „leer“ (Samsung Universal Scan Driver): Umschalter auch an der Quelle, alle Seiten
                        if (feeder && !r.duplex && feedItem == null) { attempts.Add(Tuple.Create(false, true, 0, 2)); attempts.Add(Tuple.Create(false, false, 0, 2)); }
                        bool paperEmptyOnly = true;
                        foreach (var at in attempts)
                        {
                            bool dup = at.Item1, useJpeg = at.Item2; int pagesProp = at.Item3, handling = at.Item4;
                            if (feedItem == null)   // ältere Treiber: Quelle über den Geräte-Umschalter wählen
                            {
                                if (feeder && dup) { if (!SetDuplex(dev.Properties, handling)) { trace.Add($"Betriebsart {handling} abgelehnt"); continue; } }
                                else SetProp(dev.Properties, 3088, feeder ? 1 : 2);
                                if (feeder) SetProp(dev.Properties, 3096, pagesProp);
                                if (feeder && handling == 2) { SetProp(item.Properties, 3088, 1); SetProp(item.Properties, 3096, pagesProp); }
                                if (feeder) trace.Add($"Einzugsstatus {GetProp(dev.Properties, 3087)}");   // WIA_DPS_DOCUMENT_HANDLING_STATUS (1 = Papier bereit)
                            }
                            else if (feeder)
                            {
                                SetProp(item.Properties, 3096, pagesProp);                           // Seiten je Abruf, Schleife bis Einzug leer
                                if (dup) { if (!SetDuplex(item.Properties, handling)) { trace.Add($"Betriebsart {handling} abgelehnt"); continue; } }
                                else if (r.duplex) SetProp(item.Properties, 3088, 1);               // nach misslungenem Duplex-Versuch zurück auf einseitig
                            }
                            SetProp(item.Properties, 6146, r.color == "color" ? 1 : r.color == "bw" ? 4 : 2);
                            SetProp(item.Properties, 6147, r.dpi); SetProp(item.Properties, 6148, r.dpi);
                            trace.Add((feeder ? (feedItem != null ? "Einzug (eigene Quelle)" : "Einzug (Umschalter)") : "Glas") + (dup ? $" beidseitig({handling}) Seiten={pagesProp}" : "") + (useJpeg ? " JPEG" : " BMP"));
                            int busyTries = 0;
                            while (!ct.IsCancellationRequested)
                            {
                                dynamic img;
                                // Achtung: "Falscher Parameter" (E_INVALIDARG) kommt als ArgumentException, nicht als COMException –
                                // darum alle Fehler abfangen und am HRESULT unterscheiden
                                try { img = useJpeg ? item.Transfer(JPEG) : item.Transfer(BMP); }
                                catch (Exception ce)
                                {
                                    if (ce is System.Reflection.TargetInvocationException && ce.InnerException != null) ce = ce.InnerException;
                                    uint hr = (uint)ce.HResult;
                                    trace.Add($"→ 0x{hr:X8}");
                                    if (hr == 0x80210006 && busyTries++ < 10) { Thread.Sleep(1500); continue; }     // beschäftigt
                                    if (hr == 0x80210002) throw new Exception("Papierstau – bitte beheben.");
                                    if (hr != 0x80210003) paperEmptyOnly = false;
                                    if (pages.Count == 0) break;                                                    // nächster Versuch
                                    if (hr == 0x80210003) break;                                                    // Einzug leer → fertig
                                    // Fehler nach den ersten Seiten (z. B. Doppeleinzug, Papierstau): Gescanntes behalten, Bescheid geben
                                    Note = $"Der Scanner hat nach Seite {pages.Count} gestoppt ({ce.Message.Trim()}, 0x{hr:X8}). Die gescannten Seiten sind übernommen – bitte die restlichen Blätter erneut einlegen.";
                                    stopAll = true; break;
                                }
                                byte[] data = ReadImage(img);
                                trace.Add($"Seite {pages.Count + 1}: {data.Length / 1024} KB");
                                pages.Add(data); onPage(data);
                                if (!feeder) break;
                            }
                            if (pages.Count > 0)
                            {
                                if (r.duplex && feeder && !dup && Note == "") Note = "Beidseitig hat der Scanner-Treiber nicht angenommen – es wurden nur die Vorderseiten gescannt.";
                                break;
                            }
                            if (paperEmptyOnly && !dup && !(feeder && !r.duplex && feedItem == null)) break;   // Einzug wirklich leer – weitere Formate bringen nichts
                        }
                        if (pages.Count > 0) break;
                    }
                    } finally { LastTrace = string.Join(" | ", trace); }   // Protokoll auch, wenn etwas schiefgeht
                    Program.Log($"Scan {Name}: {pages.Count} Seite(n) · {LastTrace}");
                    if (pages.Count == 0) throw new Exception("Der Scanner hat keine Seiten geliefert. Liegt Papier im Einzug oder auf dem Glas?");
                }
                catch (Exception e) { err = e; }
            });
            t.SetApartmentState(ApartmentState.STA); t.Start(); t.Join();
            // Einzug über WIA ohne Seiten (Treiber meldet „leer“): mit dem TWAIN-Treiber des Herstellers versuchen
            if ((pages == null || pages.Count == 0) && r.source != "platen" && !r.duplex && !(err?.Message ?? "").Contains("Papierstau"))
            {
                var tt = new List<string>();
                var tw = Twain.TryScan(Name, r, onPage, tt, ct);
                LastTrace = (LastTrace ?? "") + " | " + string.Join(" | ", tt);
                Program.Log($"Scan {Name} (TWAIN-Rückfall): {tw.Count} Seite(n) · {string.Join(" | ", tt)}");
                if (tw.Count > 0) { Note = ""; return tw; }
            }
            if (err != null) throw err;
            return pages;
        }

        static string GetPropString(dynamic props, int id)
        {
            try { foreach (dynamic p in props) if ((int)p.PropertyID == id) return Convert.ToString(p.Value) ?? ""; } catch { }
            return "";
        }

        // Bild über eine temporäre Datei abholen – funktioniert mit jedem Treiber (FileData/BinaryData ist per IDispatch nicht zuverlässig)
        static byte[] ReadImage(dynamic img)
        {
            string ext = "img"; try { ext = ((string)img.FileExtension).Trim('.'); } catch { }
            string tmp = Path.Combine(Path.GetTempPath(), "pdfmy-scan-" + Guid.NewGuid().ToString("N") + "." + ext);
            try
            {
                img.SaveFile(tmp);
                byte[] data = File.ReadAllBytes(tmp);
                bool isJpeg = data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8;
                return isJpeg ? data : ToJpeg(data);
            }
            finally { try { File.Delete(tmp); } catch { } }
        }

        static byte[] ToJpeg(byte[] data)
        {
            using (var ms = new MemoryStream(data)) using (var bmp = Image.FromStream(ms)) using (var o = new MemoryStream())
            { bmp.Save(o, ImageFormat.Jpeg); return o.ToArray(); }
        }
    }

    // ---------------- Scanner suchen ----------------
    class ScannerHub
    {
        readonly object gate = new object();
        List<ScanDevice> devices = new List<ScanDevice>();
        public bool Searching { get; private set; }
        public event Action Changed;
        public List<ScanDevice> Devices { get { lock (gate) return devices.ToList(); } }
        readonly string cfg = Path.Combine(Program.DataDir, "geraete.txt");   // manuell hinzugefügte Adressen
        Task running;

        public Task RefreshAsync()
        {
            lock (gate) { if (running != null && !running.IsCompleted) return running; running = Task.Run(SearchAsync); return running; }
        }

        async Task SearchAsync()
        {
            Searching = true; Changed?.Invoke();
            try { LastWoken = Wake(); if (LastWoken > 0) await Task.Delay(2500); } catch (Exception e) { Program.Log("Wecken: " + e.Message); }   // schlafende Geräte zuerst wecken
            var found = new ConcurrentDictionary<string, ScanDevice>();
            var diag = new ConcurrentQueue<string>();   // was die Suche versucht hat – fürs Protokoll
            try
            {
                var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var md = Mdns.Discover(1800); foreach (var u in md) urls.Add(u);   // Bonjour/mDNS: _uscan._tcp, über jede Netzwerkkarte
                diag.Enqueue($"Bonjour: {md.Count}");
                foreach (var u in ManualUrls()) urls.Add(u);
                var probes = urls.Select(async u => { var d = await EsclDevice.ProbeAsync(u); if (d != null) found[d.BaseUrl] = d; }).ToList();
                // WSD (z. B. Epson, Dell, Brother): WS-Discovery über jede Netzwerkkarte, dazu von Hand hinzugefügte WSD-Geräte
                probes.Add(Task.Run(() =>
                {
                    var ms = WsdDevice.Discover(null, 2500);
                    var manual = ManualWsdHosts().SelectMany(h => { try { return Dns.GetHostAddresses(h); } catch { return new IPAddress[0]; } }).ToList();
                    if (manual.Count > 0) ms.AddRange(WsdDevice.Discover(manual, 2000));
                    int ok = 0;
                    Parallel.ForEach(ms.GroupBy(m => m.Key).Select(g => g.First()), m => { var d = WsdDevice.Probe(m.Key, m.Value); if (d != null) { found[d.Id] = d; Interlocked.Increment(ref ok); } });
                    diag.Enqueue($"WSD: {ms.Count} Antwort(en), {ok} Scanner");
                }));
                probes.Add(SubnetScanAsync(found, diag));                        // Ergänzung: Netz absuchen (Port 80/443: eSCL, sonst WSD direkt)
                var wia = Task.Run(() =>
                {
                    var t = new Thread(() => { try { foreach (var d in WiaDevice.Enumerate()) found[d.Id] = d; } catch (Exception e) { Program.Log("WIA: " + e.Message); } });
                    t.SetApartmentState(ApartmentState.STA); t.IsBackground = true; t.Start();
                    if (!t.Join(15000)) Program.Log("WIA antwortet nicht (Zeitlimit)");
                    diag.Enqueue("Windows-Scanner (WIA): " + found.Values.Count(d => d.Kind == "wia"));
                });
                probes.Add(wia);
                await Task.WhenAll(probes);
            }
            catch (Exception e) { Program.Log("Suche: " + e); }
            // Dasselbe Gerät per eSCL und WSD? eSCL bevorzugen (schneller); WIA zuletzt
            var esclHosts = new HashSet<string>(found.Values.OfType<EsclDevice>().Select(d => HostOf(d.BaseUrl)), StringComparer.OrdinalIgnoreCase);
            var seenUuid = new HashSet<string>();
            var list = found.Values.Where(d => !(d is WsdDevice w && esclHosts.Contains(HostOf(w.Svc))))
                .OrderBy(d => d is EsclDevice e0 && e0.BaseUrl.StartsWith("http://[") ? 1 : 0)   // bei Doppelten IPv4/Name vor IPv6
                .Where(d => !(d is EsclDevice e && !string.IsNullOrEmpty(e.Uuid) && !seenUuid.Add(e.Uuid)))
                .OrderBy(d => d.Kind == "escl" ? 0 : d.Kind == "wsd" ? 1 : 2).ThenBy(d => d.Name).ToList();
            lock (gate) devices = list;
            Searching = false; Changed?.Invoke();
            try { var hs = list.Select(DeviceHost).Where(h => !string.IsNullOrEmpty(h)).Distinct().ToList(); if (hs.Count > 0) File.WriteAllLines(known, hs); } catch { }   // fürs Wecken nach einem Neustart
            Program.Log($"Suche fertig: {list.Count} Gerät(e) – " + string.Join("; ", list.Select(d => $"{d.Name} ({d.Kind})")));
            if (list.Count == 0) Program.Log("Suche: " + string.Join(" · ", diag) + " · Netzwerk: " + Net.Describe());
            else Program.Log("Suche: " + string.Join(" · ", diag));
        }

        static string HostOf(string url) { try { return new Uri(url).Host; } catch { return url; } }

        // ---- Schlafende Geräte wecken: viele Drucker/MFP antworten im Tiefschlaf nicht auf den WSD-Rundruf, wachen aber auf,
        // sobald ihre Adresse direkt angesprochen wird. Kurze Verbindungsversuche (Web, IPP, RAW-Druck, WSD) und – wenn die
        // Hardware-Adresse bekannt ist – ein Wake-on-LAN-Paket. Ziel: zuletzt gefundene und von Hand hinzugefügte Geräte.
        readonly string known = Path.Combine(Program.DataDir, "geraete-zuletzt.txt");
        static string DeviceHost(ScanDevice d) => d is EsclDevice e ? HostOf(e.BaseUrl) : d is WsdDevice w ? HostOf(w.Svc) : null;
        [DllImport("iphlpapi.dll")] static extern int SendARP(int destIp, int srcIp, byte[] mac, ref int len);
        public int LastWoken;
        public int Wake()
        {
            var hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var d in Devices) { var h = DeviceHost(d); if (!string.IsNullOrEmpty(h)) hosts.Add(h); }
            try { if (File.Exists(known)) foreach (var h in File.ReadAllLines(known)) if (h.Trim().Length > 0) hosts.Add(h.Trim()); } catch { }
            foreach (var u in ManualUrls()) hosts.Add(HostOf(u));
            foreach (var h in ManualWsdHosts()) hosts.Add(h);
            hosts.RemoveWhere(h => string.IsNullOrEmpty(h) || h == "localhost" || h == "127.0.0.1");
            if (hosts.Count == 0) return 0;
            Parallel.ForEach(hosts, WakeHost);
            Program.Log($"Wecken: {hosts.Count} Gerät(e) angesprochen ({string.Join(", ", hosts)})");
            return hosts.Count;
        }
        static void WakeHost(string host)
        {
            IPAddress ip;
            try { ip = Dns.GetHostAddresses(host.Trim('[', ']')).OrderBy(a => a.AddressFamily == AddressFamily.InterNetwork ? 0 : 1).FirstOrDefault(); } catch { return; }
            if (ip == null) return;
            foreach (int port in new[] { 80, 443, 631, 9100, 5357, 8080 })
                try { using (var c = new TcpClient(ip.AddressFamily)) c.ConnectAsync(ip, port).Wait(400); } catch { }
            if (ip.AddressFamily != AddressFamily.InterNetwork) return;
            try
            {
                var mac = new byte[6]; int len = 6;
                if (SendARP(BitConverter.ToInt32(ip.GetAddressBytes(), 0), 0, mac, ref len) != 0 || len != 6 || mac.All(b => b == 0)) return;
                var pkt = new byte[102]; for (int i = 0; i < 6; i++) pkt[i] = 0xFF; for (int i = 1; i <= 16; i++) Array.Copy(mac, 0, pkt, i * 6, 6);
                using (var u = new UdpClient()) { u.EnableBroadcast = true; u.Send(pkt, pkt.Length, new IPEndPoint(IPAddress.Broadcast, 9)); u.Send(pkt, pkt.Length, new IPEndPoint(ip, 9)); }
            }
            catch { }
        }

        static async Task SubnetScanAsync(ConcurrentDictionary<string, ScanDevice> found, ConcurrentQueue<string> diag)
        {
            var targets = new List<string>();
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                {
                    if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    var b = ua.Address.GetAddressBytes();
                    bool priv = b[0] == 10 || (b[0] == 192 && b[1] == 168) || (b[0] == 172 && b[1] >= 16 && b[1] <= 31);
                    if (!priv) continue;
                    for (int i = 1; i < 255; i++) targets.Add($"{b[0]}.{b[1]}.{b[2]}.{i}");
                }
            }
            // Web (80/443) und Druckerports (IPP 631, WSD 5357, RAW 9100): so werden auch Geräte gefunden, die nur per WSD scannen
            var open = new ConcurrentDictionary<string, int>();   // IP → 1 = Port 80, 2 = Port 443, 4 = Druckerport
            await Task.WhenAll(targets.Distinct().SelectMany(ip => new[] { 80, 443, 631, 5357, 9100 }.Select(async port =>
            {
                using (var c = new TcpClient())
                {
                    try
                    {
                        var t = c.ConnectAsync(ip, port);
                        if (await Task.WhenAny(t, Task.Delay(700)) == t && c.Connected) { int bit = port == 80 ? 1 : port == 443 ? 2 : 4; open.AddOrUpdate(ip, bit, (k, v) => v | bit); }
                        _ = t.ContinueWith(x => { var _e = x.Exception; }, TaskContinuationOptions.OnlyOnFaulted);   // Fehler (abgelehnt) bewusst ignorieren
                    }
                    catch { }
                }
            })));
            int escl = 0;
            var rest = new ConcurrentBag<IPAddress>();
            await Task.WhenAll(open.Select(async kv =>
            {
                string ip = kv.Key;
                if (found.Values.Any(d => (d is EsclDevice e && HostOf(e.BaseUrl) == ip) || (d is WsdDevice w && HostOf(w.Svc) == ip))) return;
                var d = (kv.Value & 3) == 0 ? null : await EsclDevice.ProbeAsync($"http://{ip}/eSCL") ?? ((kv.Value & 2) != 0 ? await EsclDevice.ProbeAsync($"https://{ip}/eSCL") : null);
                if (d != null) { found[d.BaseUrl] = d; Interlocked.Increment(ref escl); }
                else if (IPAddress.TryParse(ip, out var a)) rest.Add(a);
            }));
            // Geräte ohne eSCL (Weboberfläche oder Druckerport): direkt per WSD fragen (falls Multicast im Netz gesperrt ist)
            int wsd = 0;
            if (rest.Count > 0)
            {
                var ms = WsdDevice.Discover(rest, 2000);
                foreach (var m in ms) { if (found.Values.OfType<WsdDevice>().Any(w => HostOf(w.Svc) == HostOf(m.Value))) continue; var d = WsdDevice.Probe(m.Key, m.Value); if (d != null) { found[d.Id] = d; wsd++; } }
            }
            diag.Enqueue($"Netzsuche: {targets.Distinct().Count()} Adressen, {open.Count} Geräte (Web/Druckerports), {escl} eSCL, {wsd} WSD");
        }

        IEnumerable<string> ManualUrls()
        {
            if (!File.Exists(cfg)) yield break;
            foreach (var l in File.ReadAllLines(cfg)) if (!string.IsNullOrWhiteSpace(l) && !l.StartsWith("wsd:")) yield return l.Trim();
        }
        IEnumerable<string> ManualWsdHosts()
        {
            if (!File.Exists(cfg)) yield break;
            foreach (var l in File.ReadAllLines(cfg)) if (l.StartsWith("wsd:")) yield return l.Substring(4).Trim();
        }

        // Gerät per IP-Adresse hinzufügen (http, dann https; Pfad /eSCL)
        public async Task<ScanDevice> AddAsync(string ip)
        {
            ip = ip.Trim();
            Task r; lock (gate) r = running;
            if (r != null) await r;   // laufende Suche abwarten, sonst überschreibt sie das neue Gerät
            // IPv4, Gerätename (z. B. EPSON2CBBCB) oder IPv6 – IPv6 in URLs in eckigen Klammern, Zone wie fe80::1%12
            string h = ip, port = null;
            var m6 = System.Text.RegularExpressions.Regex.Match(ip, @"^\[([^\]]+)\](?::(\d+))?$");           // [IPv6] oder [IPv6]:Port
            var m4 = System.Text.RegularExpressions.Regex.Match(ip, @"^([^:\[\]]+):(\d+)$");                  // IPv4/Name:Port
            if (m6.Success) { h = m6.Groups[1].Value; if (m6.Groups[2].Success) port = m6.Groups[2].Value; }
            else if (m4.Success) { h = m4.Groups[1].Value; port = m4.Groups[2].Value; }
            if (h.Contains(":")) h = "[" + h.Replace("%25", "%") + "]";
            var hp = port != null ? $"{h}:{port}" : h;
            var tries = ip.StartsWith("http") ? new[] { ip.TrimEnd('/') } : (port != null ? new[] { $"http://{hp}/eSCL", $"https://{hp}/eSCL" } : new[] { $"http://{hp}/eSCL", $"https://{hp}/eSCL", $"http://{h}:8080/eSCL" });   // mit Port: nur diesen Port prüfen
            foreach (var u in tries)
            {
                var d = await EsclDevice.ProbeAsync(u, 4000);
                if (d == null) continue;
                File.AppendAllLines(cfg, new[] { d.BaseUrl });
                lock (gate) { devices.RemoveAll(x => x.Id == d.Id); devices.Insert(0, d); }
                Changed?.Invoke();
                return d;
            }
            // Kein eSCL: per WSD direkt fragen (z. B. Epson, Dell E525w)
            if (!ip.StartsWith("http"))
            {
                var host = h.Trim('[', ']');
                IPAddress[] addrs; try { addrs = IPAddress.TryParse(host, out var a) ? new[] { a } : await Dns.GetHostAddressesAsync(host); } catch { addrs = new IPAddress[0]; }
                foreach (var m in await Task.Run(() => WsdDevice.Discover(addrs, 2500)))
                {
                    var d = await Task.Run(() => WsdDevice.Probe(m.Key, m.Value));
                    if (d == null) continue;
                    File.AppendAllLines(cfg, new[] { "wsd:" + host });
                    lock (gate) { devices.RemoveAll(x => x.Id == d.Id); devices.Insert(0, d); }
                    Changed?.Invoke();
                    Program.Log($"Hinzugefügt (WSD): {ip} → {d.Name}");
                    return d;
                }
            }
            Program.Log($"Hinzufügen: unter {ip} antwortet kein Scanner (eSCL: {string.Join(", ", tries)}; WSD)");
            return null;
        }

        public ScanDevice Find(string id) { lock (gate) return devices.FirstOrDefault(d => d.Id == id) ?? devices.FirstOrDefault(); }
    }

    // ---------------- mDNS (Bonjour): Netzwerkscanner melden sich als _uscan._tcp ----------------
    static class Mdns
    {
        public static List<string> Discover(int waitMs)
        {
            var urls = new List<string>();
            try
            {
                {
                    // über jede Netzwerkkarte einzeln fragen (VPN, Hyper-V, WLAN+LAN), Antworten per Unicast
                    var replies = Net.Ask(new[] { Query("_uscan._tcp.local"), Query("_uscans._tcp.local") }, IPAddress.Parse("224.0.0.251"), 5353, null, waitMs);
                    var srv = new Dictionary<string, (string host, int port, bool tls)>();
                    var addr = new Dictionary<string, string>(); var rs = new Dictionary<string, string>();
                    foreach (var rp in replies) { try { Parse(rp.Value, srv, addr, rs); } catch { } }
                    foreach (var kv in srv)
                    {
                        string ip = addr.TryGetValue(kv.Value.host, out var a) ? a : null;
                        if (ip == null) continue;
                        string path = rs.TryGetValue(kv.Key, out var r) ? r.Trim('/') : "eSCL";
                        urls.Add($"{(kv.Value.tls ? "https" : "http")}://{ip}:{kv.Value.port}/{path}");
                    }
                }
            }
            catch (Exception e) { Program.Log("mDNS: " + e.Message); }
            return urls;
        }

        static byte[] Query(string name)
        {
            var ms = new MemoryStream();
            ms.Write(new byte[] { 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0 }, 0, 12);
            foreach (var label in name.Split('.')) { var b = Encoding.ASCII.GetBytes(label); ms.WriteByte((byte)b.Length); ms.Write(b, 0, b.Length); }
            ms.WriteByte(0);
            ms.Write(new byte[] { 0, 12, 0x80, 1 }, 0, 4);   // PTR, Klasse IN, Antwort per Unicast erbeten
            return ms.ToArray();
        }

        static string ReadName(byte[] b, ref int p)
        {
            var parts = new List<string>(); int jumps = 0, ret = -1;
            while (true)
            {
                int len = b[p];
                if (len == 0) { p++; break; }
                if ((len & 0xC0) == 0xC0) { int off = ((len & 0x3F) << 8) | b[p + 1]; if (ret < 0) ret = p + 2; p = off; if (++jumps > 20) break; continue; }
                parts.Add(Encoding.UTF8.GetString(b, p + 1, len)); p += len + 1;
            }
            if (ret >= 0) p = ret;
            return string.Join(".", parts).ToLowerInvariant();
        }

        static void Parse(byte[] b, Dictionary<string, (string, int, bool)> srv, Dictionary<string, string> addr, Dictionary<string, string> rs)
        {
            int qd = (b[4] << 8) | b[5], an = (b[6] << 8) | b[7], ns = (b[8] << 8) | b[9], ar = (b[10] << 8) | b[11];
            int p = 12;
            for (int i = 0; i < qd; i++) { ReadName(b, ref p); p += 4; }
            for (int i = 0; i < an + ns + ar; i++)
            {
                string name = ReadName(b, ref p);
                int type = (b[p] << 8) | b[p + 1]; int rdlen = (b[p + 8] << 8) | b[p + 9]; p += 10;
                int start = p;
                if (type == 33) { int port = (b[p + 4] << 8) | b[p + 5]; int q = p + 6; srv[name] = (ReadName(b, ref q), port, name.Contains("_uscans.")); }
                else if (type == 1 && rdlen == 4) addr[name] = $"{b[p]}.{b[p + 1]}.{b[p + 2]}.{b[p + 3]}";
                else if (type == 16)
                {
                    int q = p;
                    while (q < start + rdlen) { int l = b[q]; var s = Encoding.UTF8.GetString(b, q + 1, l); if (s.StartsWith("rs=", StringComparison.OrdinalIgnoreCase)) rs[name] = s.Substring(3); q += l + 1; }
                }
                p = start + rdlen;
            }
        }
    }

    // ---------------- Lokale Schnittstelle für pdfmy (nur 127.0.0.1) ----------------
    class ScanJob { public string Id; public string State = "running"; public string Error; public string Mime = "image/jpeg"; public List<byte[]> Pages = new List<byte[]>(); public DateTime Created = DateTime.UtcNow; public ScanDevice Device; }

    // ---------------- PDFs per Doppelklick in PDFMy öffnen ----------------
    // Windows ruft "pdfmy-Scan.exe --open <Datei>" auf. Die Datei bekommt ein Einmal-Kennwort (5 Minuten gültig);
    // PDFMy im Browser holt sie damit über 127.0.0.1 ab. Die Datei verlässt den Rechner nicht.
    // Zeitstempeldienste (RFC 3161), an die /tsa weiterleiten darf – gleiche Liste in js/pdfsign.js und pdfmy-scan.pl
    static class Tsa
    {
        static readonly string[] Hosts = { "timestamp.digicert.com", "timestamp.sectigo.com", "zeitstempel.dfn.de", "freetsa.org", "timestamp.globalsign.com", "ts.ssl.com", "timestamp.entrust.net", "timestamp.identrust.com", "tsa.swisssign.net" };
        public static bool Allowed(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || (u.Scheme != "http" && u.Scheme != "https") || !u.IsDefaultPort) return false;
            return Hosts.Contains(u.Host.ToLowerInvariant());
        }
    }
    static class FileOpen
    {
        static readonly ConcurrentDictionary<string, KeyValuePair<string, DateTime>> tokens = new ConcurrentDictionary<string, KeyValuePair<string, DateTime>>();
        static readonly string appFile = Path.Combine(Program.DataDir, "app.txt");
        static string appUrl;
        // Adresse der zuletzt genutzten PDFMy-Version (pdfmy.de oder pdfmy.de/mentor/) – dorthin öffnen wir Dateien
        public static string AppUrl
        {
            get
            {
                if (appUrl == null) { try { appUrl = File.Exists(appFile) ? File.ReadAllText(appFile).Trim() : null; } catch { } }
                return string.IsNullOrEmpty(appUrl) ? "https://pdfmy.de/" : appUrl;
            }
        }
        public static void Remember(string path)
        {
            int i = path.IndexOf("app=", StringComparison.Ordinal); if (i < 0) return;
            string u = Uri.UnescapeDataString(path.Substring(i + 4).Split('&')[0]);
            if (!Uri.TryCreate(u, UriKind.Absolute, out var uri)) return;
            string origin = uri.GetLeftPart(UriPartial.Authority);
            if (!LocalServer.IsAllowed(origin) || u == AppUrl) return;
            appUrl = origin + uri.AbsolutePath;
            try { File.WriteAllText(appFile, appUrl); } catch { }
        }
        // Läuft pdfmy Scan schon? Dann die Datei dorthin weitergeben
        public static bool HandOver(string file)
        {
            try
            {
                int port = Program.RunningPort(); if (port == 0) return false;   // läuft nur beim anderen Benutzer → selbst starten
                using (var h = new HttpClient { Timeout = TimeSpan.FromSeconds(4) })
                {
                    var req = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}/open-local")
                    { Content = new StringContent(new JavaScriptSerializer().Serialize(new { path = Path.GetFullPath(file) }), Encoding.UTF8, "application/json") };
                    req.Headers.Add("X-Pdfmy", "1");
                    return h.SendAsync(req).Result.IsSuccessStatusCode;
                }
            }
            catch { return false; }
        }
        public static void Open(string file)
        {
            try
            {
                file = Path.GetFullPath(file);
                if (!File.Exists(file)) { Program.Log("Öffnen: Datei nicht gefunden: " + file); return; }
                file = Secure(file);
                if (Environment.GetEnvironmentVariable("PDFMY_TEST_NOBROWSER") != "1" && OpenInApp(file)) return;   // installierte PDFMy-App (Chrome/Edge): eigenes Fenster
                var b = new byte[16]; using (var rng = System.Security.Cryptography.RandomNumberGenerator.Create()) rng.GetBytes(b);
                string tok = BitConverter.ToString(b).Replace("-", "").ToLowerInvariant();
                foreach (var old in tokens.Where(t => t.Value.Value < DateTime.UtcNow.AddMinutes(-5)).ToList()) tokens.TryRemove(old.Key, out _);
                tokens[tok] = new KeyValuePair<string, DateTime>(file, DateTime.UtcNow);
                Program.Log("Öffnen: " + Path.GetFileName(file));
                string url = AppUrl + "#open=" + tok;   // Kennwort im #-Teil: wird nie an den Server gesendet
                if (Environment.GetEnvironmentVariable("PDFMY_TEST_NOBROWSER") == "1") { File.WriteAllText(Path.Combine(Program.DataDir, "test-open.txt"), url); return; }
                Process.Start(url);
            }
            catch (Exception e) { Program.Log("Öffnen: " + e.Message); }
        }
        // Anhänge aus Outlook (klassisch: INetCache\Content.Outlook, neues Outlook: Olk bzw. Paket-Ordner) und Temp-Dateien:
        // sofort eine Kopie im eigenen Ordner – Outlook entfernt oder sperrt die Datei wieder, bevor PDFMy sie liest.
        static readonly string copies = Path.Combine(Program.DataDir, "open-copies");
        static bool IsVolatile(string file)
        {
            string f = file.ToLowerInvariant();
            return f.Contains(@"\inetcache\") || f.Contains(@"\content.outlook\") || f.Contains(@"\microsoft\olk\") || f.Contains(@"\microsoft.outlookforwindows_") || f.StartsWith(Path.GetTempPath().ToLowerInvariant());
        }
        static string Secure(string file)
        {
            if (!IsVolatile(file) || file.StartsWith(copies, StringComparison.OrdinalIgnoreCase)) return file;
            try
            {
                Directory.CreateDirectory(copies);
                foreach (var old in Directory.GetDirectories(copies)) try { if (Directory.GetLastWriteTimeUtc(old) < DateTime.UtcNow.AddDays(-1)) Directory.Delete(old, true); } catch { }
                string dir = Path.Combine(copies, DateTime.UtcNow.Ticks.ToString()); Directory.CreateDirectory(dir);   // eigener Unterordner: Dateiname bleibt gleich
                string dst = Path.Combine(dir, Path.GetFileName(file));
                File.Copy(file, dst, true);
                Program.Log("Kopie für PDFMy: " + dst);
                return dst;
            }
            catch (Exception e) { Program.Log("Kopie nicht möglich: " + e.Message); return file; }
        }
        // PDFMy (Browser-App) konnte eine übergebene Datei nicht lesen: frisch abgelegte Datei gleichen Namens in den
        // Anhang-Ordnern suchen (eigene Kopien, Outlook klassisch und neu, Temp) – nur PDF/Bilder, höchstens 30 Minuten alt.
        public static string FindRecent(string name)
        {
            name = Path.GetFileName(name ?? "");
            // Keine Platzhalter: „*.pdf“ hätte sonst die neueste PDF aus Outlook/Temp/Downloads geliefert (Sicherheitsprüfung 25.10.2026)
            if (name.IndexOfAny(new[] { '*', '?' }) >= 0) return null;
            if (name.Length == 0 || !System.Text.RegularExpressions.Regex.IsMatch(name, @"\.(pdf|jpe?g|png|tiff?|webp|bmp)$", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return null;
            string la = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            // [Ordner, Suchtiefe] – nur dort, wo Outlook Anhänge zum Öffnen ablegt; höchstens 8 Sekunden suchen
            // INetCache: klassisches Outlook (Content.Outlook) und Internet-Cache (IE\…\name[n].pdf – Outlook im Web-Modus, Webmail);
            // Olk/Paket: neues Outlook; zuletzt Temp und Downloads (nur Dateien der letzten 30 Minuten mit genau diesem Namen)
            var roots = new List<KeyValuePair<string, int>> { new KeyValuePair<string, int>(copies, 2), new KeyValuePair<string, int>(Path.Combine(la, @"Microsoft\Windows\INetCache"), 4),
                new KeyValuePair<string, int>(Path.Combine(la, @"Microsoft\Olk"), 6), new KeyValuePair<string, int>(Path.Combine(la, @"Microsoft\Windows\Temporary Internet Files"), 4) };
            try { foreach (var d in Directory.GetDirectories(Path.Combine(la, "Packages"), "Microsoft.OutlookForWindows_*")) roots.Add(new KeyValuePair<string, int>(d, 7)); } catch { }
            roots.Add(new KeyValuePair<string, int>(Path.GetTempPath(), 3));
            try { roots.Add(new KeyValuePair<string, int>(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"), 1)); } catch { }
            DateTime cutoff = DateTime.UtcNow.AddMinutes(-30), stop = DateTime.UtcNow.AddSeconds(8); FileInfo best = null;
            void Walk(string dir, int left)
            {
                if (DateTime.UtcNow > stop) return;
                try { foreach (var f in Directory.GetFiles(dir, name)) { if (!string.Equals(Path.GetFileName(f), name, StringComparison.OrdinalIgnoreCase)) continue; var fi = new FileInfo(f); if (fi.LastWriteTimeUtc >= cutoff && fi.Length > 0 && (best == null || fi.LastWriteTimeUtc > best.LastWriteTimeUtc)) best = fi; } } catch { }
                if (left > 0) try { foreach (var d in Directory.GetDirectories(dir)) Walk(d, left - 1); } catch { }
            }
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var searched = new List<string>();
            foreach (var r in roots) { if (seen.Add(r.Key) && Directory.Exists(r.Key)) { Walk(r.Key, r.Value); searched.Add(r.Key); } if (best != null) break; }   // erster Treffer genügt
            if (best != null) Program.Log("Anhang für PDFMy nachgereicht: " + best.FullName);
            else Program.Log($"Anhang nicht gefunden: {name} – gesucht in {string.Join("; ", searched)}{(DateTime.UtcNow > stop ? " (Zeitgrenze erreicht)" : "")}");   // fürs Protokoll / „Problem melden“
            return best?.FullName;
        }
        // Ist PDFMy als App in Chrome oder Edge installiert, hat der Browser dafür eine Dateizuordnung angelegt
        // („Öffnen mit“ → PDFMy, Befehl mit --app-id). Dieselbe Zeile starten – die Datei öffnet sich im App-Fenster wie beim Doppelklick dort.
        public static string AppCommand()
        {
            try
            {
                    foreach (var id in FileAssoc.BrowserAppProgIds())
                    {
                        using (var app = Registry.CurrentUser.OpenSubKey(@"Software\Classes\" + id + @"\Application"))
                        using (var c = Registry.CurrentUser.OpenSubKey(@"Software\Classes\" + id + @"\shell\open\command"))
                        {
                            string name = app?.GetValue("ApplicationName") as string, cmd = c?.GetValue("") as string;
                            if (name != "PDFMy" || cmd == null || !cmd.Contains("--app-id=") || !cmd.StartsWith("\"")) continue;
                            int q = cmd.IndexOf('"', 1); if (q < 0 || !File.Exists(cmd.Substring(1, q - 1))) continue;
                            return cmd;
                        }
                    }
            }
            catch (Exception e) { Program.Log("App suchen: " + e.Message); }
            return null;
        }
        static bool OpenInApp(string file)
        {
            string cmd = AppCommand(); if (cmd == null) return false;
            try
            {
                int q = cmd.IndexOf('"', 1);
                string exe = cmd.Substring(1, q - 1), args = cmd.Substring(q + 1).Trim().Replace("%1", file);   // nach --single-argument nimmt der Browser den Rest unverändert
                Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false });
                Program.Log("Öffnen in der PDFMy-App: " + Path.GetFileName(file));
                return true;
            }
            catch (Exception e) { Program.Log("App starten: " + e.Message); return false; }
        }
        public static byte[] Take(string tok, out string name, out string err)
        {
            name = null; err = "Die Datei ist nicht mehr verfügbar. Bitte noch einmal doppelt anklicken.";
            if (!tokens.TryRemove(tok, out var e) || e.Value < DateTime.UtcNow.AddMinutes(-5)) return null;
            try
            {
                var fi = new FileInfo(e.Key);
                if (fi.Length > 300L * 1024 * 1024) { err = "Die Datei ist zu groß (über 300 MB)."; return null; }
                name = fi.Name; return File.ReadAllBytes(fi.FullName);   // OneDrive-Platzhalter werden dabei heruntergeladen
            }
            catch (Exception x) { err = "Die Datei konnte nicht gelesen werden: " + x.Message; return null; }
        }
    }

    // ---------------- Signieren mit Windows-Zertifikaten (auch Signaturkarte, PIN fragt Windows) ----------------
    static class WinSign
    {
        const string OidSigningCertV2 = "1.2.840.113549.1.9.16.2.47";
        // --- kleines DER-Werkzeug (.NET Framework 4.8 hat keine ESS-/ASN.1-Klassen) ---
        static byte[] Tlv(byte tag, params byte[][] parts)
        {
            int n = parts.Sum(x => x.Length); var o = new List<byte> { tag };
            if (n < 0x80) o.Add((byte)n);
            else { var len = new List<byte>(); for (int v = n; v > 0; v >>= 8) len.Insert(0, (byte)v); o.Add((byte)(0x80 | len.Count)); o.AddRange(len); }
            foreach (var x in parts) o.AddRange(x);
            return o.ToArray();
        }
        // Liest ein TLV ab pos: Gesamtlänge (Kopf + Inhalt) und Inhaltsbeginn
        static (int start, int total) ReadTlv(byte[] d, int pos)
        {
            int l = d[pos + 1], h = 2;
            if (l >= 0x80) { int k = l & 0x7f; l = 0; for (int i = 0; i < k; i++) l = (l << 8) | d[pos + 2 + i]; h += k; }
            return (pos + h, h + l);
        }
        static byte[] Slice(byte[] d, int pos, int len) { var r = new byte[len]; Buffer.BlockCopy(d, pos, r, 0, len); return r; }
        /* SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }   (RFC 5035)
           ESSCertIDv2 ::= SEQUENCE { certHash OCTET STRING (SHA-256, Standard-Algorithmus entfällt), issuerSerial IssuerSerial }
           IssuerSerial ::= SEQUENCE { issuer GeneralNames ([4] directoryName), serialNumber INTEGER } – Aussteller und Nummer
           bytegenau aus dem Zertifikat (wie issuerAndSerial in js/pdfsign.js) */
        internal static byte[] SigningCertV2(byte[] certDer)
        {
            var cert = ReadTlv(certDer, 0); var tbs = ReadTlv(certDer, cert.start); int p = tbs.start;
            if (certDer[p] == 0xA0) p += ReadTlv(certDer, p).total;            // [0] version
            var serial = ReadTlv(certDer, p); byte[] serialDer = Slice(certDer, p, serial.total); p += serial.total;
            p += ReadTlv(certDer, p).total;                                     // signature-Algorithmus
            var issuer = ReadTlv(certDer, p); byte[] issuerDer = Slice(certDer, p, issuer.total);
            byte[] hash; using (var sha = SHA256.Create()) hash = sha.ComputeHash(certDer);
            var issuerSerial = Tlv(0x30, Tlv(0x30, Tlv(0xA4, issuerDer)), serialDer);
            return Tlv(0x30, Tlv(0x30, Tlv(0x30, Tlv(0x04, hash), issuerSerial)));
        }
        static X509Certificate2Collection Mine()
        {
            using (var st = new X509Store(StoreName.My, StoreLocation.CurrentUser)) { st.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly); return st.Certificates; }
        }
        // Zertifikate mit privatem Schlüssel, gültig, für Signaturen geeignet
        public static List<object> List()
        {
            var list = new List<object>();
            foreach (var c in Mine())
            {
                try
                {
                    if (!c.HasPrivateKey || DateTime.Now > c.NotAfter || DateTime.Now < c.NotBefore) continue;
                    var ku = c.Extensions.OfType<X509KeyUsageExtension>().FirstOrDefault();
                    if (ku != null && (ku.KeyUsages & (X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.NonRepudiation)) == 0) continue;
                    var eku = c.Extensions.OfType<X509EnhancedKeyUsageExtension>().FirstOrDefault();
                    // Mit Verwendungszweck: nur Dokument-/E-Mail-Signatur oder „beliebig“ (keine reinen Anmelde-/Server-Zertifikate, z. B. Microsoft-365-Geräteanmeldung)
                    string[] signEku = { "1.3.6.1.4.1.311.10.3.12", "1.3.6.1.5.5.7.3.4", "1.3.6.1.5.5.7.3.36", "1.2.840.113583.1.1.5", "2.5.29.37.0" };
                    if (eku != null && eku.EnhancedKeyUsages.Count > 0 && !eku.EnhancedKeyUsages.Cast<Oid>().Any(x => signEku.Contains(x.Value))) continue;
                    if (c.Issuer.IndexOf("login.windows.net", StringComparison.OrdinalIgnoreCase) >= 0 || c.Issuer.IndexOf("MS-Organization", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                    bool qualified = c.Extensions.Cast<X509Extension>().Any(e => e.Oid.Value == "1.3.6.1.5.5.7.1.3");   // QC-Statement (eIDAS)
                    list.Add(new { thumb = c.Thumbprint, name = c.GetNameInfo(X509NameType.SimpleName, false), issuer = c.GetNameInfo(X509NameType.SimpleName, true), notAfter = c.NotAfter.ToString("yyyy-MM-dd"), qualified });
                }
                catch { }
            }
            return list;
        }
        public static byte[] Sign(string thumb, byte[] data, string docName)
        {
            var cert = Mine().Find(X509FindType.FindByThumbprint, thumb, false).OfType<X509Certificate2>().FirstOrDefault();
            if (cert == null) throw new Exception("Zertifikat nicht gefunden.");
            byte[] result = null; Exception err = null;
            // Rückfrage und PIN-Abfrage brauchen einen STA-Thread mit Fenster
            var t = new Thread(() =>
            {
                try
                {
                    string who = cert.GetNameInfo(X509NameType.SimpleName, false), by = cert.GetNameInfo(X509NameType.SimpleName, true);
                    bool ok = Environment.GetEnvironmentVariable("PDFMY_TEST_AUTOCONFIRM") == "1" ||
                        MessageBox.Show($"PDFMy möchte das Dokument\n„{docName}“\nmit Ihrem Zertifikat digital signieren:\n\n{who}\nausgestellt von {by}\n\nJetzt signieren?", "pdfmy Scan – Digitale Signatur",
                            MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2, MessageBoxOptions.DefaultDesktopOnly) == DialogResult.Yes;
                    if (!ok) throw new OperationCanceledException();
                    var cms = new SignedCms(new ContentInfo(data), true);
                    var signer = new CmsSigner(SubjectIdentifierType.IssuerAndSerialNumber, cert) { DigestAlgorithm = new Oid("2.16.840.1.101.3.4.2.1"), IncludeOption = X509IncludeOption.WholeChain };
                    // PAdES-Baseline B-B (ETSI EN 319 142-1): signing-certificate-v2 statt signing-time (Zeit steht im PDF unter /M)
                    signer.SignedAttributes.Add(new CryptographicAttributeObject(new Oid(OidSigningCertV2), new AsnEncodedDataCollection(new AsnEncodedData(OidSigningCertV2, SigningCertV2(cert.RawData)))));
                    cms.ComputeSignature(signer, false);   // false: Windows darf nach PIN fragen (Signaturkarte)
                    result = cms.Encode();
                    Program.Log($"Signiert: {docName} mit {who}");
                }
                catch (Exception e) { err = e; }
            });
            t.SetApartmentState(ApartmentState.STA); t.Start(); t.Join();
            if (err != null) throw err;
            return result;
        }
    }

    // ---------------- Bei Windows als PDF-Programm anmelden (nur für den angemeldeten Benutzer, ohne Adminrechte) ----------------
    static class FileAssoc
    {
        // Eigener Name in „Öffnen mit“ und Standard-Apps: unterscheidbar von der installierten Browser-App, die ebenfalls „PDFMy“ heißt
        const string AppName = "PDFMy (pdfmy Scan)";
        const string ProgId = "PDFMy.Document", Root = @"Software\Mentor GmbH\PDFMy", Caps = Root + @"\Capabilities";
        const string OldRoot = @"Software\Mertens GmbH\PDFMy";   // bis 1.6.0 – wird beim Start übernommen und entfernt
        [DllImport("shell32.dll")] static extern void SHChangeNotify(int eventId, int flags, IntPtr a, IntPtr b);

        public static void Register(string exe)
        {
            try
            {
                string cmd = $"\"{exe}\" --open \"%1\"";
                // PDF-Dateien zeigen im Explorer das PDFMy-Logo – wie bei der Browser-Version (installierte Web-App); dasselbe Symbol in „Öffnen mit“ und Standard-Apps
                string dir = Path.GetDirectoryName(exe), appIco = Icon(dir, "pdfmy-app.ico", "pdfmy-app-2.ico") ?? $"\"{exe}\",0", pdfIco = appIco;
                foreach (var old in new[] { "pdf-dokument.ico", "pdf-dokument-2.ico" }) try { File.Delete(Path.Combine(dir, old)); } catch { }   // weißes Blatt bis 1.8.1
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + ProgId))
                {
                    k.SetValue("", "PDF-Dokument");
                    k.SetValue("FriendlyTypeName", "PDF-Dokument");
                    using (var i = k.CreateSubKey("DefaultIcon")) i.SetValue("", pdfIco);
                    using (var c = k.CreateSubKey(@"shell\open\command")) c.SetValue("", cmd);
                    using (var a = k.CreateSubKey("Application")) { a.SetValue("ApplicationName", AppName); a.SetValue("ApplicationCompany", "Mentor GmbH"); a.SetValue("ApplicationIcon", appIco); }
                }
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Classes\.pdf\OpenWithProgids")) k.SetValue(ProgId, new byte[0], RegistryValueKind.None);
                // Name in „Öffnen mit“: PDFMy (nicht der Dateiname des Hilfsprogramms)
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Classes\Applications\pdfmy-Scan.exe"))
                {
                    k.SetValue("FriendlyAppName", AppName);
                    using (var di = k.CreateSubKey("DefaultIcon")) di.SetValue("", appIco);
                    using (var st = k.CreateSubKey("SupportedTypes")) st.SetValue(".pdf", "");
                    using (var c = k.CreateSubKey(@"shell\open\command")) c.SetValue("", cmd);
                }
                // Eintrag in Einstellungen → Apps → Standard-Apps
                using (var k = Registry.CurrentUser.CreateSubKey(Caps))
                {
                    k.SetValue("ApplicationName", AppName);
                    k.SetValue("ApplicationDescription", "PDFs öffnen, bearbeiten, unterschreiben und Briefe scannen – lokal, ohne Upload.");
                    k.SetValue("ApplicationIcon", appIco);
                    using (var f = k.CreateSubKey("FileAssociations")) f.SetValue(".pdf", ProgId);
                }
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\RegisteredApplications")) k.SetValue("PDFMy", Caps);
                RemoveOld();   // Eintrag von 1.6.0 (Mertens GmbH) entfernen; die Standard-App hängt an der ProgId und bleibt erhalten
                SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);   // Explorer: Zuordnungen neu lesen
            }
            catch (Exception e) { Program.Log("PDF-Zuordnung: " + e.Message); }
        }
        public static void Unregister()
        {
            try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\" + ProgId, false); } catch { }
            try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Classes\.pdf\OpenWithProgids", true)) k?.DeleteValue(ProgId, false); } catch { }
            try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\Applications\pdfmy-Scan.exe", false); } catch { }
            try { Registry.CurrentUser.DeleteSubKeyTree(Root, false); } catch { }
            RemoveOld();
            DeleteIfEmpty(@"Software\Mentor GmbH");
            try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\RegisteredApplications", true)) k?.DeleteValue("PDFMy", false); } catch { }
            try { SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero); } catch { }
        }
        // Symbol aus dem Programm neben die EXE legen (Windows braucht für DefaultIcon eine Datei); null = nicht möglich.
        // Neuer Dateiname je Symbolstand: Windows hält Symbole im Cache – bei gleichem Pfad bliebe das alte (bis 1.8.0 leere) Symbol stehen.
        static string Icon(string dir, string name, string file)
        {
            try
            {
                try { File.Delete(Path.Combine(dir, name)); } catch { }   // Stand bis 1.8.0 (nur PNG-Größen, im Explorer weißes Blatt)
                string f = Path.Combine(dir, file);
                using (var s = System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                {
                    if (s == null) return null;
                    if (!File.Exists(f) || new FileInfo(f).Length != s.Length) using (var o = File.Create(f)) s.CopyTo(o);
                }
                return "\"" + f + "\",0";
            }
            catch (Exception e) { Program.Log("Symbol " + name + ": " + e.Message); return null; }
        }
        static void RemoveOld()
        {
            try { Registry.CurrentUser.DeleteSubKeyTree(OldRoot, false); } catch { }
            DeleteIfEmpty(@"Software\Mertens GmbH");
        }
        static void DeleteIfEmpty(string key)
        {
            try { using (var k = Registry.CurrentUser.OpenSubKey(key)) if (k == null || k.SubKeyCount > 0 || k.ValueCount > 0) return; Registry.CurrentUser.DeleteSubKey(key, false); } catch { }
        }
        public static bool IsRegistered() { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Classes\" + ProgId)) return k != null; }
        // Als App installiertes PDFMy (Chrome/Edge): Kennungen seiner Dateizuordnung („Chrome.123…“, Befehl mit --app-id)
        public static List<string> BrowserAppProgIds()
        {
            var l = new List<string>();
            try
            {
                using (var cls = Registry.CurrentUser.OpenSubKey(@"Software\Classes"))
                    foreach (var id in cls?.GetSubKeyNames() ?? new string[0])
                    {
                        if (!id.StartsWith("Chrome.") && !id.StartsWith("MSEdge.")) continue;
                        using (var app = cls.OpenSubKey(id + @"\Application"))
                        using (var c = cls.OpenSubKey(id + @"\shell\open\command"))
                            if ((app?.GetValue("ApplicationName") as string) == "PDFMy" && ((c?.GetValue("") as string) ?? "").Contains("--app-id=")) l.Add(id);
                    }
            }
            catch (Exception e) { Program.Log("Browser-App suchen: " + e.Message); }
            return l;
        }
        static string UserChoice() { try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice")) return k?.GetValue("ProgId") as string; } catch { return null; } }
        // Ist bei PDF die Browser-App eingestellt? Dann zeigt der Explorer das Chrome-Merkmal bzw. ein weißes Blatt statt des PDFMy-Logos
        public static bool BrowserAppIsDefault() { string u = UserChoice(); return u != null && BrowserAppProgIds().Contains(u); }
        // Browser-App aus „Öffnen mit“ für PDF ausblenden: zur Auswahl steht dann nur „PDFMy (pdfmy Scan)“ – das öffnet trotzdem im App-Fenster.
        // Die Zuordnung selbst bleibt (pdfmy Scan startet darüber das App-Fenster); Chrome legt den Eintrag bei Updates evtl. neu an → regelmäßig wiederholen.
        public static void HideBrowserApp()
        {
            try
            {
                var ids = BrowserAppProgIds(); if (ids.Count == 0) return;
                using (var ow = Registry.CurrentUser.OpenSubKey(@"Software\Classes\.pdf\OpenWithProgids", true))
                    foreach (var id in ids) if (ow?.GetValue(id) != null) { ow.DeleteValue(id, false); Program.Log("Browser-App bei „Öffnen mit“ für PDF ausgeblendet: " + id); }
            }
            catch (Exception e) { Program.Log("Browser-App ausblenden: " + e.Message); }
        }
        public static bool IsDefault()
        {
            try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice")) return (k?.GetValue("ProgId") as string) == ProgId; }
            catch { return false; }
        }
        // Windows lässt Programme die Standard-App nicht selbst setzen – wir öffnen die passende Einstellungsseite
        public static void OpenDefaultAppsSettings()
        {
            try { Process.Start("ms-settings:defaultapps?registeredAppUser=PDFMy"); }
            catch { try { Process.Start("ms-settings:defaultapps"); } catch (Exception e) { Program.Log("Standard-Apps: " + e.Message); } }
        }
    }

    class LocalServer
    {
        public static bool IsAllowed(string origin) => Allowed.Contains(origin, StringComparer.OrdinalIgnoreCase);
#if DEBUG
        static readonly string[] Allowed = { "https://pdfmy.de", "https://www.pdfmy.de", "http://localhost:8765", "http://localhost:8766", "http://127.0.0.1:8765", "http://127.0.0.1:8766" };
#else
        static readonly string[] Allowed = { "https://pdfmy.de", "https://www.pdfmy.de" };   // Entwicklungsadressen nur im Test-Build
#endif
        // Host-Kopf: nur die eigene Adresse – sonst könnte eine fremde Seite per DNS-Rebinding (evil.example → 127.0.0.1) mitlesen
        static string[] Hosts => new[] { "127.0.0.1:" + Program.Port, "localhost:" + Program.Port };
        readonly ScannerHub hub; TcpListener listener; volatile bool stop;
        readonly ConcurrentDictionary<string, ScanJob> jobs = new ConcurrentDictionary<string, ScanJob>();
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        int busy;

        public LocalServer(ScannerHub hub) { this.hub = hub; }

        public void Start()
        {
            // Ersten freien Port ab 52880 nehmen – auf Terminalservern hat jeder angemeldete Benutzer seinen eigenen pdfmy Scan
            for (int p = Program.PortFirst; ; p++)
            {
                // ExclusiveAddressUse: kein anderer Prozess darf sich mit SO_REUSEADDR auf denselben Port setzen und Verbindungen abgreifen
                var l = new TcpListener(IPAddress.Loopback, p) { ExclusiveAddressUse = true };
                try { l.Start(); listener = l; Program.Port = p; break; }
                catch (Exception e)
                {
                    if (p < Program.PortLast) continue;
                    Program.Log("Ports belegt: " + e.Message); MessageBox.Show($"pdfmy Scan konnte nicht starten (Ports {Program.PortFirst}–{Program.PortLast} belegt).", "pdfmy Scan"); return;
                }
            }
            try { File.WriteAllText(Program.PortFile, Program.Port.ToString()); } catch { }
            if (Program.Port != Program.PortFirst) Program.Log($"Port {Program.Port} (Port {Program.PortFirst} ist belegt – anderer Benutzer oder anderes Programm)");
            new Thread(Loop) { IsBackground = true }.Start();
        }
        public void Stop() { stop = true; try { listener.Stop(); } catch { } }

        void Loop()
        {
            while (!stop)
            {
                TcpClient c;
                try { c = listener.AcceptTcpClient(); } catch { if (stop) return; continue; }
                Task.Run(() => Handle(c));
            }
        }

        void Handle(TcpClient c)
        {
            using (c)
            using (var s = c.GetStream())
            {
                try
                {
                    s.ReadTimeout = 10000;
                    var head = new MemoryStream(); int matched = 0;
                    while (matched < 4) { int x = s.ReadByte(); if (x < 0) return; head.WriteByte((byte)x); matched = (x == "\r\n\r\n"[matched]) ? matched + 1 : (x == '\r' ? 1 : 0); if (head.Length > 32768) return; }
                    var lines = Encoding.ASCII.GetString(head.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
                    var req = lines[0].Split(' '); string method = req[0], path = req.Length > 1 ? req[1] : "/";
                    var h = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var l in lines.Skip(1)) { int i = l.IndexOf(':'); if (i > 0) h[l.Substring(0, i).Trim()] = l.Substring(i + 1).Trim(); }
                    // Nur Prozesse des eigenen Benutzers in der eigenen Sitzung – auf Terminalservern erreichen alle Benutzer 127.0.0.1
                    if (!Peer.IsOwn(c, out string why)) { Program.Log($"Abgelehnt: {method} {path.Split('?')[0]} ({why})"); Reject(c, s); return; }
                    h.TryGetValue("Origin", out var origin);
                    h.TryGetValue("Host", out var host);
                    bool okOrigin = (origin == null || Allowed.Contains(origin, StringComparer.OrdinalIgnoreCase)) && host != null && Hosts.Contains(host, StringComparer.OrdinalIgnoreCase);
                    var cors = new Dictionary<string, string>();
                    if (origin != null && okOrigin) { cors["Access-Control-Allow-Origin"] = origin; cors["Vary"] = "Origin"; }
                    if (method == "OPTIONS")
                    {
                        if (!okOrigin) { Send(s, 403, "text/plain", Encoding.UTF8.GetBytes("forbidden"), null); return; }
                        cors["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                        cors["Access-Control-Allow-Headers"] = "Content-Type, X-Pdfmy";
                        cors["Access-Control-Allow-Private-Network"] = "true";
                        cors["Access-Control-Max-Age"] = "600";
                        Send(s, 204, null, new byte[0], cors); return;
                    }
                    // Schutz: nur pdfmy (Origin) und nur mit eigenem Header – fremde Seiten/Bilder-Links können nichts auslösen oder lesen
                    if (!okOrigin || (path.Split('?')[0] != "/status" && !h.ContainsKey("X-Pdfmy"))) { Send(s, 403, "text/plain", Encoding.UTF8.GetBytes("forbidden"), cors); return; }
                    // Inhalt erst nach der Prüfung lesen – vorher konnte eine fremde Seite bis zu 300 MB in den Speicher schieben
                    byte[] body = new byte[0];
                    if (h.TryGetValue("Content-Length", out var cl) && int.TryParse(cl, out int n) && n > 0 && n < (path.StartsWith("/sign") || path.StartsWith("/maildraft") || path.StartsWith("/office") || path == "/cloud" ? 300_000_000 : 1_000_000))
                    { body = new byte[n]; int r = 0; while (r < n) { int k = s.Read(body, r, n - r); if (k <= 0) break; r += k; } }
                    Route(s, method, path, body, cors, h.ContainsKey("X-Pdfmy"));
                }
                catch (Exception e) { Program.Log("HTTP: " + e.Message); try { SendJson(s, 500, new { error = e.Message }, null); } catch { } }
            }
        }

        void Route(Stream s, string method, string path, byte[] body, Dictionary<string, string> cors, bool fromApp)
        {
            string p = path.Split('?')[0];
            if (p == "/status" && fromApp) FileOpen.Remember(path);   // Öffnen-Adresse nur von PDFMy selbst (nicht per <img> von fremden Seiten)
            if (p.StartsWith("/file/") && method == "GET")
            {
                var data = FileOpen.Take(p.Substring(6), out string fname, out string err);
                if (data == null) { SendJson(s, 404, new { error = err }, cors); return; }
                cors["Access-Control-Expose-Headers"] = "X-Pdfmy-Name";
                cors["X-Pdfmy-Name"] = Uri.EscapeDataString(fname);
                Send(s, 200, "application/pdf", data, cors); return;
            }
            if (p == "/maildraft" && method == "POST")   // E-Mail-Entwurf (.eml mit „X-Unsent: 1“) direkt im Mail-Programm öffnen – Outlook zeigt ihn als neue, sendebereite Nachricht
            {
                var o = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body));
                byte[] eml; try { eml = Convert.FromBase64String(Convert.ToString(o["data"])); } catch { SendJson(s, 400, new { error = "Ungültige Daten" }, cors); return; }
                string name = new string(Path.GetFileName(Convert.ToString(o.ContainsKey("name") ? o["name"] : "E-Mail")).Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch).ToArray()).Trim();
                if (name.Length == 0) name = "E-Mail"; if (!name.EndsWith(".eml", StringComparison.OrdinalIgnoreCase)) name += ".eml";
                string root = Path.Combine(Program.DataDir, "mail");
                try
                {
                    Directory.CreateDirectory(root);
                    foreach (var old in Directory.GetDirectories(root)) try { if (Directory.GetLastWriteTimeUtc(old) < DateTime.UtcNow.AddDays(-1)) Directory.Delete(old, true); } catch { }
                    string dir = Path.Combine(root, DateTime.UtcNow.Ticks.ToString()); Directory.CreateDirectory(dir);
                    string f = Path.Combine(dir, name); File.WriteAllBytes(f, eml);
                    if (Environment.GetEnvironmentVariable("PDFMY_TEST_NOBROWSER") != "1") Process.Start(new ProcessStartInfo(f) { UseShellExecute = true });
                    Program.Log("E-Mail-Entwurf geöffnet: " + name);
                    SendJson(s, 200, new { ok = true }, cors);
                }
                catch (Exception e) { Program.Log("E-Mail-Entwurf: " + e.Message); SendJson(s, 500, new { error = e.Message }, cors); }
                return;
            }
            if (p == "/attachment" && method == "GET")   // PDFMy durfte eine übergebene Datei nicht lesen (z. B. Outlook-Anhang): hier nachreichen
            {
                int qi = path.IndexOf("name=", StringComparison.Ordinal);
                string want = qi < 0 ? "" : Uri.UnescapeDataString(path.Substring(qi + 5).Split('&')[0]);
                string f = FileOpen.FindRecent(want);
                if (f == null) { SendJson(s, 404, new { error = "Datei nicht gefunden" }, cors); return; }
                var fi = new FileInfo(f);
                if (fi.Length > 300L * 1024 * 1024) { SendJson(s, 413, new { error = "Die Datei ist zu groß (über 300 MB)." }, cors); return; }
                cors["Access-Control-Expose-Headers"] = "X-Pdfmy-Name";
                cors["X-Pdfmy-Name"] = Uri.EscapeDataString(fi.Name);
                Send(s, 200, "application/octet-stream", File.ReadAllBytes(f), cors); return;
            }
            if (p == "/open-local" && method == "POST" && !cors.ContainsKey("Access-Control-Allow-Origin"))   // nur vom eigenen Programm (ohne Origin)
            {
                var o = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body));
                FileOpen.Open(Convert.ToString(o["path"]));
                SendJson(s, 200, new { ok = true }, cors); return;
            }
            if (p == "/certs" && method == "GET") { SendJson(s, 200, new { certs = WinSign.List() }, cors); return; }
            if (p == "/sign" && method == "POST")
            {
                var o = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body));
                try
                {
                    var cms = WinSign.Sign(Convert.ToString(o["thumb"]), Convert.FromBase64String(Convert.ToString(o["data"])), Convert.ToString(o.ContainsKey("name") ? o["name"] : "Dokument"));
                    SendJson(s, 200, new { cms = Convert.ToBase64String(cms) }, cors);
                }
                catch (Exception e) { Program.Log("Signatur: " + e.Message); SendJson(s, 400, new { error = e is OperationCanceledException ? "Signatur abgelehnt." : e.Message }, cors); }
                return;
            }
            if (p == "/tsa" && method == "POST")   // Zeitstempel (RFC 3161) für Signaturen: Browser dürfen Zeitstempeldienste nicht direkt abfragen (kein CORS)
            {
                var o = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body));
                string url = Convert.ToString(o.ContainsKey("url") ? o["url"] : "");
                // nur bekannte, öffentliche Zeitstempeldienste – kein offener Proxy
                if (!Tsa.Allowed(url)) { SendJson(s, 400, new { error = "Unbekannter Zeitstempeldienst" }, cors); return; }
                byte[] req; try { req = Convert.FromBase64String(Convert.ToString(o["data"])); } catch { SendJson(s, 400, new { error = "Ungültige Daten" }, cors); return; }
                if (req.Length > 4096) { SendJson(s, 400, new { error = "Anfrage zu groß" }, cors); return; }
                try
                {
                    using (var h = new HttpClient { Timeout = TimeSpan.FromSeconds(20) })
                    {
                        var c = new ByteArrayContent(req); c.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/timestamp-query");
                        var r = h.PostAsync(url, c).Result; var d = r.Content.ReadAsByteArrayAsync().Result;
                        if (!r.IsSuccessStatusCode || d.Length > 65536) throw new Exception("Zeitstempeldienst antwortet mit " + (int)r.StatusCode);
                        Program.Log("Zeitstempel von " + new Uri(url).Host + " (" + d.Length + " Bytes)");
                        SendJson(s, 200, new { data = Convert.ToBase64String(d) }, cors);
                    }
                }
                catch (Exception e) { var m = (e is AggregateException a ? a.InnerException ?? e : e).Message; Program.Log("Zeitstempel: " + m); SendJson(s, 502, new { error = m }, cors); }
                return;
            }
            if (p == "/office" && method == "GET") { SendJson(s, 200, new { apps = OfficeApps.Detect().Select(c => new { c.id, c.app, c.what, c.fmt }).ToList() }, cors); return; }   // installierte Office-Programme
            if (p == "/office" && method == "POST")   // PDF mit dem gewählten Office-Programm öffnen (Datei bleibt auf dem Rechner)
            {
                var o = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body ?? new byte[0]));
                byte[] pdf = null; try { pdf = Convert.FromBase64String(Convert.ToString(o["data"])); } catch { }
                string err = OfficeApps.Open(Convert.ToString(o["id"]), o.ContainsKey("name") ? Convert.ToString(o["name"]) : null, pdf, out string saved);
                SendJson(s, err == null ? 200 : 409, new { ok = err == null, error = err, path = saved }, cors); return;
            }
            if (p == "/cloud" && method == "GET") { SendJson(s, 200, new { folders = CloudFolders.Detect() }, cors); return; }   // Sync-Ordner (Nextcloud, ownCloud, Seafile, Dropbox, OneDrive, Google Drive, iCloud)
            if (p == "/cloud" && method == "POST")   // PDF im Unterordner „PDFMy“ des gewählten Cloud-Ordners ablegen – hochladen tut das Sync-Programm des Nutzers
            {
                var o = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body ?? new byte[0]));
                byte[] pdf = null; try { pdf = Convert.FromBase64String(Convert.ToString(o["data"])); } catch { }
                string err = CloudFolders.Save(Convert.ToString(o["id"]), o.ContainsKey("name") ? Convert.ToString(o["name"]) : null, pdf, out string saved);
                SendJson(s, err == null ? 200 : 409, new { ok = err == null, error = err, path = saved }, cors); return;
            }
            if (p == "/cloud/show" && method == "POST")   // abgelegte Datei im Explorer zeigen
            {
                var o = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body ?? new byte[0]));
                CloudFolders.Show(o != null && o.ContainsKey("path") ? Convert.ToString(o["path"]) : null);
                SendJson(s, 200, new { ok = true }, cors); return;
            }
            if (p == "/printer" && method == "POST")   // Drucker „PDFMy“ einrichten (?on=1) oder entfernen (?on=0) – Windows fragt einmal nach Bestätigung
            {
                bool on = path.Contains("on=1");
                string err = PdfPrinter.Setup(on);
                SendJson(s, err == null ? 200 : 409, new { ok = err == null, error = err, printer = PdfPrinter.State(), printerName = PdfPrinter.Name }, cors); return;
            }
            if (p == "/defaultapps" && method == "POST") { FileAssoc.OpenDefaultAppsSettings(); SendJson(s, 200, new { ok = true, registered = FileAssoc.IsRegistered() }, cors); return; }
            if (p == "/status") { SendJson(s, 200, new { app = "pdfmy-scan", version = Program.Version, ownUser = true, pades = true, tsa = true, searching = hub.Searching, devices = hub.Devices.Count, pdfDefault = FileAssoc.IsDefault(), pdfBrowserApp = FileAssoc.BrowserAppIsDefault(), printer = PdfPrinter.State(), printerName = PdfPrinter.Name }, cors); return; }
            if (p == "/wake" && method == "POST")   // „Scanner aufwecken“: wecken, kurz warten, neu suchen
            {
                hub.RefreshAsync().Wait(40000);   // die Suche weckt zuerst alle bekannten Geräte
                SendJson(s, 200, new { woken = hub.LastWoken, devices = hub.Devices.Count }, cors); return;
            }
            if (p == "/scanners" && method == "GET")
            {
                if (path.Contains("refresh=1")) hub.RefreshAsync().Wait(25000);
                else if (hub.Searching) hub.RefreshAsync().Wait(25000);
                SendJson(s, 200, new { searching = hub.Searching, scanners = hub.Devices.Select(d => new { id = d.Id, name = d.Name, kind = d.Kind, feeder = d.Feeder, duplex = d.Duplex, platen = !(d is EsclDevice ed) || ed.Platen }) }, cors); return;
            }
            if (p == "/log")
            {
                string f = Path.Combine(Program.DataDir, "log.txt");
                var lines = File.Exists(f) ? File.ReadAllLines(f) : new string[0];
                // net: Netzwerkkarten mit interner IP-Adresse (z. B. „Ethernet 192.168.1.23/24“) – für den Fehlerbericht (Scanner im selben Netz?)
                SendJson(s, 200, new { version = Program.Version, lines = lines.Skip(Math.Max(0, lines.Length - 40)).ToArray(), net = Net.Describe(), host = Environment.MachineName }, cors); return;
            }
            if (p == "/quit" && method == "POST" && !cors.ContainsKey("Access-Control-Allow-Origin"))
            {
                SendJson(s, 200, new { ok = true }, cors);
                Program.Log("Beendet für Update");
                Environment.Exit(0);
            }
            if (p == "/scanners/add" && method == "POST")
            {
                var o = json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(body));
                var d = hub.AddAsync(Convert.ToString(o["ip"])).Result;
                if (d == null) { SendJson(s, 404, new { error = "Unter dieser Adresse antwortet kein Scanner (eSCL oder WSD). Bitte am Gerät „AirPrint/eSCL/Mopria“ oder „WSD-Scan“ aktivieren." }, cors); return; }
                SendJson(s, 200, new { id = d.Id, name = d.Name, kind = d.Kind, feeder = d.Feeder, duplex = d.Duplex }, cors); return;
            }
            if (p == "/scan" && method == "POST")
            {
                var r = json.Deserialize<ScanRequest>(Encoding.UTF8.GetString(body));
                var dev = hub.Find(r.id);
                if (dev == null) { SendJson(s, 404, new { error = "Kein Scanner gefunden." }, cors); return; }
                if (Interlocked.CompareExchange(ref busy, 1, 0) != 0) { SendJson(s, 409, new { error = "Es läuft bereits ein Scan." }, cors); return; }
                var job = new ScanJob { Id = Guid.NewGuid().ToString("N").Substring(0, 12) };
                if (dev is EsclDevice e && !e.Jpeg) job.Mime = "application/pdf";
                job.Device = dev;
                jobs[job.Id] = job;
                foreach (var old in jobs.Values.Where(j => j.Created < DateTime.UtcNow.AddMinutes(-30)).ToList()) jobs.TryRemove(old.Id, out _);
                Task.Run(() =>
                {
                    try
                    {
                        dev.Scan(r, page =>
                        {
                            if (dev is EsclDevice ed && ed.LastFormat != null) job.Mime = ed.LastFormat;
                            if (dev is WsdDevice wd) job.Mime = wd.LastMime;
                            lock (job.Pages) job.Pages.Add(page);
                        }, CancellationToken.None);
                        job.State = "done";
                    }
                    catch (Exception ex) { job.Error = (ex is AggregateException ae ? ae.InnerException : ex).Message; job.State = "error"; Program.Log("Scan: " + ex); }
                    finally { Interlocked.Exchange(ref busy, 0); }
                });
                SendJson(s, 200, new { job = job.Id, device = dev.Name }, cors); return;
            }
            if (p.StartsWith("/scan/"))
            {
                var parts = p.Split('/');   // "", "scan", id, ["page", n]
                if (!jobs.TryGetValue(parts[2], out var job)) { SendJson(s, 404, new { error = "Unbekannter Scanauftrag." }, cors); return; }
                if (parts.Length == 3) { int n; lock (job.Pages) n = job.Pages.Count; SendJson(s, 200, new { state = job.State, pages = n, error = job.Error, mime = job.Mime, detail = job.Device?.LastTrace, note = job.Device?.Note }, cors); return; }
                if (parts.Length == 5 && parts[3] == "page" && int.TryParse(parts[4], out int idx))
                {
                    byte[] data = null; lock (job.Pages) if (idx >= 0 && idx < job.Pages.Count) data = job.Pages[idx];
                    if (data == null) { SendJson(s, 404, new { error = "Seite nicht vorhanden." }, cors); return; }
                    Send(s, 200, job.Mime, data, cors); return;
                }
            }
            SendJson(s, 404, new { error = "Nicht gefunden" }, cors);
        }

        // 403 an einen fremden Prozess: Antwort senden, Rest der Anfrage (höchstens 1 MB, 2 s) verwerfen und sauber schließen –
        // sonst bricht Windows die Verbindung hart ab und der Absender sieht statt 403 nur einen Verbindungsfehler
        static void Reject(TcpClient c, Stream s)
        {
            Send(s, 403, "text/plain", Encoding.UTF8.GetBytes("forbidden"), null);
            try
            {
                c.Client.Shutdown(SocketShutdown.Send); s.ReadTimeout = 2000;
                var buf = new byte[16384]; int total = 0, n;
                while (total < 1_000_000 && (n = s.Read(buf, 0, buf.Length)) > 0) total += n;
            }
            catch { }
        }

        void SendJson(Stream s, int code, object o, Dictionary<string, string> extra) => Send(s, code, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json.Serialize(o)), extra);

        static void Send(Stream s, int code, string type, byte[] data, Dictionary<string, string> extra)
        {
            var sb = new StringBuilder();
            sb.Append($"HTTP/1.1 {code} {(code == 200 ? "OK" : code == 204 ? "No Content" : "Error")}\r\n");
            if (type != null) sb.Append($"Content-Type: {type}\r\n");
            sb.Append($"Content-Length: {data.Length}\r\nCache-Control: no-store\r\nConnection: close\r\n");
            if (extra != null) foreach (var kv in extra) sb.Append($"{kv.Key}: {kv.Value}\r\n");
            sb.Append("\r\n");
            var hb = Encoding.ASCII.GetBytes(sb.ToString());
            s.Write(hb, 0, hb.Length); s.Write(data, 0, data.Length); s.Flush();
        }
    }
}
