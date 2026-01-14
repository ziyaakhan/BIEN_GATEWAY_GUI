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
                setTimeout(() => setupBLE(), 100);
            } else if (sectionId === 'wifi') {
                setTimeout(() => setupWiFi(), 100);
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

        // RS-485
        if (config.rs485) {
            document.getElementById('rs485-enabled').checked = config.rs485.enabled || false;
            if (config.rs485.baudrate) document.getElementById('rs485-baudrate').value = config.rs485.baudrate;
            if (config.rs485.parity) document.getElementById('rs485-parity').value = config.rs485.parity;
            if (config.rs485.data_bits) document.getElementById('rs485-data-bits').value = config.rs485.data_bits;
            if (config.rs485.stop_bits) document.getElementById('rs485-stop-bits').value = config.rs485.stop_bits;
            if (config.rs485.flow_control) document.getElementById('rs485-flow-control').value = config.rs485.flow_control;
            if (config.rs485.timeout) document.getElementById('rs485-timeout').value = config.rs485.timeout;
            if (config.rs485.direction_control) document.getElementById('rs485-direction-control').value = config.rs485.direction_control;
        }

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

        // BLE
        if (config.ble) {
            document.getElementById('ble-enabled').checked = config.ble.enabled || false;
            
            if (config.ble.profiles) {
                bleProfiles = config.ble.profiles;
                updateBLEProfilesList();
            }
        }

        // LoRaWAN
        if (config.lorawan) {
            document.getElementById('lorawan-enabled').checked = config.lorawan.enabled || false;
            if (config.lorawan.gateway_id) document.getElementById('lorawan-gateway-id').value = config.lorawan.gateway_id;
            if (config.lorawan.forwarder_type) {
                document.getElementById('lorawan-forwarder-type').value = config.lorawan.forwarder_type;
                toggleForwarderSettings(config.lorawan.forwarder_type);
            }
            if (config.lorawan.mqtt_server) document.getElementById('lorawan-mqtt-server').value = config.lorawan.mqtt_server;
            if (config.lorawan.mqtt_port) document.getElementById('lorawan-mqtt-port').value = config.lorawan.mqtt_port;
            if (config.lorawan.udp_server) document.getElementById('lorawan-udp-server').value = config.lorawan.udp_server;
            if (config.lorawan.udp_port) document.getElementById('lorawan-udp-port').value = config.lorawan.udp_port;
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

// ============================================================================
// RS-485 Configuration
// ============================================================================

function toggleModbusSettings(enabled) {
    const modbusSettings = document.getElementById('modbus-settings');
    modbusSettings.style.display = enabled ? 'block' : 'none';
}

function setupRS485() {
    const saveBtn = document.getElementById('save-rs485');
    const modbusEnabled = document.getElementById('modbus-enabled');
    
    modbusEnabled.addEventListener('change', (e) => {
        toggleModbusSettings(e.target.checked);
    });
    
    saveBtn.addEventListener('click', async () => {
        const config = {
            enabled: document.getElementById('rs485-enabled').checked,
            baudrate: parseInt(document.getElementById('rs485-baudrate').value),
            parity: document.getElementById('rs485-parity').value,
            data_bits: parseInt(document.getElementById('rs485-data-bits').value),
            stop_bits: parseFloat(document.getElementById('rs485-stop-bits').value),
            flow_control: document.getElementById('rs485-flow-control').value,
            timeout: parseInt(document.getElementById('rs485-timeout').value),
            direction_control: document.getElementById('rs485-direction-control').value
        };

        try {
            const result = await apiCall('/config/rs485', 'POST', config);
            
            if (result && result.status === 'success') {
                showMessage('rs485-message', 'RS-485 ayarları kaydedildi');
                
                // Save Modbus config if enabled
                if (modbusEnabled.checked) {
                    await saveModbusConfig();
                }
            }
        } catch (error) {
            showMessage('rs485-message', 'Kaydetme başarısız: ' + error.message, true);
        }
    });
}

async function saveModbusConfig() {
    const config = {
        enabled: document.getElementById('modbus-enabled').checked,
        slave_id: parseInt(document.getElementById('modbus-slave-id').value),
        polling_interval: parseInt(document.getElementById('modbus-polling-interval').value),
        function_codes: document.getElementById('modbus-function-codes').value,
        register_map: document.getElementById('modbus-register-map').value,
        data_type: document.getElementById('modbus-data-type').value,
        byte_order: document.getElementById('modbus-byte-order').value,
        retry_count: parseInt(document.getElementById('modbus-retry-count').value),
        error_handling: document.getElementById('modbus-error-handling').value
    };

    try {
        const result = await apiCall('/config/modbus', 'POST', config);
        if (result && result.status === 'success') {
            console.log('Modbus config saved');
        }
    } catch (error) {
        console.error('Modbus config save error:', error);
    }
}

// ============================================================================
// BLE Configuration
// ============================================================================

let bleProfiles = [];
let currentTelemetryItems = [];
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
    const charInput = document.getElementById('ble-profile-characteristic-uuid');
    
    if (macInput) macInput.value = mac || '';
    if (serviceInput && serviceUuid) serviceInput.value = serviceUuid;
    if (charInput && characteristicUuid) charInput.value = characteristicUuid;
    
    // Profil formunu göster
    const profileForm = document.getElementById('ble-profile-form');
    if (profileForm) {
        profileForm.style.display = 'block';
    }
};

function updateBLEProfilesList() {
    const profilesList = document.getElementById('ble-profiles-list');
    if (bleProfiles.length === 0) {
        profilesList.innerHTML = '<p class="text-muted">Henüz profil yok</p>';
        return;
    }
    
    profilesList.innerHTML = bleProfiles.map((profile, index) => {
        const status = profile.connected ? '<span style="color: green;">● Bağlı</span>' : '<span style="color: red;">● Bağlı Değil</span>';
        return `
            <div class="device-item" style="padding: 10px; margin-bottom: 5px; border: 1px solid #e1e8ed; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${profile.name}</strong> - ${profile.mac}<br>
                    ${status}
                </div>
                <div>
                    <button class="btn btn-secondary" onclick="editBLEProfile(${index})" style="padding: 5px 10px; margin-right: 5px;">Düzenle</button>
                    <button class="btn btn-danger" onclick="deleteBLEProfile(${index})" style="padding: 5px 10px;">Sil</button>
                </div>
            </div>
        `;
    }).join('');
}

function addTelemetryItem() {
    const telemetryList = document.getElementById('ble-telemetry-list');
    const index = currentTelemetryItems.length;
    
    const telemetryItem = {
        key: '',
        valueExpression: ''
    };
    currentTelemetryItems.push(telemetryItem);
    
    renderTelemetryList();
}

// Global scope'ta olmalı (HTML onclick için)
window.removeTelemetryItem = function(index) {
    console.log('removeTelemetryItem çağrıldı, index:', index);
    currentTelemetryItems.splice(index, 1);
    renderTelemetryList();
};

function renderTelemetryList() {
    const telemetryList = document.getElementById('ble-telemetry-list');
    if (currentTelemetryItems.length === 0) {
        telemetryList.innerHTML = '<p class="text-muted">Henüz telemetry eklenmedi</p>';
        return;
    }
    
    telemetryList.innerHTML = currentTelemetryItems.map((item, index) => `
        <div style="padding: 10px; margin-bottom: 10px; border: 1px solid #e1e8ed; border-radius: 4px; background: #f8f9fa;">
            <div class="form-row">
                <div class="form-group" style="flex: 1;">
                    <label>Key</label>
                    <input type="text" class="form-control telemetry-key" data-index="${index}" value="${item.key}" placeholder="Örn: temperature">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Value Expression</label>
                    <input type="text" class="form-control telemetry-expression" data-index="${index}" value="${item.valueExpression}" placeholder="Örn: [0], [:], [1,2]">
                </div>
                <div class="form-group" style="width: 100px;">
                    <label>&nbsp;</label>
                    <button class="btn btn-danger" onclick="removeTelemetryItem(${index})" style="width: 100%;">Sil</button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Event listeners ekle
    document.querySelectorAll('.telemetry-key').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentTelemetryItems[index].key = e.target.value;
        });
    });
    
    document.querySelectorAll('.telemetry-expression').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentTelemetryItems[index].valueExpression = e.target.value;
        });
    });
}

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
    document.getElementById('ble-profile-characteristic-uuid').value = profile.characteristic_uuid || '';
    document.getElementById('ble-profile-connect-retry').value = profile.connect_retry || 3;
    document.getElementById('ble-profile-connect-retry-seconds').value = profile.connect_retry_seconds || 10;
    document.getElementById('ble-profile-wait-after-retries').value = profile.wait_after_retries || 30;
    document.getElementById('ble-profile-poll-period').value = profile.poll_period || 10000;
    
    currentTelemetryItems = profile.telemetry ? [...profile.telemetry] : [];
    renderTelemetryList();
    
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
    document.getElementById('ble-profile-characteristic-uuid').value = '';
    document.getElementById('ble-profile-connect-retry').value = 3;
    document.getElementById('ble-profile-connect-retry-seconds').value = 10;
    document.getElementById('ble-profile-wait-after-retries').value = 30;
    document.getElementById('ble-profile-poll-period').value = 10000;
    currentTelemetryItems = [];
    renderTelemetryList();
    document.getElementById('ble-profile-form').style.display = 'none';
    document.getElementById('delete-ble-profile').style.display = 'none';
}

async function saveBLEProfiles() {
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
            showMessage('ble-message', 'BLE profilleri kaydedildi');
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
    const addTelemetryBtn = document.getElementById('add-telemetry');
    const bleEnabled = document.getElementById('ble-enabled');
    
    // Element kontrolü - eğer yoksa, navigation değiştiğinde tekrar dene
    if (!scanBtn || !addProfileBtn || !saveProfileBtn || !cancelProfileBtn || !deleteProfileBtn || !addTelemetryBtn || !bleEnabled) {
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
        const profile = {
            name: document.getElementById('ble-profile-name').value,
            mac: document.getElementById('ble-profile-mac').value,
            service_uuid: document.getElementById('ble-profile-service-uuid').value,
            characteristic_uuid: document.getElementById('ble-profile-characteristic-uuid').value,
            connect_retry: parseInt(document.getElementById('ble-profile-connect-retry').value) || 3,
            connect_retry_seconds: parseInt(document.getElementById('ble-profile-connect-retry-seconds').value) || 10,
            wait_after_retries: parseInt(document.getElementById('ble-profile-wait-after-retries').value) || 30,
            poll_period: parseInt(document.getElementById('ble-profile-poll-period').value) || 10000,
            telemetry: currentTelemetryItems.filter(item => item.key && item.valueExpression)
        };
        
        if (!profile.name || !profile.mac) {
            showMessage('ble-message', 'Lütfen cihaz ismi ve MAC adresi girin', true);
            return;
        }
        
        if (profileId !== '') {
            // Güncelle
            bleProfiles[parseInt(profileId)] = profile;
        } else {
            // Yeni ekle
            profile.connected = false;
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
    
    // Telemetry ekle
    addTelemetryBtn.addEventListener('click', () => {
        addTelemetryItem();
    });
    
    // BLE enabled toggle
    bleEnabled.addEventListener('change', async (e) => {
        await saveBLEProfiles();
    });
}

// ============================================================================
// LoRaWAN Configuration
// ============================================================================

function toggleForwarderSettings(type) {
    const mqttSettings = document.getElementById('mqtt-forwarder-settings');
    const udpSettings = document.getElementById('udp-forwarder-settings');
    
    if (type === 'mqtt') {
        mqttSettings.style.display = 'block';
        udpSettings.style.display = 'none';
    } else {
        mqttSettings.style.display = 'none';
        udpSettings.style.display = 'block';
    }
}

function setupLoRaWAN() {
    const saveBtn = document.getElementById('save-lorawan');
    const forwarderType = document.getElementById('lorawan-forwarder-type');
    
    forwarderType.addEventListener('change', (e) => {
        toggleForwarderSettings(e.target.value);
    });
    
    saveBtn.addEventListener('click', async () => {
        const forwarderTypeValue = forwarderType.value;
        const config = {
            enabled: document.getElementById('lorawan-enabled').checked,
            gateway_id: document.getElementById('lorawan-gateway-id').value,
            forwarder_type: forwarderTypeValue
        };

        if (forwarderTypeValue === 'mqtt') {
            config.mqtt_server = document.getElementById('lorawan-mqtt-server').value;
            config.mqtt_port = parseInt(document.getElementById('lorawan-mqtt-port').value);
        } else {
            config.udp_server = document.getElementById('lorawan-udp-server').value;
            config.udp_port = parseInt(document.getElementById('lorawan-udp-port').value);
        }

        try {
            const result = await apiCall('/config/lorawan', 'POST', config);
            
            if (result && result.status === 'success') {
                showMessage('lorawan-message', 'LoRaWAN ayarları kaydedildi');
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
            const result = await apiCall('/config/wifi', 'POST', config);
            
            if (result && result.status === 'success') {
                showMessage('wifi-message', 'WiFi ayarları kaydedildi');
            }
        } catch (error) {
            showMessage('wifi-message', 'Kaydetme başarısız: ' + error.message, true);
        }
    });
}

// ============================================================================
// System Configuration
// ============================================================================

function setupSystem() {
    const saveBtn = document.getElementById('save-system');
    const restartBtn = document.getElementById('restart-gateway');
    const changePasswordBtn = document.getElementById('change-password');
    
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
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    setupLogin();
    setupLogout();
    setupNavigation();
    setupRS485();
    setupBLE();
    setupLoRaWAN();
    setupWiFi();
    setupSystem();

    // Start with login screen
    showScreen('login-screen');
});
