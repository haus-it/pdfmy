// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PdfmyScan
{
    /* Drucker „PDFMy“: in jedem Programm „Drucken“ → das Dokument öffnet sich in PDFMy. Ohne eigenen Treiber: der in Windows
       eingebaute Treiber „Microsoft Print To PDF“ mit einem Anschluss, der in einen Ordner nur dieses Benutzers schreibt
       (C:\ProgramData\PDFMy\Druck\<SID> – im Benutzerprofil lässt Windows keine Datei-Anschlüsse zu). Je Benutzer ein eigener
       Drucker, den nur er benutzen darf. Einrichten, Reparieren und Entfernen brauchen einmal eine Windows-Bestätigung (UAC).
       Auf Terminalservern (mehrere Benutzer gleichzeitig) wird der Drucker nicht angeboten.
       Seit 1.16.0: Der Drucker wird an seinem Anschluss erkannt (nicht am Namen – Umbenennen oder ein geänderter Benutzername
       ließen den Druck sonst still liegen), prüft sich selbst (Problem), repariert sich mit einem Klick (Repair) und meldet
       einen ankommenden Druck sofort (Incoming) – vorher sah man bis zum Öffnen einige Sekunden lang nichts. */
    static class PdfPrinter
    {
        const string Driver = "Microsoft Print To PDF";
        static readonly Lazy<bool> ts = new Lazy<bool>(DetectTerminalServer);
        static string Sid => WindowsIdentity.GetCurrent().User.Value;
        static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "PDFMy", "Druck");
        static string FolderOf(string sid) => Path.Combine(Root, sid);
        public static string Folder => FolderOf(Sid);
        static string PortFile => Path.Combine(Folder, "druck.pdf");
        // Name des eigenen Druckers: der Drucker, dessen Anschluss in den eigenen Druckordner schreibt – sonst der Name fürs Einrichten
        public static string Name => FindName() ?? NameOf(Environment.UserName);
        static string NameOf(string user) => "PDFMy (" + Regex.Replace(user, @"[\\,!'""]", "") + ")";
        static RegistryKey Hklm => RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Registry32);
        public static Action Incoming;   // Druck kommt an (Infobereich zeigt eine Meldung)

        public static bool TerminalServer => ts.Value || Environment.GetEnvironmentVariable("PDFMY_TEST_TS") == "1";
        static bool DetectTerminalServer()
        {
            try
            {
                using (var s = new System.Management.ManagementObjectSearcher(@"root\cimv2\TerminalServices", "SELECT TerminalServerMode FROM Win32_TerminalServiceSetting"))
                    foreach (System.Management.ManagementObject o in s.Get()) if (Convert.ToInt32(o["TerminalServerMode"]) == 1) return true;   // Remotedesktop-Sitzungshost
            }
            catch { }
            try { using (var k = Hklm.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion")) if (((k?.GetValue("ProductName") as string) ?? "").IndexOf("multi-session", StringComparison.OrdinalIgnoreCase) >= 0) return true; }   // Windows 10/11 Enterprise multi-session
            catch { }
            return false;
        }
        public static bool DriverAvailable()
        {
            foreach (var env in new[] { "Windows x64", "Windows ARM64", "Windows NT x86" })
                foreach (var ver in new[] { "Version-4", "Version-3" })   // „Microsoft Print To PDF“ ist ein Typ-4-Treiber
                    using (var k = Hklm.OpenSubKey($@"SYSTEM\CurrentControlSet\Control\Print\Environments\{env}\Drivers\{ver}\{Driver}")) if (k != null) return true;
            return false;
        }
        static string FindName()
        {
            try
            {
                using (var k = Hklm.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Print\Printers"))
                    if (k != null) foreach (var n in k.GetSubKeyNames())
                            using (var p = k.OpenSubKey(n)) if (string.Equals(p?.GetValue("Port") as string, PortFile, StringComparison.OrdinalIgnoreCase)) return n;
            }
            catch { }
            return null;
        }
        public static bool Installed() => FindName() != null;
        // "ts" = Terminalserver, "on" = eingerichtet, "nodriver" = „Microsoft Print to PDF“ fehlt/abgeschaltet, "off" = nicht eingerichtet
        public static string State() => TerminalServer ? "ts" : Installed() ? "on" : !DriverAvailable() ? "nodriver" : "off";

        // ---------- Selbsttest ----------
        // Warteschlange des Druckers lesen (Windows-Druck-API): Status-Bits und Zahl der Aufträge – null, wenn nicht lesbar
        [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
        [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
        [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool GetPrinter(IntPtr h, int level, IntPtr buf, int size, out int needed);
        static (int status, int jobs)? Queue(string name)
        {
            if (name == null || !OpenPrinter(name, out IntPtr h, IntPtr.Zero)) return null;
            try
            {
                GetPrinter(h, 2, IntPtr.Zero, 0, out int need); if (need <= 0) return null;
                IntPtr buf = Marshal.AllocHGlobal(need);
                try
                {
                    if (!GetPrinter(h, 2, buf, need, out need)) return null;
                    int off = 13 * IntPtr.Size;   // PRINTER_INFO_2: 13 Zeiger, dann Attributes, Priority, DefaultPriority, StartTime, UntilTime, Status, cJobs
                    return (Marshal.ReadInt32(buf, off + 5 * 4), Marshal.ReadInt32(buf, off + 6 * 4));
                }
                finally { Marshal.FreeHGlobal(buf); }
            }
            finally { ClosePrinter(h); }
        }
        static DateTime stuckSince = DateTime.MaxValue;
        // Funktioniert der Drucker? null = ja, sonst eine verständliche Ursache (Grundlage für „Drucker reparieren“)
        public static string Problem()
        {
            if (TerminalServer) return null;
            string name = FindName(); if (name == null) return null;   // nicht eingerichtet ist kein Fehler
            try { using (var sc = new ServiceController("Spooler")) if (sc.Status != ServiceControllerStatus.Running) return "Die Windows-Druckwarteschlange läuft nicht."; } catch { }
            if (!DriverAvailable()) return "Der Windows-Treiber „Microsoft Print to PDF“ ist ausgeschaltet.";
            if (!Directory.Exists(Folder)) return "Der Druckordner fehlt.";
            var q = Queue(name);
            if (q == null) return "Windows meldet den Drucker als nicht erreichbar.";
            const int PAUSED = 0x1, ERROR = 0x2, PAPER_PROBLEM = 0x40, OFFLINE = 0x80, USER_INTERVENTION = 0x100000;
            if ((q.Value.status & PAUSED) != 0) return "Der Drucker ist angehalten.";
            if ((q.Value.status & (ERROR | OFFLINE | PAPER_PROBLEM | USER_INTERVENTION)) != 0) return "Windows meldet einen Druckerfehler.";
            if (q.Value.jobs > 0 && DateTime.UtcNow - stuckSince > TimeSpan.FromMinutes(2)) return "Ein Druckauftrag hängt in der Warteschlange.";
            return null;
        }

        // Einrichten/Entfernen über eine erhöhte Kopie dieses Programms → null oder verständliche Fehlermeldung
        public static string Setup(bool on) => RunElevated(on ? "install" : "remove");
        // Reparieren: Drucker und Anschluss neu anlegen, Warteschlange leeren, Druckdienst und Treiber einschalten – eine Bestätigung
        public static string Repair() => RunElevated("repair");
        static string RunElevated(string mode)
        {
            bool on = mode != "remove";
            if (on && TerminalServer) return "Auf Terminalservern bietet pdfmy Scan den Drucker nicht an: Er gälte für alle angemeldeten Benutzer.";
            string errFile = Path.Combine(Root, "fehler-" + Sid + ".txt");
            try
            {
                try { File.Delete(errFile); } catch { }
                var psi = new ProcessStartInfo(Application.ExecutablePath, $"--printer {mode} {Sid} \"{Environment.UserName}\"") { Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                using (var p = Process.Start(psi))
                {
                    if (!p.WaitForExit(180000)) return "Windows hat nicht rechtzeitig geantwortet. Bitte noch einmal versuchen.";
                    if (p.ExitCode != 0)
                    {
                        string m = null; try { m = File.ReadAllText(errFile).Trim(); } catch { }
                        if (on && !DriverAvailable()) { OpenFeatures(); return "Der in Windows eingebaute PDF-Treiber „Microsoft Print to PDF“ ist ausgeschaltet. pdfmy Scan hat das Windows-Fenster zum Einschalten geöffnet: Haken bei „Microsoft Print to PDF“ setzen, OK klicken und es danach noch einmal versuchen."; }
                        return string.IsNullOrEmpty(m) ? "Der Drucker konnte nicht " + (mode == "repair" ? "repariert" : on ? "eingerichtet" : "entfernt") + " werden (Code " + p.ExitCode + ")." : m;
                    }
                }
            }
            catch (System.ComponentModel.Win32Exception e) when (e.NativeErrorCode == 1223) { return "Abgebrochen – ohne Windows-Bestätigung kann der Drucker nicht " + (mode == "repair" ? "repariert" : on ? "angelegt" : "entfernt") + " werden."; }
            catch (Exception e) { return e.Message; }
            stuckSince = DateTime.MaxValue;
            Program.Log("Drucker „" + Name + "“ " + (mode == "repair" ? "repariert" : on ? "eingerichtet" : "entfernt"));
            if (on) Watch();
            return null;
        }

        // Fenster „Windows-Features“ öffnen (dort lässt sich „Microsoft Print to PDF“ einschalten) – in jeder Sprache dasselbe Programm
        static void OpenFeatures()
        {
            try
            {
                string win = Environment.GetFolderPath(Environment.SpecialFolder.Windows), exe = Path.Combine(win, @"Sysnative\OptionalFeatures.exe");
                Process.Start(new ProcessStartInfo(File.Exists(exe) ? exe : Path.Combine(win, @"System32\OptionalFeatures.exe")) { UseShellExecute = true });
            }
            catch (Exception e) { Program.Log("Windows-Features öffnen: " + e.Message); }
        }

        // Erhöhte Kopie: "--printer install|repair|remove <SID> <Benutzername>" → Rückgabe 0 = gut
        public static int Elevated(string[] args)
        {
            string sid = args.Length > 2 ? args[2] : "", user = args.Length > 3 ? args[3] : "", mode = args[1];
            if (!Regex.IsMatch(sid, @"^S-1-(5|12)-[0-9-]+$") || user.Length == 0 || !new[] { "install", "repair", "remove" }.Contains(mode)) return 2;
            string folder = FolderOf(sid), port = Path.Combine(folder, "druck.pdf"), name = NameOf(user), err = Path.Combine(Root, "fehler-" + sid + ".txt");
            Func<string, string> q = v => "'" + v.Replace("'", "''") + "'";
            try
            {
                Directory.CreateDirectory(Root);
                // Entfernen: jeder Drucker mit diesem Anschluss (auch umbenannte), dann der Anschluss selbst (Windows gibt ihn kurz verzögert frei)
                string remove = $"Get-Printer -EA SilentlyContinue | Where-Object {{ $_.PortName -eq {q(port)} }} | Remove-Printer -EA SilentlyContinue; " +
                                $"for ($i = 0; $i -lt 10; $i++) {{ try {{ Remove-PrinterPort -Name {q(port)} -EA Stop; break }} catch {{ if (-not (Get-PrinterPort -Name {q(port)} -EA SilentlyContinue)) {{ break }}; Start-Sleep -Milliseconds 500 }} }}";
                string ps;
                if (mode == "remove") ps = "$ErrorActionPreference='Stop'; " + remove;
                else
                {
                    // Ordner: nur dieser Benutzer und das System (Druckwarteschlange) – andere Benutzer sehen die Druckdateien nicht
                    Directory.CreateDirectory(folder);
                    if (mode == "repair") try { File.Delete(port); } catch { }   // halb geschriebene Druckdatei eines hängenden Auftrags
                    var acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true, false);
                    var who = new SecurityIdentifier(sid);
                    foreach (var id in new[] { who, new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null) })
                        acl.AddAccessRule(new FileSystemAccessRule(id, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
                    try { acl.SetOwner(who); } catch { }
                    Directory.SetAccessControl(folder, acl);
                    // Drucker: drucken darf nur dieser Benutzer; Verwaltung Administratoren und System
                    string sddl = $"G:SYD:(A;;LCSWSDRCWDWO;;;BA)(A;OIIO;RPWPSDRCWDWO;;;BA)(A;;LCSWSDRCWDWO;;;SY)(A;OIIO;RPWPSDRCWDWO;;;SY)(A;;SWRC;;;{sid})(A;CIIO;GX;;;CO)(A;OIIO;RPWPSDRCWDWO;;;CO)";
                    // Druckdienst starten und den Windows-Treiber einschalten, falls er abgeschaltet ist (sonst müsste man ins Fenster „Windows-Features“)
                    string prep = "Set-Service Spooler -StartupType Automatic -EA SilentlyContinue; if ((Get-Service Spooler).Status -ne 'Running') { Start-Service Spooler }; " +
                                  $"if (-not (Get-PrinterDriver -Name {q(Driver)} -EA SilentlyContinue)) {{ Enable-WindowsOptionalFeature -Online -FeatureName Printing-PrintToPDFServices-Features -All -NoRestart -EA SilentlyContinue | Out-Null }}; ";
                    ps = "$ErrorActionPreference='Stop'; " + prep + (mode == "repair" ? remove + "; " : "") +
                         $"if (-not (Get-PrinterPort -Name {q(port)} -EA SilentlyContinue)) {{ Add-PrinterPort -Name {q(port)} }}; " +
                         $"if (-not (Get-Printer -EA SilentlyContinue | Where-Object {{ $_.PortName -eq {q(port)} }})) {{ Add-Printer -Name {q(name)} -DriverName {q(Driver)} -PortName {q(port)} }}; " +
                         $"Get-Printer | Where-Object {{ $_.PortName -eq {q(port)} }} | ForEach-Object {{ Set-Printer -Name $_.Name -PermissionSDDL {q(sddl)} }}";
                }
                // 64-Bit-PowerShell (pdfmy Scan selbst ist 32 Bit): Druckerverwaltung in der Umgebung des Systems
                string sysnative = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"Sysnative\WindowsPowerShell\v1.0\powershell.exe");
                string exe = File.Exists(sysnative) ? sysnative : "powershell.exe";
                var psi = new ProcessStartInfo(exe, "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + Convert.ToBase64String(Encoding.Unicode.GetBytes(ps)))
                { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
                using (var p = Process.Start(psi))
                {
                    string e = p.StandardError.ReadToEnd(); p.StandardOutput.ReadToEnd(); p.WaitForExit();
                    if (p.ExitCode != 0)
                    {
                        string m = Regex.Match(e, @"[^\r\n]+").Value;
                        if (Regex.IsMatch(e, "Zugriff|Access is denied|0x80070005", RegexOptions.IgnoreCase)) m = "Windows hat das Anlegen des Druckers verweigert – in Firmen verbieten das manchmal Richtlinien. Bitte die IT fragen.";
                        File.WriteAllText(err, m); return 1;
                    }
                }
                if (mode == "remove") try { Directory.Delete(folder, true); } catch { }
                return 0;
            }
            catch (Exception e) { try { File.WriteAllText(err, e.Message); } catch { } return 1; }
        }

        // ---------- Druckordner beobachten: Druck melden, fertige Datei umbenennen und in PDFMy öffnen ----------
        static System.Threading.Timer timer;
        static int busy;
        static long lastSize = -1;
        static bool announced;
        public static bool Pending { get; private set; }   // gerade kommt ein Druck an (kein automatisches Update in dieser Zeit)
        public static void Watch()
        {
            if (timer != null || TerminalServer || !Installed()) return;
            timer = new System.Threading.Timer(_ => Tick(), null, 1000, 1000);
            Program.Log("Drucker „" + Name + "“ bereit");
            string pr = Problem(); if (pr != null) Program.Log("Drucker: " + pr);
        }
        static void Tick()
        {
            if (Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                var f = new FileInfo(PortFile);
                int jobs = Queue(FindName())?.jobs ?? 0;
                if (jobs > 0 && stuckSince == DateTime.MaxValue) stuckSince = DateTime.UtcNow;
                if (jobs == 0) stuckSince = DateTime.MaxValue;
                Pending = jobs > 0 || (f.Exists && f.Length > 0);
                // Sofort Bescheid geben, sobald Windows den Druck annimmt – Fertigstellen und Öffnen dauert einige Sekunden
                if (Pending && !announced) { announced = true; try { Incoming?.Invoke(); } catch { } }
                if (!f.Exists || f.Length == 0) { lastSize = -1; if (jobs == 0) announced = false; return; }
                bool complete;
                try
                {
                    // solange Windows noch schreibt, gelingt exklusives Öffnen nicht
                    using (var fs = new FileStream(f.FullName, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
                    {
                        var tail = new byte[Math.Min(1024, (int)fs.Length)]; fs.Seek(-tail.Length, SeekOrigin.End); fs.Read(tail, 0, tail.Length);
                        complete = Encoding.ASCII.GetString(tail).Contains("%%EOF") || fs.Length == lastSize;
                        lastSize = fs.Length;
                    }
                }
                catch (IOException) { return; }
                if (!complete) return;
                lastSize = -1;
                string stamp = DateTime.Now.ToString("yyyy-MM-dd HH-mm-ss"), dst = Path.Combine(Folder, $"Druck {stamp}.pdf");
                for (int n = 2; File.Exists(dst); n++) dst = Path.Combine(Folder, $"Druck {stamp} ({n}).pdf");
                File.Move(f.FullName, dst);
                announced = false; Pending = jobs > 0;
                Program.Log("Gedruckt in PDFMy: " + Path.GetFileName(dst));
                FileOpen.Open(dst);
                // ältere Druckdateien nach 7 Tagen entfernen (Zwischenablage, nicht das Archiv)
                foreach (var old in new DirectoryInfo(Folder).GetFiles("Druck *.pdf").Where(x => x.LastWriteTimeUtc < DateTime.UtcNow.AddDays(-7))) try { old.Delete(); } catch { }
            }
            catch (Exception e) { Program.Log("Drucker: " + e.Message); }
            finally { Interlocked.Exchange(ref busy, 0); }
        }
    }
}
