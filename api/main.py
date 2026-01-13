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
from pathlib import Path
from datetime import datetime, timedelta
import secrets

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
UI_DIR = BASE_DIR / "ui"
CONFIG_DIR = BASE_DIR / "config"
USERS_FILE = CONFIG_DIR / "users.json"
GATEWAY_CONFIG_FILE = CONFIG_DIR / "gateway.json"

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

# Session storage (in-memory, simple approach)
sessions = {}

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
            "ble": {
                "enabled": False,
                "server_mac": "",
                "service_uuid": "",
                "characteristic_uuid": "",
                "connection_timeout": 30,
                "scan_interval": 10,
                "auto_reconnect": False,
                "operation_mode": "read",
                "read_interval": 1000,
                "write_interval": 1000,
                "connection_control": False,
                "forwarder_type": "mqtt",
                "mqtt_server": "",
                "mqtt_port": 1883,
                "mqtt_topic": "",
                "mqtt_access_token": "",
                "https_server": "",
                "https_port": 443,
                "https_endpoint": "",
                "https_access_token": "",
                "devices": []
            },
            "lorawan": {
                "enabled": False,
                "gateway_id": "",
                "forwarder_type": "mqtt",
                "mqtt_server": "",
                "mqtt_port": 1883,
                "udp_server": "",
                "udp_port": 1700
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
    # Check if session expired (24 hours)
    if datetime.now() > session["expires"]:
        del sessions[session_id]
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
                ['nmcli', '-t', '-f', 'SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list'],
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
    gateway_id: str
    forwarder_type: str  # mqtt or udp
    mqtt_server: Optional[str] = ""
    mqtt_port: Optional[int] = 1883
    udp_server: Optional[str] = ""
    udp_port: Optional[int] = 1700


class WiFiConfig(BaseModel):
    country: str
    ssid: str
    password: str


class SystemConfig(BaseModel):
    gateway_name: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


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
    
    # Create session
    session_id = secrets.token_urlsafe(32)
    sessions[session_id] = {
        "username": credentials.username,
        "expires": datetime.now() + timedelta(hours=24)
    }
    
    # Set cookie
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        max_age=86400  # 24 hours
    )
    
    return {"status": "success", "username": credentials.username}


@app.post("/api/logout")
async def logout(request: Request, response: Response):
    """Logout endpoint"""
    session_id = request.cookies.get("session_id")
    if session_id in sessions:
        del sessions[session_id]
    
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


@app.post("/api/config/lorawan")
async def update_lorawan(config: LoRaWANConfig, request: Request):
    """Update LoRaWAN configuration"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    gateway_config = load_gateway_config()
    gateway_config["lorawan"] = config.dict()
    save_gateway_config(gateway_config)
    
    return {"status": "success", "config": config.dict()}


@app.post("/api/config/wifi")
async def update_wifi(config: WiFiConfig, request: Request):
    """Update WiFi configuration"""
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
    
    # In production, this would configure the WiFi connection
    # using system commands like nmcli or wpa_supplicant
    
    return {"status": "success", "config": config.dict()}


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


@app.post("/api/wifi/scan")
async def scan_wifi(request: Request):
    """Scan for WiFi networks"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    networks = scan_wifi_networks()
    
    # Save scanned networks to config
    gateway_config = load_gateway_config()
    if "wifi" not in gateway_config:
        gateway_config["wifi"] = {}
    gateway_config["wifi"]["networks"] = networks
    save_gateway_config(gateway_config)
    
    return {"status": "success", "networks": networks}


@app.post("/api/system/restart")
async def restart_gateway(request: Request):
    """Restart gateway (placeholder)"""
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # In production, this would trigger actual restart
    # os.system("sudo reboot")
    # or use subprocess: subprocess.run(["sudo", "reboot"])
    
    return {"status": "success", "message": "Gateway restart initiated"}


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory=UI_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
