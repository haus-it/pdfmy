#!/bin/sh
# Prüfung von ScanCore gegen nachgebaute Scanner (JDK nötig). Kurzer Temp-Pfad: Javas interne Unix-Sockets vertragen keine langen Pfade.
cd "$(dirname "$0")/.." && O="$(pwd)/test/.out" && mkdir -p "$O" && javac -encoding UTF-8 -nowarn -d "$O" android/app/src/main/java/de/pdfmy/app/ScanCore.java test/ScanCoreTest.java && java -Dfile.encoding=UTF-8 -Djdk.net.unixdomain.tmpdir="${SCANTEST_TMP:-C:/Windows/Temp}" -cp "$O" de.pdfmy.app.ScanCoreTest
