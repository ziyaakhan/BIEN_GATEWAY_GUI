#!/bin/bash
# Gateway GUI Başlatma Scripti
# Raspberry Pi için hızlı başlatma scripti

set -e

# Renkler
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Gateway GUI Başlatılıyor...${NC}"

# Proje dizini
PROJECT_DIR="/opt/gateway"
VENV_DIR="$PROJECT_DIR/venv"

# Proje dizinine git
cd "$PROJECT_DIR" || {
    echo -e "${RED}HATA: $PROJECT_DIR dizini bulunamadı!${NC}"
    echo "Lütfen dosyaları /opt/gateway dizinine kopyalayın."
    exit 1
}

# Sanal ortam kontrolü
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}Sanal ortam bulunamadı, oluşturuluyor...${NC}"
    python3 -m venv venv
fi

# Sanal ortamı aktifleştir
source "$VENV_DIR/bin/activate"

# Bağımlılıkları kontrol et
if ! python -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}Bağımlılıklar kuruluyor...${NC}"
    pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
fi

# Config dizinini oluştur
mkdir -p "$PROJECT_DIR/config"
chmod 755 "$PROJECT_DIR/config"

# Port kontrolü
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}Port 8000 kullanımda, temizleniyor...${NC}"
    sudo lsof -ti :8000 | xargs sudo kill -9 2>/dev/null || true
    pkill -f uvicorn 2>/dev/null || true
    sleep 2
fi

# Uygulamayı başlat
echo -e "${GREEN}Uygulama başlatılıyor...${NC}"
echo -e "${GREEN}Tarayıcıdan erişmek için: http://$(hostname -I | awk '{print $1}'):8000${NC}"
echo -e "${YELLOW}Durdurmak için Ctrl+C tuşlarına basın${NC}"
echo ""

uvicorn api.main:app --host 0.0.0.0 --port 8000
