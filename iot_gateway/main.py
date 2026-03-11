#!/usr/bin/env python3
"""
Biensis IoT Gateway - BLE + Modbus veri toplama ve MQTT publish
gateway.json'dan config okur, BLE ve Modbus cihazlarından veri toplar,
MQTT üzerinden sunucuya iletir.
"""

import asyncio
import json
import time
import os
import struct

CONFIG_PATH = os.path.expanduser("~/BIEN_GATEWAY_GUI/config/gateway.json")
LAST_SEEN_PATH = "/tmp/iot_last_seen.json"

# -------------------------------------------------------------------------
# MQTT Yönetimi
# -------------------------------------------------------------------------

class MQTTManager:
    def __init__(self, name):
        self.name = name
        self.client = None
        self.host = None
        self.port = None
        self.token = None
        self._connected = False

    def setup(self, host, port, token):
        import paho.mqtt.client as mqtt

        if not host or not token:
            self.disconnect()
            return False

        if self.client and host == self.host and port == self.port and token == self.token:
            return self._connected or True

        self.disconnect()
        self.host = host
        self.port = port
        self.token = token
        self._connected = False
        mgr = self

        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        except Exception:
            self.client = mqtt.Client()
        self.client.username_pw_set(token)

        def on_connect(*args):
            if not mgr._connected:
                mgr._connected = True
                print(f"[{mgr.name} MQTT] Baglandi ({host}:{port})")

        self.client.on_connect = on_connect
        self.client.on_disconnect = lambda *args: setattr(mgr, '_connected', False)

        try:
            self.client.connect(host, port, 60)
            self.client.loop_start()
            return True
        except Exception as e:
            print(f"[{self.name} MQTT] Baglanti hatasi: {e}")
            self.client = None
            return False

    def publish(self, topic, payload):
        if self.client:
            self.client.publish(topic, json.dumps(payload))
            return True
        return False

    def disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.client = None


ble_mqtt = MQTTManager("BLE")
modbus_mqtt = MQTTManager("Modbus")

# -------------------------------------------------------------------------
# Ortak Yardımcılar
# -------------------------------------------------------------------------

def load_config():
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"[Config] Okuma hatası: {e}")
        return {}


def update_last_seen(device_id, device_type="ble"):
    try:
        data = {}
        if os.path.exists(LAST_SEEN_PATH):
            with open(LAST_SEEN_PATH, "r") as f:
                data = json.load(f)
        key = f"{device_type}:{device_id.upper()}"
        data[key] = time.time()
        # BLE uyumluluğu: eski format da yaz
        if device_type == "ble":
            data[device_id.upper()] = time.time()
        with open(LAST_SEEN_PATH, "w") as f:
            json.dump(data, f)
    except Exception as e:
        print(f"[LastSeen] Yazma hatası: {e}")


def parse_ble_value(data, expression):
    expr = expression.strip()
    if not expr.startswith("[") or not expr.endswith("]"):
        return None

    inner = expr[1:-1].strip()

    if inner == ":":
        return list(data)

    if ":" in inner:
        parts = inner.split(":")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else len(data)
        return list(data[start:end])

    if "," in inner:
        indices = [int(x.strip()) for x in inner.split(",")]
        if len(indices) == 2:
            return (data[indices[0]] << 8) | data[indices[1]]
        return [data[i] for i in indices]

    idx = int(inner)
    return data[idx]

# -------------------------------------------------------------------------
# BLE İşlemleri
# -------------------------------------------------------------------------

async def ble_fetch_and_publish(profile):
    from bleak import BleakClient

    name = profile.get("name", "BLE_Device")
    mac = profile.get("mac", "")
    char_uuid = profile.get("characteristic_uuid", "")
    connect_retry = profile.get("connect_retry", 3)
    connect_retry_seconds = profile.get("connect_retry_seconds", 10)
    wait_after_retries = profile.get("wait_after_retries", 30)
    poll_period = profile.get("poll_period", 10000)
    telemetry_map = profile.get("telemetry", [])

    if not mac or not char_uuid:
        print(f"[BLE:{name}] MAC veya UUID eksik, atlanıyor.")
        return

    print(f"\n[BLE:{name}] ({mac}) Bağlanılıyor...")

    for attempt in range(1, connect_retry + 1):
        data_received = asyncio.Event()
        received_payload = {}

        def notification_handler(sender, data):
            nonlocal received_payload
            try:
                values = {}
                if telemetry_map:
                    for item in telemetry_map:
                        key = item.get("key", "")
                        expr = item.get("valueExpression", "")
                        if key and expr:
                            values[key] = parse_ble_value(data, expr)
                else:
                    values = {"raw": list(data)}

                received_payload = {
                    name: [{
                        "ts": int(round(time.time() * 1000)),
                        "values": values
                    }]
                }
                data_received.set()
            except Exception as e:
                print(f"  Veri ayrıştırma hatası: {e}")

        try:
            async with BleakClient(mac, timeout=15.0) as client:
                if client.is_connected:
                    print(f"  -> Bağlandı (deneme {attempt}/{connect_retry})")
                    await client.start_notify(char_uuid, notification_handler)
                    try:
                        timeout_sec = poll_period / 1000.0
                        await asyncio.wait_for(data_received.wait(), timeout=max(timeout_sec, 10.0))
                        update_last_seen(mac, "ble")
                        if ble_mqtt.publish("v1/gateway/telemetry", received_payload):
                            print(f"  -> MQTT gönderildi: {received_payload}")
                        else:
                            print(f"  -> Veri alındı, MQTT bağlı değil: {received_payload}")
                        return
                    except asyncio.TimeoutError:
                        print(f"  -> Veri gelmedi (Timeout)")
                    finally:
                        await client.stop_notify(char_uuid)
                else:
                    print(f"  -> Bağlantı kurulamadı (deneme {attempt}/{connect_retry})")
        except Exception as e:
            print(f"  -> BLE Hatası (deneme {attempt}/{connect_retry}): {e}")

        if attempt < connect_retry:
            print(f"  {connect_retry_seconds}s sonra tekrar denenecek...")
            await asyncio.sleep(connect_retry_seconds)

    print(f"  -> Tüm denemeler başarısız. {wait_after_retries}s bekleniyor...")
    await asyncio.sleep(wait_after_retries)


async def ble_loop(config):
    ble = config.get("ble", {})
    if not ble.get("enabled", False):
        return

    profiles = ble.get("profiles", [])
    if not profiles:
        return

    mqtt_cfg = config.get("ble_mqtt", {})
    mqtt_ok = ble_mqtt.setup(mqtt_cfg.get("host", ""), mqtt_cfg.get("port", 1883), mqtt_cfg.get("token", ""))
    if not mqtt_ok:
        print("[BLE] MQTT bağlantısı yok, atlanıyor.")
        return

    print(f"\n[BLE] {len(profiles)} profil işleniyor...")
    for profile in profiles:
        await ble_fetch_and_publish(profile)
        await asyncio.sleep(2)

# -------------------------------------------------------------------------
# Modbus İşlemleri
# -------------------------------------------------------------------------

PARITY_MAP = {"none": "N", "even": "E", "odd": "O"}
DATA_TYPE_FORMAT = {
    "uint16": (">H", 1),
    "int16": (">h", 1),
    "uint32": (">I", 2),
    "int32": (">i", 2),
    "float32": (">f", 2),
}


def modbus_read_registers(profile):
    """Bir Modbus profilinden register okur ve telemetri verisi döner"""
    from pymodbus.client import ModbusSerialClient

    serial_port = profile.get("serial_port", "/dev/ttyUSB0")
    baudrate = profile.get("baudrate", 9600)
    parity = PARITY_MAP.get(profile.get("parity", "none"), "N")
    data_bits = profile.get("data_bits", 8)
    stop_bits = profile.get("stop_bits", 1)
    timeout_ms = profile.get("timeout", 1000)
    slave_id = profile.get("slave_id", 1)
    function_codes = profile.get("function_codes", "3")
    register_map_str = profile.get("register_map", "")
    data_type = profile.get("data_type", "uint16")
    byte_order = profile.get("byte_order", "big_endian")
    name = profile.get("name", "Modbus_Device")

    if not register_map_str or register_map_str == "{}":
        print(f"[Modbus:{name}] Register haritası boş, atlanıyor.")
        return None

    try:
        if isinstance(register_map_str, str):
            register_map = json.loads(register_map_str)
        else:
            register_map = register_map_str
    except json.JSONDecodeError:
        print(f"[Modbus:{name}] Register haritası geçersiz JSON: {register_map_str}")
        return None

    if not register_map:
        return None

    client = ModbusSerialClient(
        port=serial_port,
        baudrate=baudrate,
        parity=parity,
        bytesize=data_bits,
        stopbits=stop_bits,
        timeout=timeout_ms / 1000.0,
    )

    if not client.connect():
        print(f"[Modbus:{name}] Seri port bağlantısı başarısız: {serial_port}")
        return None

    values = {}
    fmt, reg_count = DATA_TYPE_FORMAT.get(data_type, (">H", 1))
    fc = int(function_codes.split(",")[0].strip())

    try:
        for key, address in register_map.items():
            addr = int(address)
            try:
                if fc == 3:
                    result = client.read_holding_registers(addr, reg_count, slave=slave_id)
                elif fc == 4:
                    result = client.read_input_registers(addr, reg_count, slave=slave_id)
                elif fc == 1:
                    result = client.read_coils(addr, 1, slave=slave_id)
                elif fc == 2:
                    result = client.read_discrete_inputs(addr, 1, slave=slave_id)
                else:
                    print(f"  Desteklenmeyen FC: {fc}")
                    continue

                if result.isError():
                    print(f"  Register {key}@{addr}: Hata - {result}")
                    continue

                if fc in (1, 2):
                    values[key] = result.bits[0]
                elif reg_count == 1:
                    raw = result.registers[0]
                    if data_type == "int16":
                        values[key] = struct.unpack(">h", struct.pack(">H", raw))[0]
                    else:
                        values[key] = raw
                else:
                    regs = result.registers[:reg_count]
                    if byte_order == "little_endian":
                        regs = list(reversed(regs))
                    raw_bytes = b"".join(struct.pack(">H", r) for r in regs)
                    values[key] = struct.unpack(fmt, raw_bytes)[0]

            except Exception as e:
                print(f"  Register {key}@{addr}: Okuma hatası - {e}")
    finally:
        client.close()

    if not values:
        return None

    return {
        name: [{
            "ts": int(round(time.time() * 1000)),
            "values": values
        }]
    }


async def modbus_loop(config):
    modbus_cfg = config.get("modbus", {})
    if not modbus_cfg.get("enabled", False):
        return

    profiles = config.get("modbus_profiles", [])
    if not profiles:
        return

    mqtt_cfg = config.get("modbus_mqtt", {})
    mqtt_ok = modbus_mqtt.setup(mqtt_cfg.get("host", ""), mqtt_cfg.get("port", 1883), mqtt_cfg.get("token", ""))
    if not mqtt_ok:
        print("[Modbus] MQTT bağlantısı yok, atlanıyor.")
        return

    print(f"\n[Modbus] {len(profiles)} profil işleniyor...")
    for profile in profiles:
        name = profile.get("name", "Modbus_Device")
        serial_port = profile.get("serial_port", "?")
        slave_id = profile.get("slave_id", 1)
        print(f"\n[Modbus:{name}] Port:{serial_port} Slave:{slave_id} okunuyor...")

        try:
            payload = await asyncio.get_event_loop().run_in_executor(
                None, modbus_read_registers, profile
            )
            if payload:
                device_key = f"{serial_port}:{slave_id}"
                update_last_seen(device_key, "modbus")
                if modbus_mqtt.publish("v1/gateway/telemetry", payload):
                    print(f"  -> MQTT gönderildi: {payload}")
                else:
                    print(f"  -> Veri okundu, MQTT bağlı değil: {payload}")
        except Exception as e:
            print(f"  -> Modbus hatası: {e}")

        await asyncio.sleep(1)

# -------------------------------------------------------------------------
# Ana Döngü
# -------------------------------------------------------------------------

async def main():
    print("=" * 50)
    print("  Biensis IoT Gateway Başlatıldı")
    print("=" * 50)

    while True:
        config = load_config()
        if not config:
            print("[Gateway] Config okunamadı, 10s bekleniyor...")
            await asyncio.sleep(10)
            continue

        await ble_loop(config)
        await modbus_loop(config)

        print("\n[Gateway] Döngü tamamlandı, 15s bekleniyor...")
        await asyncio.sleep(15)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        ble_mqtt.disconnect()
        modbus_mqtt.disconnect()
        print("\nGateway durduruldu.")
