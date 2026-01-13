# Gateway Konfigürasyon Projesi

## Amaç

Bu proje, **Raspberry Pi üzerinde çalışan bir gateway yazılımının**, yalnızca **web tarayıcı üzerinden** (masaüstü ortamı olmadan) konfigüre edilebilmesini hedefler.

- ThingsBoard, hazır IoT platformları veya harici dashboardlar **kullanılmayacaktır**.
- Arayüz modern, sade ve HTML/CSS/JS tabanlı olacaktır.
- Gateway bir cihazdır; UI yalnızca **konfigürasyon ve kontrol** amaçlıdır.

---

## Genel Mimari

- **Backend:** FastAPI (Python)
- **Web Server:** Uvicorn (systemd servisi olarak)
- **Frontend:** Saf HTML + CSS + JavaScript
- **Erişim:** Tarayıcı üzerinden (`http://<gateway-ip>:8000/`)

---

## Temel Prensipler

- UI dosyaları backend içinde render edilmez, **static olarak servis edilir**
- Backend yalnızca:
  - Konfigürasyon API’lerini
  - Login / session yönetimini
  - Donanım konfigürasyonlarını
  sağlar
- UI, backend ile **REST API** üzerinden haberleşir

---

## Dizin Yapısı

```
/opt/gateway
├── api/
│   ├── main.py              # FastAPI uygulaması
│   ├── routes/              # API endpointleri (ileride)
│   └── services/            # RS485, BLE, LoRaWAN servisleri
│
├── ui/
│   ├── index.html           # Ana admin ekranı
│   ├── style.css            # Modern UI stilleri
│   └── app.js               # Frontend logic
│
├── config/
│   ├── users.json           # Kullanıcılar (default: admin/admin)
│   └── gateway.json         # Tüm donanım konfigürasyonları
│
└── venv/                    # Python sanal ortam
```

---

## Web Arayüz (UI) Gereksinimleri

### Genel

- Tek sayfa uygulama (SPA benzeri yapı)
- HTML + CSS + JS (React, Vue yok)
- Responsive olmak zorunda değil (gateway lokal ağda)

### Giriş (Login)

- Tarayıcı açıldığında login ekranı gelir
- Default kullanıcı:
  - username: `admin`
  - password: `admin`
- Login başarılı olursa session cookie set edilir

### Ana Admin Sayfası

- Üstte veya solda **sabit bir menü** bulunur
- Dashboard, grafik, istatistik **yoktur**
- Amaç yalnızca ayar yapmaktır

### Sol Menü Başlıkları

1. **RS-485 Ayarları**
   - Baudrate
   - Parity
   - Slave ID
   - Enable / Disable

2. **BLE Ayarları**
   - Aç / Kapat
   - Scan interval
   - Bağlı cihaz listesi

3. **LoRaWAN Ayarları**
   - DevEUI / AppEUI / AppKey
   - OTAA / ABP seçimi
   - Enable / Disable

4. **Sistem**
   - Gateway adı
   - Restart gateway butonu

---

## Backend (FastAPI) Gereksinimleri

### Genel

- `/` endpoint’i yalnızca `index.html` döner
- Static dosyalar `/static` altında servis edilir
- HTML template engine **kullanılmaz**

### API Yaklaşımı

- UI → JSON request
- API → JSON response

Örnek endpointler:

- `POST /api/login`
- `POST /api/logout`
- `GET /api/config`
- `POST /api/config/rs485`
- `POST /api/config/ble`
- `POST /api/config/lorawan`

### Konfigürasyon Saklama

- Tüm ayarlar `/opt/gateway/config/gateway.json` içinde tutulur
- API gelen ayarları bu dosyaya yazar
- Donanım servisleri bu dosyayı okur

---

## Servis Yönetimi

- Backend `systemd` ile servis olarak çalışır
- Servis adı: `api.service`
- Uvicorn, `0.0.0.0:8000` üzerinden dinler

---

## Bilinçli Olarak Yapılmayacaklar

- ThingsBoard entegrasyonu
- MQTT dashboard
- Grafik, chart, telemetry ekranları
- Masaüstü (X11) arayüz
- React / Vue / Angular

---

## Geliştirme Sırası (AI Agent için)

1. Static UI servis eden **en minimal FastAPI** kur
2. `/` → index.html çalıştığını doğrula
3. Login API ekle (session cookie)
4. UI login ekranını bağla
5. Sol menülü modern admin sayfasını oluştur
6. RS485 / BLE / LoRaWAN konfigürasyon API’lerini ekle
7. `gateway.json` ile kalıcı ayar yap
8. Restart ve enable/disable fonksiyonlarını bağla

---

## Başarı Kriteri

- Raspberry Pi’de masaüstü olmadan
- Tarayıcıdan girildiğinde
- Modern bir admin paneli açılıyor
- Gateway tüm ayarları buradan yapılabiliyor
- Harici platforma bağımlılık yok

