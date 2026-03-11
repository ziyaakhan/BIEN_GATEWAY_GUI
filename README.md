# Biensis Gateway GUI

Raspberry Pi tabanlı IoT gateway cihazı için web arayüzlü konfigürasyon paneli.
Modbus, BLE, LoRaWAN ve WiFi ayarlarını tarayıcı üzerinden yönetir.

## Mimari

```
Backend:   FastAPI (Python) + Uvicorn
Frontend:  HTML / CSS / JavaScript (framework yok)
Donanım:   Raspberry Pi (Seeed WM1302 LoRa HAT, BLE, RS-485)
Erişim:    http://<gateway-ip>  (port 80 → 8000 yönlendirmeli)
```

## Proje Yapısı    

```
BIEN_GATEWAY_GUI/
├── api/
│   └── main.py                  # FastAPI uygulaması, tüm API endpoint'leri
├── ui/
│   ├── index.html               # Tek sayfa web arayüzü
│   ├── app.js                   # Frontend logic ve API iletişimi
│   └── style.css                # Arayüz stilleri
├── config/
│   ├── gateway.json             # Aktif gateway konfigürasyonu
│   ├── factory_default.json     # Fabrika ayarları (reset için)
│   ├── users.json               # Kullanıcı bilgileri (otomatik oluşur)
│   └── sessions.json            # Oturum verileri (otomatik oluşur)
├── scripts/
│   ├── biensis-gateway.service  # systemd servis dosyası
│   └── ap_mode.sh               # WiFi bağlanamazsa hotspot aç
├── gui_launch.sh                # Manuel başlatma scripti
└── requirements.txt             # Python bağımlılıkları
```

**Pi'deki ek dosyalar:**

```
~/ble_gateway/
└── main.py                      # BLE cihaz okuma + MQTT publish scripti
```

## Hızlı Başlangıç (Geliştirme)

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

Tarayıcı: `http://localhost:8000` | Giriş: `admin` / `admin`

## Modüller

### Modbus
- Profil bazlı konfigürasyon (seri port, baud rate, parity, vb.)
- MQTT forward ayarları (sunucu, port, access token)
- Profiller eklenebilir, düzenlenebilir, silinebilir

### BLE (Bluetooth Low Energy)
- Profil bazlı cihaz yönetimi (MAC, characteristic UUID, telemetri ifadeleri)
- Cihaz tarama (bluetoothctl / hcitool)
- Bağlantı durumu takibi (son 2 dk veri alındıysa "Bağlı")
- MQTT forward ayarları
- `~/ble_gateway/main.py` ile bağlan-oku-kopar döngüsü

### LoRaWAN
- ChirpStack Concentratord ayarları (`/etc/chirpstack-concentratord/sx1302.toml`)
- ChirpStack MQTT Forwarder ayarları (`/etc/chirpstack-mqtt-forwarder/chirpstack-mqtt-forwarder.toml`)
- Kaydet deyince TOML dosyaları yazılır, servisler restart edilir
- Region, Gateway ID, anten kazancı, konum, MQTT server/port

### WiFi
- Ağ tarama (nmcli)
- SSID/şifre ile bağlantı
- AP modu: bağlanamazsa "Biensis-Gateway" hotspot açar

### Sistem
- Sistem durumu (CPU, RAM, disk, sıcaklık, uptime)
- Gateway yeniden başlatma
- Fabrika ayarlarına dönme
- Şifre değiştirme

## API Endpoint'leri

| Method | Endpoint                     | Açıklama                          |
|--------|------------------------------|-----------------------------------|
| POST   | `/api/login`                 | Oturum aç                         |
| POST   | `/api/logout`                | Oturum kapat                      |
| GET    | `/api/config`                | Tüm konfigürasyonu getir          |
| POST   | `/api/config/modbus`         | Modbus ayarlarını kaydet           |
| POST   | `/api/config/modbus/profiles`| Modbus profillerini kaydet         |
| POST   | `/api/config/modbus/mqtt`    | Modbus MQTT ayarlarını kaydet      |
| POST   | `/api/config/ble`            | BLE ayarlarını kaydet              |
| POST   | `/api/config/ble/profiles`   | BLE profillerini kaydet            |
| POST   | `/api/config/ble/mqtt`       | BLE MQTT ayarlarını kaydet         |
| POST   | `/api/ble/scan`              | BLE cihazlarını tara               |
| POST   | `/api/ble/status`            | BLE cihaz bağlantı durumları       |
| POST   | `/api/config/lorawan`        | LoRaWAN ayarları + TOML yaz        |
| POST   | `/api/config/wifi`           | WiFi bağlantısı kur                |
| POST   | `/api/wifi/scan`             | WiFi ağlarını tara                 |
| GET    | `/api/wifi/status`           | WiFi bağlantı durumu               |
| POST   | `/api/config/system`         | Sistem ayarlarını kaydet           |
| GET    | `/api/system/status`         | Sistem metrikleri                  |
| POST   | `/api/system/restart`        | Cihazı yeniden başlat              |
| POST   | `/api/system/factory-reset`  | Fabrika ayarlarına dön             |
| POST   | `/api/user/change-password`  | Şifre değiştir                     |

## Konfigürasyon Yapısı (gateway.json)

```json
{
  "gateway_name": "Gateway-01",
  "modbus":          { "enabled": false, ... },
  "modbus_profiles": [ ... ],
  "modbus_mqtt":     { "host": "", "port": 1883, "token": "" },
  "ble":             { "enabled": false, "profiles": [ ... ] },
  "ble_mqtt":        { "host": "", "port": 1883, "token": "" },
  "lorawan":         { "enabled": false, "gateway_id": "", "region": "EU868", ... },
  "wifi":            { "country": "TR", "ssid": "", "password": "" }
}