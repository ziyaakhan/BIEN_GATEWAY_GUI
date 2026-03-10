#!/bin/bash
# Biensis Gateway - AP Mode Fallback Script
# WiFi bağlantısı yoksa "Biensis-Gateway" hotspot açar
# Kullanım: sudo bash ap_mode.sh

AP_SSID="Biensis-Gateway"
AP_PASS="biensis123"
AP_IP="192.168.4.1"
AP_INTERFACE="wlan0"
CONFIG_FILE="$HOME/BIEN_GATEWAY_GUI/config/gateway.json"

check_wifi_connection() {
    nmcli -t -f ACTIVE dev wifi 2>/dev/null | grep -q "yes"
    return $?
}

try_saved_wifi() {
    if [ -f "$CONFIG_FILE" ]; then
        SSID=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('wifi',{}).get('ssid',''))" 2>/dev/null)
        PASS=$(python3 -c "import json; c=json.load(open('$CONFIG_FILE')); print(c.get('wifi',{}).get('password',''))" 2>/dev/null)
        
        if [ -n "$SSID" ]; then
            echo "[WiFi] Kayıtlı ağa bağlanılıyor: $SSID"
            if [ -n "$PASS" ]; then
                nmcli dev wifi connect "$SSID" password "$PASS" 2>/dev/null
            else
                nmcli dev wifi connect "$SSID" 2>/dev/null
            fi
            sleep 5
            if check_wifi_connection; then
                echo "[WiFi] Bağlantı başarılı: $SSID"
                return 0
            fi
        fi
    fi
    return 1
}

start_ap_mode() {
    echo "[AP] Biensis-Gateway hotspot başlatılıyor..."

    # hostapd config
    cat > /tmp/hostapd.conf << EOF
interface=$AP_INTERFACE
driver=nl80211
ssid=$AP_SSID
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=$AP_PASS
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
EOF

    # dnsmasq config
    cat > /tmp/dnsmasq-ap.conf << EOF
interface=$AP_INTERFACE
dhcp-range=192.168.4.10,192.168.4.50,255.255.255.0,24h
address=/#/$AP_IP
EOF

    # WiFi client modunu durdur
    nmcli dev disconnect $AP_INTERFACE 2>/dev/null
    sleep 1

    # IP ayarla
    ip addr flush dev $AP_INTERFACE
    ip addr add $AP_IP/24 dev $AP_INTERFACE
    ip link set $AP_INTERFACE up

    # hostapd başlat
    hostapd /tmp/hostapd.conf -B
    sleep 2

    # dnsmasq başlat
    dnsmasq -C /tmp/dnsmasq-ap.conf --pid-file=/tmp/dnsmasq-ap.pid
    
    # Port 80 -> 8000 yönlendirmesi
    iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000 2>/dev/null || \
    iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000

    echo "[AP] Hotspot aktif!"
    echo "[AP] SSID: $AP_SSID"
    echo "[AP] Şifre: $AP_PASS"
    echo "[AP] IP: $AP_IP"
    echo "[AP] Web arayüzü: http://$AP_IP"
}

stop_ap_mode() {
    echo "[AP] Hotspot durduruluyor..."
    killall hostapd 2>/dev/null
    if [ -f /tmp/dnsmasq-ap.pid ]; then
        kill $(cat /tmp/dnsmasq-ap.pid) 2>/dev/null
        rm /tmp/dnsmasq-ap.pid
    fi
    ip addr flush dev $AP_INTERFACE 2>/dev/null
    sleep 1
}

# Ana akış
echo "=== Biensis Gateway WiFi Manager ==="

# Zaten bağlıysa çık
if check_wifi_connection; then
    echo "[WiFi] Zaten bağlı, AP mode gerekmiyor."
    exit 0
fi

# Kayıtlı WiFi'ye bağlanmayı dene
if try_saved_wifi; then
    exit 0
fi

# Bağlantı yoksa AP mode başlat
echo "[WiFi] Bağlantı kurulamadı, AP mode başlatılıyor..."
start_ap_mode
