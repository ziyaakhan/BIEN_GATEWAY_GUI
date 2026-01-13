# Raspberry Pi Gateway Kurulum ve Entegrasyon Rehberi

Bu doküman, Gateway GUI uygulamasını Raspberry Pi'ye kurma ve sistem ayarlarını entegre etme sürecini açıklar.

---

## 1. Raspberry Pi'ye Kurulum

### 1.1. Sistem Paketlerini Kurma (APT)

```bash
# Raspberry Pi'ye SSH ile bağlan
ssh pi@raspberrypi.local

# Sistem paketlerini güncelle
sudo apt update
sudo apt upgrade -y

# Temel paketleri kur
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    git \
    curl \
    jq \
    network-manager \
    wireless-tools \
    iw \
    wpa_supplicant \
    bluez \
    bluez-tools \
    libbluetooth-dev \
    libffi-dev \
    libssl-dev

# Serial port desteği için
sudo apt install -y \
    minicom \
    setserial \
    udev

# NetworkManager CLI araçları (WiFi yönetimi için)
sudo apt install -y network-manager

# Systemd servis yönetimi için (genellikle zaten kurulu)
# systemctl --version
```

### 1.2. Dosyaları Aktarma

```bash
# Proje dizinini oluştur
sudo mkdir -p /opt/gateway
sudo chown pi:pi /opt/gateway

# Dosyaları aktar (kendi bilgisayarınızdan)
scp -r gateway-gui/* pi@raspberrypi.local:/opt/gateway/
```

### 1.3. Python Sanal Ortamı ve Bağımlılıklar

```bash
cd /opt/gateway

# Sanal ortam oluştur
python3 -m venv venv

# Sanal ortamı aktifleştir
source venv/bin/activate

# pip'i güncelle
pip install --upgrade pip setuptools wheel

# Python bağımlılıklarını kur
pip install -r requirements.txt

# Kurulumu doğrula
pip list
```

**Not:** Eğer bazı paketler kurulmuyorsa, gerekli sistem kütüphanelerini kurun:

```bash
# pyserial için
sudo apt install -y libudev-dev

# watchdog için
sudo apt install -y inotify-tools

# BLE için (opsiyonel)
sudo apt install -y libbluetooth-dev
pip install bluepy  # Manuel kurulum gerekebilir
```

### 1.4. Kurulum Doğrulama

```bash
# Python versiyonunu kontrol et
python3 --version  # Python 3.7+ olmalı

# Sanal ortam aktif mi kontrol et
which python  # /opt/gateway/venv/bin/python göstermeli

# Paketleri kontrol et
pip list | grep -E "fastapi|uvicorn|watchdog|pyserial"
```

### 1.5. Manuel Test (Servise Eklemeden Önce)

Servise eklemeden önce uygulamayı manuel olarak başlatıp test edebilirsiniz:

```bash
cd /opt/gateway

# Sanal ortamı aktifleştir (eğer aktif değilse)
source venv/bin/activate

# Uygulamayı başlat
uvicorn api.main:app --host 0.0.0.0 --port 8000

# Veya daha detaylı log ile:
uvicorn api.main:app --host 0.0.0.0 --port 8000 --log-level debug --reload
```

**Test Adımları:**

1. **Tarayıcıdan Test:**
   ```bash
   # Raspberry Pi'nin IP adresini öğren
   hostname -I
   # veya
   ip addr show wlan0 | grep "inet "
   ```
   
   Tarayıcıdan şu adrese gidin:
   ```
   http://RASPBERRY_PI_IP:8000
   ```
   
   Örnek: `http://192.168.1.100:8000`

2. **API Endpoint'lerini Test Etme:**
   
   Başka bir terminal açın ve:
   ```bash
   # Health check
   curl http://localhost:8000/api/health
   
   # Login testi
   curl -X POST http://localhost:8000/api/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin"}' \
     -c cookies.txt
   
   # Config okuma (login sonrası)
   curl http://localhost:8000/api/config -b cookies.txt
   ```

3. **Hata Kontrolü:**
   
   Terminal'de hata mesajları görünecektir. Örnek hatalar:
   - Port zaten kullanılıyor: `Address already in use` → Başka bir servis 8000 portunu kullanıyor
   - Modül bulunamadı: `ModuleNotFoundError` → `pip install -r requirements.txt` çalıştırın
   - Dosya bulunamadı: `FileNotFoundError` → Dosya yollarını kontrol edin

4. **Durdurma:**
   
   Çalışan uygulamayı durdurmak için terminal'de `Ctrl+C` tuşlarına basın.

5. **Arka Planda Çalıştırma (Test için):**
   
   Eğer terminal'i kapatmak istiyorsanız ama uygulama çalışmaya devam etsin:
   ```bash
   # Arka planda başlat
   nohup uvicorn api.main:app --host 0.0.0.0 --port 8000 > gateway.log 2>&1 &
   
   # Process ID'yi kaydet
   echo $! > gateway.pid
   
   # Logları görüntüle
   tail -f gateway.log
   
   # Durdurma
   kill $(cat gateway.pid)
   ```

**Test Checklist:**

- [ ] Uygulama başladı mı? (Terminal'de "Application startup complete" mesajı görünmeli)
- [ ] Tarayıcıdan login ekranı açılıyor mu?
- [ ] Login yapabiliyor musunuz? (admin/admin)
- [ ] Tüm menü bölümleri görünüyor mu?
- [ ] Ayarları kaydedebiliyor musunuz?
- [ ] API endpoint'leri çalışıyor mu?

**Sorun Giderme:**

- **Port 8000 kullanımda (Address already in use):** 
  
  Bu hata, port 8000'in başka bir process tarafından kullanıldığını gösterir. Çözüm:
  
  ```bash
  # 1. Hangi process kullanıyor kontrol et
  sudo lsof -i :8000
  # veya
  sudo netstat -tulpn | grep 8000
  # veya
  sudo ss -tulpn | grep :8000
  ```
  
  Çıktı örneği:
  ```
  COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
  python3  1234  pi    3u  IPv4  12345      0t0  TCP *:8000 (LISTEN)
  ```
  
  **Çözüm Seçenekleri:**
  
  **Seçenek 1: Çalışan process'i durdur**
  ```bash
  # Process ID'yi bul (yukarıdaki komuttan, örnek: 1234)
  sudo kill 1234
  
  # Veya zorla durdur
  sudo kill -9 1234
  
  # Tekrar başlat
  uvicorn api.main:app --host 0.0.0.0 --port 8000
  ```
  
  **Seçenek 2: Tüm Python/uvicorn process'lerini durdur**
  ```bash
  # Tüm uvicorn process'lerini bul ve durdur
  pkill -f uvicorn
  
  # Veya tüm Python process'lerini (dikkatli kullanın!)
  # pkill python3
  
  # Tekrar başlat
  uvicorn api.main:app --host 0.0.0.0 --port 8000
  ```
  
  **Seçenek 3: Farklı port kullan**
  ```bash
  # Port 8001 kullan
  uvicorn api.main:app --host 0.0.0.0 --port 8001
  ```
  
  **Seçenek 4: Servis çalışıyorsa durdur**
  ```bash
  # Eğer servis olarak kurulduysa
  sudo systemctl stop gateway-api.service
  
  # Servis durumunu kontrol et
  sudo systemctl status gateway-api.service
  
  # Servisi devre dışı bırak (manuel test için)
  sudo systemctl disable gateway-api.service
  ```
  
  **Hızlı Çözüm (Tüm seçenekleri birleştiren script):**
  ```bash
  # Port 8000'i kullanan process'i bul ve durdur
  sudo lsof -ti :8000 | xargs sudo kill -9 2>/dev/null || true
  
  # Uvicorn process'lerini durdur
  pkill -f uvicorn 2>/dev/null || true
  
  # Kısa bir bekleme
  sleep 2
  
  # Tekrar başlat
  cd /opt/gateway
  source venv/bin/activate
  uvicorn api.main:app --host 0.0.0.0 --port 8000
  ```

- **Permission denied:**
  ```bash
  # Dosya izinlerini kontrol et
  ls -la /opt/gateway/
  
  # Gerekirse sahipliği değiştir
  sudo chown -R pi:pi /opt/gateway
  ```

- **ModuleNotFoundError:**
  ```bash
  # Sanal ortam aktif mi kontrol et
  which python  # /opt/gateway/venv/bin/python olmalı
  
  # Paketleri tekrar kur
  pip install -r requirements.txt
  ```

Manuel test başarılı olduktan sonra servise ekleyebilirsiniz.

### 1.3. Sistem Servisi Olarak Çalıştırma

```bash
# Systemd servis dosyası oluştur
sudo nano /etc/systemd/system/gateway-api.service
```

Servis dosyası içeriği:

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

Servisi başlat:

```bash
# Servisi aktifleştir
sudo systemctl daemon-reload
sudo systemctl enable gateway-api.service
sudo systemctl start gateway-api.service

# Durumu kontrol et
sudo systemctl status gateway-api.service

# Logları görüntüle
sudo journalctl -u gateway-api.service -f
```

---

## 2. Konfigürasyon Dosyasını Okuma/Yazma

### 2.1. Konfigürasyon Dosyası Yolu

Tüm ayarlar `/opt/gateway/config/gateway.json` dosyasında saklanır.

### 2.2. Python ile Okuma

```python
import json
from pathlib import Path

CONFIG_FILE = Path("/opt/gateway/config/gateway.json")

def load_config():
    """Konfigürasyon dosyasını yükle"""
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

# Kullanım
config = load_config()
print(config['gateway_name'])
print(config['rs485']['enabled'])
print(config['wifi']['ssid'])
```

### 2.3. Python ile Yazma

```python
def save_config(config):
    """Konfigürasyon dosyasını kaydet"""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

# Kullanım
config = load_config()
config['gateway_name'] = "Yeni Gateway"
save_config(config)
```

### 2.4. Shell Script ile Okuma/Yazma

```bash
#!/bin/bash
CONFIG_FILE="/opt/gateway/config/gateway.json"

# Okuma
GATEWAY_NAME=$(jq -r '.gateway_name' $CONFIG_FILE)
RS485_ENABLED=$(jq -r '.rs485.enabled' $CONFIG_FILE)

# Yazma
jq '.gateway_name = "Yeni İsim"' $CONFIG_FILE > /tmp/gateway.json && mv /tmp/gateway.json $CONFIG_FILE
```

---

## 3. Değişiklikleri Dinleme ve Haber Alma

### 3.1. Yöntem 1: Dosya İzleme (File Watching) - Önerilen

Python ile dosya değişikliklerini izleme:

```python
#!/usr/bin/env python3
"""
config_watcher.py - Konfigürasyon dosyası değişikliklerini izler
"""

import json
import time
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

CONFIG_FILE = Path("/opt/gateway/config/gateway.json")
LAST_CONFIG = None

class ConfigHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path == str(CONFIG_FILE):
            self.handle_config_change()
    
    def handle_config_change(self):
        global LAST_CONFIG
        
        try:
            with open(CONFIG_FILE, 'r') as f:
                new_config = json.load(f)
            
            if LAST_CONFIG is None:
                LAST_CONFIG = new_config
                return
            
            # Değişiklikleri kontrol et
            changes = detect_changes(LAST_CONFIG, new_config)
            
            if changes:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Konfigürasyon değişti!")
                for change in changes:
                    print(f"  - {change}")
                
                # Değişiklikleri uygula
                apply_changes(changes, new_config)
            
            LAST_CONFIG = new_config
            
        except Exception as e:
            print(f"Hata: {e}")

def detect_changes(old_config, new_config):
    """Değişiklikleri tespit et"""
    changes = []
    
    # RS485 değişiklikleri
    if old_config.get('rs485') != new_config.get('rs485'):
        changes.append('RS485 ayarları değişti')
    
    # WiFi değişiklikleri
    if old_config.get('wifi', {}).get('ssid') != new_config.get('wifi', {}).get('ssid'):
        changes.append('WiFi SSID değişti')
    
    # BLE değişiklikleri
    if old_config.get('ble') != new_config.get('ble'):
        changes.append('BLE ayarları değişti')
    
    # LoRaWAN değişiklikleri
    if old_config.get('lorawan') != new_config.get('lorawan'):
        changes.append('LoRaWAN ayarları değişti')
    
    return changes

def apply_changes(changes, config):
    """Değişiklikleri sisteme uygula"""
    for change in changes:
        if 'WiFi' in change:
            apply_wifi_config(config['wifi'])
        elif 'RS485' in change:
            apply_rs485_config(config['rs485'])
        elif 'BLE' in change:
            apply_ble_config(config['ble'])
        elif 'LoRaWAN' in change:
            apply_lorawan_config(config['lorawan'])

if __name__ == "__main__":
    # İlk konfigürasyonu yükle
    with open(CONFIG_FILE, 'r') as f:
        LAST_CONFIG = json.load(f)
    
    # Dosya izleyiciyi başlat
    event_handler = ConfigHandler()
    observer = Observer()
    observer.schedule(event_handler, str(CONFIG_FILE.parent), recursive=False)
    observer.start()
    
    try:
        print("Konfigürasyon izleyici başlatıldı...")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    
    observer.join()
```

**Not:** `watchdog` paketi `requirements.txt` ile otomatik olarak kurulur. Eğer manuel kurulum gerekiyorsa:

```bash
pip install watchdog
```

Servis olarak çalıştırma:

```ini
[Unit]
Description=Gateway Config Watcher
After=gateway-api.service

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/gateway
Environment="PATH=/opt/gateway/venv/bin"
ExecStart=/opt/gateway/venv/bin/python3 /opt/gateway/config_watcher.py
Restart=always

[Install]
WantedBy=multi-user.target
```

### 3.2. Yöntem 2: Polling (Periyodik Kontrol)

```python
#!/usr/bin/env python3
"""
config_poller.py - Konfigürasyon dosyasını periyodik olarak kontrol eder
"""

import json
import time
from pathlib import Path

CONFIG_FILE = Path("/opt/gateway/config/gateway.json")
CHECK_INTERVAL = 5  # saniye
LAST_CONFIG_HASH = None

def get_config_hash():
    """Konfigürasyon dosyasının hash'ini al"""
    import hashlib
    with open(CONFIG_FILE, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

def check_config_changes():
    """Konfigürasyon değişikliklerini kontrol et"""
    global LAST_CONFIG_HASH
    
    current_hash = get_config_hash()
    
    if LAST_CONFIG_HASH is None:
        LAST_CONFIG_HASH = current_hash
        return False
    
    if current_hash != LAST_CONFIG_HASH:
        LAST_CONFIG_HASH = current_hash
        return True
    
    return False

if __name__ == "__main__":
    print("Konfigürasyon kontrolcüsü başlatıldı...")
    
    while True:
        if check_config_changes():
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Konfigürasyon değişti!")
            
            # Konfigürasyonu yükle ve uygula
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
            
            apply_all_configs(config)
        
        time.sleep(CHECK_INTERVAL)
```

### 3.3. Yöntem 3: API Webhook (Gelişmiş)

Backend'e webhook endpoint'i ekleyin:

```python
# api/main.py içine ekle

@app.post("/api/config/webhook")
async def config_webhook(request: Request):
    """Konfigürasyon değişikliği webhook'u"""
    # Bu endpoint'i dış servislerden çağırabilirsiniz
    # veya config_watcher.py buraya POST isteği gönderebilir
    pass
```

---

## 4. Sistem Ayarlarını Uygulama

### 4.1. WiFi Ayarlarını Uygulama

```python
import subprocess
import json

def apply_wifi_config(wifi_config):
    """WiFi ayarlarını sisteme uygula"""
    ssid = wifi_config.get('ssid')
    password = wifi_config.get('password')
    country = wifi_config.get('country', 'TR')
    
    if not ssid:
        print("WiFi SSID belirtilmemiş")
        return
    
    # NetworkManager kullanarak (nmcli)
    try:
        # WiFi'yi kapat
        subprocess.run(['nmcli', 'radio', 'wifi', 'off'], check=False)
        time.sleep(1)
        
        # WiFi'yi aç
        subprocess.run(['nmcli', 'radio', 'wifi', 'on'], check=False)
        time.sleep(2)
        
        # Ülke kodunu ayarla
        subprocess.run(['sudo', 'iw', 'reg', 'set', country], check=False)
        
        # WiFi bağlantısını oluştur/güncelle
        if password:
            # Şifreli ağ
            subprocess.run([
                'nmcli', 'connection', 'add',
                'type', 'wifi',
                'con-name', f'Gateway-WiFi-{ssid}',
                'ifname', 'wlan0',
                'ssid', ssid,
                'wifi-sec.key-mgmt', 'wpa-psk',
                'wifi-sec.psk', password
            ], check=False)
        else:
            # Açık ağ
            subprocess.run([
                'nmcli', 'connection', 'add',
                'type', 'wifi',
                'con-name', f'Gateway-WiFi-{ssid}',
                'ifname', 'wlan0',
                'ssid', ssid
            ], check=False)
        
        # Bağlantıyı aktifleştir
        subprocess.run([
            'nmcli', 'connection', 'up', f'Gateway-WiFi-{ssid}'
        ], check=False)
        
        print(f"WiFi bağlantısı oluşturuldu: {ssid}")
        
    except Exception as e:
        print(f"WiFi ayarları uygulanırken hata: {e}")

# Alternatif: wpa_supplicant kullanarak
def apply_wifi_config_wpa(wifi_config):
    """wpa_supplicant kullanarak WiFi ayarlarını uygula"""
    ssid = wifi_config.get('ssid')
    password = wifi_config.get('password')
    
    wpa_config = f"""
network={{
    ssid="{ssid}"
    {"psk=\"" + password + "\"" if password else "key_mgmt=NONE"}
}}
"""
    
    with open('/etc/wpa_supplicant/wpa_supplicant.conf', 'a') as f:
        f.write(wpa_config)
    
    subprocess.run(['sudo', 'wpa_cli', '-i', 'wlan0', 'reconfigure'], check=False)
```

### 4.2. RS-485 Ayarlarını Uygulama

```python
import serial
import json

def apply_rs485_config(rs485_config):
    """RS-485 ayarlarını uygula"""
    enabled = rs485_config.get('enabled', False)
    
    if not enabled:
        print("RS-485 devre dışı")
        return
    
    baudrate = rs485_config.get('baudrate', 9600)
    parity = rs485_config.get('parity', 'none')
    data_bits = rs485_config.get('data_bits', 8)
    stop_bits = rs485_config.get('stop_bits', 1)
    
    # Parity mapping
    parity_map = {
        'none': serial.PARITY_NONE,
        'even': serial.PARITY_EVEN,
        'odd': serial.PARITY_ODD
    }
    
    # Stop bits mapping
    stop_bits_map = {
        1: serial.STOPBITS_ONE,
        1.5: serial.STOPBITS_ONE_POINT_FIVE,
        2: serial.STOPBITS_TWO
    }
    
    try:
        # Serial port aç (örnek: /dev/ttyUSB0)
        ser = serial.Serial(
            port='/dev/ttyUSB0',
            baudrate=baudrate,
            bytesize=data_bits,
            parity=parity_map.get(parity, serial.PARITY_NONE),
            stopbits=stop_bits_map.get(stop_bits, serial.STOPBITS_ONE),
            timeout=rs485_config.get('timeout', 1000) / 1000.0
        )
        
        print(f"RS-485 portu açıldı: {baudrate} baud")
        
        # Modbus ayarlarını uygula
        modbus_config = load_config().get('modbus', {})
        if modbus_config.get('enabled'):
            apply_modbus_config(modbus_config, ser)
        
    except Exception as e:
        print(f"RS-485 ayarları uygulanırken hata: {e}")

def apply_modbus_config(modbus_config, serial_port):
    """Modbus ayarlarını uygula"""
    slave_id = modbus_config.get('slave_id', 1)
    polling_interval = modbus_config.get('polling_interval', 1000)
    
    print(f"Modbus aktif: Slave ID={slave_id}, Polling={polling_interval}ms")
    
    # Modbus RTU implementasyonu buraya gelecek
    # Örnek: pymodbus kütüphanesi kullanılabilir
```

### 4.3. BLE Ayarlarını Uygulama

BLE servisi için özel bir Python scripti oluşturulmuştur: `services/ble_service.py`

**BLE Servisi Kurulumu:**

```bash
cd /opt/gateway

# BLE kütüphanesini kur (bluepy - Raspberry Pi için önerilir)
pip install bluepy

# Alternatif: bleak (cross-platform, async)
# pip install bleak

# Script'i çalıştırılabilir yap
chmod +x services/ble_service.py
```

**BLE Servisini Manuel Test:**

```bash
cd /opt/gateway
source venv/bin/activate

# Servisi başlat
python3 services/ble_service.py
```

**BLE Servisini Systemd Servisi Olarak Çalıştırma:**

```bash
# Servis dosyası oluştur
sudo nano /etc/systemd/system/gateway-ble.service
```

Servis dosyası içeriği:

```ini
[Unit]
Description=Gateway BLE Service
After=network.target bluetooth.target
Requires=bluetooth.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/gateway
Environment="PATH=/opt/gateway/venv/bin"
ExecStart=/opt/gateway/venv/bin/python3 /opt/gateway/services/ble_service.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Servisi başlat:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gateway-ble.service
sudo systemctl start gateway-ble.service

# Durumu kontrol et
sudo systemctl status gateway-ble.service

# Logları görüntüle
sudo journalctl -u gateway-ble.service -f
# veya
tail -f /opt/gateway/logs/ble_service.log
```

**BLE Servisi Özellikleri:**

- ✅ Otomatik cihaz tarama
- ✅ Server MAC adresine otomatik bağlanma
- ✅ Read/Write/Notify operasyonları
- ✅ Otomatik yeniden bağlanma
- ✅ Periyodik okuma/yazma
- ✅ Konfigürasyon değişikliklerini otomatik algılama

**Python ile BLE Ayarlarını Uygulama:**

```python
import subprocess
import json

def apply_ble_config(ble_config):
    """BLE ayarlarını uygula"""
    enabled = ble_config.get('enabled', False)
    
    if not enabled:
        print("BLE devre dışı")
        # BLE servisini durdur
        subprocess.run(['sudo', 'systemctl', 'stop', 'gateway-ble.service'], check=False)
        return
    
    # BLE servisini başlat/yeniden başlat
    # Konfigürasyon gateway.json'da olduğu için servis otomatik okuyacak
    subprocess.run(['sudo', 'systemctl', 'restart', 'gateway-ble.service'], check=False)
    
    print("BLE ayarları uygulandı")
```

**Bluetooth Donanım Kontrolü:**

```bash
# Bluetooth servisini kontrol et
sudo systemctl status bluetooth

# Bluetooth'u aktifleştir
sudo systemctl start bluetooth
sudo systemctl enable bluetooth

# Bluetooth adaptörünü kontrol et
hciconfig
# veya
bluetoothctl show

# Bluetooth cihazlarını tarama (test için)
bluetoothctl scan on
```

**Sorun Giderme:**

- **Bluetooth adaptörü bulunamadı:**
  ```bash
  # Adaptörü kontrol et
  hciconfig
  
  # Adaptörü resetle
  sudo hciconfig hci0 reset
  ```

- **Permission denied hatası:**
  ```bash
  # pi kullanıcısını bluetooth grubuna ekle
  sudo usermod -aG bluetooth pi
  
  # Yeniden login gerekebilir
  ```

- **bluepy kurulum hatası:**
  ```bash
  # Gerekli sistem paketlerini kur
  sudo apt install -y libbluetooth-dev
  
  # Tekrar kur
  pip install bluepy
  ```

### 4.4. LoRaWAN Ayarlarını Uygulama

```python
import subprocess
import json

def apply_lorawan_config(lorawan_config):
    """LoRaWAN ayarlarını uygula"""
    enabled = lorawan_config.get('enabled', False)
    
    if not enabled:
        print("LoRaWAN devre dışı")
        subprocess.run(['sudo', 'systemctl', 'stop', 'lorawan-gateway'], check=False)
        return
    
    gateway_id = lorawan_config.get('gateway_id')
    forwarder_type = lorawan_config.get('forwarder_type', 'mqtt')
    
    # LoRaWAN gateway konfigürasyonu
    if forwarder_type == 'mqtt':
        mqtt_server = lorawan_config.get('mqtt_server')
        mqtt_port = lorawan_config.get('mqtt_port', 1883)
        
        # ChirpStack veya Packet Forwarder konfigürasyonu
        gateway_config = {
            'gateway_ID': gateway_id,
            'server_address': mqtt_server,
            'serv_port_up': mqtt_port,
            'serv_port_down': mqtt_port
        }
        
        # Konfigürasyon dosyasını kaydet
        with open('/opt/gateway/config/packet-forwarder.json', 'w') as f:
            json.dump(gateway_config, f, indent=2)
    
    elif forwarder_type == 'udp':
        udp_server = lorawan_config.get('udp_server')
        udp_port = lorawan_config.get('udp_port', 1700)
        
        gateway_config = {
            'gateway_ID': gateway_id,
            'server_address': udp_server,
            'serv_port_up': udp_port,
            'serv_port_down': udp_port
        }
        
        with open('/opt/gateway/config/packet-forwarder.json', 'w') as f:
            json.dump(gateway_config, f, indent=2)
    
    # LoRaWAN gateway servisini yeniden başlat
    subprocess.run(['sudo', 'systemctl', 'restart', 'lorawan-gateway'], check=False)
    
    print(f"LoRaWAN ayarları uygulandı: {forwarder_type}")
```

---

## 5. Tam Entegrasyon Örneği

Tüm fonksiyonları birleştiren ana script:

```python
#!/usr/bin/env python3
"""
gateway_config_manager.py - Tüm konfigürasyon değişikliklerini yönetir
"""

import json
import time
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

CONFIG_FILE = Path("/opt/gateway/config/gateway.json")

class GatewayConfigManager(FileSystemEventHandler):
    def __init__(self):
        self.last_config = self.load_config()
    
    def load_config(self):
        """Konfigürasyonu yükle"""
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    
    def on_modified(self, event):
        if event.src_path == str(CONFIG_FILE):
            self.handle_config_change()
    
    def handle_config_change(self):
        """Konfigürasyon değişikliğini işle"""
        try:
            new_config = self.load_config()
            
            # Her bölümü kontrol et ve uygula
            if self.last_config.get('wifi') != new_config.get('wifi'):
                print("[WiFi] Ayarlar değişti")
                apply_wifi_config(new_config.get('wifi', {}))
            
            if self.last_config.get('rs485') != new_config.get('rs485'):
                print("[RS485] Ayarlar değişti")
                apply_rs485_config(new_config.get('rs485', {}))
            
            if self.last_config.get('modbus') != new_config.get('modbus'):
                print("[Modbus] Ayarlar değişti")
                # Modbus ayarları RS485 ile birlikte uygulanır
            
            if self.last_config.get('ble') != new_config.get('ble'):
                print("[BLE] Ayarlar değişti")
                apply_ble_config(new_config.get('ble', {}))
            
            if self.last_config.get('lorawan') != new_config.get('lorawan'):
                print("[LoRaWAN] Ayarlar değişti")
                apply_lorawan_config(new_config.get('lorawan', {}))
            
            if self.last_config.get('gateway_name') != new_config.get('gateway_name'):
                print(f"[Sistem] Gateway adı değişti: {new_config.get('gateway_name')}")
                # Hostname değiştirme (opsiyonel)
                # subprocess.run(['sudo', 'hostnamectl', 'set-hostname', new_config.get('gateway_name')])
            
            self.last_config = new_config
            
        except Exception as e:
            print(f"Hata: {e}")

# Fonksiyonlar buraya gelecek (yukarıdaki apply_* fonksiyonları)

if __name__ == "__main__":
    manager = GatewayConfigManager()
    
    observer = Observer()
    observer.schedule(manager, str(CONFIG_FILE.parent), recursive=False)
    observer.start()
    
    print("Gateway Konfigürasyon Yöneticisi başlatıldı...")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    
    observer.join()
```

Servis olarak çalıştırma:

```ini
[Unit]
Description=Gateway Config Manager
After=gateway-api.service

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/gateway
Environment="PATH=/opt/gateway/venv/bin"
ExecStart=/opt/gateway/venv/bin/python3 /opt/gateway/gateway_config_manager.py
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## 6. WiFi Tarama Fonksiyonunu Gerçekleştirme

Backend'deki `scan_wifi_networks()` fonksiyonunu gerçek implementasyonla değiştirin:

```python
# api/main.py içinde

def scan_wifi_networks():
    """WiFi ağlarını tara (gerçek implementasyon)"""
    try:
        # nmcli kullanarak WiFi tarama
        result = subprocess.run(
            ['nmcli', '-t', '-f', 'SSID,SIGNAL,SECURITY', 'dev', 'wifi'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        networks = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            
            parts = line.split(':')
            if len(parts) >= 3:
                ssid = parts[0]
                signal = int(parts[1]) if parts[1].isdigit() else 0
                security = parts[2] if len(parts) > 2 else ''
                
                networks.append({
                    'ssid': ssid,
                    'signal': signal,
                    'encrypted': security != '' and '--' not in security
                })
        
        return networks
        
    except Exception as e:
        print(f"WiFi tarama hatası: {e}")
        return []
```

---

## 7. Test ve Debug

### 7.1. Konfigürasyon Değişikliğini Test Etme

```bash
# Konfigürasyonu manuel olarak değiştir
jq '.wifi.ssid = "TestWiFi"' /opt/gateway/config/gateway.json > /tmp/test.json
mv /tmp/test.json /opt/gateway/config/gateway.json

# Logları kontrol et
sudo journalctl -u gateway-config-manager -f
```

### 7.2. API Endpoint'lerini Test Etme

```bash
# Konfigürasyonu oku
curl http://localhost:8000/api/config

# WiFi ayarlarını değiştir
curl -X POST http://localhost:8000/api/config/wifi \
  -H "Content-Type: application/json" \
  -d '{"country":"TR","ssid":"TestWiFi","password":"test123"}'
```

---

## 8. Güvenlik Notları

1. **Dosya İzinleri**: Konfigürasyon dosyalarının sadece gerekli kullanıcılar tarafından yazılabilir olması:
   ```bash
   sudo chmod 644 /opt/gateway/config/gateway.json
   sudo chown pi:pi /opt/gateway/config/gateway.json
   ```

2. **Şifre Güvenliği**: `users.json` dosyasındaki şifrelerin hash'lenmesi önerilir (bcrypt vb.)

3. **API Güvenliği**: Production'da HTTPS kullanın ve CORS ayarlarını kısıtlayın

---

## 9. Özet

1. **Kurulum**: Dosyaları `/opt/gateway` dizinine kopyalayın ve servisleri başlatın
2. **Konfigürasyon**: Tüm ayarlar `/opt/gateway/config/gateway.json` dosyasında
3. **Değişiklik Dinleme**: `gateway_config_manager.py` dosya değişikliklerini izler
4. **Uygulama**: Her ayar tipi için `apply_*` fonksiyonları sisteme uygular
5. **Test**: Manuel olarak JSON dosyasını değiştirerek veya API üzerinden test edin

Bu yapı ile GUI'den yapılan tüm değişiklikler otomatik olarak sisteme uygulanacaktır.
