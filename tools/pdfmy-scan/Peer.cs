// Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Wem gehört die Gegenverbindung? Auf Rechnern mit mehreren angemeldeten Benutzern (Terminalserver/RDS) ist
// 127.0.0.1 für alle erreichbar. pdfmy Scan lässt deshalb nur Prozesse desselben Benutzers in derselben Sitzung zu
// (KONZEPT.md, 25.10.2026). Grundlage: die Verbindungstabelle von Windows (GetExtendedTcpTable) nennt zu jeder
// Verbindung den Prozess, dessen Anmeldetoken den Benutzer (SID) und ProcessIdToSessionId die Sitzung.
using System;
using System.Diagnostics;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Principal;

namespace PdfmyScan
{
    static class Peer
    {
        [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool sort, int af, int tableClass, int reserved);
        [DllImport("kernel32.dll")] static extern bool ProcessIdToSessionId(int pid, out int session);
        [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, int access, out IntPtr token);
        [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int cls, IntPtr info, int len, out int needed);

        const int AF_INET = 2, TCP_TABLE_OWNER_PID_ALL = 5, STATE_LISTEN = 2, STATE_ESTABLISHED = 5;
        const int PROCESS_QUERY_LIMITED_INFORMATION = 0x1000, TOKEN_QUERY = 8, TokenUser = 1;
        const uint LOOPBACK = 0x0100007F;   // 127.0.0.1 in Netzwerk-Byte-Reihenfolge

        static readonly int ownPid = Process.GetCurrentProcess().Id;
        static readonly int ownSession = Process.GetCurrentProcess().SessionId;
        static readonly SecurityIdentifier ownSid = WindowsIdentity.GetCurrent().User;

        // Gehört das andere Ende dieser (angenommenen) Verbindung dem eigenen Benutzer in der eigenen Sitzung?
        public static bool IsOwn(System.Net.Sockets.TcpClient c, out string why)
        {
            why = null;
            var remote = (IPEndPoint)c.Client.RemoteEndPoint; var local = (IPEndPoint)c.Client.LocalEndPoint;
            if (!IPAddress.IsLoopback(remote.Address)) { why = "nicht lokal"; return false; }
            // Gegenstück: die Zeile, deren lokaler Port der fremde Port und deren Ziel unser Port ist
            int pid = FindPid(STATE_ESTABLISHED, remote.Port, local.Port);
            if (pid <= 0) { why = "Prozess nicht ermittelbar"; return false; }
            return IsOwnProcess(pid, out why);
        }

        // Gehört der Dienst, der auf diesem Port lauscht, dem eigenen Benutzer in der eigenen Sitzung? (Doppelklick, Update, Deinstallation)
        public static bool ListenerIsOwn(int port)
        {
            int pid = FindPid(STATE_LISTEN, port, 0);
            return pid > 0 && IsOwnProcess(pid, out _);
        }

        public static bool IsOwnProcess(int pid, out string why)
        {
            why = null;
            if (pid == ownPid) return true;
            if (!ProcessIdToSessionId(pid, out int session)) { why = "Sitzung nicht ermittelbar"; return false; }
            if (session != ownSession) { why = "andere Sitzung (" + session + ")"; return false; }
            var sid = UserOf(pid);
            if (sid == null) { why = "Benutzer nicht ermittelbar"; return false; }   // Prozess eines anderen Benutzers: Windows verweigert den Zugriff
            if (!sid.Equals(ownSid)) { why = "anderer Benutzer"; return false; }
            return true;
        }

        // Support (--peer-test): wie viele laufende Prozesse würden zugelassen, wie viele abgelehnt – und warum
        public static string SelfTest()
        {
            var why = new System.Collections.Generic.Dictionary<string, int>(); int own = 0;
            foreach (var p in Process.GetProcesses())
            {
                if (IsOwnProcess(p.Id, out string w)) own++;
                else { w = w.StartsWith("andere Sitzung") ? "andere Sitzung" : w; why[w] = why.TryGetValue(w, out int n) ? n + 1 : 1; }
            }
            var parts = new System.Collections.Generic.List<string>();
            foreach (var kv in why) parts.Add(kv.Key + " " + kv.Value);
            return $"Benutzer {ownSid}, Sitzung {ownSession}: zugelassen {own}, abgelehnt {string.Join(", ", parts)}";
        }

        static SecurityIdentifier UserOf(int pid)
        {
            IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h == IntPtr.Zero) return null;
            try
            {
                if (!OpenProcessToken(h, TOKEN_QUERY, out IntPtr tok)) return null;
                try
                {
                    GetTokenInformation(tok, TokenUser, IntPtr.Zero, 0, out int len);
                    if (len <= 0) return null;
                    IntPtr buf = Marshal.AllocHGlobal(len);
                    try
                    {
                        if (!GetTokenInformation(tok, TokenUser, buf, len, out len)) return null;
                        return new SecurityIdentifier(Marshal.ReadIntPtr(buf));   // TOKEN_USER beginnt mit SID_AND_ATTRIBUTES.Sid
                    }
                    finally { Marshal.FreeHGlobal(buf); }
                }
                finally { CloseHandle(tok); }
            }
            finally { CloseHandle(h); }
        }

        // Prozessnummer zur Verbindung 127.0.0.1:localPort → remotePort (remotePort 0: beliebig, z. B. lauschender Dienst)
        static int FindPid(int state, int localPort, int remotePort)
        {
            int size = 0;
            GetExtendedTcpTable(IntPtr.Zero, ref size, false, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0);
            for (int attempt = 0; attempt < 3; attempt++)
            {
                IntPtr buf = Marshal.AllocHGlobal(size + 4096);
                try
                {
                    int sz = size + 4096;
                    uint rc = GetExtendedTcpTable(buf, ref sz, false, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0);
                    if (rc == 122) { size = sz; continue; }   // ERROR_INSUFFICIENT_BUFFER: Tabelle ist inzwischen gewachsen
                    if (rc != 0) return -1;
                    int n = Marshal.ReadInt32(buf);
                    for (int i = 0; i < n; i++)
                    {
                        IntPtr row = buf + 4 + i * 24;   // MIB_TCPROW_OWNER_PID: State, LocalAddr, LocalPort, RemoteAddr, RemotePort, Pid
                        if (Marshal.ReadInt32(row) != state) continue;
                        if (state != STATE_LISTEN && (uint)Marshal.ReadInt32(row, 4) != LOOPBACK) continue;
                        if (NetPort(Marshal.ReadInt32(row, 8)) != localPort) continue;
                        if (remotePort != 0 && NetPort(Marshal.ReadInt32(row, 16)) != remotePort) continue;
                        return Marshal.ReadInt32(row, 20);
                    }
                    return 0;
                }
                finally { Marshal.FreeHGlobal(buf); }
            }
            return -1;
        }
        static int NetPort(int v) => ((v & 0xFF) << 8) | ((v >> 8) & 0xFF);
    }
}
