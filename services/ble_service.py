#!/usr/bin/env python3
"""
BLE Service - Bluetooth Low Energy Haberleşme Servisi
Raspberry Pi için BLE cihazlarıyla haberleşme servisi
"""

import json
import time
import logging
import threading
import requests
from pathlib import Path
from typing import Optional, List, Dict
from datetime import datetime

# MQTT kütüphanesi
try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False

# BLE kütüphaneleri (bluepy veya bleak)
try:
    from bluepy import btle
    USE_BLUEPY = True
except ImportError:
    try:
        import asyncio
        from bleak import BleakScanner, BleakClient
        USE_BLUEPY = False
    except ImportError:
        print("HATA: BLE kütüphanesi bulunamadı. 'pip install bluepy' veya 'pip install bleak' kurun")
        USE_BLUEPY = None

# Logging yapılandırması
LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'ble_service.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('BLE_Service')

if not MQTT_AVAILABLE:
    logger.warning("paho-mqtt bulunamadı. MQTT desteği devre dışı.")

# Yollar
BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_FILE = BASE_DIR / "config" / "gateway.json"


class BLEService:
    """BLE Haberleşme Servisi"""
    
    def __init__(self):
        self.config = None
        self.running = False
        self.connected_devices = {}
        self.scan_thread = None
        self.read_thread = None
        self.write_thread = None
        self.mqtt_client = None
        
    def load_config(self):
        """Konfigürasyonu yükle"""
        try:
            with open(CONFIG_FILE, 'r') as f:
                gateway_config = json.load(f)
                self.config = gateway_config.get('ble', {})
                logger.info(f"Konfigürasyon yüklendi: enabled={self.config.get('enabled')}")
                return True
        except Exception as e:
            logger.error(f"Konfigürasyon yükleme hatası: {e}")
            return False
    
    def scan_devices(self) -> List[Dict]:
        """BLE cihazlarını tara"""
        if not self.config.get('enabled'):
            return []
        
        scan_interval = self.config.get('scan_interval', 10)
        devices = []
        
        try:
            if USE_BLUEPY:
                devices = self._scan_bluepy()
            else:
                devices = self._scan_bleak()
            
            logger.info(f"{len(devices)} BLE cihazı bulundu")
            return devices
            
        except Exception as e:
            logger.error(f"BLE tarama hatası: {e}")
            return []
    
    def _scan_bluepy(self) -> List[Dict]:
        """bluepy kullanarak tarama"""
        devices = []
        try:
            scanner = btle.Scanner()
            scan_results = scanner.scan(timeout=self.config.get('scan_interval', 10))
            
            for device in scan_results:
                devices.append({
                    'mac': device.addr,
                    'name': device.getValueText(btle.ScanEntry.COMPLETE_LOCAL_NAME) or device.addr,
                    'rssi': device.rssi,
                    'connectable': True
                })
        except Exception as e:
            logger.error(f"bluepy tarama hatası: {e}")
        
        return devices
    
    def _scan_bleak(self) -> List[Dict]:
        """bleak kullanarak tarama (async)"""
        devices = []
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            async def scan():
                scanner = BleakScanner()
                scan_results = await scanner.discover(timeout=self.config.get('scan_interval', 10))
                
                for device in scan_results:
                    devices.append({
                        'mac': device.address,
                        'name': device.name or device.address,
                        'rssi': device.rssi if hasattr(device, 'rssi') else 0,
                        'connectable': True
                    })
            
            loop.run_until_complete(scan())
            loop.close()
        except Exception as e:
            logger.error(f"bleak tarama hatası: {e}")
        
        return devices
    
    def connect_device(self, mac_address: str) -> bool:
        """BLE cihazına bağlan"""
        if mac_address in self.connected_devices:
            logger.info(f"Cihaz zaten bağlı: {mac_address}")
            return True
        
        try:
            if USE_BLUEPY:
                client = btle.Peripheral(mac_address)
            else:
                client = None  # bleak için async gerekli
            
            self.connected_devices[mac_address] = {
                'client': client,
                'connected_at': datetime.now(),
                'last_read': None,
                'last_write': None
            }
            
            logger.info(f"Cihaz bağlandı: {mac_address}")
            return True
            
        except Exception as e:
            logger.error(f"Bağlantı hatası ({mac_address}): {e}")
            return False
    
    def disconnect_device(self, mac_address: str):
        """BLE cihazından bağlantıyı kes"""
        if mac_address in self.connected_devices:
            try:
                if USE_BLUEPY:
                    client = self.connected_devices[mac_address]['client']
                    if client:
                        client.disconnect()
            except Exception as e:
                logger.error(f"Bağlantı kesme hatası ({mac_address}): {e}")
            
            del self.connected_devices[mac_address]
            logger.info(f"Cihaz bağlantısı kesildi: {mac_address}")
    
    def read_characteristic(self, mac_address: str, service_uuid: str, char_uuid: str) -> Optional[bytes]:
        """Karakteristik değerini oku"""
        if mac_address not in self.connected_devices:
            logger.warning(f"Cihaz bağlı değil: {mac_address}")
            return None
        
        try:
            if USE_BLUEPY:
                client = self.connected_devices[mac_address]['client']
                service = client.getServiceByUUID(service_uuid)
                characteristic = service.getCharacteristics(char_uuid)[0]
                value = characteristic.read()
                
                self.connected_devices[mac_address]['last_read'] = datetime.now()
                logger.debug(f"Okuma başarılı: {mac_address} -> {value.hex()}")
                return value
            else:
                # bleak için async implementasyon gerekli
                logger.warning("bleak için async implementasyon gerekli")
                return None
                
        except Exception as e:
            logger.error(f"Okuma hatası ({mac_address}): {e}")
            return None
    
    def write_characteristic(self, mac_address: str, service_uuid: str, char_uuid: str, value: bytes) -> bool:
        """Karakteristik değerine yaz"""
        if mac_address not in self.connected_devices:
            logger.warning(f"Cihaz bağlı değil: {mac_address}")
            return False
        
        try:
            if USE_BLUEPY:
                client = self.connected_devices[mac_address]['client']
                service = client.getServiceByUUID(service_uuid)
                characteristic = service.getCharacteristics(char_uuid)[0]
                characteristic.write(value)
                
                self.connected_devices[mac_address]['last_write'] = datetime.now()
                logger.debug(f"Yazma başarılı: {mac_address} -> {value.hex()}")
                return True
            else:
                # bleak için async implementasyon gerekli
                logger.warning("bleak için async implementasyon gerekli")
                return False
                
        except Exception as e:
            logger.error(f"Yazma hatası ({mac_address}): {e}")
            return False
    
    def start_scanning(self):
        """Periyodik tarama başlat"""
        if self.scan_thread and self.scan_thread.is_alive():
            return
        
        def scan_loop():
            while self.running and self.config.get('enabled'):
                try:
                    devices = self.scan_devices()
                    
                    # Konfigürasyondaki server MAC'e bağlan
                    server_mac = self.config.get('server_mac', '').upper()
                    if server_mac and server_mac not in self.connected_devices:
                        # MAC adresini bul
                        for device in devices:
                            if device['mac'].upper() == server_mac:
                                self.connect_device(server_mac)
                                break
                    
                    # Tarama aralığı kadar bekle
                    time.sleep(self.config.get('scan_interval', 10))
                    
                except Exception as e:
                    logger.error(f"Tarama döngüsü hatası: {e}")
                    time.sleep(5)
        
        self.scan_thread = threading.Thread(target=scan_loop, daemon=True)
        self.scan_thread.start()
        logger.info("BLE tarama başlatıldı")
    
    def start_reading(self):
        """Periyodik okuma başlat"""
        if self.read_thread and self.read_thread.is_alive():
            return
        
        def read_loop():
            while self.running and self.config.get('enabled'):
                try:
                    server_mac = self.config.get('server_mac', '').upper()
                    service_uuid = self.config.get('service_uuid', '')
                    char_uuid = self.config.get('characteristic_uuid', '')
                    read_interval = self.config.get('read_interval', 1000) / 1000.0
                    operation_mode = self.config.get('operation_mode', 'read')
                    
                    if server_mac and service_uuid and char_uuid:
                        if operation_mode in ['read', 'read_write', 'read_notify']:
                            if server_mac in self.connected_devices:
                                value = self.read_characteristic(server_mac, service_uuid, char_uuid)
                                if value:
                                    logger.info(f"Okunan veri: {value.hex()}")
                                    # Veriyi MQTT veya HTTPS'e gönder
                                    self.send_data(server_mac, value)
                            else:
                                # Bağlantı yoksa bağlanmayı dene
                                if self.config.get('auto_reconnect', False):
                                    self.connect_device(server_mac)
                    
                    time.sleep(read_interval)
                    
                except Exception as e:
                    logger.error(f"Okuma döngüsü hatası: {e}")
                    time.sleep(1)
        
        self.read_thread = threading.Thread(target=read_loop, daemon=True)
        self.read_thread.start()
        logger.info("BLE okuma başlatıldı")
    
    def start_writing(self):
        """Periyodik yazma başlat"""
        if self.write_thread and self.write_thread.is_alive():
            return
        
        def write_loop():
            while self.running and self.config.get('enabled'):
                try:
                    server_mac = self.config.get('server_mac', '').upper()
                    service_uuid = self.config.get('service_uuid', '')
                    char_uuid = self.config.get('characteristic_uuid', '')
                    write_interval = self.config.get('write_interval', 1000) / 1000.0
                    operation_mode = self.config.get('operation_mode', 'read')
                    
                    if server_mac and service_uuid and char_uuid:
                        if operation_mode in ['write', 'read_write']:
                            if server_mac in self.connected_devices:
                                # Örnek yazma (gerçek veri konfigürasyondan gelecek)
                                # value = bytes([0x01, 0x02, 0x03])
                                # self.write_characteristic(server_mac, service_uuid, char_uuid, value)
                                pass
                    
                    time.sleep(write_interval)
                    
                except Exception as e:
                    logger.error(f"Yazma döngüsü hatası: {e}")
                    time.sleep(1)
        
        self.write_thread = threading.Thread(target=write_loop, daemon=True)
        self.write_thread.start()
        logger.info("BLE yazma başlatıldı")
    
    def setup_mqtt(self):
        """MQTT client'ı kur"""
        if not MQTT_AVAILABLE:
            logger.error("MQTT kütüphanesi bulunamadı")
            return False
        
        try:
            mqtt_server = self.config.get('mqtt_server', '')
            mqtt_port = self.config.get('mqtt_port', 1883)
            access_token = self.config.get('mqtt_access_token', '')
            
            if not mqtt_server:
                logger.warning("MQTT server belirtilmemiş")
                return False
            
            self.mqtt_client = mqtt.Client(client_id=f"gateway_ble_{int(time.time())}")
            
            # Access token varsa username olarak kullan
            if access_token:
                self.mqtt_client.username_pw_set(access_token)
            
            self.mqtt_client.connect(mqtt_server, mqtt_port, 60)
            self.mqtt_client.loop_start()
            
            logger.info(f"MQTT bağlantısı kuruldu: {mqtt_server}:{mqtt_port}")
            return True
            
        except Exception as e:
            logger.error(f"MQTT kurulum hatası: {e}")
            return False
    
    def send_data_mqtt(self, mac_address: str, data: bytes):
        """Veriyi MQTT üzerinden gönder"""
        if not self.mqtt_client:
            if not self.setup_mqtt():
                return False
        
        try:
            topic = self.config.get('mqtt_topic', 'gateway/ble/data')
            if not topic:
                topic = 'gateway/ble/data'
            
            # Veriyi JSON formatına çevir
            payload = {
                'mac_address': mac_address,
                'timestamp': datetime.now().isoformat(),
                'data': data.hex(),
                'data_length': len(data)
            }
            
            result = self.mqtt_client.publish(topic, json.dumps(payload))
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.debug(f"MQTT'ye gönderildi: {topic} -> {payload}")
                return True
            else:
                logger.error(f"MQTT gönderim hatası: {result.rc}")
                return False
                
        except Exception as e:
            logger.error(f"MQTT gönderim hatası: {e}")
            return False
    
    def send_data_https(self, mac_address: str, data: bytes):
        """Veriyi HTTPS üzerinden gönder"""
        try:
            https_server = self.config.get('https_server', '')
            https_port = self.config.get('https_port', 443)
            https_endpoint = self.config.get('https_endpoint', '/api/v1/telemetry')
            access_token = self.config.get('https_access_token', '')
            
            if not https_server:
                logger.warning("HTTPS server belirtilmemiş")
                return False
            
            # URL oluştur (port varsa ekle)
            server = https_server.rstrip('/')
            # Eğer server'da zaten port varsa (örn: api.example.com:8443) kullan, yoksa port ekle
            if ':' not in server.split('/')[-1]:
                if https_port != 443:  # 443 varsayılan HTTPS portu, eklemeye gerek yok
                    url = f"https://{server}:{https_port}{https_endpoint}"
                else:
                    url = f"https://{server}{https_endpoint}"
            else:
                url = f"https://{server}{https_endpoint}"
            
            # Headers
            headers = {
                'Content-Type': 'application/json'
            }
            
            if access_token:
                headers['Authorization'] = f'Bearer {access_token}'
            
            # Payload
            payload = {
                'mac_address': mac_address,
                'timestamp': datetime.now().isoformat(),
                'data': data.hex(),
                'data_length': len(data)
            }
            
            # POST isteği gönder
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                logger.debug(f"HTTPS'ye gönderildi: {url} -> {payload}")
                return True
            else:
                logger.error(f"HTTPS gönderim hatası: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"HTTPS gönderim hatası: {e}")
            return False
    
    def send_data(self, mac_address: str, data: bytes):
        """Veriyi forwarder tipine göre gönder"""
        forwarder_type = self.config.get('forwarder_type', 'mqtt')
        
        if forwarder_type == 'mqtt':
            return self.send_data_mqtt(mac_address, data)
        elif forwarder_type == 'https':
            return self.send_data_https(mac_address, data)
        else:
            logger.warning(f"Bilinmeyen forwarder tipi: {forwarder_type}")
            return False
    
    def start(self):
        """Servisi başlat"""
        if not self.load_config():
            logger.error("Konfigürasyon yüklenemedi, servis başlatılamadı")
            return False
        
        if not self.config.get('enabled'):
            logger.info("BLE servisi devre dışı")
            return False
        
        if USE_BLUEPY is None:
            logger.error("BLE kütüphanesi bulunamadı")
            return False
        
        self.running = True
        
        # Başlangıç taraması
        devices = self.scan_devices()
        logger.info(f"İlk tarama: {len(devices)} cihaz bulundu")
        
        # Server MAC'e bağlan
        server_mac = self.config.get('server_mac', '').upper()
        if server_mac:
            self.connect_device(server_mac)
        
        # Forwarder'ı başlat
        forwarder_type = self.config.get('forwarder_type', 'mqtt')
        if forwarder_type == 'mqtt':
            self.setup_mqtt()
        # HTTPS için özel başlatma gerekmez
        
        # Thread'leri başlat
        self.start_scanning()
        
        operation_mode = self.config.get('operation_mode', 'read')
        if operation_mode in ['read', 'read_write', 'read_notify']:
            self.start_reading()
        
        if operation_mode in ['write', 'read_write']:
            self.start_writing()
        
        logger.info("BLE servisi başlatıldı")
        return True
    
    def stop(self):
        """Servisi durdur"""
        self.running = False
        
        # MQTT bağlantısını kapat
        if self.mqtt_client:
            try:
                self.mqtt_client.loop_stop()
                self.mqtt_client.disconnect()
            except Exception as e:
                logger.error(f"MQTT bağlantı kapatma hatası: {e}")
        
        # Tüm bağlantıları kes
        for mac in list(self.connected_devices.keys()):
            self.disconnect_device(mac)
        
        # Thread'lerin bitmesini bekle
        if self.scan_thread:
            self.scan_thread.join(timeout=5)
        if self.read_thread:
            self.read_thread.join(timeout=5)
        if self.write_thread:
            self.write_thread.join(timeout=5)
        
        logger.info("BLE servisi durduruldu")
    
    def reload_config(self):
        """Konfigürasyonu yeniden yükle"""
        logger.info("Konfigürasyon yeniden yükleniyor...")
        old_enabled = self.config.get('enabled') if self.config else False
        
        if self.load_config():
            new_enabled = self.config.get('enabled', False)
            
            if old_enabled != new_enabled:
                if new_enabled:
                    self.start()
                else:
                    self.stop()
            else:
                # Ayarları güncelle (bağlantı kontrolü vb.)
                if not new_enabled:
                    self.stop()


def main():
    """Ana fonksiyon"""
    service = BLEService()
    
    try:
        if service.start():
            # Servis çalışırken bekle
            while True:
                time.sleep(1)
                
                # Konfigürasyon değişikliklerini kontrol et (basit polling)
                # Gerçek implementasyonda file watching kullanılabilir
                service.reload_config()
        else:
            logger.error("Servis başlatılamadı")
    
    except KeyboardInterrupt:
        logger.info("Kullanıcı tarafından durduruldu")
    except Exception as e:
        logger.error(f"Beklenmeyen hata: {e}")
    finally:
        service.stop()


if __name__ == "__main__":
    main()
