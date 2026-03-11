"""
Gateway Configuration API
FastAPI backend for browser-based gateway configuration
"""

from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import json
import os
import subprocess
import time
import logging
from pathlib import Path
from datetime import datetime, timedelta
import secrets

# Logging yapılandırması
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
print("a")
# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
UI_DIR = BASE_DIR / "ui"
CONFIG_DIR = BASE_DIR / "config"
USERS_FILE = CONFIG_DIR / "users.json"
GATEWAY_CONFIG_FILE = CONFIG_DIR / "gateway.json"
FACTORY_DEFAULT_FILE = CONFIG_DIR / "factory_default.json"

# Ensure config directory exists
CONFIG_DIR.mkdir(exist_ok=True)

# Initialize FastAPI app
app = FastAPI(title="Gateway Configuration API", version="1.0.0")

# CORS middleware (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session storage (file-backed so sessions survive restarts)
SESSIONS_FILE = CONFIG_DIR / "sessions.json"
sessions = {}


def load_sessions():
    global sessions
    try:
        if SESSIONS_FILE.exists():
            with open(SESSIONS_FILE, "r") as f:
                raw = json.load(f)
            now = datetime.now()
            sessions = {}
            for sid, data in raw.items():
                exp = datetime.fromisoformat(data["expires"])
                if now < exp:
                    data["expires"] = exp
                    sessions[sid] = data
    except Exception:
        sessions = {}


def save_sessions():
    try:
        raw = {}
        for sid, data in sessions.items():
            raw[sid] = {
                "username": data["username"],
                "expires": data["expires"].isoformat()
            }
        with open(SESSIONS_FILE, "w") as f:
            json.dump(raw, f)
    except Exception:
        pass


load_sessions()

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def load_users():
    """Load users from users.json"""
    if not USERS_FILE.exists():
        # Create default admin user
        default_users = {
            "admin": {
                "password": "admin",  # In production, this should be hashed
                "role": "admin"
            }
        }
        with open(USERS_FILE, 'w') as f:
            json.dump(default_users, f, indent=2)
        return default_users
    
    with open(USERS_FILE, 'r') as f:
        return json.load(f)


def save_users(users):
    """Save users to users.json"""
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)


def load_gateway_config():
    """Load gateway configuration"""
    # Config dizinini oluştur (yoksa)
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    
    if not GATEWAY_CONFIG_FILE.exists():
        # Create default configuration
        default_config = {
            "gateway_name": "Gateway-01",
            "rs485": {
                "enabled": False,
                "baudrate": 9600,
                "parity": "none",
                "data_bits": 8,
                "stop_bits": 1,
                "flow_control": "none",
                "timeout": 1000,
                "direction_control": "auto"
            },
            "modbus": {
                "enabled": False,
                "slave_id": 1,
                "polling_interval": 1000,
                "function_codes": "3,4",
                "register_map": "{}",
                "data_type": "uint16",
                "byte_order": "big_endian",
                "retry_count": 3,
                "error_handling": "retry"
            },
            "modbus_profiles": [],
            "ble": {
                "enabled": False,
                "profiles": []
            },
            "lorawan": {
                "enabled": False,
                "gateway_id": "",
                "region": "EU868",
                "model": "seeed_wm1302",
                "antenna_gain": 0,
                "log_level": "INFO",
                "latitude": 0,
                "longitude": 0,
                "altitude": 0,
                "mqtt_server": "",
                "mqtt_port": 1883,
                "topic_prefix": "eu868",
                "mqtt_json": False
            },
            "wifi": {
                "country": "TR",
                "ssid": "",
                "password": "",
                "networks": []
            }
        }
        with open(GATEWAY_CONFIG_FILE, 'w') as f:
            json.dump(default_config, f, indent=2)
        return default_config
    
    with open(GATEWAY_CONFIG_FILE, 'r') as f:
        return json.load(f)


def save_gateway_config(config):
    """Save gateway configuration"""
    try:
        # Config dizinini oluştur (yoksa)
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        
        # Dosyayı yaz
        with open(GATEWAY_CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        
        # Dosya izinlerini ayarla (okuma/yazma herkes için)
        try:
            os.chmod(GATEWAY_CONFIG_FILE, 0o644)
        except Exception:
            pass  # Windows'ta chmod çalışmayabilir
        
    except PermissionError as e:
        error_msg = f"Dosya yazma izni yok: {GATEWAY_CONFIG_FILE}"
        print(f"Permission error: {error_msg}")
        print(f"Lütfen şu komutu çalıştırın: sudo chmod 666 {GATEWAY_CONFIG_FILE}")
        print(f"Veya: sudo chown $USER:$USER {GATEWAY_CONFIG_FILE}")
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        error_msg = f"Konfigürasyon kaydedilemedi: {str(e)}"
        print(f"Save config error: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


def get_session_user(request: Request):
    """Get user from session cookie"""
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in sessions:
        return None
    
    session = sessions[session_id]
    if datetime.now() > session["expires"]:
        del sessions[session_id]
        save_sessions()
        return None
    
    return session["username"]


def scan_wifi_networks():
    """
    Scan for WiFi networks using nmcli or iwlist
    Raspberry Pi için gerçek WiFi tarama implementasyonu
    """
    networks = []
    
    try:
        # Önce nmcli ile dene (NetworkManager kullanıyorsa)
        try:
            result = subprocess.run(
                ['nmcli', '-t', '-f', 'SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list', '--rescan', 'yes'],
                capture_output=True,
                text=True,
                timeout=30,
                check=False
            )
            
            if result.returncode == 0 and result.stdout.strip():
                # nmcli çıktısını parse et
                seen_ssids = set()  # Duplicate SSID'leri önlemek için
                
                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue
                    
                    parts = line.split(':')
                    if len(parts) >= 2:
                        ssid = parts[0].strip()
                        signal_str = parts[1].strip() if len(parts) > 1 else '0'
                        security = parts[2].strip() if len(parts) > 2 else ''
                        
                        # Boş SSID'leri atla ve duplicate'leri önle
                        if not ssid or ssid == '--' or ssid in seen_ssids:
                            continue
                        
                        seen_ssids.add(ssid)
                        
                        # Signal değerini parse et
                        try:
                            signal = int(signal_str) if signal_str.isdigit() else 0
                        except ValueError:
                            signal = 0
                        
                        # Security bilgisini kontrol et
                        encrypted = security != '' and security != '--' and 'WPA' in security.upper()
                        
                        networks.append({
                            'ssid': ssid,
                            'signal': signal,
                            'encrypted': encrypted
                        })
                
                # Signal gücüne göre sırala (yüksekten düşüğe)
                networks.sort(key=lambda x: x['signal'], reverse=True)
                
                if networks:
                    return networks
        
        except FileNotFoundError:
            # nmcli bulunamadı, iwlist ile dene
            pass
        except subprocess.TimeoutExpired:
            print("WiFi tarama zaman aşımına uğradı (nmcli)")
        except Exception as e:
            print(f"nmcli tarama hatası: {e}")
        
        # nmcli başarısız olduysa iwlist ile dene
        try:
            result = subprocess.run(
                ['sudo', 'iwlist', 'wlan0', 'scan'],
                capture_output=True,
                text=True,
                timeout=30,
                check=False
            )
            
            if result.returncode == 0 and result.stdout.strip():
                seen_ssids = set()
                current_ssid = None
                current_signal = 0
                current_encrypted = False
                
                for line in result.stdout.split('\n'):
                    line = line.strip()
                    
                    # SSID bul
                    if 'ESSID:' in line:
                        ssid = line.split('ESSID:')[1].strip().strip('"').strip("'")
                        if ssid and ssid != 'off/any':
                            current_ssid = ssid
                    
                    # Signal gücü bul
                    elif 'Signal level=' in line or 'Quality=' in line:
                        try:
                            if 'Signal level=' in line:
                                signal_part = line.split('Signal level=')[1].split()[0]
                                # dBm formatında (-70 gibi)
                                signal = abs(int(signal_part.split('/')[0]))
                                # dBm'i yüzdeye çevir (yaklaşık)
                                current_signal = max(0, min(100, 100 + signal))
                            elif 'Quality=' in line:
                                quality_part = line.split('Quality=')[1].split()[0]
                                if '/' in quality_part:
                                    parts = quality_part.split('/')
                                    current_signal = int((int(parts[0]) / int(parts[1])) * 100)
                                else:
                                    current_signal = int(quality_part)
                        except (ValueError, IndexError):
                            pass
                    
                    # Encryption bul
                    elif 'Encryption key:' in line:
                        current_encrypted = 'on' in line.lower()
                    
                    # Cell sonu - network bilgilerini kaydet
                    elif line.startswith('Cell') and current_ssid:
                        if current_ssid and current_ssid not in seen_ssids:
                            seen_ssids.add(current_ssid)
                            networks.append({
                                'ssid': current_ssid,
                                'signal': current_signal,
                                'encrypted': current_encrypted
                            })
                        
                        # Reset
                        current_ssid = None
                        current_signal = 0
                        current_encrypted = False
                
                # Son network'i de ekle
                if current_ssid and current_ssid not in seen_ssids:
                    networks.append({
                        'ssid': current_ssid,
                        'signal': current_signal,
                        'encrypted': current_encrypted
                    })
                
                # Signal gücüne göre sırala
                networks.sort(key=lambda x: x['signal'], reverse=True)
                
                if networks:
                    return networks
        
        except FileNotFoundError:
            print("iwlist bulunamadı. WiFi tarama için nmcli veya iwlist gerekli.")
        except subprocess.TimeoutExpired:
            print("WiFi tarama zaman aşımına uğradı (iwlist)")
        except Exception as e:
            print(f"iwlist tarama hatası: {e}")
        
        # Her iki yöntem de başarısız olduysa boş liste döndür
        if not networks:
            print("WiFi tarama başarısız. Boş liste döndürülüyor.")
            return []
        
        return networks
        
    except Exception as e:
        print(f"WiFi tarama genel hatası: {e}")
        return []


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class LoginRequest(BaseModel):
    username: str
    password: str


class RS485Config(BaseModel):
    enabled: bool
    baudrate: int
    parity: str
    data_bits: Optional[int] = 8
    stop_bits: Optional[float] = 1
    flow_control: Optional[str] = "none"
    timeout: Optional[int] = 1000
    direction_control: Optional[str] = "auto"


class ModbusConfig(BaseModel):
    enabled: bool
    slave_id: int
    polling_interval: int
    function_codes: str
    register_map: str
    data_type: str
    byte_order: str
    retry_count: int
    error_handling: str


class ModbusProfilesRequest(BaseModel):
    profiles: List[dict]


class MQTTForwardConfig(BaseModel):
    host: str = ""
    port: int = 1883
    token: str = ""


class BLEConfig(BaseModel):
    enabled: bool
    server_mac: Optional[str] = ""
    service_uuid: Optional[str] = ""
    characteristic_uuid: Optional[str] = ""
    connection_timeout: Optional[int] = 30
    scan_interval: Optional[int] = 10
    auto_reconnect: Optional[bool] = False
    operation_mode: Optional[str] = "read"
    read_interval: Optional[int] = 1000
    write_interval: Optional[int] = 1000
    connection_control: Optional[bool] = False
    forwarder_type: Optional[str] = "mqtt"  # mqtt or https
    mqtt_server: Optional[str] = ""
    mqtt_port: Optional[int] = 1883
    mqtt_topic: Optional[str] = ""
    mqtt_access_token: Optional[str] = ""
    https_server: Optional[str] = ""
    https_port: Optional[int] = 443
    https_endpoint: Optional[str] = ""
    https_access_token: Optional[str] = ""
    devices: Optional[List[str]] = []


class LoRaWANConfig(BaseModel):
    enabled: bool
    gateway_id: str = ""
    region: str = "EU868"
    model: str = "seeed_wm1302"
    antenna_gain: int = 0
    log_level: str = "INFO"
    latitude: float = 0
    longitude: float = 0
    altitude: int = 0
    mqtt_server: str = ""
    mqtt_port: int = 1883
    topic_prefix: str = "eu868"
    mqtt_json: bool = False


class WiFiConfig(BaseModel):
    country: str
    ssid: str
    password: str


class SystemConfig(BaseModel):
    gateway_name: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class BLEProfilesRequest(BaseModel):
    enabled: bool
    profiles: List[dict]


# ============================================================================
# ROUTES
# ============================================================================

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve main HTML page"""
    index_file = UI_DIR / "index.html"
    if not index_file.exists():
        return HTMLResponse("<h1>UI not found</h1><p>Please create ui/index.html</p>", status_code=404)
    
    with open(index_file, 'r', encoding='utf-8') as f:
        return HTMLResponse(content=f.read())


@app.post("/api/login")
async def login(credentials: LoginRequest, response: Response):
    """Login endpoint"""
    users = load_users()
    
    if credentials.username not in users:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = users[credentials.username]
    if user["password"] != credentials.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    session_id = secrets.token_urlsafe(32)
    sessions[session_id] = {
        "username": credentials.username,
        "expires": datetime.now() + timedelta(hours=24)
    }
    save_sessions()

    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        max_age=86400
    )

    return {"status": "success", "username": credentials.username}


@app.post("/api/logout")
async def logout(request: Request, response: Response):
    """Logout endpoint"""
    session_id = request.cookies.get("session_id")
    if session_id in sessions:
        del sessions[session_id]
        save_sessions()

    response.delete_cookie("session_id")
    return {"status": "success"}


@app.get("/api/config")
async def get_config(request: Request):
    """Get full gateway configuration"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    config = load_gateway_config()
    return config


@app.post("/api/config/rs485")
async def update_rs485(config: RS485Config, request: Request):
    """Update RS485 configuration"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    gateway_config["rs485"] = config.dict()
    save_gateway_config(gateway_config)
    
    return {"status": "success", "config": config.dict()}


@app.post("/api/config/modbus")
async def update_modbus(config: ModbusConfig, request: Request):
    """Update Modbus configuration"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    gateway_config["modbus"] = config.dict()
    save_gateway_config(gateway_config)
    
    return {"status": "success", "config": config.dict()}


@app.post("/api/config/modbus/profiles")
async def update_modbus_profiles(request_data: ModbusProfilesRequest, request: Request):
    """Update Modbus profiles (BLE'ye benzer)"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    gateway_config["modbus_profiles"] = request_data.profiles
    save_gateway_config(gateway_config)
    
    return {"status": "success", "profiles": request_data.profiles}


@app.post("/api/config/modbus/mqtt")
async def update_modbus_mqtt(config: MQTTForwardConfig, request: Request):
    """Update Modbus MQTT forward settings"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    gateway_config["modbus_mqtt"] = config.dict()
    save_gateway_config(gateway_config)
    
    return {"status": "success", "config": config.dict()}


@app.post("/api/config/ble/mqtt")
async def update_ble_mqtt(config: MQTTForwardConfig, request: Request):
    """Update BLE MQTT forward settings"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    gateway_config["ble_mqtt"] = config.dict()
    save_gateway_config(gateway_config)
    
    return {"status": "success", "config": config.dict()}


def scan_ble_devices():
    """
    Scan for BLE devices using bluetoothctl or hcitool
    Raspberry Pi için gerçek BLE tarama implementasyonu
    """
    devices = []
    
    try:
        # Önce bluetoothctl ile dene
        try:
            # bluetoothctl scan on (background'da çalışır)
            scan_process = subprocess.Popen(
                ['bluetoothctl', 'scan', 'on'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Biraz bekle (cihazların bulunması için)
            time.sleep(8)
            
            # Taramayı durdur
            subprocess.run(['bluetoothctl', 'scan', 'off'], 
                         capture_output=True, timeout=3, check=False)
            scan_process.terminate()
            scan_process.wait(timeout=2)
            
            # Cihazları listele
            result = subprocess.run(
                ['bluetoothctl', 'devices'],
                capture_output=True,
                text=True,
                timeout=5,
                check=False
            )
            
            if result.returncode == 0 and result.stdout.strip():
                seen_macs = set()
                for line in result.stdout.strip().split('\n'):
                    if 'Device' in line:
                        parts = line.split(' ', 1)
                        if len(parts) >= 2:
                            mac = parts[1].split()[0]
                            name = ' '.join(parts[1].split()[1:]) if len(parts[1].split()) > 1 else mac
                            
                            if mac and mac not in seen_macs and ':' in mac:
                                seen_macs.add(mac)
                                devices.append({
                                    'mac': mac,
                                    'name': name,
                                    'service_uuid': '',  # bluetoothctl ile UUID almak için ek komut gerekir
                                    'characteristic_uuid': ''
                                })
            
            if devices:
                return devices
                
        except FileNotFoundError:
            print("bluetoothctl bulunamadı")
        except subprocess.TimeoutExpired:
            print("bluetoothctl tarama zaman aşımına uğradı")
        except Exception as e:
            print(f"bluetoothctl tarama hatası: {e}")
        
        # Eğer bluetoothctl başarısız olduysa, hcitool ile dene
        try:
            result = subprocess.run(
                ['sudo', 'hcitool', 'lescan', '--duplicates'],
                capture_output=True,
                text=True,
                timeout=10,
                check=False
            )
            
            if result.stdout and result.stdout.strip():
                seen_macs = set()
                for line in result.stdout.strip().split('\n'):
                    if line.strip() and not line.startswith('LE Scan'):
                        parts = line.split()
                        if len(parts) >= 1:
                            mac = parts[0]
                            name = ' '.join(parts[1:]) if len(parts) > 1 else mac
                            
                            if mac and mac not in seen_macs and ':' in mac and len(mac) == 17:
                                seen_macs.add(mac)
                                devices.append({
                                    'mac': mac,
                                    'name': name,
                                    'service_uuid': '',
                                    'characteristic_uuid': ''
                                })
            
            if devices:
                return devices
                
        except FileNotFoundError:
            print("hcitool bulunamadı. BLE tarama için bluetoothctl veya hcitool gerekli.")
        except subprocess.TimeoutExpired:
            print("hcitool tarama zaman aşımına uğradı")
        except Exception as e:
            print(f"hcitool tarama hatası: {e}")
        
        # Windows'ta test için mock data (geliştirme ortamı)
        import platform
        if platform.system() == 'Windows':
            print("Windows ortamında - mock BLE cihazları döndürülüyor")
            return [
                {
                    'mac': 'AA:BB:CC:DD:EE:FF',
                    'name': 'Mock BLE Device',
                    'service_uuid': '',
                    'characteristic_uuid': ''
                }
            ]
        
    except Exception as e:
        print(f"BLE tarama genel hatası: {e}")
        import traceback
        traceback.print_exc()
    
    return devices




@app.post("/api/config/ble")
async def update_ble(config: BLEConfig, request: Request):
    """Update BLE configuration"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    gateway_config["ble"] = config.dict()
    save_gateway_config(gateway_config)
    
    return {"status": "success", "config": config.dict()}


@app.post("/api/config/ble/profiles")
async def update_ble_profiles(request_data: BLEProfilesRequest, request: Request):
    """Update BLE profiles (ThingsBoard bağımsız)"""
    logger.info("=" * 50)
    logger.info("BLE PROFILES UPDATE ENDPOINT ÇAĞRILDI")
    logger.info("=" * 50)
    print("=" * 50)
    print("BLE PROFILES UPDATE ENDPOINT ÇAĞRILDI")
    print("=" * 50)
    logger.info(f"Request data: enabled={request_data.enabled}, profiles count={len(request_data.profiles)}")
    print(f"Request data: enabled={request_data.enabled}, profiles count={len(request_data.profiles)}")
    
    user = get_session_user(request)
    logger.info(f"Session user: {user}")
    print(f"Session user: {user}")
    
    if not user:
        logger.warning("401: Kullanıcı kimlik doğrulaması yapılmamış")
        print("401: Kullanıcı kimlik doğrulaması yapılmamış")
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Gateway config'i güncelle
    gateway_config = load_gateway_config()
    if "ble" not in gateway_config:
        gateway_config["ble"] = {}
    
    gateway_config["ble"]["enabled"] = request_data.enabled
    gateway_config["ble"]["profiles"] = request_data.profiles
    logger.info(f"Gateway config güncelleniyor: enabled={request_data.enabled}")
    print(f"Gateway config güncelleniyor: enabled={request_data.enabled}")
    save_gateway_config(gateway_config)
    
    return {"status": "success", "profiles": request_data.profiles}


@app.post("/api/ble/scan")
async def scan_ble(request: Request):
    """Scan for BLE devices"""
    logger.info("=" * 50)
    logger.info("BLE SCAN ENDPOINT ÇAĞRILDI")
    logger.info("=" * 50)
    print("=" * 50)
    print("BLE SCAN ENDPOINT ÇAĞRILDI")
    print("=" * 50)
    
    user = get_session_user(request)
    logger.info(f"Session user: {user}")
    print(f"Session user: {user}")
    
    if not user:
        logger.warning("401: Kullanıcı kimlik doğrulaması yapılmamış")
        print("401: Kullanıcı kimlik doğrulaması yapılmamış")
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        logger.info("BLE cihazları taranıyor...")
        print("BLE cihazları taranıyor...")
        devices = scan_ble_devices()
        logger.info(f"Bulunan cihaz sayısı: {len(devices)}")
        logger.info(f"Cihazlar: {devices}")
        print(f"Bulunan cihaz sayısı: {len(devices)}")
        print(f"Cihazlar: {devices}")
        return {"status": "success", "devices": devices}
    except Exception as e:
        logger.error(f"BLE tarama hatası: {e}", exc_info=True)
        print(f"BLE tarama hatası: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"BLE tarama başarısız: {str(e)}")


BLE_LAST_SEEN_PATH = "/tmp/iot_last_seen.json"
BLE_ACTIVE_TIMEOUT = 120  # 2 dakika


@app.post("/api/ble/status")
async def ble_device_status(request: Request):
    """Check BLE device activity from last_seen timestamps (2 min threshold)"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    body = await request.json()
    mac_list = body.get("macs", [])
    statuses = {}

    last_seen = {}
    try:
        if os.path.exists(BLE_LAST_SEEN_PATH):
            with open(BLE_LAST_SEEN_PATH, "r") as f:
                last_seen = json.load(f)
    except Exception:
        pass

    now = time.time()
    for mac in mac_list:
        mac_upper = mac.upper()
        ts = last_seen.get(mac_upper, 0)
        statuses[mac_upper] = (now - ts) < BLE_ACTIVE_TIMEOUT

    return {"status": "success", "statuses": statuses}


REGION_CHANNELS = {
    "EU868": {
        "multi_sf": [868100000, 868300000, 868500000, 867100000, 867300000, 867500000, 867700000, 867900000],
        "lora_std": {"frequency": 868300000, "bandwidth": 250000, "spreading_factor": 7},
        "fsk": {"frequency": 868800000, "bandwidth": 125000, "datarate": 50000}
    },
    "US915": {
        "multi_sf": [902300000, 902500000, 902700000, 902900000, 903100000, 903300000, 903500000, 903700000],
        "lora_std": {"frequency": 903000000, "bandwidth": 500000, "spreading_factor": 8},
        "fsk": {"frequency": 0, "bandwidth": 0, "datarate": 0}
    },
    "AS923": {
        "multi_sf": [923200000, 923400000, 922200000, 922400000, 922600000, 922800000, 923000000, 923600000],
        "lora_std": {"frequency": 923200000, "bandwidth": 250000, "spreading_factor": 7},
        "fsk": {"frequency": 0, "bandwidth": 0, "datarate": 0}
    }
}

CONCENTRATORD_TOML = "/etc/chirpstack-concentratord/sx1302.toml"
MQTT_FORWARDER_TOML = "/etc/chirpstack-mqtt-forwarder/chirpstack-mqtt-forwarder.toml"


def write_concentratord_toml(cfg: LoRaWANConfig):
    region = cfg.region if cfg.region in REGION_CHANNELS else "EU868"
    ch = REGION_CHANNELS[region]

    channels_str = ",\n  ".join(str(f) for f in ch["multi_sf"])

    content = f'''[concentratord]
log_level="{cfg.log_level}"
log_to_syslog=false
stats_interval="30s"
disable_crc_filter=false

[concentratord.api]
event_bind="ipc:///tmp/concentratord_event"
command_bind="ipc:///tmp/concentratord_command"

[gateway]
antenna_gain={cfg.antenna_gain}
lorawan_public=true
region="{region}"
model="{cfg.model}"
gps_tty_path="/dev/ttyS0"
model_flags=[]
gateway_id="{cfg.gateway_id}"
time_fallback_enabled=true

[gateway.concentrator]
multi_sf_channels=[
  {channels_str},
]

[gateway.concentrator.lora_std]
frequency={ch["lora_std"]["frequency"]}
bandwidth={ch["lora_std"]["bandwidth"]}
spreading_factor={ch["lora_std"]["spreading_factor"]}

[gateway.concentrator.fsk]
frequency={ch["fsk"]["frequency"]}
bandwidth={ch["fsk"]["bandwidth"]}
datarate={ch["fsk"]["datarate"]}

[gateway.location]
latitude={cfg.latitude}
longitude={cfg.longitude}
altitude={cfg.altitude}
'''
    proc = subprocess.run(["sudo", "tee", CONCENTRATORD_TOML], input=content.encode(), capture_output=True, timeout=10)
    if proc.returncode != 0:
        raise Exception(f"concentratord toml yazılamadı: {proc.stderr.decode()}")


def write_mqtt_forwarder_toml(cfg: LoRaWANConfig):
    server_addr = cfg.mqtt_server.strip()
    if server_addr and not server_addr.startswith("tcp://"):
        server_addr = f"tcp://{server_addr}:{cfg.mqtt_port}"
    elif not server_addr:
        server_addr = f"tcp://127.0.0.1:{cfg.mqtt_port}"

    json_val = "true" if cfg.mqtt_json else "false"

    content = f'''[logging]
  level="info"

[backend]
  enabled="concentratord"

  [backend.concentratord]
    event_url="ipc:///tmp/concentratord_event"
    command_url="ipc:///tmp/concentratord_command"

[mqtt]
  server="{server_addr}"
  topic_prefix="{cfg.topic_prefix}"
  json={json_val}
'''
    proc = subprocess.run(["sudo", "tee", MQTT_FORWARDER_TOML], input=content.encode(), capture_output=True, timeout=10)
    if proc.returncode != 0:
        raise Exception(f"mqtt forwarder toml yazılamadı: {proc.stderr.decode()}")


def restart_lorawan_services():
    errors = []
    for svc in ["chirpstack-concentratord", "chirpstack-mqtt-forwarder"]:
        try:
            subprocess.run(["sudo", "systemctl", "restart", svc], capture_output=True, timeout=15)
        except Exception as e:
            errors.append(f"{svc}: {str(e)}")
    return errors


@app.post("/api/config/lorawan")
async def update_lorawan(config: LoRaWANConfig, request: Request):
    """Update LoRaWAN configuration and write TOML files"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    gateway_config = load_gateway_config()
    gateway_config["lorawan"] = config.dict()
    save_gateway_config(gateway_config)

    if config.enabled:
        try:
            write_concentratord_toml(config)
            write_mqtt_forwarder_toml(config)
            errors = restart_lorawan_services()
            if errors:
                return {"status": "success", "config": config.dict(), "warnings": errors}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TOML yazma/servis hatası: {str(e)}")

    return {"status": "success", "config": config.dict()}


@app.post("/api/config/wifi")
async def update_wifi(config: WiFiConfig, request: Request):
    """Update WiFi configuration and apply connection"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    if "wifi" not in gateway_config:
        gateway_config["wifi"] = {}
    
    gateway_config["wifi"]["country"] = config.country
    gateway_config["wifi"]["ssid"] = config.ssid
    gateway_config["wifi"]["password"] = config.password
    save_gateway_config(gateway_config)
    
    connect_result = {"applied": False, "message": ""}
    
    try:
        subprocess.run(
            ['sudo', 'iw', 'reg', 'set', config.country],
            capture_output=True, text=True, timeout=5, check=False
        )
    except Exception:
        pass

    try:
        del_result = subprocess.run(
            ['sudo', 'nmcli', 'connection', 'delete', config.ssid],
            capture_output=True, text=True, timeout=10, check=False
        )
    except Exception:
        pass

    try:
        cmd = ['sudo', 'nmcli', 'dev', 'wifi', 'connect', config.ssid]
        if config.password:
            cmd += ['password', config.password]
        
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30, check=False
        )
        
        if result.returncode == 0:
            connect_result = {"applied": True, "message": "WiFi bağlantısı başarılı"}
            stop_ap_mode()
        else:
            err = result.stderr.strip() or result.stdout.strip()
            connect_result = {"applied": False, "message": f"Bağlantı hatası: {err}"}
    except subprocess.TimeoutExpired:
        connect_result = {"applied": False, "message": "Bağlantı zaman aşımına uğradı"}
    except FileNotFoundError:
        connect_result = {"applied": False, "message": "nmcli bulunamadı"}
    except Exception as e:
        connect_result = {"applied": False, "message": str(e)}
    
    return {"status": "success", "config": config.dict(), "connection": connect_result}


@app.get("/api/wifi/status")
async def get_wifi_status(request: Request):
    """Get current WiFi connection status"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    status = {"connected": False, "ssid": "", "ip": "", "signal": "", "mode": "client"}
    
    try:
        result = subprocess.run(
            ['nmcli', '-t', '-f', 'ACTIVE,SSID,SIGNAL', 'dev', 'wifi'],
            capture_output=True, text=True, timeout=10, check=False
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split('\n'):
                parts = line.split(':')
                if len(parts) >= 2 and parts[0] == 'yes':
                    status["connected"] = True
                    status["ssid"] = parts[1]
                    status["signal"] = parts[2] if len(parts) > 2 else ""
                    break
    except Exception:
        pass

    try:
        result = subprocess.run(
            ['hostname', '-I'],
            capture_output=True, text=True, timeout=5, check=False
        )
        if result.returncode == 0:
            ips = result.stdout.strip().split()
            if ips:
                status["ip"] = ips[0]
    except Exception:
        pass
    
    ap_active = False
    try:
        result = subprocess.run(
            ['systemctl', 'is-active', 'hostapd'],
            capture_output=True, text=True, timeout=5, check=False
        )
        ap_active = result.stdout.strip() == 'active'
    except Exception:
        pass
    
    status["mode"] = "ap" if ap_active else "client"
    
    return status


def stop_ap_mode():
    """AP modunu durdur"""
    try:
        subprocess.run(['sudo', 'systemctl', 'stop', 'hostapd'], capture_output=True, timeout=10, check=False)
        subprocess.run(['sudo', 'systemctl', 'stop', 'dnsmasq'], capture_output=True, timeout=10, check=False)
    except Exception as e:
        print(f"AP mode durdurma hatası: {e}")


@app.post("/api/config/system")
async def update_system(config: SystemConfig, request: Request):
    """Update system configuration"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    gateway_config["gateway_name"] = config.gateway_name
    save_gateway_config(gateway_config)
    
    return {"status": "success", "config": config.dict()}


@app.post("/api/user/change-password")
async def change_password(request_data: ChangePasswordRequest, request: Request):
    """Change user password"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    users = load_users()
    
    if user not in users:
        raise HTTPException(status_code=404, detail="User not found")
    
    if users[user]["password"] != request_data.current_password:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    users[user]["password"] = request_data.new_password
    save_users(users)
    
    return {"status": "success", "message": "Password changed successfully"}


@app.get("/api/system/status")
async def get_system_status(request: Request):
    """Get system status (CPU, RAM, uptime, disk, temperature)"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    status = {}
    
    try:
        result = subprocess.run(['uptime', '-p'], capture_output=True, text=True, timeout=5, check=False)
        status["uptime"] = result.stdout.strip() if result.returncode == 0 else "N/A"
    except Exception:
        status["uptime"] = "N/A"

    try:
        with open('/proc/loadavg', 'r') as f:
            parts = f.read().split()
            status["cpu_load"] = f"{parts[0]} / {parts[1]} / {parts[2]}"
    except Exception:
        status["cpu_load"] = "N/A"

    try:
        result = subprocess.run(['free', '-m'], capture_output=True, text=True, timeout=5, check=False)
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            if len(lines) >= 2:
                parts = lines[1].split()
                total = int(parts[1])
                used = int(parts[2])
                status["ram"] = f"{used}MB / {total}MB ({int(used/total*100)}%)"
        else:
            status["ram"] = "N/A"
    except Exception:
        status["ram"] = "N/A"

    try:
        result = subprocess.run(['df', '-h', '/'], capture_output=True, text=True, timeout=5, check=False)
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            if len(lines) >= 2:
                parts = lines[1].split()
                status["disk"] = f"{parts[2]} / {parts[1]} ({parts[4]})"
        else:
            status["disk"] = "N/A"
    except Exception:
        status["disk"] = "N/A"

    try:
        with open('/sys/class/thermal/thermal_zone0/temp', 'r') as f:
            temp = int(f.read().strip()) / 1000
            status["temperature"] = f"{temp:.1f}°C"
    except Exception:
        status["temperature"] = "N/A"

    try:
        result = subprocess.run(['hostname', '-I'], capture_output=True, text=True, timeout=5, check=False)
        status["ip"] = result.stdout.strip().split()[0] if result.returncode == 0 else "N/A"
    except Exception:
        status["ip"] = "N/A"

    return status


@app.post("/api/wifi/scan")
async def scan_wifi(request: Request):
    """Scan for WiFi networks"""
    logger.info("=" * 50)
    logger.info("WIFI SCAN ENDPOINT ÇAĞRILDI")
    logger.info("=" * 50)
    print("=" * 50)
    print("WIFI SCAN ENDPOINT ÇAĞRILDI")
    print("=" * 50)
    
    user = get_session_user(request)
    logger.info(f"Session user: {user}")
    print(f"Session user: {user}")
    
    if not user:
        logger.warning("401: Kullanıcı kimlik doğrulaması yapılmamış")
        print("401: Kullanıcı kimlik doğrulaması yapılmamış")
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    logger.info("WiFi ağları taranıyor...")
    print("WiFi ağları taranıyor...")
    networks = scan_wifi_networks()
    logger.info(f"Bulunan ağ sayısı: {len(networks)}")
    logger.info(f"Ağlar: {networks}")
    print(f"Bulunan ağ sayısı: {len(networks)}")
    print(f"Ağlar: {networks}")
    
    # Save scanned networks to config
    gateway_config = load_gateway_config()
    if "wifi" not in gateway_config:
        gateway_config["wifi"] = {}
    gateway_config["wifi"]["networks"] = networks
    save_gateway_config(gateway_config)
    
    return {"status": "success", "networks": networks}


@app.post("/api/system/restart")
async def restart_gateway(request: Request):
    """Restart gateway"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    subprocess.Popen(['sudo', 'reboot'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"status": "success", "message": "Gateway yeniden başlatılıyor"}


@app.post("/api/system/factory-reset")
async def factory_reset(request: Request):
    """Reset to factory defaults"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    import shutil
    
    if FACTORY_DEFAULT_FILE.exists():
        shutil.copy2(FACTORY_DEFAULT_FILE, GATEWAY_CONFIG_FILE)
    else:
        gateway_config = load_gateway_config()
        default_config = {
            "gateway_name": "Gateway-01",
            "rs485": {"enabled": False, "baudrate": 9600, "parity": "none", "data_bits": 8, "stop_bits": 1, "flow_control": "none", "timeout": 1000, "direction_control": "auto"},
            "modbus": {"enabled": False, "slave_id": 1, "polling_interval": 1000, "function_codes": "3,4", "register_map": "{}", "data_type": "uint16", "byte_order": "big_endian", "retry_count": 3, "error_handling": "retry"},
            "modbus_profiles": [],
            "modbus_mqtt": {"host": "", "port": 1883, "token": ""},
            "ble": {"enabled": False, "profiles": []},
            "ble_mqtt": {"host": "", "port": 1883, "token": ""},
            "lorawan": {"enabled": False, "gateway_id": "", "region": "EU868", "model": "seeed_wm1302", "antenna_gain": 0, "log_level": "INFO", "latitude": 0, "longitude": 0, "altitude": 0, "mqtt_server": "", "mqtt_port": 1883, "topic_prefix": "eu868", "mqtt_json": False},
            "wifi": {"country": "TR", "ssid": "", "password": "", "networks": []}
        }
        save_gateway_config(default_config)
    
    default_users = {"admin": {"password": "admin", "role": "admin"}}
    save_users(default_users)
    
    return {"status": "success", "message": "Fabrika ayarlarına dönüldü"}


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory=UI_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
