# Gateway Konfigürasyon Projesi

Gateway cihazınızı tarayıcı üzerinden yönetmek için modern bir web arayüzü.

## Özellikler

- 🔐 Güvenli login sistemi
- 📡 RS-485 konfigürasyonu
- 🔵 BLE (Bluetooth Low Energy) ayarları
- 📶 LoRaWAN konfigürasyonu
- ⚙️ Sistem yönetimi
- 🎨 Modern, kullanıcı dostu arayüz

## Kurulum

### 1. Gerekli Paketlerin Yüklenmesi

```bash
# Sanal ortam oluştur (önerilen)
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

# Bağımlılıkları yükle
pip install -r requirements.txt
```

### 2. Uygulamayı Başlatma

```bash
# Development modunda
python api/main.py

# veya uvicorn ile
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Tarayıcıdan Erişim

Tarayıcınızda şu adresi açın:
```
http://localhost:8000
```

veya yerel ağdan:
```
http://<gateway-ip>:8000
```

## Varsayılan Giriş Bilgileri

- **Kullanıcı Adı:** admin
- **Şifre:** admin

⚠️ **Önemli:** İlk girişten sonra şifrenizi değiştirmeyi unutmayın!

## Dizin Yapısı

```
gateway-gui/
├── api/
│   └── main.py              # FastAPI backend
├── ui/
│   ├── index.html           # Ana HTML
│   ├── style.css            # Stil dosyası
│   └── app.js               # Frontend JavaScript
├── config/
│   ├── users.json           # Kullanıcı bilgileri (otomatik oluşturulur)
│   └── gateway.json         # Gateway konfigürasyonu (otomatik oluşturulur)
├── requirements.txt         # Python bağımlılıkları
└── README.md               # Bu dosya
```

## API Endpoints

### Authentication
- `POST /api/login` - Giriş yap
- `POST /api/logout` - Çıkış yap

### Configuration
- `GET /api/config` - Tüm konfigürasyonu getir
- `POST /api/config/rs485` - RS-485 ayarlarını güncelle
- `POST /api/config/ble` - BLE ayarlarını güncelle
- `POST /api/config/lorawan` - LoRaWAN ayarlarını güncelle
- `POST /api/config/system` - Sistem ayarlarını güncelle

### System
- `POST /api/system/restart` - Gateway'i yeniden başlat
- `GET /api/health` - Health check

## Production Deployment (Raspberry Pi)

### Systemd Servis Oluşturma

1. Servis dosyası oluştur:

```bash
sudo nano /etc/systemd/system/gateway-api.service
```

2. Aşağıdaki içeriği ekle:

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

3. Servisi etkinleştir ve başlat:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gateway-api
sudo systemctl start gateway-api
```

4. Servis durumunu kontrol et:

```bash
sudo systemctl status gateway-api
```

## Geliştirme

### Backend Değişiklikleri

Backend değişiklikleri için `api/main.py` dosyasını düzenleyin. Uvicorn `--reload` flag'i ile çalışıyorsa değişiklikler otomatik yüklenecektir.

### Frontend Değişiklikleri

UI dosyalarını (`ui/` klasöründe) düzenleyin. Tarayıcıyı yenileyerek değişiklikleri görebilirsiniz.

## Güvenlik Notları

1. **Şifre Hashleme:** Production ortamında şifrelerin hash'lenmesi önerilir (örn: bcrypt)
2. **HTTPS:** Production'da HTTPS kullanın (nginx reverse proxy ile)
3. **CORS:** Production'da CORS ayarlarını sınırlandırın
4. **Firewall:** Sadece güvenli ağlardan erişime izin verin

## Sorun Giderme

### Port zaten kullanımda
```bash
# Port 8000'i kullanan process'i bul
lsof -i :8000

# veya Windows'ta
netstat -ano | findstr :8000
```

### Config dosyaları oluşturulmuyor
```bash
# Config klasörünün yazma izni olduğundan emin olun
chmod 755 config/
```

### Static dosyalar yüklenmiyor
- `ui/` klasörünün doğru konumda olduğundan emin olun
- Tarayıcı konsolunu kontrol edin (F12)

## Lisans

MIT License

## Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın
