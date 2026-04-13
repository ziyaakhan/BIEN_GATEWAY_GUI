// ============================================================================
// API Helper Functions
// ============================================================================

const API_BASE = '/api';

async function apiCall(endpoint, method = 'GET', data = null, isLogin = false) {
    const url = API_BASE + endpoint;
    console.log(`API Call: ${method} ${url}`, data ? { data } : '');
    
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        console.log('Fetching...', url);
        const response = await fetch(url, options);
        console.log('Response status:', response.status, response.statusText);
        
        // For login endpoint, handle 401 as error
        if (response.status === 401) {
            if (isLogin) {
                // For login, parse error message and throw
                try {
                    const errorResult = await response.json();
                    throw new Error(errorResult.detail || 'Invalid credentials');
                } catch (parseError) {
                    throw new Error('Invalid credentials');
                }
            } else {
                // For other endpoints, redirect to login
                console.log('401 Unauthorized - redirecting to login');
                showScreen('login-screen');
                return null;
            }
        }

        // Content-Type kontrolü
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            throw new Error(`Beklenmeyen yanıt formatı: ${text.substring(0, 100)}`);
        }
        
        const result = await response.json();
        console.log('API Response:', result);
        
        if (!response.ok) {
            throw new Error(result.detail || result.message || 'Request failed');
        }

        return result;
    } catch (error) {
        console.error('API Error:', error);
        console.error('Error details:', {
            endpoint: url,
            method: method,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// ============================================================================
// Screen Management
// ============================================================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// ============================================================================
// Navigation
// ============================================================================

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Show corresponding section
            const sectionId = item.dataset.section;
            sections.forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById('section-' + sectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            // Update title
            const title = item.textContent.trim();
            const titleEl = document.getElementById('section-title');
            if (titleEl) {
                titleEl.textContent = title;
            }
            
            // Lazy setup - section görünür olduğunda setup yap
            if (sectionId === 'ble') {
                console.log('BLE section görünür oldu, setupBLE çağrılıyor...');
                setTimeout(() => {
                    console.log('setupBLE timeout içinde çağrılıyor...');
                    setupBLE();
                }, 100);
            } else if (sectionId === 'wifi') {
                console.log('WiFi section görünür oldu, setupWiFi çağrılıyor...');
                setTimeout(() => {
                    console.log('setupWiFi timeout içinde çağrılıyor...');
                    setupWiFi();
                }, 100);
            }
        });
    });
}

// ============================================================================
// Message Display
// ============================================================================

function showMessage(elementId, message, isError = false) {
    const messageEl = document.getElementById(elementId);
    messageEl.textContent = message;
    messageEl.className = 'message ' + (isError ? 'error' : 'success');
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}

// ============================================================================
// Login
// ============================================================================

function setupLogin() {
    const loginForm = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Clear previous error
        errorEl.style.display = 'none';
        errorEl.classList.remove('show');
        errorEl.textContent = '';
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const result = await apiCall('/login', 'POST', { username, password }, true);
            
            if (result && result.status === 'success') {
                // Clear error on success
                errorEl.style.display = 'none';
                errorEl.classList.remove('show');
                
                document.getElementById('username-display').textContent = result.username;
                showScreen('admin-screen');
                // Navigate to system section after login
                const systemNav = document.querySelector('[data-section="system"]');
                if (systemNav) {
                    systemNav.click();
                }
                await loadConfig();
            } else {
                // If result is null or status is not success
                throw new Error('Login failed');
            }
        } catch (error) {
            errorEl.textContent = 'Yanlış şifre veya kullanıcı adı';
            errorEl.style.display = 'block';
            errorEl.classList.add('show');
            
            // Clear error after 5 seconds
            setTimeout(() => {
                errorEl.style.display = 'none';
                errorEl.classList.remove('show');
            }, 5000);
        }
    });
}

// ============================================================================
// Logout
// ============================================================================

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    
    logoutBtn.addEventListener('click', async () => {
        try {
            await apiCall('/logout', 'POST');
            showScreen('login-screen');
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
}

// ============================================================================
// Configuration Loading
// ============================================================================

async function loadConfig() {
    try {
        const config = await apiCall('/config', 'GET');
        
        if (!config) return;

        // Modbus
        if (config.modbus) {
            document.getElementById('modbus-enabled').checked = config.modbus.enabled || false;
            toggleModbusSettings(config.modbus.enabled);
            if (config.modbus.slave_id) document.getElementById('modbus-slave-id').value = config.modbus.slave_id;
            if (config.modbus.polling_interval) document.getElementById('modbus-polling-interval').value = config.modbus.polling_interval;
            if (config.modbus.function_codes) document.getElementById('modbus-function-codes').value = config.modbus.function_codes;
            if (config.modbus.register_map) document.getElementById('modbus-register-map').value = typeof config.modbus.register_map === 'string' ? config.modbus.register_map : JSON.stringify(config.modbus.register_map);
            if (config.modbus.data_type) document.getElementById('modbus-data-type').value = config.modbus.data_type;
            if (config.modbus.byte_order) document.getElementById('modbus-byte-order').value = config.modbus.byte_order;
            if (config.modbus.retry_count) document.getElementById('modbus-retry-count').value = config.modbus.retry_count;
            if (config.modbus.error_handling) document.getElementById('modbus-error-handling').value = config.modbus.error_handling;
        }

        // Modbus MQTT
        if (config.modbus_mqtt) {
            if (config.modbus_mqtt.host) document.getElementById('modbus-mqtt-host').value = config.modbus_mqtt.host;
            if (config.modbus_mqtt.port) document.getElementById('modbus-mqtt-port').value = config.modbus_mqtt.port;
            if (config.modbus_mqtt.token) document.getElementById('modbus-mqtt-token').value = config.modbus_mqtt.token;
        }

        // Modbus profilleri
        if (config.modbus_profiles) {
            modbusProfiles = config.modbus_profiles;
            renderModbusProfilesList();
        }

        // BLE
        if (config.ble) {
            document.getElementById('ble-enabled').checked = config.ble.enabled || false;
            toggleBLESettings(config.ble.enabled || false);
            
            if (config.ble.profiles) {
                bleProfiles = config.ble.profiles;
                updateBLEProfilesList();
            }
        }

        // BLE MQTT
        if (config.ble_mqtt) {
            if (config.ble_mqtt.host) document.getElementById('ble-mqtt-host').value = config.ble_mqtt.host;
            if (config.ble_mqtt.port) document.getElementById('ble-mqtt-port').value = config.ble_mqtt.port;
            if (config.ble_mqtt.token) document.getElementById('ble-mqtt-token').value = config.ble_mqtt.token;
        }

        // LoRaWAN
        if (config.lorawan) {
            document.getElementById('lorawan-enabled').checked = config.lorawan.enabled || false;
            toggleLoRaWANSettingsVisibility(config.lorawan.enabled || false);
            if (config.lorawan.gateway_id) document.getElementById('lorawan-gateway-id').value = config.lorawan.gateway_id;
            if (config.lorawan.region) document.getElementById('lorawan-region').value = config.lorawan.region;
            if (config.lorawan.antenna_gain != null) document.getElementById('lorawan-antenna-gain').value = config.lorawan.antenna_gain;
            if (config.lorawan.log_level) document.getElementById('lorawan-log-level').value = config.lorawan.log_level;
            if (config.lorawan.latitude != null) document.getElementById('lorawan-latitude').value = config.lorawan.latitude;
            if (config.lorawan.longitude != null) document.getElementById('lorawan-longitude').value = config.lorawan.longitude;
            if (config.lorawan.altitude != null) document.getElementById('lorawan-altitude').value = config.lorawan.altitude;
            if (config.lorawan.mqtt_server) document.getElementById('lorawan-mqtt-server').value = config.lorawan.mqtt_server;
            if (config.lorawan.mqtt_port) document.getElementById('lorawan-mqtt-port').value = config.lorawan.mqtt_port;
        }

        // WiFi
        if (config.wifi) {
            if (config.wifi.country) document.getElementById('wifi-country').value = config.wifi.country;
            if (config.wifi.ssid) document.getElementById('wifi-ssid').value = config.wifi.ssid;
            // WiFi ağları sadece tarama yapıldığında gösterilir, başlangıçta gösterilmez
        }

        // System
        if (config.gateway_name) {
            document.getElementById('gateway-name').value = config.gateway_name;
        }

    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

function toggleModbusSettings(enabled) {
    const modbusBody = document.getElementById('rs485-settings');
    if (modbusBody) {
        modbusBody.style.display = enabled ? 'block' : 'none';
    }
}

function setupRS485() {
    const modbusEnabled = document.getElementById('modbus-enabled');
    const addProfileBtn = document.getElementById('add-modbus-profile');
    const saveProfileBtn = document.getElementById('save-modbus-profile');
    const cancelProfileBtn = document.getElementById('cancel-modbus-profile');
    const deleteProfileBtn = document.getElementById('delete-modbus-profile');
    
    if (!modbusEnabled || !addProfileBtn) {
        return;
    }
    
    toggleModbusSettings(modbusEnabled.checked);
    
    const buildModbusConfigFromForm = (enabled) => ({
        enabled: !!enabled,
        slave_id: parseInt(document.getElementById('modbus-slave-id')?.value) || 1,
        polling_interval: parseInt(document.getElementById('modbus-polling-interval')?.value) || 1000,
        function_codes: document.getElementById('modbus-function-codes')?.value || "3,4",
        register_map: document.getElementById('modbus-register-map')?.value || "{}",
        data_type: document.getElementById('modbus-data-type')?.value || "uint16",
        byte_order: document.getElementById('modbus-byte-order')?.value || "big_endian",
        retry_count: parseInt(document.getElementById('modbus-retry-count')?.value) || 3,
        error_handling: document.getElementById('modbus-error-handling')?.value || "retry",
    });

    modbusEnabled.addEventListener('change', async (e) => {
        const enabled = !!e.target.checked;
        toggleModbusSettings(enabled);
        try {
            await apiCall('/config/modbus', 'POST', buildModbusConfigFromForm(enabled));
            showMessage('rs485-message', enabled ? 'Modbus etkinleştirildi' : 'Modbus devre dışı bırakıldı');
        } catch (error) {
            showMessage('rs485-message', 'Kaydetme başarısız: ' + error.message, true);
        }
    });
    
    addProfileBtn.addEventListener('click', () => {
        clearModbusProfileForm();
        document.getElementById('modbus-profile-form').style.display = 'block';
    });
    
    saveProfileBtn.addEventListener('click', async () => {
        try {
            const name = document.getElementById('modbus-profile-name').value;
            if (!name) {
                showMessage('rs485-message', 'Lütfen profil adı girin', true);
                return;
            }
            
            const profile = collectModbusFormProfile();
            const editIndex = document.getElementById('modbus-profile-id').value;
            
            if (editIndex !== '') {
                modbusProfiles[parseInt(editIndex)] = profile;
            } else {
                modbusProfiles.push(profile);
            }

            await saveModbusProfiles();
            renderModbusProfilesList();
            clearModbusProfileForm();
            showMessage('rs485-message', 'Profil kaydedildi');
        } catch (error) {
            showMessage('rs485-message', 'Kaydetme başarısız: ' + error.message, true);
        }
    });
    
    cancelProfileBtn.addEventListener('click', () => {
        clearModbusProfileForm();
    });
    
    deleteProfileBtn.addEventListener('click', async () => {
        const editIndex = document.getElementById('modbus-profile-id').value;
        if (editIndex !== '') {
            await deleteModbusProfile(parseInt(editIndex));
        }
    });

    // Modbus MQTT kaydet
    const saveMqttBtn = document.getElementById('save-modbus-mqtt');
    if (saveMqttBtn) {
        saveMqttBtn.addEventListener('click', async () => {
            try {
                const mqttConfig = {
                    host: document.getElementById('modbus-mqtt-host').value,
                    port: parseInt(document.getElementById('modbus-mqtt-port').value),
                    token: document.getElementById('modbus-mqtt-token').value
                };
                await apiCall('/config/modbus/mqtt', 'POST', mqttConfig);
                showMessage('modbus-mqtt-message', 'MQTT ayarları kaydedildi');
            } catch (error) {
                showMessage('modbus-mqtt-message', 'Kaydetme başarısız: ' + error.message, true);
            }
        });
    }
}

// Modbus profilleri (backend: config.modbus_profiles)
let modbusProfiles = [];

function collectModbusFormProfile() {
    return {
        name: document.getElementById('modbus-profile-name').value,
        serial_port: document.getElementById('modbus-serial-port').value,
        baudrate: parseInt(document.getElementById('modbus-baudrate').value),
        parity: document.getElementById('modbus-parity').value,
        data_bits: parseInt(document.getElementById('modbus-data-bits').value),
        stop_bits: parseInt(document.getElementById('modbus-stop-bits').value),
        timeout: parseInt(document.getElementById('modbus-timeout').value),
        slave_id: parseInt(document.getElementById('modbus-slave-id').value),
        polling_interval: parseInt(document.getElementById('modbus-polling-interval').value),
        function_codes: document.getElementById('modbus-function-codes').value,
        register_map: document.getElementById('modbus-register-map').value,
        data_type: document.getElementById('modbus-data-type').value,
        byte_order: document.getElementById('modbus-byte-order').value,
        retry_count: parseInt(document.getElementById('modbus-retry-count').value),
        error_handling: document.getElementById('modbus-error-handling').value
    };
}

function fillModbusForm(profile) {
    document.getElementById('modbus-profile-name').value = profile.name || '';
    document.getElementById('modbus-serial-port').value = profile.serial_port ?? '/dev/ttyUSB0';
    document.getElementById('modbus-baudrate').value = profile.baudrate ?? 9600;
    document.getElementById('modbus-parity').value = profile.parity ?? 'none';
    document.getElementById('modbus-data-bits').value = profile.data_bits ?? 8;
    document.getElementById('modbus-stop-bits').value = profile.stop_bits ?? 1;
    document.getElementById('modbus-timeout').value = profile.timeout ?? 1000;
    document.getElementById('modbus-slave-id').value = profile.slave_id ?? 1;
    document.getElementById('modbus-polling-interval').value = profile.polling_interval ?? 1000;
    document.getElementById('modbus-function-codes').value = profile.function_codes ?? '3,4';
    document.getElementById('modbus-register-map').value = profile.register_map ?? '';
    document.getElementById('modbus-data-type').value = profile.data_type ?? 'uint16';
    document.getElementById('modbus-byte-order').value = profile.byte_order ?? 'big_endian';
    document.getElementById('modbus-retry-count').value = profile.retry_count ?? 3;
    document.getElementById('modbus-error-handling').value = profile.error_handling ?? 'retry';
}

function clearModbusProfileForm() {
    document.getElementById('modbus-profile-id').value = '';
    document.getElementById('modbus-profile-name').value = '';
    document.getElementById('modbus-serial-port').value = '/dev/ttyUSB0';
    document.getElementById('modbus-baudrate').value = 9600;
    document.getElementById('modbus-parity').value = 'none';
    document.getElementById('modbus-data-bits').value = 8;
    document.getElementById('modbus-stop-bits').value = 1;
    document.getElementById('modbus-timeout').value = 1000;
    document.getElementById('modbus-slave-id').value = 1;
    document.getElementById('modbus-polling-interval').value = 1000;
    document.getElementById('modbus-function-codes').value = '3,4';
    document.getElementById('modbus-register-map').value = '';
    document.getElementById('modbus-data-type').value = 'uint16';
    document.getElementById('modbus-byte-order').value = 'big_endian';
    document.getElementById('modbus-retry-count').value = 3;
    document.getElementById('modbus-error-handling').value = 'retry';
    document.getElementById('modbus-profile-form').style.display = 'none';
    document.getElementById('delete-modbus-profile').style.display = 'none';
}

function renderModbusProfilesList() {
    const listEl = document.getElementById('modbus-profiles-list');
    if (!listEl) return;

    if (!modbusProfiles.length) {
        listEl.innerHTML = '<p class="text-muted">Henüz profil yok</p>';
        return;
    }

    listEl.innerHTML = modbusProfiles.map((p, index) => {
        const name = (p.name || `Profil ${index + 1}`).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `
        <div class="device-item" style="padding: 10px; margin-bottom: 5px; border: 1px solid #e1e8ed; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${name}</strong><br>
                ${p.serial_port ?? '/dev/ttyUSB0'} | ${p.baudrate ?? 9600} baud | ${p.data_bits ?? 8}${(p.parity ?? 'none')[0].toUpperCase()}${p.stop_bits ?? 1}<br>
                Slave ID: ${p.slave_id ?? '-'} | Interval: ${p.polling_interval ?? '-'} ms
            </div>
            <div>
                <button class="btn btn-secondary" style="padding: 5px 10px; margin-right: 5px; min-width: 80px; width: auto;" onclick="window.editModbusProfile(${index})">Düzenle</button>
                <button class="btn btn-danger" style="padding: 5px 10px; min-width: 80px; width: auto;" onclick="window.deleteModbusProfile(${index})">Sil</button>
            </div>
        </div>`;
    }).join('');
}

window.editModbusProfile = function(index) {
    const profile = modbusProfiles[index];
    if (!profile) return;
    
    document.getElementById('modbus-profile-id').value = index;
    fillModbusForm(profile);
    document.getElementById('modbus-profile-form').style.display = 'block';
    document.getElementById('delete-modbus-profile').style.display = 'inline-block';
};

window.deleteModbusProfile = async function(index) {
    if (!confirm('Bu profili silmek istediğinize emin misiniz?')) return;
    
    modbusProfiles.splice(index, 1);
    renderModbusProfilesList();
    clearModbusProfileForm();
    try {
        await saveModbusProfiles();
        showMessage('rs485-message', 'Profil silindi');
    } catch (error) {
        showMessage('rs485-message', 'Silme başarısız: ' + error.message, true);
    }
};

async function saveModbusProfiles() {
    const result = await apiCall('/config/modbus/profiles', 'POST', {
        profiles: modbusProfiles
    });
    return result;
}

// ============================================================================
// BLE Configuration
// ============================================================================

function toggleBLESettings(enabled) {
    const bleSettings = document.getElementById('ble-settings');
    if (bleSettings) {
        bleSettings.style.display = enabled ? 'block' : 'none';
    }
}

let bleProfiles = [];
let currentCharacteristics = [];
let pendingSelectedCharacteristicUuid = '';
let wifiSetupDone = false;

function updateBLEScannedDevices(devices) {
    const devicesList = document.getElementById('ble-scanned-devices');
    if (!devicesList) {
        console.error('ble-scanned-devices elementi bulunamadı');
        return;
    }
    
    if (devices && devices.length > 0) {
        devicesList.innerHTML = devices.map(device => {
            // XSS koruması için escape
            const mac = (device.mac || '').replace(/'/g, "\\'");
            const name = (device.name || device.mac || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const serviceUuid = (device.service_uuid || '').replace(/'/g, "\\'");
            const charUuid = (device.characteristic_uuid || '').replace(/'/g, "\\'");
            
            return `<div class="device-item" style="cursor: pointer; padding: 10px; margin-bottom: 5px; border: 1px solid #e1e8ed; border-radius: 4px;" onclick="selectBLEDevice('${mac}', '${serviceUuid}', '${charUuid}')">
                <strong>${name}</strong><br>
                MAC: ${mac}<br>
                ${serviceUuid ? `Service: ${serviceUuid}<br>` : ''}
                ${charUuid ? `Characteristic: ${charUuid}` : ''}
            </div>`;
        }).join('');
    } else {
        devicesList.innerHTML = '<p class="text-muted">BLE cihazı bulunamadı</p>';
    }
}

// Global scope'ta olmalı (HTML onclick için)
window.selectBLEDevice = function(mac, serviceUuid, characteristicUuid) {
    const macInput = document.getElementById('ble-profile-mac');
    const serviceInput = document.getElementById('ble-profile-service-uuid');
    
    if (macInput) macInput.value = mac || '';
    if (serviceInput && serviceUuid) serviceInput.value = serviceUuid;
    if (characteristicUuid) {
        pendingSelectedCharacteristicUuid = characteristicUuid;
        if (!currentCharacteristics.length) {
            currentCharacteristics = [createDefaultCharacteristic(characteristicUuid)];
        } else if (!currentCharacteristics[0].uuid) {
            currentCharacteristics[0].uuid = characteristicUuid;
        }
        renderCharacteristicsList();
    }
    
    // Profil formunu göster
    const profileForm = document.getElementById('ble-profile-form');
    if (profileForm) {
        profileForm.style.display = 'block';
    }
};

function createDefaultCharacteristic(uuid = '') {
    return {
        name: '',
        uuid: uuid || '',
        mode: 'notify', // read | write | notify
        poll_period: 10000, // ms
        write_payload_hex: '',
        telemetry: []
    };
}

function renderCharacteristicsList() {
    const listEl = document.getElementById('ble-characteristics-list');
    if (!listEl) return;

    if (!currentCharacteristics.length) {
        listEl.innerHTML = '<p class="text-muted">Henüz karakteristik eklenmedi</p>';
        return;
    }

    const escapeHtml = (s) => (s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    listEl.innerHTML = currentCharacteristics.map((ch, chIndex) => {
        const mode = ch.mode || 'notify';
        const telemetryItems = Array.isArray(ch.telemetry) ? ch.telemetry : [];
        return `
            <div style="padding: 12px; margin-bottom: 12px; border: 1px solid #e1e8ed; border-radius: 6px; background: #f8f9fa;">
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <strong>Karakteristik ${chIndex + 1}</strong>
                    <button type="button" class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="removeBLECharacteristic(${chIndex})">Sil</button>
                </div>

                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label>Ad (opsiyonel)</label>
                        <input type="text" class="form-control ble-ch-name" data-ch-index="${chIndex}" value="${escapeHtml(ch.name)}" placeholder="Örn: battery, temp">
                    </div>
                    <div class="form-group" style="flex: 2;">
                        <label>UUID</label>
                        <input type="text" class="form-control ble-ch-uuid" data-ch-index="${chIndex}" value="${escapeHtml(ch.uuid)}" placeholder="00002a19-0000-1000-8000-00805f9b34fb">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group" style="flex: 1;">
                        <label>Mod</label>
                        <select class="form-control ble-ch-mode" data-ch-index="${chIndex}">
                            <option value="read" ${mode === 'read' ? 'selected' : ''}>Read</option>
                            <option value="write" ${mode === 'write' ? 'selected' : ''}>Write</option>
                            <option value="notify" ${mode === 'notify' ? 'selected' : ''}>Notify</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Read/Notify Aralığı (ms)</label>
                        <input type="number" class="form-control ble-ch-poll" data-ch-index="${chIndex}" min="100" max="600000" value="${parseInt(ch.poll_period || 10000)}">
                    </div>
                </div>

                <div class="form-group ble-ch-write-wrap" data-ch-index="${chIndex}" style="display:${mode === 'write' ? 'block' : 'none'};">
                    <label>Write Payload (HEX, opsiyonel)</label>
                    <input type="text" class="form-control ble-ch-write-payload" data-ch-index="${chIndex}" value="${escapeHtml(ch.write_payload_hex)}" placeholder="Örn: 010203">
                    <small class="text-muted">Boş bırakılırsa write yapılmaz (sadece yapı saklanır).</small>
                </div>

                <div style="margin-top: 10px;">
                    <div style="display:flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <strong>Telemetry</strong>
                        <button type="button" class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="addTelemetryItem(${chIndex})">Telemetry Ekle</button>
                    </div>
                    <div class="ble-telemetry-list" data-ch-index="${chIndex}">
                        ${telemetryItems.length ? telemetryItems.map((item, idx) => `
                            <div style="padding: 10px; margin-bottom: 10px; border: 1px solid #e1e8ed; border-radius: 4px; background: #fff;">
                                <div class="form-row">
                                    <div class="form-group" style="flex: 1;">
                                        <label>Key</label>
                                        <input type="text" class="form-control ble-tlm-key" data-ch-index="${chIndex}" data-item-index="${idx}" value="${escapeHtml(item.key)}" placeholder="Örn: temperature">
                                    </div>
                                    <div class="form-group" style="flex: 1;">
                                        <label>Value Expression</label>
                                        <input type="text" class="form-control ble-tlm-expr" data-ch-index="${chIndex}" data-item-index="${idx}" value="${escapeHtml(item.valueExpression)}" placeholder="Örn: [0], [:], [1,2]">
                                    </div>
                                    <div class="form-group" style="width: 100px;">
                                        <label>&nbsp;</label>
                                        <button type="button" class="btn btn-danger" onclick="removeTelemetryItem(${chIndex}, ${idx})" style="width: 100%;">Sil</button>
                                    </div>
                                </div>
                            </div>
                        `).join('') : '<p class="text-muted">Henüz telemetry eklenmedi</p>'}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Input listeners
    listEl.querySelectorAll('.ble-ch-name').forEach(input => {
        input.addEventListener('input', (e) => {
            const chIndex = parseInt(e.target.dataset.chIndex);
            if (currentCharacteristics[chIndex]) currentCharacteristics[chIndex].name = e.target.value;
        });
    });
    listEl.querySelectorAll('.ble-ch-uuid').forEach(input => {
        input.addEventListener('input', (e) => {
            const chIndex = parseInt(e.target.dataset.chIndex);
            if (currentCharacteristics[chIndex]) currentCharacteristics[chIndex].uuid = e.target.value;
        });
    });
    listEl.querySelectorAll('.ble-ch-mode').forEach(select => {
        select.addEventListener('change', (e) => {
            const chIndex = parseInt(e.target.dataset.chIndex);
            if (currentCharacteristics[chIndex]) currentCharacteristics[chIndex].mode = e.target.value;
            const wrap = listEl.querySelector(`.ble-ch-write-wrap[data-ch-index="${chIndex}"]`);
            if (wrap) wrap.style.display = (e.target.value === 'write') ? 'block' : 'none';
        });
    });
    listEl.querySelectorAll('.ble-ch-poll').forEach(input => {
        input.addEventListener('input', (e) => {
            const chIndex = parseInt(e.target.dataset.chIndex);
            if (currentCharacteristics[chIndex]) currentCharacteristics[chIndex].poll_period = parseInt(e.target.value) || 10000;
        });
    });
    listEl.querySelectorAll('.ble-ch-write-payload').forEach(input => {
        input.addEventListener('input', (e) => {
            const chIndex = parseInt(e.target.dataset.chIndex);
            if (currentCharacteristics[chIndex]) currentCharacteristics[chIndex].write_payload_hex = e.target.value;
        });
    });
    listEl.querySelectorAll('.ble-tlm-key').forEach(input => {
        input.addEventListener('input', (e) => {
            const chIndex = parseInt(e.target.dataset.chIndex);
            const itemIndex = parseInt(e.target.dataset.itemIndex);
            const item = currentCharacteristics[chIndex]?.telemetry?.[itemIndex];
            if (item) item.key = e.target.value;
        });
    });
    listEl.querySelectorAll('.ble-tlm-expr').forEach(input => {
        input.addEventListener('input', (e) => {
            const chIndex = parseInt(e.target.dataset.chIndex);
            const itemIndex = parseInt(e.target.dataset.itemIndex);
            const item = currentCharacteristics[chIndex]?.telemetry?.[itemIndex];
            if (item) item.valueExpression = e.target.value;
        });
    });
}

window.removeBLECharacteristic = function(chIndex) {
    currentCharacteristics.splice(chIndex, 1);
    renderCharacteristicsList();
};

function addBLECharacteristic(uuid = '') {
    currentCharacteristics.push(createDefaultCharacteristic(uuid));
    renderCharacteristicsList();
}

async function updateBLEProfilesList() {
    const profilesList = document.getElementById('ble-profiles-list');
    if (bleProfiles.length === 0) {
        profilesList.innerHTML = '<p class="text-muted">Henüz profil yok</p>';
        return;
    }

    let statuses = {};
    try {
        const macs = bleProfiles.map(p => p.mac).filter(Boolean);
        if (macs.length > 0) {
            const result = await apiCall('/ble/status', 'POST', { macs });
            if (result && result.statuses) statuses = result.statuses;
        }
    } catch (e) { /* ignore */ }

    profilesList.innerHTML = bleProfiles.map((profile, index) => {
        const isConnected = statuses[profile.mac?.toUpperCase()] || false;
        const status = isConnected
            ? '<span style="color: green;">● Bağlı</span>'
            : '<span style="color: red;">● Bağlı Değil</span>';
        return `
            <div class="device-item" style="padding: 10px; margin-bottom: 5px; border: 1px solid #e1e8ed; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${profile.name}</strong> - ${profile.mac}<br>
                    ${status}
                </div>
                <div>
                    <button class="btn btn-secondary" onclick="editBLEProfile(${index})" style="padding: 5px 10px; margin-right: 5px; min-width: 80px; width: auto;">Düzenle</button>
                    <button class="btn btn-danger" onclick="deleteBLEProfile(${index})" style="padding: 5px 10px; min-width: 80px; width: auto;">Sil</button>
                </div>
            </div>
        `;
    }).join('');
}

window.addTelemetryItem = function(chIndex) {
    if (!currentCharacteristics[chIndex]) return;
    currentCharacteristics[chIndex].telemetry = currentCharacteristics[chIndex].telemetry || [];
    currentCharacteristics[chIndex].telemetry.push({ key: '', valueExpression: '' });
    renderCharacteristicsList();
};

window.removeTelemetryItem = function(chIndex, itemIndex) {
    const arr = currentCharacteristics[chIndex]?.telemetry;
    if (!arr) return;
    arr.splice(itemIndex, 1);
    renderCharacteristicsList();
};

// Global scope'ta olmalı (HTML onclick için)
window.editBLEProfile = function(index) {
    console.log('editBLEProfile çağrıldı, index:', index);
    const profile = bleProfiles[index];
    if (!profile) {
        console.error('Profil bulunamadı, index:', index);
        return;
    }
    
    document.getElementById('ble-profile-id').value = index;
    document.getElementById('ble-profile-name').value = profile.name || '';
    document.getElementById('ble-profile-mac').value = profile.mac || '';
    document.getElementById('ble-profile-service-uuid').value = profile.service_uuid || '';
    document.getElementById('ble-profile-connect-retry').value = profile.connect_retry || 3;
    document.getElementById('ble-profile-connect-retry-seconds').value = profile.connect_retry_seconds || 10;
    document.getElementById('ble-profile-wait-after-retries').value = profile.wait_after_retries || 30;
    document.getElementById('ble-profile-poll-period').value = profile.poll_period || 10000;

    if (Array.isArray(profile.characteristics) && profile.characteristics.length) {
        currentCharacteristics = profile.characteristics.map(ch => ({
            name: ch.name || '',
            uuid: ch.uuid || '',
            mode: ch.mode || 'notify',
            poll_period: parseInt(ch.poll_period || profile.poll_period || 10000),
            write_payload_hex: ch.write_payload_hex || '',
            telemetry: Array.isArray(ch.telemetry) ? ch.telemetry.map(t => ({ key: t.key || '', valueExpression: t.valueExpression || '' })) : []
        }));
    } else {
        // Geriye dönük uyumluluk
        currentCharacteristics = [createDefaultCharacteristic(profile.characteristic_uuid || pendingSelectedCharacteristicUuid)];
        currentCharacteristics[0].poll_period = profile.poll_period || 10000;
        currentCharacteristics[0].telemetry = profile.telemetry ? [...profile.telemetry] : [];
    }
    renderCharacteristicsList();
    
    const profileForm = document.getElementById('ble-profile-form');
    const deleteBtn = document.getElementById('delete-ble-profile');
    if (profileForm) profileForm.style.display = 'block';
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
};

window.deleteBLEProfile = function(index) {
    console.log('deleteBLEProfile çağrıldı, index:', index);
    if (!confirm('Bu profili silmek istediğinize emin misiniz?')) {
        return;
    }
    
    bleProfiles.splice(index, 1);
    updateBLEProfilesList();
    saveBLEProfiles();
};

function clearBLEProfileForm() {
    document.getElementById('ble-profile-id').value = '';
    document.getElementById('ble-profile-name').value = '';
    document.getElementById('ble-profile-mac').value = '';
    document.getElementById('ble-profile-service-uuid').value = '';
    document.getElementById('ble-profile-connect-retry').value = 3;
    document.getElementById('ble-profile-connect-retry-seconds').value = 10;
    document.getElementById('ble-profile-wait-after-retries').value = 30;
    document.getElementById('ble-profile-poll-period').value = 10000;
    currentCharacteristics = [];
    pendingSelectedCharacteristicUuid = '';
    renderCharacteristicsList();
    document.getElementById('ble-profile-form').style.display = 'none';
    document.getElementById('delete-ble-profile').style.display = 'none';
}

async function saveBLEProfiles(showMsg = true) {
    try {
        const bleEnabledEl = document.getElementById('ble-enabled');
        if (!bleEnabledEl) {
            console.error('ble-enabled elementi bulunamadı');
            return;
        }
        
        const result = await apiCall('/config/ble/profiles', 'POST', {
            enabled: bleEnabledEl.checked,
            profiles: bleProfiles
        });
        
        if (result && result.status === 'success') {
            if (showMsg) {
                showMessage('ble-message', 'BLE profilleri kaydedildi');
            }
            clearBLEProfileForm();
        }
    } catch (error) {
        console.error('BLE profilleri kaydetme hatası:', error);
        showMessage('ble-message', 'Kaydetme başarısız: ' + error.message, true);
    }
}

let bleSetupDone = false;

function setupBLE() {
    // Element kontrolü - eğer yoksa, navigation değiştiğinde tekrar dene
    const scanBtn = document.getElementById('scan-ble');
    const addProfileBtn = document.getElementById('add-ble-profile');
    const saveProfileBtn = document.getElementById('save-ble-profile');
    const cancelProfileBtn = document.getElementById('cancel-ble-profile');
    const deleteProfileBtn = document.getElementById('delete-ble-profile');
    const addCharacteristicBtn = document.getElementById('add-ble-characteristic');
    const bleEnabled = document.getElementById('ble-enabled');
    const bleMessage = document.getElementById('ble-message');
    
    // Element kontrolü - eğer yoksa, navigation değiştiğinde tekrar dene
    if (!scanBtn || !addProfileBtn || !saveProfileBtn || !cancelProfileBtn || !deleteProfileBtn || !addCharacteristicBtn || !bleEnabled) {
        console.log('BLE elementleri henüz yüklenmedi, navigation değiştiğinde tekrar deneniyor...');
        bleSetupDone = false; // Flag'i sıfırla ki tekrar denesin
        return;
    }
    
    // Eğer zaten setup yapıldıysa tekrar yapma (event listener duplicate'lerini önlemek için)
    if (bleSetupDone) {
        console.log('BLE setup zaten yapıldı');
        return;
    }
    
    bleSetupDone = true;
    console.log('BLE setup başlatılıyor...');

    // Güvenli başlangıç: sayfa BLE sekmesinde açıldıysa ayar görünürlüğünü senkronla
    // (bazı durumlarda eski inline style/cache yüzünden görünürlük takılı kalabiliyor)
    try {
        toggleBLESettings(!!bleEnabled.checked);
        const bleSettingsEl = document.getElementById('ble-settings');
        if (bleSettingsEl && bleEnabled.checked) {
            bleSettingsEl.style.display = 'block';
        }
    } catch (e) {
        console.warn('BLE settings görünürlük senkron hatası:', e);
    }
    
    // Sayfa ilk açıldığında varsa eski başarı mesajını temizle
    if (bleMessage) {
        bleMessage.textContent = '';
        bleMessage.className = 'message';
        bleMessage.style.display = 'none';
    }
    
    // BLE tarama
    scanBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('BLE tarama butonuna tıklandı!');
        try {
            scanBtn.disabled = true;
            scanBtn.textContent = 'Taranıyor...';
            console.log('BLE tarama başlatılıyor...');
            const result = await apiCall('/ble/scan', 'POST');
            console.log('BLE tarama sonucu:', result);
            
            if (result && result.devices) {
                updateBLEScannedDevices(result.devices);
                showMessage('ble-message', `${result.devices.length} BLE cihazı bulundu`);
            } else {
                showMessage('ble-message', 'BLE cihazı bulunamadı', true);
            }
        } catch (error) {
            console.error('BLE tarama hatası:', error);
            showMessage('ble-message', 'BLE tarama başarısız: ' + error.message, true);
        } finally {
            scanBtn.disabled = false;
            scanBtn.textContent = 'BLE Cihazlarını Tara';
        }
    });
    
    console.log('BLE scan button event listener eklendi');
    
    // Yeni profil ekle
    addProfileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Yeni profil ekle butonuna tıklandı!');
        clearBLEProfileForm();
        if (!currentCharacteristics.length) {
            currentCharacteristics = [createDefaultCharacteristic(pendingSelectedCharacteristicUuid)];
        }
        renderCharacteristicsList();
        const profileForm = document.getElementById('ble-profile-form');
        if (profileForm) {
            profileForm.style.display = 'block';
            console.log('Profil formu gösterildi');
        } else {
            console.error('ble-profile-form elementi bulunamadı!');
        }
    });
    
    console.log('BLE add profile button event listener eklendi');
    
    // Profil kaydet
    saveProfileBtn.addEventListener('click', async () => {
        const profileId = document.getElementById('ble-profile-id').value;
        const cleanedCharacteristics = (currentCharacteristics || [])
            .map(ch => ({
                name: (ch.name || '').trim(),
                uuid: (ch.uuid || '').trim(),
                mode: ch.mode || 'notify',
                poll_period: parseInt(ch.poll_period || 10000),
                write_payload_hex: (ch.write_payload_hex || '').trim(),
                telemetry: (Array.isArray(ch.telemetry) ? ch.telemetry : [])
                    .filter(t => t && t.key && t.valueExpression)
                    .map(t => ({ key: t.key, valueExpression: t.valueExpression }))
            }))
            .filter(ch => ch.uuid);

        const profile = {
            name: document.getElementById('ble-profile-name').value,
            mac: document.getElementById('ble-profile-mac').value,
            service_uuid: document.getElementById('ble-profile-service-uuid').value,
            connect_retry: parseInt(document.getElementById('ble-profile-connect-retry').value) || 3,
            connect_retry_seconds: parseInt(document.getElementById('ble-profile-connect-retry-seconds').value) || 10,
            wait_after_retries: parseInt(document.getElementById('ble-profile-wait-after-retries').value) || 30,
            poll_period: parseInt(document.getElementById('ble-profile-poll-period').value) || 10000,
            characteristics: cleanedCharacteristics
        };
        
        if (!profile.name || !profile.mac) {
            showMessage('ble-message', 'Lütfen cihaz ismi ve MAC adresi girin', true);
            return;
        }

        if (!profile.characteristics.length) {
            showMessage('ble-message', 'Lütfen en az 1 karakteristik UUID ekleyin', true);
            return;
        }
        
        if (profileId !== '') {
            // Güncelle
            bleProfiles[parseInt(profileId)] = profile;
        } else {
            // Yeni ekle
            bleProfiles.push(profile);
        }
        
        updateBLEProfilesList();
        await saveBLEProfiles();
    });
    
    // İptal
    cancelProfileBtn.addEventListener('click', () => {
        clearBLEProfileForm();
    });
    
    // Sil
    deleteProfileBtn.addEventListener('click', () => {
        const profileId = document.getElementById('ble-profile-id').value;
        if (profileId !== '') {
            deleteBLEProfile(parseInt(profileId));
        }
    });
    
    // Karakteristik ekle
    addCharacteristicBtn.addEventListener('click', () => {
        addBLECharacteristic();
    });
    
    // BLE enabled toggle
    bleEnabled.addEventListener('change', async (e) => {
        toggleBLESettings(e.target.checked);
        await saveBLEProfiles(false);
    });

    // BLE MQTT kaydet
    const saveBLEMqttBtn = document.getElementById('save-ble-mqtt');
    if (saveBLEMqttBtn) {
        saveBLEMqttBtn.addEventListener('click', async () => {
            try {
                const mqttConfig = {
                    host: document.getElementById('ble-mqtt-host').value,
                    port: parseInt(document.getElementById('ble-mqtt-port').value),
                    token: document.getElementById('ble-mqtt-token').value
                };
                await apiCall('/config/ble/mqtt', 'POST', mqttConfig);
                showMessage('ble-mqtt-message', 'MQTT ayarları kaydedildi');
            } catch (error) {
                showMessage('ble-mqtt-message', 'Kaydetme başarısız: ' + error.message, true);
            }
        });
    }
}

// ============================================================================
// LoRaWAN Configuration
// ============================================================================

function toggleLoRaWANSettingsVisibility(enabled) {
    const lorawanSettings = document.getElementById('lorawan-settings');
    if (lorawanSettings) {
        lorawanSettings.style.display = enabled ? 'block' : 'none';
    }
}

function setupLoRaWAN() {
    const saveBtn = document.getElementById('save-lorawan');
    const lorawanEnabled = document.getElementById('lorawan-enabled');

    const buildLoRaWANConfig = () => ({
        enabled: lorawanEnabled.checked,
        gateway_id: document.getElementById('lorawan-gateway-id').value,
        region: document.getElementById('lorawan-region').value,
        model: "seeed_wm1302",
        antenna_gain: parseInt(document.getElementById('lorawan-antenna-gain').value) || 0,
        log_level: document.getElementById('lorawan-log-level').value,
        latitude: parseFloat(document.getElementById('lorawan-latitude').value) || 0,
        longitude: parseFloat(document.getElementById('lorawan-longitude').value) || 0,
        altitude: parseInt(document.getElementById('lorawan-altitude').value) || 0,
        mqtt_server: document.getElementById('lorawan-mqtt-server').value,
        mqtt_port: parseInt(document.getElementById('lorawan-mqtt-port').value) || 1883,
        topic_prefix: "eu868",
        mqtt_json: false
    });

    const saveLoRaWANConfig = async (showMsg = true) => {
        const config = buildLoRaWANConfig();
        const result = await apiCall('/config/lorawan', 'POST', config);
        return result;
    };

    if (lorawanEnabled) {
        toggleLoRaWANSettingsVisibility(lorawanEnabled.checked);
        lorawanEnabled.addEventListener('change', async (e) => {
            toggleLoRaWANSettingsVisibility(e.target.checked);
            try {
                await saveLoRaWANConfig(false);
            } catch (error) {
                showMessage('lorawan-message', 'Kaydetme başarısız: ' + error.message, true);
            }
        });
    }

    saveBtn.addEventListener('click', async () => {
        try {
            showMessage('lorawan-message', 'Kaydediliyor ve servisler yeniden başlatılıyor...');
            const result = await saveLoRaWANConfig(true);
            if (result && result.status === 'success') {
                showMessage('lorawan-message', 'LoRaWAN ayarları kaydedildi, servisler yeniden başlatıldı');
            }
        } catch (error) {
            showMessage('lorawan-message', 'Kaydetme başarısız: ' + error.message, true);
        }
    });
}

// ============================================================================
// WiFi Configuration
// ============================================================================

function updateWiFiNetworks(networks) {
    const networksList = document.getElementById('wifi-networks');
    if (!networksList) {
        console.error('wifi-networks elementi bulunamadı');
        return;
    }
    
    if (networks && networks.length > 0) {
        networksList.innerHTML = networks.map(network => {
            // XSS koruması için escape
            const ssid = (network.ssid || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const displaySsid = (network.ssid || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div class="device-item" style="cursor: pointer; padding: 10px; margin-bottom: 5px; border: 1px solid #e1e8ed; border-radius: 4px;" onclick="selectWiFiNetwork('${ssid}', ${network.encrypted ? 'true' : 'false'})">
                <strong>${displaySsid}</strong> ${network.encrypted ? '(Şifreli)' : '(Açık)'} - Sinyal: ${network.signal || 'N/A'}%
            </div>`;
        }).join('');
    } else {
        networksList.innerHTML = '<p class="text-muted">WiFi ağı bulunamadı</p>';
    }
}

// Global scope'ta olmalı (HTML onclick için)
window.selectWiFiNetwork = function(ssid, encrypted) {
    const ssidInput = document.getElementById('wifi-ssid');
    const passwordInput = document.getElementById('wifi-password');
    
    if (ssidInput) ssidInput.value = ssid || '';
    if (passwordInput && !encrypted) passwordInput.value = '';
};

function setupWiFi() {
    const scanBtn = document.getElementById('scan-wifi');
    const saveBtn = document.getElementById('save-wifi');
    
    if (!scanBtn || !saveBtn) {
        console.log('WiFi elementleri henüz yüklenmedi, navigation değiştiğinde tekrar deneniyor...');
        wifiSetupDone = false; // Flag'i sıfırla ki tekrar denesin
        return;
    }
    
    // Eğer zaten setup yapıldıysa tekrar yapma
    if (wifiSetupDone) {
        console.log('WiFi setup zaten yapıldı');
        return;
    }
    
    wifiSetupDone = true;
    console.log('WiFi setup başlatılıyor...');
    
    scanBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('WiFi tarama butonuna tıklandı!');
        try {
            scanBtn.disabled = true;
            scanBtn.textContent = 'Taranıyor...';
            console.log('WiFi tarama başlatılıyor...');
            const result = await apiCall('/wifi/scan', 'POST');
            console.log('WiFi tarama sonucu:', result);
            
            if (result && result.networks) {
                updateWiFiNetworks(result.networks);
                showMessage('wifi-message', `${result.networks.length} WiFi ağı bulundu`);
            } else {
                showMessage('wifi-message', 'WiFi ağı bulunamadı', true);
            }
        } catch (error) {
            console.error('WiFi tarama hatası:', error);
            showMessage('wifi-message', 'WiFi tarama başarısız: ' + error.message, true);
        } finally {
            scanBtn.disabled = false;
            scanBtn.textContent = 'WiFi Ağlarını Tara';
        }
    });
    
    console.log('WiFi scan button event listener eklendi');
    
    saveBtn.addEventListener('click', async () => {
        const config = {
            country: document.getElementById('wifi-country').value,
            ssid: document.getElementById('wifi-ssid').value,
            password: document.getElementById('wifi-password').value
        };

        if (!config.ssid) {
            showMessage('wifi-message', 'Lütfen SSID girin', true);
            return;
        }

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Bağlanılıyor...';
            const result = await apiCall('/config/wifi', 'POST', config);
            
            if (result && result.status === 'success') {
                if (result.connection && result.connection.applied) {
                    showMessage('wifi-message', result.connection.message);
                } else if (result.connection) {
                    showMessage('wifi-message', result.connection.message, true);
                } else {
                    showMessage('wifi-message', 'WiFi ayarları kaydedildi');
                }
                loadWiFiStatus();
            }
        } catch (error) {
            showMessage('wifi-message', 'Kaydetme başarısız: ' + error.message, true);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'WiFi Bağlantısını Kaydet';
        }
    });
}

// ============================================================================
// System Configuration
// ============================================================================

async function loadSystemStatus() {
    try {
        const status = await apiCall('/system/status', 'GET');
        if (!status) return;
        
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '-'; };
        set('sys-ip', status.ip);
        set('sys-uptime', status.uptime);
        set('sys-cpu', status.cpu_load);
        set('sys-ram', status.ram);
        set('sys-disk', status.disk);
        set('sys-temp', status.temperature);
    } catch (error) {
        console.error('System status error:', error);
    }
}

function setupSystem() {
    const saveBtn = document.getElementById('save-system');
    const restartBtn = document.getElementById('restart-gateway');
    const changePasswordBtn = document.getElementById('change-password');
    
    loadSystemStatus();
    setInterval(loadSystemStatus, 30000);
    
    saveBtn.addEventListener('click', async () => {
        const config = {
            gateway_name: document.getElementById('gateway-name').value
        };

        try {
            const result = await apiCall('/config/system', 'POST', config);
            
            if (result && result.status === 'success') {
                showMessage('system-message', 'Sistem ayarları kaydedildi');
            }
        } catch (error) {
            showMessage('system-message', 'Kaydetme başarısız: ' + error.message, true);
        }
    });

    changePasswordBtn.addEventListener('click', async () => {
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!currentPassword || !newPassword || !confirmPassword) {
            showMessage('password-message', 'Lütfen tüm alanları doldurun', true);
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage('password-message', 'Yeni şifreler eşleşmiyor', true);
            return;
        }

        try {
            const result = await apiCall('/user/change-password', 'POST', {
                current_password: currentPassword,
                new_password: newPassword
            });
            
            if (result && result.status === 'success') {
                showMessage('password-message', 'Şifre başarıyla değiştirildi');
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            }
        } catch (error) {
            showMessage('password-message', 'Şifre değiştirme başarısız: ' + error.message, true);
        }
    });

    restartBtn.addEventListener('click', async () => {
        if (!confirm('Gateway yeniden başlatılacak. Emin misiniz?')) {
            return;
        }

        try {
            const result = await apiCall('/system/restart', 'POST');
            
            if (result && result.status === 'success') {
                alert('Gateway yeniden başlatılıyor...');
            }
        } catch (error) {
            alert('Yeniden başlatma başarısız: ' + error.message);
        }
    });

    const factoryResetBtn = document.getElementById('factory-reset');
    if (factoryResetBtn) {
        factoryResetBtn.addEventListener('click', async () => {
            if (!confirm('TÜM AYARLAR SİLİNECEK!\nŞifre admin/admin olacak.\n\nEmin misiniz?')) {
                return;
            }
            if (!confirm('Bu işlem geri alınamaz. Devam etmek istiyor musunuz?')) {
                return;
            }

            try {
                const result = await apiCall('/system/factory-reset', 'POST');
                if (result && result.status === 'success') {
                    alert('Fabrika ayarlarına dönüldü. Sayfa yenilenecek.');
                    window.location.reload();
                }
            } catch (error) {
                alert('Fabrika ayarlarına dönme başarısız: ' + error.message);
            }
        });
    }
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - Tüm setup fonksiyonları çağrılıyor...');
    
    setupLogin();
    console.log('✓ setupLogin tamamlandı');
    
    setupLogout();
    console.log('✓ setupLogout tamamlandı');
    
    setupNavigation();
    console.log('✓ setupNavigation tamamlandı');
    
    setupRS485();
    console.log('✓ setupRS485 tamamlandı');
    
    setupBLE();
    console.log('✓ setupBLE çağrıldı (lazy init)');
    
    setupLoRaWAN();
    console.log('✓ setupLoRaWAN tamamlandı');
    
    setupWiFi();
    console.log('✓ setupWiFi çağrıldı (lazy init)');
    
    setupSystem();
    console.log('✓ setupSystem tamamlandı');

    // Check existing session before showing login
    (async () => {
        try {
            const config = await apiCall('/config');
            if (config) {
                console.log('✓ Mevcut session geçerli, admin ekranına yönlendiriliyor');
                showScreen('admin-screen');
                const systemNav = document.querySelector('[data-section="system"]');
                if (systemNav) systemNav.click();
                await loadConfig();
                return;
            }
        } catch (e) {
            console.log('Session geçersiz veya hata:', e);
        }
        showScreen('login-screen');
        console.log('✓ Login screen gösterildi');
    })();

    console.log('Tüm setup fonksiyonları tamamlandı!');
});
