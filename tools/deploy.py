# Copyright (c) 2026 Mentor GmbH, Paderborn (https://mentor-group.de) – PDFMy, https://pdfmy.de
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
"""SFTP-Upload für pdfmy.de: lädt nur geänderte Dateien hoch (SHA-256-Manifest auf dem Server).

Zugangsdaten kommen aus den Umgebungsvariablen PDFMY_SFTP_USER / PDFMY_SFTP_PASS (gesetzt von deploy.ps1).
Der SFTP-Benutzer ist bei IONOS auf das Webverzeichnis beschränkt, daher ist "/" hier das Website-Verzeichnis.
"""
import argparse, hashlib, io, json, os, posixpath, stat, sys, time
import paramiko

MANIFEST = '.deploy-manifest.json'
LAST = ('sw.js', 'index.html')  # zuletzt hochladen, damit Besucher nie eine halbe Version sehen


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def local_files(root):
    out = {}
    for d, _, files in os.walk(root):
        for n in files:
            p = os.path.join(d, n)
            out[os.path.relpath(p, root).replace(os.sep, '/')] = p
    return out


def ensure_dir(sftp, path, made):
    parts = [p for p in path.split('/') if p]
    cur = ''
    for p in parts:
        cur += '/' + p
        if cur in made:
            continue
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)
        made.add(cur)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', required=True)
    ap.add_argument('--local', required=True)
    ap.add_argument('--known-hosts', required=True)
    ap.add_argument('--test', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    user, pw = os.environ.get('PDFMY_SFTP_USER'), os.environ.get('PDFMY_SFTP_PASS')
    if not user or not pw:
        sys.exit('Zugangsdaten fehlen (deploy.ps1 verwenden).')

    client = paramiko.SSHClient()
    if os.path.exists(a.known_hosts):
        client.load_host_keys(a.known_hosts)
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
    else:
        # Erster Kontakt: Schlüssel merken (Trust on first use), danach wird jede Änderung abgelehnt
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(a.host, username=user, password=pw, look_for_keys=False, allow_agent=False, timeout=30)
    if not os.path.exists(a.known_hosts):
        client.save_host_keys(a.known_hosts)
    key = client.get_transport().get_remote_server_key()
    print(f'Verbunden mit {a.host} als {user} (Server-Schlüssel {key.get_name()} {key.get_fingerprint().hex()[:16]}…)')
    sftp = client.open_sftp()
    root = sftp.normalize('.')
    entries = sftp.listdir_attr(root)
    print(f'Zielverzeichnis {root}: {len(entries)} Einträge')
    if a.test:
        client.close()
        return

    try:
        with sftp.open(posixpath.join(root, MANIFEST), 'r') as f:
            remote = json.load(f)
    except (FileNotFoundError, ValueError):
        remote = {}
    files = local_files(a.local)
    hashes = {rel: sha(p) for rel, p in files.items()}
    changed = [rel for rel in sorted(files) if remote.get(rel) != hashes[rel]]
    changed.sort(key=lambda r: (r in LAST, LAST.index(r) if r in LAST else 0, r))
    stale = [rel for rel in remote if rel not in files]
    size = sum(os.path.getsize(files[r]) for r in changed)
    print(f'{len(changed)} geänderte Datei(en), {size / 1048576:.1f} MB; {len(stale)} veraltete Datei(en)')
    if a.dry_run:
        for r in changed:
            print('  ↑', r)
        for r in stale:
            print('  ✗', r)
        client.close()
        return

    made, t0 = set(), time.time()
    for i, rel in enumerate(changed, 1):
        target = posixpath.join(root, rel)
        ensure_dir(sftp, posixpath.dirname(target), made)
        sftp.put(files[rel], target)
        remote[rel] = hashes[rel]
        print(f'  [{i}/{len(changed)}] {rel}')
    for rel in stale:
        try:
            sftp.remove(posixpath.join(root, rel))
            print('  entfernt', rel)
        except FileNotFoundError:
            pass
        remote.pop(rel, None)
    # Leer gewordene Ordner veralteter Dateien entfernen (tiefste zuerst)
    dirs = set()
    for r in stale:
        d = posixpath.dirname(r)
        while d:
            dirs.add(d); d = posixpath.dirname(d)
    for d in sorted(dirs, key=lambda d: -d.count('/')):
        try:
            if not sftp.listdir(posixpath.join(root, d)):
                sftp.rmdir(posixpath.join(root, d)); print('  Ordner entfernt', d)
        except (FileNotFoundError, OSError):
            pass
    with sftp.open(posixpath.join(root, MANIFEST), 'w') as f:
        f.write(json.dumps(remote, indent=1, sort_keys=True))
    print(f'Fertig in {time.time() - t0:.1f} s.')
    client.close()


if __name__ == '__main__':
    main()
