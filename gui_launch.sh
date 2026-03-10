source venv/bin/activate

# Port 80 -> 8000 yönlendirmesi (IP girince direkt açılsın)
sudo iptables -t nat -C PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000 2>/dev/null || \
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000

uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
