// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.AccessControl;
using System.Security.Principal;
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
       Drucker, den nur er benutzen darf. Einrichten und Entfernen brauchen einmal eine Windows-Bestätigung (UAC).
       Auf Terminalservern (mehrere Benutzer gleichzeitig) wird der Drucker nicht angeboten. */
    static class PdfPrinter
    {
        const string Driver = "Microsoft Print To PDF";
        static readonly Lazy<bool> ts = new Lazy<bool>(DetectTerminalServer);
        static string Sid => WindowsIdentity.GetCurrent().User.Value;
        static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "PDFMy", "Druck");
        static string FolderOf(string sid) => Path.Combine(Root, sid);
        public static string Folder => FolderOf(Sid);
        static string PortFile => Path.Combine(Folder, "druck.pdf");
        public static string Name => NameOf(Environment.UserName);
        static string NameOf(string user) => "PDFMy (" + Regex.Replace(user, @"[\\,!'""]", "") + ")";
        static RegistryKey Hklm => RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Registry32);

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
        public static bool Installed() { using (var k = Hklm.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Print\Printers\" + Name)) return k != null; }
        // "ts" = Terminalserver, "on" = eingerichtet, "nodriver" = „Microsoft Print to PDF“ fehlt/abgeschaltet, "off" = nicht eingerichtet
        public static string State() => TerminalServer ? "ts" : Installed() ? "on" : !DriverAvailable() ? "nodriver" : "off";

        // Einrichten/Entfernen über eine erhöhte Kopie dieses Programms → null oder verständliche Fehlermeldung
        public static string Setup(bool on)
        {
            if (on && TerminalServer) return "Auf Terminalservern bietet pdfmy Scan den Drucker nicht an: Er gälte für alle angemeldeten Benutzer.";
            if (on && !DriverAvailable()) return "Der Windows-Drucker „Microsoft Print to PDF“ ist ausgeschaltet. Einschalten: Windows-Suche „Windows-Features aktivieren oder deaktivieren“ → Haken bei „Microsoft Print to PDF“.";
            string errFile = Path.Combine(Root, "fehler-" + Sid + ".txt");
            try
            {
                try { File.Delete(errFile); } catch { }
                var psi = new ProcessStartInfo(Application.ExecutablePath, $"--printer {(on ? "install" : "remove")} {Sid} \"{Environment.UserName}\"") { Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                using (var p = Process.Start(psi))
                {
                    if (!p.WaitForExit(120000)) return "Windows hat nicht rechtzeitig geantwortet. Bitte noch einmal versuchen.";
                    if (p.ExitCode != 0) { string m = null; try { m = File.ReadAllText(errFile).Trim(); } catch { } return string.IsNullOrEmpty(m) ? "Der Drucker konnte nicht " + (on ? "eingerichtet" : "entfernt") + " werden (Code " + p.ExitCode + ")." : m; }
                }
            }
            catch (System.ComponentModel.Win32Exception e) when (e.NativeErrorCode == 1223) { return "Abgebrochen – ohne Windows-Bestätigung kann kein Drucker " + (on ? "angelegt" : "entfernt") + " werden."; }
            catch (Exception e) { return e.Message; }
            Program.Log("Drucker „" + Name + "“ " + (on ? "eingerichtet" : "entfernt"));
            if (on) Watch();
            return null;
        }

        // Erhöhte Kopie: "--printer install|remove <SID> <Benutzername>" → Rückgabe 0 = gut
        public static int Elevated(string[] args)
        {
            string sid = args.Length > 2 ? args[2] : "", user = args.Length > 3 ? args[3] : "";
            if (!Regex.IsMatch(sid, @"^S-1-(5|12)-[0-9-]+$") || user.Length == 0) return 2;
            string folder = FolderOf(sid), port = Path.Combine(folder, "druck.pdf"), name = NameOf(user), err = Path.Combine(Root, "fehler-" + sid + ".txt");
            Func<string, string> q = v => "'" + v.Replace("'", "''") + "'";
            try
            {
                Directory.CreateDirectory(Root);
                string ps;
                if (args[1] == "install")
                {
                    // Ordner: nur dieser Benutzer und das System (Druckwarteschlange) – andere Benutzer sehen die Druckdateien nicht
                    Directory.CreateDirectory(folder);
                    var acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true, false);
                    var who = new SecurityIdentifier(sid);
                    foreach (var id in new[] { who, new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null) })
                        acl.AddAccessRule(new FileSystemAccessRule(id, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
                    try { acl.SetOwner(who); } catch { }
                    Directory.SetAccessControl(folder, acl);
                    // Drucker: drucken darf nur dieser Benutzer; Verwaltung Administratoren und System
                    string sddl = $"G:SYD:(A;;LCSWSDRCWDWO;;;BA)(A;OIIO;RPWPSDRCWDWO;;;BA)(A;;LCSWSDRCWDWO;;;SY)(A;OIIO;RPWPSDRCWDWO;;;SY)(A;;SWRC;;;{sid})(A;CIIO;GX;;;CO)(A;OIIO;RPWPSDRCWDWO;;;CO)";
                    ps = $"$ErrorActionPreference='Stop'; if (-not (Get-PrinterPort -Name {q(port)} -EA SilentlyContinue)) {{ Add-PrinterPort -Name {q(port)} }}; " +
                         $"if (-not (Get-Printer -Name {q(name)} -EA SilentlyContinue)) {{ Add-Printer -Name {q(name)} -DriverName {q(Driver)} -PortName {q(port)} }}; " +
                         $"Set-Printer -Name {q(name)} -PermissionSDDL {q(sddl)}";
                }
                else ps = $"$ErrorActionPreference='Stop'; Remove-Printer -Name {q(name)} -EA SilentlyContinue; for ($i = 0; $i -lt 10; $i++) {{ try {{ Remove-PrinterPort -Name {q(port)} -EA Stop; break }} catch {{ if (-not (Get-PrinterPort -Name {q(port)} -EA SilentlyContinue)) {{ break }}; Start-Sleep -Milliseconds 500 }} }}";
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
                if (args[1] != "install") try { Directory.Delete(folder, true); } catch { }
                return 0;
            }
            catch (Exception e) { try { File.WriteAllText(err, e.Message); } catch { } return 1; }
        }

        // Druckordner beobachten: fertige Druckdatei umbenennen und in PDFMy öffnen
        static System.Threading.Timer timer;
        static int busy;
        static long lastSize = -1;
        public static void Watch()
        {
            if (timer != null || TerminalServer || !Installed()) return;
            timer = new System.Threading.Timer(_ => Tick(), null, 1000, 1000);
            Program.Log("Drucker „" + Name + "“ bereit");
        }
        static void Tick()
        {
            if (Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                var f = new FileInfo(PortFile);
                if (!f.Exists || f.Length == 0) { lastSize = -1; return; }
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
