// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;

namespace PdfmyScan
{
    /* Sichere Updates (KONZEPT.md, Update-Strategie Stufe 1): Ein Update wird nur gestartet, wenn die Datei
       1. eine gültige Authenticode-Signatur hat (Windows prüft Kette, Sperrstatus und Zeitstempel – WinVerifyTrust),
       2. von „Mentor GmbH“ (Paderborn, DE) signiert ist und
       3. eine neuere Version als die installierte ist (kein Zurückstufen).
       Die SHA-256-Prüfsumme aus version.json kommt vom selben Server wie die Datei – erst die Signatur schützt gegen einen übernommenen Server. */
    static class UpdateTrust
    {
        const string Publisher = "Mentor GmbH";

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct WINTRUST_FILE_INFO { public uint cbStruct; public string pcwszFilePath; public IntPtr hFile; public IntPtr pgKnownSubject; }
        [StructLayout(LayoutKind.Sequential)]
        struct WINTRUST_DATA
        {
            public uint cbStruct; public IntPtr pPolicyCallbackData, pSIPClientData; public uint dwUIChoice, fdwRevocationChecks, dwUnionChoice;
            public IntPtr pFile; public uint dwStateAction; public IntPtr hWVTStateData, pwszURLReference; public uint dwProvFlags, dwUIContext; public IntPtr pSignatureSettings;
        }
        [DllImport("wintrust.dll", CharSet = CharSet.Unicode)] static extern int WinVerifyTrust(IntPtr hwnd, [MarshalAs(UnmanagedType.LPStruct)] Guid action, ref WINTRUST_DATA data);
        static readonly Guid GenericVerifyV2 = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

        // Windows-Prüfung der Signatur (0 = gültig und vertrauenswürdig)
        static int Verify(string path)
        {
            var fi = new WINTRUST_FILE_INFO { cbStruct = (uint)Marshal.SizeOf(typeof(WINTRUST_FILE_INFO)), pcwszFilePath = path };
            IntPtr pfi = Marshal.AllocHGlobal(Marshal.SizeOf(fi));
            try
            {
                Marshal.StructureToPtr(fi, pfi, false);
                var d = new WINTRUST_DATA
                {
                    cbStruct = (uint)Marshal.SizeOf(typeof(WINTRUST_DATA)), dwUIChoice = 2 /* WTD_UI_NONE */, fdwRevocationChecks = 0 /* WTD_REVOKE_NONE: Kette mit Zeitstempel; Sperrprüfung macht Windows bei Bedarf selbst */,
                    dwUnionChoice = 1 /* WTD_CHOICE_FILE */, pFile = pfi, dwStateAction = 1 /* WTD_STATEACTION_VERIFY */, dwProvFlags = 0x80 /* WTD_CACHE_ONLY_URL_RETRIEVAL */,
                };
                int r = WinVerifyTrust(IntPtr.Zero, GenericVerifyV2, ref d);
                d.dwStateAction = 2;   // WTD_STATEACTION_CLOSE
                WinVerifyTrust(IntPtr.Zero, GenericVerifyV2, ref d);
                return r;
            }
            finally { Marshal.FreeHGlobal(pfi); }
        }

        /* Prüft eine heruntergeladene Update-Datei. version: die angebotene Version (null = nicht prüfen). → null oder Ablehnungsgrund */
        public static string Check(string path, string version)
        {
            if (!File.Exists(path)) return "Datei fehlt";
            if (version != null && !(new Version(version) > new Version(Program.Version))) return $"Version {version} ist nicht neuer als die installierte {Program.Version} – Zurückstufen wird nicht installiert";
            int r = Verify(path);
            if (r != 0) return $"keine gültige digitale Signatur (Windows meldet 0x{r:X8})";
            X509Certificate2 cert;
            try { cert = new X509Certificate2(X509Certificate.CreateFromSignedFile(path)); }
            catch (Exception e) { return "Signatur nicht lesbar: " + e.Message; }
            string cn = cert.GetNameInfo(X509NameType.SimpleName, false) ?? "", subj = cert.Subject ?? "";
            if (cn != Publisher || subj.IndexOf("O=" + Publisher, StringComparison.Ordinal) < 0 || subj.IndexOf("C=DE", StringComparison.Ordinal) < 0)
                return $"falscher Herausgeber: {cn} (erwartet {Publisher})";
            return null;
        }
    }
}
