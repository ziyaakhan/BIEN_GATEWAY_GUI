# Raspberry Pi Kurulum Rehberi

Bu rehber, Biensis Gateway GUI'yi sıfır bir Raspberry Pi'ye kurmak için gereken adımları açıklar.

**Hedef ortam:** Raspberry Pi OS (Bookworm), kullanıcı `biensis-rpi`

---

## 1. Sistem Paketleri

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  python3 python3-pip python3-venv python3-dev \
  network-manager bluez bluez-tools libbluetooth-dev \
  git curl jq
```

## 2. Proje Dosyalarını Kopyalama

Geliştirme bilgisayarından Pi'ye:

```bash
scp -r BIEN_GATEWAY_GUI/ biensis-rpi@<PI_IP>:~/BIEN_GATEWAY_GUI/
```

## 3. Python Ortamı

```bash
cd ~/BIEN_GATEWAY_GUI
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

## 4. Manuel Test

```bash
cd ~/BIEN_GATEWAY_GUI
bash gui_launch.sh
```

Tarayıcıdan `http://<PI_IP>` adresini açın. Login: `admin` / `admin`

## 5. Otomatik Başlatma (systemd)

```bash
sudo cp scripts/biensis-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable biensis-gateway
sudo systemctl start biensis-gateway
```

Kontrol:

```bash
sudo systemctl status biensis-gateway
sudo journalctl -u biensis-gateway -f
```

## 6. BLE Gateway Servisi

BLE cihazlarından veri okuyup MQTT'ye ileten ayrı bir script:

```bash
cd ~/ble_gateway
pip install bleak paho-mqtt   # venv içindeyken
```

Manuel test:

```bash
python3 ~/ble_gateway/main.py
```

Servis olarak çalıştırmak isterseniz:

```ini
# /etc/systemd/system/ble-gateway.service
[Unit]
Description=BLE Gateway Data Collector
After=bluetooth.target network.target

[Service]
Type=simple
User=biensis-rpi
WorkingDirectory=/home/biensis-rpi/ble_gateway
ExecStart=/home/biensis-rpi/BIEN_GATEWAY_GUI/venv/bin/python3 main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ble-gateway
sudo systemctl start ble-gateway
```

## 7. AP Modu (Hotspot)

WiFi'ye bağlanamadığında otomatik hotspot açmak için:

```bash
sudo apt install -y hostapd dnsmasq
sudo systemctl disable hostapd dnsmasq   # Manuel yönetilecek
```

AP modu scripti: `scripts/ap_mode.sh` — cron veya systemd ile tetiklenebilir.
Hotspot adı: **Biensis-Gateway**, IP: `192.168.4.1`

## 8. Port Yönlendirme

Port 80'den gelen trafik 8000'e yönlendirilir (iptables).
Bu kural `biensis-gateway.service` içinde otomatik uygulanır.

Kalıcılık için:

```bash
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

---

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| Servis başlamıyor | `sudo journalctl -u biensis-gateway -n 50` |
| Port 8000 meşgul | `sudo lsof -i :8000` ile process bul, `sudo kill <PID>` |
| BLE tarama çalışmıyor | `sudo systemctl status bluetooth`, `bluetoothctl show` |
| LoRaWAN TOML yazılamıyor | sudoers dosyasını kontrol et |
| WiFi tarama tek ağ gösteriyor | `sudo nmcli dev wifi list --rescan yes` ile test et |
| Sayfa açılmıyor (port 80) | `sudo iptables -t nat -L PREROUTING` ile kuralı kontrol et |
