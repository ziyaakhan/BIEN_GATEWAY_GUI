# Raspberry Pi Kurulum Rehberi

**Hedef ortam:** Raspberry Pi OS (Bookworm)

---

## Otomatik Kurulum (Önerilen)

PC'den tek komutla yeni bir Pi'ye kurulum:

```bash
# Varsayılan ayarlarla (IP: 192.168.1.111, kullanıcı: biensis-rpi, şifre: a)
python deploy.py

# Farklı IP ile
python deploy.py --ip 192.168.1.50

# Tüm parametreleri belirterek
python deploy.py --ip 10.0.0.5 --user biensis-rpi --password a
```

Bu komut:
1. Tüm proje dosyalarını Pi'ye kopyalar
2. Sistem paketlerini kurar
3. Python ortamını hazırlar
4. Gateway GUI servisini oluşturup başlatır
5. BLE Gateway servisini kurar (varsa)
6. Port 80 → 8000 yönlendirmesini ayarlar
7. Kurulum bitince IP adresi ve giriş bilgilerini gösterir

**Gereksinim:** PC'de `paramiko` kurulu olmalı: `pip install paramiko`

---

## Manuel Kurulum

Otomatik kurulum yerine adım adım yapmak isterseniz:

### 1. Dosyaları Kopyalama

```bash
scp -r BIEN_GATEWAY_GUI/ biensis-rpi@<PI_IP>:~/BIEN_GATEWAY_GUI/
```

### 2. Pi'de Setup Scriptini Çalıştırma

```bash
ssh biensis-rpi@<PI_IP>
bash ~/BIEN_GATEWAY_GUI/scripts/setup.sh
```

`setup.sh` şunları yapar:
- Sistem paketleri kurulumu (python3, network-manager, bluez, vb.)
- Python venv oluşturma ve bağımlılık kurulumu
- Config dosyalarını oluşturma
- Passwordless sudo ayarı
- Gateway GUI systemd servisi
- BLE Gateway systemd servisi
- iptables port yönlendirme (kalıcı)

### 3. Kontrol

```bash
sudo systemctl status biensis-gateway
sudo systemctl status ble-gateway
```

Tarayıcıdan: `http://<PI_IP>` | Giriş: `admin` / `admin`

---

## Güncelleme

Mevcut bir Pi'ye kod güncellemesi göndermek için de aynı `deploy.py` kullanılabilir.
Dosyalar güncellenir ve servisler yeniden başlatılır.

---

## Servis Yönetimi

```bash
# GUI servisi
sudo systemctl status biensis-gateway
sudo systemctl restart biensis-gateway
sudo journalctl -u biensis-gateway -f

# BLE servisi
sudo systemctl status ble-gateway
sudo systemctl restart ble-gateway
sudo journalctl -u ble-gateway -f
```

---

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| Servis başlamıyor | `sudo journalctl -u biensis-gateway -n 50` |
| Port 8000 meşgul | `sudo lsof -i :8000` → `sudo kill <PID>` |
| BLE tarama çalışmıyor | `sudo systemctl status bluetooth` |
| LoRaWAN TOML yazılamıyor | `sudo cat /etc/sudoers.d/biensis-rpi` kontrol et |
| WiFi tek ağ gösteriyor | `sudo nmcli dev wifi list --rescan yes` |
| Sayfa açılmıyor (port 80) | `sudo iptables -t nat -L PREROUTING` |
| deploy.py bağlanamıyor | Pi IP, kullanıcı adı ve şifreyi kontrol et |
