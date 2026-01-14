# Raspberry Pi Hızlı Başlangıç Rehberi

Bu rehber, Gateway GUI uygulamasını Raspberry Pi'de hiçbir şey değiştirmeden çalıştırmak için gereken adımları içerir.

## Adım 1: Dosyaları Raspberry Pi'ye Aktarın

### Windows'tan (SCP ile):
```bash
# PowerShell veya CMD'de
scp -r C:\Users\Biensis\Desktop\gateway-gui\* pi@raspberrypi.local:/opt/gateway/
```

### Linux/Mac'ten:
```bash
scp -r ~/Desktop/gateway-gui/* pi@raspberrypi.local:/opt/gateway/
```

### Alternatif: USB ile
1. Dosyaları USB belleğe kopyalayın
2. USB'yi Raspberry Pi'ye takın
3. Raspberry Pi'de:
```bash
sudo mkdir -p /opt/gateway
sudo cp -r /media/pi/USB_NAME/gateway-gui/* /opt/gateway/
sudo chown -R pi:pi /opt/gateway
```

## Adım 2: Raspberry Pi'de Kurulum

SSH ile bağlanın:
```bash
ssh pi@raspberrypi.local
# veya IP ile
ssh pi@192.168.1.XXX
```

### 2.1. Gerekli Paketleri Kurun

```bash
# Sistem paketlerini güncelle
sudo apt update
sudo apt upgrade -y

# Temel paketleri kur
sudo apt install -y python3 python3-pip python3-venv git curl jq \
    network-manager wireless-tools iw wpa_supplicant \
    bluez bluez-tools libbluetooth-dev \
    libffi-dev libssl-dev build-essential
```

### 2.2. Proje Dizinine Gidin

```bash
cd /opt/gateway
```

### 2.3. Sanal Ortam Oluşturun

```bash
python3 -m venv venv
source venv/bin/activate
```

### 2.4. Bağımlılıkları Kurun

```bash
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

**Not:** Eğer `bluepy` kurulumunda sorun yaşarsanız:
```bash
sudo apt install -y libbluetooth-dev
pip install bluepy
```

## Adım 3: Uygulamayı Başlatın

### 3.1. Manuel Başlatma (Test için)

```bash
cd /opt/gateway
source venv/bin/activate
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

**Başarılı başlatma çıktısı:**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### 3.2. Tarayıcıdan Erişim

1. Raspberry Pi'nin IP adresini öğrenin:
```bash
hostname -I
```

2. Tarayıcınızda şu adrese gidin:
```
http://RASPBERRY_PI_IP:8000
```

Örnek: `http://192.168.1.100:8000`

3. Giriş yapın:
   - Kullanıcı Adı: `admin`
   - Şifre: `admin`

## Adım 4: Servis Olarak Çalıştırma (Opsiyonel)

Uygulamanın her açılışta otomatik başlaması için:

### 4.1. Servis Dosyası Oluşturun

```bash
sudo nano /etc/systemd/system/gateway-api.service
```

Aşağıdaki içeriği yapıştırın:

```ini
[Unit]
Description=Gateway Configuration API
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/gateway
Environment="PATH=/opt/gateway/venv/bin"
ExecStart=/opt/gateway/venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 4.2. Servisi Başlatın

```bash
sudo systemctl daemon-reload
sudo systemctl enable gateway-api
sudo systemctl start gateway-api
```

### 4.3. Durumu Kontrol Edin

```bash
sudo systemctl status gateway-api
```

## Sorun Giderme

### Port 8000 zaten kullanımda

```bash
# Port'u kullanan process'i bul ve durdur
sudo lsof -ti :8000 | xargs sudo kill -9 2>/dev/null || true
pkill -f uvicorn 2>/dev/null || true
```

### Dosya izinleri sorunu

```bash
sudo chown -R pi:pi /opt/gateway
chmod +x /opt/gateway/venv/bin/*
```

### Modül bulunamadı hatası

```bash
cd /opt/gateway
source venv/bin/activate
pip install -r requirements.txt
```

### Config dosyaları oluşturulmuyor

```bash
mkdir -p /opt/gateway/config
chmod 755 /opt/gateway/config
```

## Hızlı Test

```bash
# Health check
curl http://localhost:8000/api/health

# Login testi
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

## Logları Görüntüleme

### Manuel başlatmada:
Terminal'de direkt görünür.

### Servis olarak:
```bash
sudo journalctl -u gateway-api -f
```

## Durdurma

### Manuel başlatmada:
Terminal'de `Ctrl+C`

### Servis olarak:
```bash
sudo systemctl stop gateway-api
```

## Önemli Notlar

1. **İlk girişten sonra şifreyi değiştirin!**
2. **Production'da HTTPS kullanın** (nginx reverse proxy ile)
3. **Firewall ayarlarını kontrol edin** (port 8000 açık olmalı)
4. **ThingsBoard Gateway config dizini:** `/etc/thingsboard-gateway/config/` (varsayılan)

## Yardım

Sorun yaşıyorsanız:
1. Logları kontrol edin: `sudo journalctl -u gateway-api -n 50`
2. Port durumunu kontrol edin: `sudo netstat -tulpn | grep 8000`
3. Python versiyonunu kontrol edin: `python3 --version` (3.7+ olmalı)
