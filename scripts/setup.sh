#!/bin/bash
# Biensis Gateway - Otomatik Kurulum Scripti
# Pi üzerinde çalıştırılır: bash ~/BIEN_GATEWAY_GUI/scripts/setup.sh
set -e

PROJECT_DIR="$HOME/BIEN_GATEWAY_GUI"
VENV_DIR="$PROJECT_DIR/venv"
SERVICE_NAME="biensis-gateway"
BLE_SERVICE_NAME="ble-gateway"

echo "================================================"
echo "  Biensis Gateway Kurulumu"
echo "================================================"

# 1. Sistem paketleri
echo ""
echo "[1/7] Sistem paketleri kuruluyor..."
sudo apt update -qq
export DEBIAN_FRONTEND=noninteractive
sudo -E apt install -y -qq \
  python3 python3-pip python3-venv python3-dev \
  network-manager bluez bluez-tools libbluetooth-dev \
  hostapd dnsmasq iptables-persistent \
  git curl jq > /dev/null 2>&1
echo "  OK"

# 2. Python sanal ortamı
echo "[2/7] Python ortamı hazırlanıyor..."
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r "$PROJECT_DIR/requirements.txt"
pip install bleak paho-mqtt
echo "  OK"

# 3. Config dosyaları
echo "[3/7] Konfigürasyon dosyaları kontrol ediliyor..."
mkdir -p "$PROJECT_DIR/config"

if [ ! -f "$PROJECT_DIR/config/gateway.json" ]; then
  if [ -f "$PROJECT_DIR/config/factory_default.json" ]; then
    cp "$PROJECT_DIR/config/factory_default.json" "$PROJECT_DIR/config/gateway.json"
    echo "  gateway.json oluşturuldu (factory default)"
  fi
fi

if [ ! -f "$PROJECT_DIR/config/users.json" ]; then
  echo '{"admin": {"password": "admin", "role": "admin"}}' > "$PROJECT_DIR/config/users.json"
  echo "  users.json oluşturuldu"
fi
echo "  OK"

# 4. Sudoers (passwordless sudo)
echo "[4/7] Sudo yetkileri ayarlanıyor..."
SUDOERS_FILE="/etc/sudoers.d/$USER"
if [ ! -f "$SUDOERS_FILE" ]; then
  echo "$USER ALL=(ALL) NOPASSWD: ALL" | sudo tee "$SUDOERS_FILE" > /dev/null
  sudo chmod 440 "$SUDOERS_FILE"
  echo "  Passwordless sudo aktif"
else
  echo "  Zaten mevcut"
fi

# 5. GUI servisi
echo "[5/7] Gateway GUI servisi kuruluyor..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=Biensis Gateway GUI
After=network.target NetworkManager.service
Wants=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStartPre=/bin/bash -c 'sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000 2>/dev/null || sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000'
ExecStart=/bin/bash -c 'source $VENV_DIR/bin/activate && uvicorn api.main:app --host 0.0.0.0 --port 8000'
Restart=always
RestartSec=5
Environment=PATH=$VENV_DIR/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}
echo "  OK"

# 6. BLE Gateway servisi
echo "[6/7] BLE Gateway servisi kuruluyor..."
BLE_DIR="$HOME/ble_gateway"
if [ -f "$BLE_DIR/main.py" ]; then
  sudo tee /etc/systemd/system/${BLE_SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=BLE Gateway Data Collector
After=bluetooth.target network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$BLE_DIR
ExecStart=$VENV_DIR/bin/python3 main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable ${BLE_SERVICE_NAME}
  sudo systemctl restart ${BLE_SERVICE_NAME}
  echo "  OK"
else
  mkdir -p "$BLE_DIR"
  echo "  $BLE_DIR/main.py bulunamadı, BLE servisi atlandı"
fi

# 7. iptables kalıcılık
echo "[7/7] Port yönlendirme kalıcı hale getiriliyor..."
sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000 2>/dev/null || \
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000
sudo netfilter-persistent save > /dev/null 2>&1 || true
echo "  OK"

# Özet
echo ""
echo "================================================"
echo "  Kurulum Tamamlandı!"
echo "================================================"
echo ""
echo "  Web Arayüz:  http://$(hostname -I | awk '{print $1}')"
echo "  Giriş:       admin / admin"
echo ""
echo "  Servisler:"
echo "    sudo systemctl status $SERVICE_NAME"
echo "    sudo systemctl status $BLE_SERVICE_NAME"
echo ""
echo "  Loglar:"
echo "    sudo journalctl -u $SERVICE_NAME -f"
echo "================================================"
