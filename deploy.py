#!/usr/bin/env python3
"""
Biensis Gateway - Yeni Pi'ye Kurulum Scripti
PC'den çalıştırılır. Dosyaları Pi'ye kopyalar ve setup.sh'ı çalıştırır.

Kullanım:
  python deploy.py                           # Varsayılan ayarlarla
  python deploy.py --ip 192.168.1.50         # Farklı IP
  python deploy.py --ip 10.0.0.5 --user pi   # Farklı kullanıcı
  python deploy.py --password mypass          # Farklı şifre
"""

import argparse
import os
import sys
import stat

try:
    import paramiko
except ImportError:
    print("paramiko gerekli: pip install paramiko")
    sys.exit(1)

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))

TRANSFER_ITEMS = [
    "api/main.py",
    "ui/index.html",
    "ui/app.js",
    "ui/style.css",
    "config/gateway.json",
    "config/factory_default.json",
    "scripts/setup.sh",
    "scripts/biensis-gateway.service",
    "scripts/ap_mode.sh",
    "gui_launch.sh",
    "requirements.txt",
]


def connect(ip, port, user, password):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Bağlanılıyor: {user}@{ip}:{port}")
    ssh.connect(ip, port=port, username=user, password=password,
                timeout=15, banner_timeout=15, auth_timeout=15)
    print("  Bağlantı başarılı")
    return ssh


def mkdir_p(sftp, remote_dir):
    """Recursive mkdir - üst klasörlerden başlayarak oluşturur"""
    dirs_to_create = []
    d = remote_dir
    while d and d != "/":
        try:
            sftp.stat(d)
            break
        except FileNotFoundError:
            dirs_to_create.insert(0, d)
            d = os.path.dirname(d)
    for d in dirs_to_create:
        print(f"  Klasör oluşturuluyor: {d}")
        sftp.mkdir(d)


def upload_files(ssh, user):
    sftp = ssh.open_sftp()
    remote_base = f"/home/{user}/BIEN_GATEWAY_GUI"

    mkdir_p(sftp, remote_base)

    remote_dirs = set()
    for item in TRANSFER_ITEMS:
        d = os.path.dirname(item)
        if d:
            remote_dirs.add(f"{remote_base}/{d}")

    for d in sorted(remote_dirs):
        mkdir_p(sftp, d)

    TEXT_EXTENSIONS = {".py", ".html", ".js", ".css", ".json", ".sh", ".service", ".txt", ".toml", ".md"}

    for item in TRANSFER_ITEMS:
        local = os.path.join(PROJECT_DIR, item)
        remote = f"{remote_base}/{item}"
        if not os.path.exists(local):
            print(f"  ATLANDI (dosya yok): {item}")
            continue
        print(f"  {item}")

        ext = os.path.splitext(item)[1].lower()
        if ext in TEXT_EXTENSIONS:
            with open(local, "r", encoding="utf-8") as f:
                content = f.read().replace("\r\n", "\n").replace("\r", "\n")
            with sftp.open(remote, "w") as rf:
                rf.write(content)
        else:
            sftp.put(local, remote)

    sftp.close()
    return remote_base


def run_setup(ssh, remote_base):
    setup_script = f"{remote_base}/scripts/setup.sh"

    print("\nsetup.sh çalıştırılıyor (bu birkaç dakika sürebilir)...\n")

    channel = ssh.get_transport().open_session()
    channel.set_combine_stderr(True)
    channel.exec_command(f"bash {setup_script}")

    while True:
        if channel.recv_ready():
            data = channel.recv(4096).decode("utf-8", errors="replace")
            print(data, end="", flush=True)
        if channel.exit_status_ready():
            remaining = channel.recv(65536).decode("utf-8", errors="replace")
            if remaining:
                print(remaining, end="", flush=True)
            break

    exit_code = channel.recv_exit_status()
    if exit_code != 0:
        print(f"\nsetup.sh hata ile çıktı (kod: {exit_code})")
    else:
        print("\nKurulum başarıyla tamamlandı!")

    return exit_code


def main():
    parser = argparse.ArgumentParser(description="Biensis Gateway - Pi'ye Kurulum")
    parser.add_argument("--ip", default="192.168.1.111", help="Pi IP adresi (varsayılan: 192.168.1.111)")
    parser.add_argument("--port", type=int, default=22, help="SSH port (varsayılan: 22)")
    parser.add_argument("--user", default="biensis-rpi", help="SSH kullanıcı (varsayılan: biensis-rpi)")
    parser.add_argument("--password", default="a", help="SSH şifre (varsayılan: a)")
    args = parser.parse_args()

    print("=" * 50)
    print("  Biensis Gateway - Pi'ye Kurulum")
    print("=" * 50)

    ssh = connect(args.ip, args.port, args.user, args.password)

    print("\nDosyalar kopyalanıyor...")
    remote_base = upload_files(ssh, args.user)

    exit_code = run_setup(ssh, remote_base)

    ssh.close()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
