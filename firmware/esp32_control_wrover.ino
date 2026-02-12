/**
* Zefender Machine Control Firmware (ESP32 Wrover Compatible)
* PROD VERSION 1.0 - Optimized for Hostinger Deployment
*
* Features:
* - Reliable WebSocket Connection (Bypasses Shared Hosting Limitations)
* - 3-Minute Connection Watchdog (Auto-Reboot)
* - 24-Hour Scheduled Maintenance (Auto-Reboot)
* - WiFi Auto-Reconnect
* - Over-The-Air (OTA) Updates
* - Dynamic Sequence Engine
*/

#include <WiFi.h>
#include <SocketIoClient.h> 
#include <ArduinoJson.h>    
#include <WebServer.h>      
#include <Update.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <vector>
#include <esp_wifi.h>

// ====================== CONFIGURATION ======================
#define WIFI_SSID       "SPK"
#define WIFI_PASSWORD   "Spk@0209"

// Server Connection
char host[] = "mintcream-marten-438766.hostingersite.com"; 
int port = 80;
char path[] = "/socket.io/?transport=websocket"; // Force WebSocket for stability

#define MACHINE_ID      "RNSIT_01"
#define OTA_PASS        "Healthmet@123"

// Pin Definitions
#define PIN_PUMP      4
#define PIN_HEATER    5
#define PIN_FAN       18
#define PIN_UV        19
#define BUZZER_PIN    23 

// Timing Constants
const unsigned long HEARTBEAT_INTERVAL = 5000;
const unsigned long WATCHDOG_TIMEOUT = 180000;      // 3 Minutes
const unsigned long DAILY_REBOOT_INTERVAL = 86400000; // 24 Hours

// Global State
bool isRunningSequence = false;
unsigned long lastHeartbeat = 0;
bool isSocketConnected = false;
unsigned long lastConnectionTime = 0;

SocketIoClient socket;
WebServer server(80);

// ====================== HELPER FUNCTIONS ======================

// Log to Serial and Remote Server
void logPrint(const String &msg) {
    Serial.println(msg);
    if (isSocketConnected) {
        DynamicJsonDocument doc(512);
        doc["message"] = msg;
        doc["timestamp"] = millis();
        String output;
        serializeJson(doc, output);
        socket.emit("machine_log", output.c_str());
    }
}

// Pin Polarity Management
struct PinConfig {
    int pin;
    bool isActiveLow;
};
std::vector<PinConfig> pinConfigs;

void initDefaultPins() {
    pinConfigs.clear();
    int defaults[] = {4, 5, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
    for(int p : defaults) {
        pinConfigs.push_back({p, true}); // Default Active Low
    }
}

bool pinIsActiveLow(int pin) {
    for(const auto& c : pinConfigs) {
        if(c.pin == pin) return c.isActiveLow;
    }
    return true; 
}

void relayOn(int pin)  { 
    if (pin > 0) {
        bool isLow = pinIsActiveLow(pin);
        pinMode(pin, OUTPUT); 
        digitalWrite(pin, isLow ? LOW : HIGH); 
        logPrint("📍 Pin " + String(pin) + " ON");
    }
}

void relayOff(int pin) { 
    if (pin > 0) {
        bool isLow = pinIsActiveLow(pin);
        pinMode(pin, OUTPUT);
        digitalWrite(pin, isLow ? HIGH : LOW); 
        logPrint("📍 Pin " + String(pin) + " OFF");
    }
}

void buzzerOn()  { relayOn(BUZZER_PIN); }
void buzzerOff() { relayOff(BUZZER_PIN); }

void playMelodyBlocking(const int durations[], int length) {
    for (int i = 0; i < length; i++) {
        int beepDuration = 3000 / durations[i];
        buzzerOn();
        delay(beepDuration);
        buzzerOff();
        delay(beepDuration * 0.3);
    }
}

// ====================== SEQUENCE ENGINE ======================
enum StepAction { ACTION_ON, ACTION_OFF, ACTION_WAIT };

struct SequenceStep {
    int stepIndex;
    int pin;
    StepAction action;
    unsigned long duration;
    String description;
};

class SequenceEngine {
public:
    SequenceEngine() : running(false), stepIndex(0), stepStart(0) {}

    void loadSequence(const JsonArray& stepsJson) {
        steps.clear();
        logPrint("🔄 Loading new sequence");
        for (JsonObject s : stepsJson) {
            SequenceStep step;
            step.stepIndex = s["step_index"] | 0;
            step.pin = s["pin_number"] | -1;
            step.duration = s["duration_ms"] | 0;
            step.description = s["description"] | "";
            String act = s["action"] | "WAIT";
            if (act == "ON") step.action = ACTION_ON;
            else if (act == "OFF") step.action = ACTION_OFF;
            else step.action = ACTION_WAIT;
            steps.push_back(step);
        }
    }

    void start() {
        if (steps.empty() || running) return;
        running = true;
        isRunningSequence = true;
        stepIndex = 0;
        stepStart = millis();
        logPrint("🚀 Starting Sequence");
        playMelodyBlocking((const int[]){4,8,4}, 3); 
        executeStep(steps[stepIndex]);
    }

    void stop() {
        running = false;
        isRunningSequence = false;
        for(const auto& s : steps) {
            if(s.pin > 0) relayOff(s.pin);
        }
        logPrint("🛑 Sequence Stopped");
        if (isSocketConnected) socket.emit("sequence_complete", "{}");
    }

    void update() {
        if (!running) return;
        if (stepIndex >= steps.size()) {
            stop();
            playMelodyBlocking((const int[]){4,4,4,4}, 4); 
            return;
        }
        if (millis() - stepStart >= steps[stepIndex].duration) {
            stepIndex++;
            if (stepIndex < steps.size()) {
                stepStart = millis();
                executeStep(steps[stepIndex]);
            }
        }
    }
    
    bool isBusy() { return running; }

private:
    std::vector<SequenceStep> steps;
    bool running;
    size_t stepIndex;
    unsigned long stepStart;

    void executeStep(const SequenceStep& s) {
        logPrint("👉 Step " + String(s.stepIndex) + ": " + s.description);
        if (s.pin > 0) {
            if (s.action == ACTION_ON) relayOn(s.pin);
            else if (s.action == ACTION_OFF) relayOff(s.pin);
        }
    }
};

SequenceEngine engine;

// ====================== SOCKET HANDLERS ======================

void onConfig(const char * payload, size_t length) {
    logPrint("📩 Config Received");
    DynamicJsonDocument doc(2048);
    deserializeJson(doc, payload);

    if (doc.containsKey("gpios")) {
        pinConfigs.clear();
        JsonArray gpios = doc["gpios"].as<JsonArray>();
        for (JsonObject g : gpios) {
            int pin = g["pin_number"];
            bool isLow = g["is_active_low"] | false;
            pinConfigs.push_back({pin, isLow});
            pinMode(pin, OUTPUT);
            relayOff(pin); 
        }
        logPrint("✅ Pins Reconfigured");
    }
}

void onConnect(const char * payload, size_t length) {
    logPrint("✅ CONNECTED TO SERVER");
    isSocketConnected = true;
    String regJson = "{\"machine_id\":\"" + String(MACHINE_ID) + "\"}";
    socket.emit("register", regJson.c_str());
}

void onDisconnect(const char * payload, size_t length) {
    logPrint("⚠ DISCONNECTED");
    isSocketConnected = false;
}

void onRunSequence(const char * payload, size_t length) {
    logPrint("📩 RUN SEQUENCE");
    DynamicJsonDocument doc(4096);
    if (!deserializeJson(doc, payload) && doc.containsKey("steps")) {
        engine.loadSequence(doc["steps"].as<JsonArray>());
        engine.start();
    }
}

// Pulse Engine
struct PulsingPin { int pin; unsigned long endTime; };
std::vector<PulsingPin> activePulses;

void updatePulses() {
    for (int i = activePulses.size() - 1; i >= 0; i--) {
        if (millis() >= activePulses[i].endTime) {
            relayOff(activePulses[i].pin);
            activePulses.erase(activePulses.begin() + i);
        }
    }
}

void onPulseGPIO(const char * payload, size_t length) {
    DynamicJsonDocument doc(256);
    deserializeJson(doc, payload);
    int pin = doc["pin"];
    int duration = doc["duration"] | 5000;
    if (pin > 0) {
        relayOn(pin);
        for (int i = 0; i < activePulses.size(); i++) {
            if (activePulses[i].pin == pin) {
                activePulses.erase(activePulses.begin() + i);
                break;
            }
        }
        activePulses.push_back({ pin, millis() + duration });
    }
}

void onToggleGPIO(const char * payload, size_t length) {
    DynamicJsonDocument doc(256);
    deserializeJson(doc, payload);
    if (doc.containsKey("action")) {
        String act = doc["action"];
        if (act == "ALL_ON") for(const auto& c : pinConfigs) relayOn(c.pin);
        else if (act == "ALL_OFF") for(const auto& c : pinConfigs) relayOff(c.pin);
        return;
    }
    int pin = doc["pin"];
    if (pin > 0) {
        pinMode(pin, OUTPUT); 
        int val = digitalRead(pin);
        digitalWrite(pin, (val == HIGH) ? LOW : HIGH);
        logPrint("🔌 Toggled Pin " + String(pin));
        lastHeartbeat = millis(); 
    }
}

void onEmergencyStop(const char * payload, size_t length) {
    logPrint("🚨 EMERGENCY STOP");
    engine.stop();
    activePulses.clear();
    for(const auto& c : pinConfigs) relayOff(c.pin);
}

void onReconnectWifi(const char * payload, size_t length) {
    logPrint("🔄 Remote WiFi Reconnect Command");
    ESP.restart();
}

void onOTAUpdate(const char * payload, size_t length) {
    logPrint("📩 OTA Update Request");
    DynamicJsonDocument doc(512);
    deserializeJson(doc, payload);
    if (doc.containsKey("url")) {
        String url = doc["url"];
        WiFiClient client;
        t_httpUpdate_return ret = httpUpdate.update(client, url);
        if (ret == HTTP_UPDATE_OK) logPrint("✅ OTA Success! Restarting...");
        else logPrint("❌ OTA Failed");
    }
}

// ====================== OTA WEB HANDLERS ======================
const char* otaHTML = "<form method='POST' action='/update' enctype='multipart/form-data'><input type='file' name='update'><input type='submit' value='Update'></form>";

void handleRoot() { server.send(200, "text/plain", "Machine Online"); }
void handleUpdateGet() {
    if (!server.authenticate("admin", OTA_PASS)) return server.requestAuthentication();
    server.send(200, "text/html", otaHTML);
}
void handleUpdatePost() {
    if (!server.authenticate("admin", OTA_PASS)) return server.requestAuthentication();
    server.send(200, "text/plain", (Update.hasError()) ? "FAIL" : "OK");
    ESP.restart();
}
void handleUpdateUpload() {
    if (!server.authenticate("admin", OTA_PASS)) return;
    HTTPUpload& upload = server.upload();
    if (upload.status == UPLOAD_FILE_START) Update.begin(UPDATE_SIZE_UNKNOWN);
    else if (upload.status == UPLOAD_FILE_WRITE) Update.write(upload.buf, upload.currentSize);
    else if (upload.status == UPLOAD_FILE_END) Update.end(true);
}

// ====================== MAIN SETUP & LOOP ======================

void setup() {
    Serial.begin(115200);
    initDefaultPins();

    pinMode(BUZZER_PIN, OUTPUT);
    relayOff(BUZZER_PIN);
    for(const auto& c : pinConfigs) {
        pinMode(c.pin, OUTPUT);
        relayOff(c.pin);
    }

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\n✅ WiFi Connected: " + WiFi.localIP().toString());

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("config", onConfig);
    socket.on("run_sequence", onRunSequence);
    socket.on("toggle_gpio", onToggleGPIO);
    socket.on("pulse_gpio", onPulseGPIO);
    socket.on("emergency_stop", onEmergencyStop);
    socket.on("reconnect_wifi", onReconnectWifi);
    socket.on("ota_update", onOTAUpdate);

    socket.begin(host, port, path);
    lastHeartbeat = millis(); // Prevent boot spam
    
    server.on("/", HTTP_GET, handleRoot);
    server.on("/update", HTTP_GET, handleUpdateGet);
    server.on("/update", HTTP_POST, handleUpdatePost, handleUpdateUpload);
    server.begin();
}

void loop() {
    // 1. WiFi Auto-Recovery
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("⚠ WiFi Lost! Reconnecting...");
        WiFi.disconnect(); 
        WiFi.reconnect();
        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) delay(100);
        if (WiFi.status() == WL_CONNECTED) Serial.println("✅ WiFi Restored");
    }

    // 2. Service Loops
    socket.loop();
    server.handleClient();
    engine.update();
    updatePulses();

    // 3. Connection Watchdog (3 Minutes)
    if (isSocketConnected) {
        lastConnectionTime = millis();
    } else if (millis() - lastConnectionTime > WATCHDOG_TIMEOUT) {
        Serial.println("💀 Watchdog: Offline > 3min. Rebooting...");
        delay(1000);
        ESP.restart();
    }

    // 4. Daily Maintenance Reboot (24 Hours)
    if (millis() > DAILY_REBOOT_INTERVAL && !engine.isBusy()) {
        Serial.println("✨ Daily Maintenance Reboot");
        delay(1000);
        ESP.restart();
    }

    // 5. Heartbeat
    if (isSocketConnected && (millis() - lastHeartbeat > HEARTBEAT_INTERVAL)) {
        lastHeartbeat = millis();
        DynamicJsonDocument doc(2048);
        doc["is_running_sequence"] = engine.isBusy();
        
        JsonObject states = doc.createNestedObject("states");
        for(const auto& c : pinConfigs) {
             bool rawVal = digitalRead(c.pin);
             states[String(c.pin)] = c.isActiveLow ? (rawVal == LOW) : (rawVal == HIGH);
        }
        
        JsonObject net = doc.createNestedObject("network");
        net["ssid"] = WiFi.SSID();
        net["rssi"] = WiFi.RSSI();
        net["ip"] = WiFi.localIP().toString();

        String output;
        serializeJson(doc, output);
        socket.emit("heartbeat", output.c_str());
    }
    
    // Relaxed loop delay (50ms) for stability
    delay(50); 
}