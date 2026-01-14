# ESP32-C3 ile BLE Bağlantı Rehberi

Bu doküman, ESP32-C3 cihazını BLE server olarak yapılandırıp Raspberry Pi Gateway ile bağlantı kurma sürecini açıklar.

---

## 1. ESP32-C3 BLE Server Kodu

ESP32-C3'ü BLE server olarak yapılandırmak için aşağıdaki Arduino kodu kullanılabilir:

### Arduino IDE Kurulumu

1. **Arduino IDE'yi kurun** (1.8.x veya 2.x)
2. **ESP32 Board Support ekleyin:**
   - File → Preferences → Additional Board Manager URLs
   - Şu URL'yi ekleyin: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   - Tools → Board → Boards Manager → "esp32" ara ve kur

### ESP32-C3 BLE Server Kodu

```cpp
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// BLE UUID'leri (Gateway'deki ayarlarla eşleşmeli)
#define SERVICE_UUID        "0000180f-0000-1000-8000-00805f9b34fb"
#define CHARACTERISTIC_UUID "00002a19-0000-1000-8000-00805f9b34fb"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// BLE Server Callbacks
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("Cihaz bağlandı");
    }

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("Cihaz bağlantısı kesildi");
    }
};

// BLE Characteristic Callbacks
class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        std::string value = pCharacteristic->getValue();
        
        if (value.length() > 0) {
            Serial.print("Alınan veri: ");
            for (int i = 0; i < value.length(); i++) {
                Serial.print((char)value[i]);
            }
            Serial.println();
        }
    }
    
    void onRead(BLECharacteristic *pCharacteristic) {
        // Okuma isteği geldiğinde çağrılır
        Serial.println("Okuma isteği alındı");
    }
};

void setup() {
    Serial.begin(115200);
    Serial.println("ESP32-C3 BLE Server başlatılıyor...");

    // BLE Device oluştur
    BLEDevice::init("ESP32-C3-Gateway"); // Bu isim Gateway'de görünecek
    
    // BLE Server oluştur
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    // BLE Service oluştur
    BLEService *pService = pServer->createService(SERVICE_UUID);

    // BLE Characteristic oluştur
    pCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_READ   |
        BLECharacteristic::PROPERTY_WRITE  |
        BLECharacteristic::PROPERTY_NOTIFY |
        BLECharacteristic::PROPERTY_INDICATE
    );

    pCharacteristic->setCallbacks(new MyCallbacks());

    // BLE2902 descriptor ekle (Notify için gerekli)
    pCharacteristic->addDescriptor(new BLE2902());

    // Service'i başlat
    pService->start();

    // BLE Advertising başlat
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(false);
    pAdvertising->setMinPreferred(0x0);  // Bağlantı için optimize edilmiş
    BLEDevice::startAdvertising();
    
    Serial.println("BLE Server hazır! Bağlantı bekleniyor...");
    Serial.print("MAC Adresi: ");
    Serial.println(BLEDevice::getAddress().toString().c_str());
    Serial.print("Service UUID: ");
    Serial.println(SERVICE_UUID);
    Serial.print("Characteristic UUID: ");
    Serial.println(CHARACTERISTIC_UUID);
}

void loop() {
    // Bağlantı durumunu kontrol et
    if (!deviceConnected && oldDeviceConnected) {
        delay(500); // Bluetooth stack'in hazır olması için bekle
        pServer->startAdvertising(); // Yeniden reklam yap
        Serial.println("Yeniden bağlantı bekleniyor...");
        oldDeviceConnected = deviceConnected;
    }
    
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
    }

    // Örnek: Periyodik olarak veri gönder (isteğe bağlı)
    if (deviceConnected) {
        // Örnek sensör verisi (gerçek uygulamada sensörlerden okunur)
        float temperature = 25.5; // Örnek sıcaklık değeri
        uint8_t data[4];
        memcpy(data, &temperature, sizeof(float));
        
        pCharacteristic->setValue(data, 4);
        pCharacteristic->notify();
        
        delay(2000); // 2 saniyede bir gönder
    }
    
    delay(100);
}
```

### Kod Açıklaması

- **SERVICE_UUID**: BLE servis UUID'si (Gateway'deki ayarla eşleşmeli)
- **CHARACTERISTIC_UUID**: Karakteristik UUID'si (Gateway'deki ayarla eşleşmeli)
- **Device Name**: "ESP32-C3-Gateway" (Gateway'de görünecek isim)
- **MAC Address**: Otomatik oluşturulur, Serial Monitor'de görüntülenir

---

## 2. Gateway'de BLE Konfigürasyonu

### 2.1. ESP32-C3 MAC Adresini Bulma

ESP32-C3'ü yükledikten sonra Serial Monitor'de MAC adresi görünecek:

```
MAC Adresi: AA:BB:CC:DD:EE:FF
```

Veya Gateway UI'dan WiFi tarama gibi BLE tarama yaparak bulabilirsiniz (ileride eklenebilir).

### 2.2. Gateway UI'da Ayarlama

1. **BLE Ayarları** bölümüne gidin
2. **BLE'yi aktifleştirin** (toggle switch)
3. **Server MAC Adresi**: ESP32-C3'ün MAC adresini girin (örn: `AA:BB:CC:DD:EE:FF`)
4. **Servis UUID**: `0000180f-0000-1000-8000-00805f9b34fb` (veya ESP32-C3'teki UUID)
5. **Karakteristik UUID**: `00002a19-0000-1000-8000-00805f9b34fb` (veya ESP32-C3'teki UUID)
6. **Bağlantı Zaman Aşımı**: 30 saniye
7. **BLE Tarama Süresi**: 10 saniye
8. **Otomatik Yeniden Bağlanma**: Aktif edin
9. **Read/Write/Notify Seçimi**: İhtiyacınıza göre seçin (örn: `read_notify`)
10. **Okuma Aralığı**: 1000 ms (1 saniye)
11. **Veri İletim Ayarları**:
    - **İletim Tipi**: MQTT veya HTTPS seçin
    - **MQTT** seçildiyse:
      - MQTT Server
      - MQTT Port (varsayılan: 1883)
      - MQTT Topic
      - Access Token
    - **HTTPS** seçildiyse:
      - HTTPS Server
      - HTTPS Port (varsayılan: 443)
      - Endpoint
      - Access Token
12. **Kaydet** butonuna tıklayın

---

## 3. Bağlantı Testi

### 3.1. ESP32-C3 Serial Monitor

ESP32-C3'ün Serial Monitor'ünde şunları görmelisiniz:

```
ESP32-C3 BLE Server başlatılıyor...
BLE Server hazır! Bağlantı bekleniyor...
MAC Adresi: AA:BB:CC:DD:EE:FF
Service UUID: 0000180f-0000-1000-8000-00805f9b34fb
Characteristic UUID: 00002a19-0000-1000-8000-00805f9b34fb
Cihaz bağlandı  (Gateway bağlandığında)
```

### 3.2. Gateway Logları

Raspberry Pi'de BLE servis loglarını kontrol edin:

```bash
# BLE servis loglarını görüntüle
tail -f /opt/gateway/logs/ble_service.log

# veya systemd logları
sudo journalctl -u gateway-ble.service -f
```

Başarılı bağlantıda şunları görmelisiniz:

```
INFO - Cihaz bağlandı: AA:BB:CC:DD:EE:FF
INFO - Okunan veri: 1a2b3c4d
INFO - MQTT'ye gönderildi: gateway/ble/data -> {...}
```

### 3.3. Gateway UI'da Kontrol

Gateway UI'da **BLE Ayarları** → **Bağlı Cihazlar** bölümünde ESP32-C3 görünmelidir.

---

## 4. Veri Formatı ve Örnekler

### 4.1. ESP32-C3'ten Veri Gönderme

ESP32-C3'ten veri göndermek için:

```cpp
// Örnek 1: Float değer gönderme (sıcaklık)
float temperature = 25.5;
uint8_t data[4];
memcpy(data, &temperature, sizeof(float));
pCharacteristic->setValue(data, 4);
pCharacteristic->notify();

// Örnek 2: Integer değer gönderme
int32_t sensorValue = 1234;
uint8_t data[4];
memcpy(data, &sensorValue, sizeof(int32_t));
pCharacteristic->setValue(data, 4);
pCharacteristic->notify();

// Örnek 3: String gönderme
String message = "Hello Gateway";
pCharacteristic->setValue(message.c_str());
pCharacteristic->notify();

// Örnek 4: Özel byte array
uint8_t customData[] = {0x01, 0x02, 0x03, 0x04};
pCharacteristic->setValue(customData, 4);
pCharacteristic->notify();
```

### 4.2. Gateway'den Veri Okuma

Gateway BLE servisi otomatik olarak verileri okur ve MQTT/HTTPS'e gönderir. Veri formatı:

```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "timestamp": "2024-01-01T12:00:00",
  "data": "1a2b3c4d",
  "data_length": 4
}
```

### 4.3. Gateway'den ESP32-C3'e Veri Yazma

Gateway'den ESP32-C3'e veri yazmak için `operation_mode`'u `write` veya `read_write` yapın.

ESP32-C3 kodunda `onWrite` callback'i veriyi alır:

```cpp
void onWrite(BLECharacteristic *pCharacteristic) {
    std::string value = pCharacteristic->getValue();
    
    // Byte array olarak işle
    uint8_t* data = (uint8_t*)value.data();
    int length = value.length();
    
    // Veriyi kullan
    for (int i = 0; i < length; i++) {
        Serial.print(data[i], HEX);
        Serial.print(" ");
    }
    Serial.println();
}
```

---

## 5. Özel UUID Kullanımı

Kendi UUID'lerinizi kullanmak isterseniz:

### 5.1. UUID Oluşturma

Online UUID generator kullanabilirsiniz: https://www.uuidgenerator.net/

### 5.2. ESP32-C3 Kodunda Değiştirme

```cpp
// Kendi UUID'lerinizi kullanın
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "87654321-4321-4321-4321-cba987654321"
```

### 5.3. Gateway'de Güncelleme

Gateway UI'da aynı UUID'leri girin.

---

## 6. Sorun Giderme

### 6.1. Bağlantı Kurulamıyor

**Sorun**: ESP32-C3'e bağlanılamıyor

**Çözümler**:
- ESP32-C3'ün BLE server modunda olduğundan emin olun
- MAC adresinin doğru girildiğini kontrol edin
- ESP32-C3'ün yakın mesafede olduğunu kontrol edin (BLE menzili ~10m)
- ESP32-C3'ü yeniden başlatın
- Gateway'deki BLE servisini yeniden başlatın: `sudo systemctl restart gateway-ble.service`

### 6.2. Veri Okunamıyor

**Sorun**: Bağlantı var ama veri okunamıyor

**Çözümler**:
- UUID'lerin eşleştiğini kontrol edin
- `operation_mode`'un `read` veya `read_notify` olduğunu kontrol edin
- ESP32-C3'ün `notify()` veya `setValue()` çağırdığını kontrol edin
- Serial Monitor'de ESP32-C3'ün veri gönderdiğini kontrol edin

### 6.3. Veri Gönderilemiyor

**Sorun**: Gateway'den ESP32-C3'e veri yazılamıyor

**Çözümler**:
- `operation_mode`'un `write` veya `read_write` olduğunu kontrol edin
- ESP32-C3'teki `onWrite` callback'inin çalıştığını kontrol edin
- Characteristic'in `PROPERTY_WRITE` özelliğine sahip olduğunu kontrol edin

### 6.4. MQTT/HTTPS'e Veri Gitmiyor

**Sorun**: BLE'den veri okunuyor ama MQTT/HTTPS'e gitmiyor

**Çözümler**:
- Gateway loglarını kontrol edin: `tail -f /opt/gateway/logs/ble_service.log`
- MQTT server/HTTPS server ayarlarını kontrol edin
- Access token'ın doğru olduğunu kontrol edin
- Network bağlantısını kontrol edin

---

## 7. Gelişmiş Kullanım

### 7.1. Çoklu ESP32-C3 Desteği

Birden fazla ESP32-C3 bağlamak için:

1. Her ESP32-C3 için farklı MAC adresi kullanın
2. Gateway'de her cihaz için ayrı konfigürasyon oluşturun
3. Veya BLE servisini genişleterek çoklu cihaz desteği ekleyin

### 7.2. Veri Parsing

Gateway'de okunan veriyi parse etmek için BLE servisini genişletebilirsiniz:

```python
# services/ble_service.py içinde

def parse_ble_data(data: bytes, data_type: str = 'float'):
    """BLE verisini parse et"""
    if data_type == 'float' and len(data) >= 4:
        import struct
        return struct.unpack('f', data)[0]
    elif data_type == 'int32' and len(data) >= 4:
        import struct
        return struct.unpack('i', data)[0]
    elif data_type == 'string':
        return data.decode('utf-8')
    else:
        return data.hex()
```

### 7.3. Otomatik Yeniden Bağlanma

`auto_reconnect` aktifse, bağlantı kesildiğinde otomatik olarak yeniden bağlanır.

---

## 8. Örnek Kullanım Senaryoları

### Senaryo 1: Sıcaklık Sensörü

ESP32-C3 bir sıcaklık sensöründen veri okuyup Gateway'e gönderir:

```cpp
// ESP32-C3 kodu
#include <DHT.h>

DHT dht(4, DHT22); // GPIO4, DHT22 sensör

void loop() {
    if (deviceConnected) {
        float temp = dht.readTemperature();
        uint8_t data[4];
        memcpy(data, &temp, sizeof(float));
        pCharacteristic->setValue(data, 4);
        pCharacteristic->notify();
        delay(5000); // 5 saniyede bir
    }
}
```

### Senaryo 2: Komut Gönderme

Gateway'den ESP32-C3'e komut gönderme:

```cpp
// ESP32-C3 kodu
void onWrite(BLECharacteristic *pCharacteristic) {
    std::string value = pCharacteristic->getValue();
    
    if (value == "LED_ON") {
        digitalWrite(LED_PIN, HIGH);
    } else if (value == "LED_OFF") {
        digitalWrite(LED_PIN, LOW);
    }
}
```

Gateway'den yazma için BLE servisini genişletebilirsiniz.

---

## 9. Güvenlik Notları

1. **Access Token**: MQTT/HTTPS için mutlaka access token kullanın
2. **UUID Güvenliği**: Production'da standart UUID'ler yerine özel UUID'ler kullanın
3. **Veri Şifreleme**: Hassas veriler için BLE üzerinde şifreleme ekleyin
4. **Bağlantı Doğrulama**: ESP32-C3'te bağlantı doğrulama mekanizması ekleyin

---

## 10. Hızlı Başlangıç Checklist

- [ ] ESP32-C3'ü Arduino IDE'ye yükleyin
- [ ] BLE server kodunu ESP32-C3'e yükleyin
- [ ] MAC adresini Serial Monitor'den alın
- [ ] Gateway UI'da BLE ayarlarını yapın
- [ ] MAC adresini, UUID'leri ve forwarder ayarlarını girin
- [ ] BLE servisini başlatın: `sudo systemctl start gateway-ble.service`
- [ ] Logları kontrol edin: `tail -f /opt/gateway/logs/ble_service.log`
- [ ] Bağlantıyı test edin
- [ ] Veri akışını kontrol edin (MQTT/HTTPS)

Bu adımları takip ederek ESP32-C3 ile Gateway arasında BLE bağlantısı kurabilirsiniz.
