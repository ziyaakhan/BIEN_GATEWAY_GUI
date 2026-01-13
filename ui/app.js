// ============================================================================
// API Helper Functions
// ============================================================================

const API_BASE = '/api';

async function apiCall(endpoint, method = 'GET', data = null, isLogin = false) {
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
        const response = await fetch(API_BASE + endpoint, options);
        
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
                showScreen('login-screen');
                return null;
            }
        }

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.detail || 'Request failed');
        }

        return result;
    } catch (error) {
        console.error('API Error:', error);
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
            document.getElementById('section-' + sectionId).classList.add('active');

            // Update title
            const title = item.textContent.trim();
            document.getElementById('section-title').textContent = title;
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
            if (config.ble.server_mac) document.getElementById('ble-server-mac').value = config.ble.server_mac;
            if (config.ble.service_uuid) document.getElementById('ble-service-uuid').value = config.ble.service_uuid;
            if (config.ble.characteristic_uuid) document.getElementById('ble-characteristic-uuid').value = config.ble.characteristic_uuid;
            if (config.ble.connection_timeout) document.getElementById('ble-connection-timeout').value = config.ble.connection_timeout;
            if (config.ble.scan_interval) document.getElementById('ble-scan-interval').value = config.ble.scan_interval;
            document.getElementById('ble-auto-reconnect').checked = config.ble.auto_reconnect || false;
            if (config.ble.operation_mode) document.getElementById('ble-operation-mode').value = config.ble.operation_mode;
            if (config.ble.read_interval) document.getElementById('ble-read-interval').value = config.ble.read_interval;
            if (config.ble.write_interval) document.getElementById('ble-write-interval').value = config.ble.write_interval;
            document.getElementById('ble-connection-control').checked = config.ble.connection_control || false;
            
            if (config.ble.forwarder_type) {
                document.getElementById('ble-forwarder-type').value = config.ble.forwarder_type;
                toggleBLEForwarderSettings(config.ble.forwarder_type);
            }
            if (config.ble.mqtt_server) document.getElementById('ble-mqtt-server').value = config.ble.mqtt_server;
            if (config.ble.mqtt_port) document.getElementById('ble-mqtt-port').value = config.ble.mqtt_port;
            if (config.ble.mqtt_topic) document.getElementById('ble-mqtt-topic').value = config.ble.mqtt_topic;
            if (config.ble.mqtt_access_token) document.getElementById('ble-mqtt-access-token').value = config.ble.mqtt_access_token;
            if (config.ble.https_server) document.getElementById('ble-https-server').value = config.ble.https_server;
            if (config.ble.https_endpoint) document.getElementById('ble-https-endpoint').value = config.ble.https_endpoint;
            if (config.ble.https_access_token) document.getElementById('ble-https-access-token').value = config.ble.https_access_token;
            
            // Update BLE device list
            const deviceList = document.getElementById('ble-devices');
            if (config.ble.devices && config.ble.devices.length > 0) {
                deviceList.innerHTML = config.ble.devices.map(device => 
                    `<div class="device-item">${device}</div>`
                ).join('');
            } else {
                deviceList.innerHTML = '<p class="text-muted">Henüz cihaz bulunmuyor</p>';
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
            if (config.wifi.networks && config.wifi.networks.length > 0) {
                updateWiFiNetworks(config.wifi.networks);
            }
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

function toggleBLEForwarderSettings(type) {
    const mqttSettings = document.getElementById('ble-mqtt-settings');
    const httpsSettings = document.getElementById('ble-https-settings');
    
    if (type === 'mqtt') {
        mqttSettings.style.display = 'block';
        httpsSettings.style.display = 'none';
    } else {
        mqttSettings.style.display = 'none';
        httpsSettings.style.display = 'block';
    }
}

function setupBLE() {
    const saveBtn = document.getElementById('save-ble');
    const forwarderType = document.getElementById('ble-forwarder-type');
    
    forwarderType.addEventListener('change', (e) => {
        toggleBLEForwarderSettings(e.target.value);
    });
    
    saveBtn.addEventListener('click', async () => {
        const forwarderTypeValue = forwarderType.value;
        const config = {
            enabled: document.getElementById('ble-enabled').checked,
            server_mac: document.getElementById('ble-server-mac').value,
            service_uuid: document.getElementById('ble-service-uuid').value,
            characteristic_uuid: document.getElementById('ble-characteristic-uuid').value,
            connection_timeout: parseInt(document.getElementById('ble-connection-timeout').value),
            scan_interval: parseInt(document.getElementById('ble-scan-interval').value),
            auto_reconnect: document.getElementById('ble-auto-reconnect').checked,
            operation_mode: document.getElementById('ble-operation-mode').value,
            read_interval: parseInt(document.getElementById('ble-read-interval').value),
            write_interval: parseInt(document.getElementById('ble-write-interval').value),
            connection_control: document.getElementById('ble-connection-control').checked,
            forwarder_type: forwarderTypeValue,
            devices: [] // Device list is read-only for now
        };

        if (forwarderTypeValue === 'mqtt') {
            config.mqtt_server = document.getElementById('ble-mqtt-server').value;
            config.mqtt_port = parseInt(document.getElementById('ble-mqtt-port').value);
            config.mqtt_topic = document.getElementById('ble-mqtt-topic').value;
            config.mqtt_access_token = document.getElementById('ble-mqtt-access-token').value;
        } else {
            config.https_server = document.getElementById('ble-https-server').value;
            config.https_endpoint = document.getElementById('ble-https-endpoint').value;
            config.https_access_token = document.getElementById('ble-https-access-token').value;
        }

        try {
            const result = await apiCall('/config/ble', 'POST', config);
            
            if (result && result.status === 'success') {
                showMessage('ble-message', 'BLE ayarları kaydedildi');
            }
        } catch (error) {
            showMessage('ble-message', 'Kaydetme başarısız: ' + error.message, true);
        }
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
    if (networks && networks.length > 0) {
        networksList.innerHTML = networks.map(network => 
            `<div class="device-item" style="cursor: pointer; padding: 10px; margin-bottom: 5px; border: 1px solid #e1e8ed; border-radius: 4px;" onclick="selectWiFiNetwork('${network.ssid}', ${network.encrypted})">
                <strong>${network.ssid}</strong> ${network.encrypted ? '(Şifreli)' : '(Açık)'} - Sinyal: ${network.signal || 'N/A'}%
            </div>`
        ).join('');
    } else {
        networksList.innerHTML = '<p class="text-muted">WiFi ağı bulunamadı</p>';
    }
}

function selectWiFiNetwork(ssid, encrypted) {
    document.getElementById('wifi-ssid').value = ssid;
    if (!encrypted) {
        document.getElementById('wifi-password').value = '';
    }
}

function setupWiFi() {
    const scanBtn = document.getElementById('scan-wifi');
    const saveBtn = document.getElementById('save-wifi');
    
    scanBtn.addEventListener('click', async () => {
        try {
            scanBtn.disabled = true;
            scanBtn.textContent = 'Taranıyor...';
            const result = await apiCall('/wifi/scan', 'POST');
            
            if (result && result.networks) {
                updateWiFiNetworks(result.networks);
                showMessage('wifi-message', `${result.networks.length} WiFi ağı bulundu`);
            }
        } catch (error) {
            showMessage('wifi-message', 'WiFi tarama başarısız: ' + error.message, true);
        } finally {
            scanBtn.disabled = false;
            scanBtn.textContent = 'WiFi Ağlarını Tara';
        }
    });
    
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
