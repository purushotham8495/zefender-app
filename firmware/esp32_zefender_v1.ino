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
#define WIFI_SSID       "PM"
#define WIFI_PASSWORD   "123456789"

// Stepper Motor Pins
#define STEP_PIN 26
#define DIR_PIN 25

// MP3 Module (DFPlayer Mini UART on Pins 16 RX & 17 TX)
#define HAS_MP3_MODULE  true   // Set to true for machines with the MP3 module installed

bool stepperRunning = false;
unsigned long lastStepTime = 0;
bool stepState = false;
const unsigned long stepInterval = 60; // ~5 RPM

// Server Connection
char host[] = "admin.zefender.com"; 
int port = 80;
char path[] = "/socket.io/?transport=websocket"; // Force WebSocket for stability

#define MACHINE_ID      "HEL_02"
#define OTA_PASS        "Healthmet@123"

// Pin Definitions
#define PIN_PUMP      4
#define PIN_HEATER    5
#define PIN_FAN       18
#define PIN_UV        19
#define BUZZER_PIN    23 
#define BUTTON_PIN    3    // Physical push button on RX0 (GPIO 3)

// Timing Constants
const unsigned long HEARTBEAT_INTERVAL = 5000;
const unsigned long WATCHDOG_TIMEOUT = 180000;      // 3 Minutes
const unsigned long DAILY_REBOOT_INTERVAL = 86400000; // 24 Hours

// Global State
bool isRunningSequence = false;
unsigned long lastHeartbeat = 0;
bool isSocketConnected = false;
unsigned long lastConnectionTime = 0;

// Button Debounce and State variables
bool lastButtonState = HIGH;
bool currentButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY = 50;

SocketIoClient socket;
WebServer server(80);

// ====================== HELPER FUNCTIONS ======================

// MP3 DFPlayer Mini Raw UART packet sender (No external library dependency)
void sendMP3Command(uint8_t command, uint8_t para1, uint8_t para2) {
    #if HAS_MP3_MODULE
    uint16_t checksum = 0xFFFF - (0xFF + 0x06 + command + 0x00 + para1 + para2) + 1;
    uint8_t packet[10] = {
        0x7E, 
        0xFF, 
        0x06, 
        command, 
        0x00, // No feedback
        para1, 
        para2, 
        (uint8_t)(checksum >> 8), 
        (uint8_t)(checksum & 0xFF), 
        0xEF
    };
    Serial2.write(packet, 10);
    #endif
}

void mp3Play(int track) {
    #if HAS_MP3_MODULE
    logPrint("🎵 MP3 Play track " + String(track));
    sendMP3Command(0x03, (track >> 8) & 0xFF, track & 0xFF);
    #endif
}

void mp3Stop() {
    #if HAS_MP3_MODULE
    logPrint("⏹ MP3 Stop playback");
    sendMP3Command(0x16, 0x00, 0x00);
    #endif
}

void mp3SetVolume(int volume) {
    #if HAS_MP3_MODULE
    logPrint("🔊 MP3 Volume set to " + String(volume));
    sendMP3Command(0x06, 0x00, volume & 0xFF);
    #endif
}


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
    int defaults[] = {2,4, 5, 15,16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
    for(int p : defaults) {
        #if HAS_MP3_MODULE
        if (p == 16 || p == 17) continue; // Skip serial pins
        #endif
        pinConfigs.push_back({p, true}); // Default Active Low
    }
}

void rotateStepperBackground() {
    if (!stepperRunning) return;

    unsigned long now = millis();
    if (now - lastStepTime >= stepInterval) {
        lastStepTime = now;
        stepState = !stepState;
        digitalWrite(STEP_PIN, stepState ? HIGH : LOW);
    }
}

bool pinIsActiveLow(int pin) {
    for(const auto& c : pinConfigs) {
        if(c.pin == pin) return c.isActiveLow;
    }
    return true; 
}

void relayOn(int pin) {
    #if HAS_MP3_MODULE
    if (pin == 16 || pin == 17) return; // Prevent driving MP3 serial lines
    #endif

    if(pin == STEP_PIN){
        stepperRunning = true;
        logPrint("Stepper START");
        return;
    }

    if(pin == DIR_PIN){
        digitalWrite(DIR_PIN, HIGH);
        logPrint("Stepper DIR HIGH");
        return;
    }

    bool isLow = pinIsActiveLow(pin);
    pinMode(pin, OUTPUT);
    digitalWrite(pin, isLow ? LOW : HIGH);

    logPrint("Pin "+String(pin)+" ON");
}

void relayOff(int pin) {
    #if HAS_MP3_MODULE
    if (pin == 16 || pin == 17) return; // Prevent driving MP3 serial lines
    #endif

    if(pin == STEP_PIN){
        stepperRunning = false;
        digitalWrite(STEP_PIN,LOW);
        logPrint("Stepper STOP");
        return;
    }

    if(pin == DIR_PIN){
        digitalWrite(DIR_PIN,LOW);
        logPrint("Stepper DIR LOW");
        return;
    }

    bool isLow = pinIsActiveLow(pin);
    pinMode(pin, OUTPUT);
    digitalWrite(pin, isLow ? HIGH : LOW);

    logPrint("Pin "+String(pin)+" OFF");
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
enum StepAction { ACTION_ON, ACTION_OFF, ACTION_WAIT, ACTION_PLAY };

struct SequenceStep {
    int stepIndex;
    int pin;
    StepAction action;
    unsigned long duration;
    String description;
    int trackNum;
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
            step.trackNum = s["track_number"] | 0;
            String act = s["action"] | "WAIT";
            if (act == "ON") step.action = ACTION_ON;
            else if (act == "OFF") step.action = ACTION_OFF;
            else if (act == "PLAY_TRACK") step.action = ACTION_PLAY;
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
        #if HAS_MP3_MODULE
        mp3Stop();
        #endif
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
        if (s.action == ACTION_PLAY) {
            #if HAS_MP3_MODULE
            mp3Play(s.trackNum);
            #endif
        } else if (s.pin > 0) {
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

// ====================== LOCAL HARDCODED SEQUENCES ======================
// Use this function to write sequences directly in C++ code
void runLocalSequence(String id) {
    logPrint("🔄 Triggering LOCAL Sequence: " + id);
    isRunningSequence = true;

    if (id == "INTERNAL_CLEAN") {
        // Example: Hardcoded high-speed pulsing logic
        relayOn(PIN_PUMP);
        delay(2000);
        relayOff(PIN_PUMP);
        delay(500);
        relayOn(PIN_PUMP);
        delay(2000);
        relayOff(PIN_PUMP);
    } 
    else if (id == "DRY_CYCLE") {
        relayOn(PIN_FAN);
        delay(5000);
        relayOff(PIN_FAN);
    }
    else {
        logPrint("❌ Unknown Local Sequence ID: " + id);
    }

    isRunningSequence = false;
    if (isSocketConnected) socket.emit("sequence_complete", "{}");
    logPrint("✅ Local Sequence Finished");
}

void onRunSequence(const char * payload, size_t length) {
    logPrint("📩 RUN SEQUENCE");
    DynamicJsonDocument doc(4096);
    deserializeJson(doc, payload);

    // Check if the web sent a specific ID (Local Sequence)
    if (doc.containsKey("sequence_id")) {
        String seqId = doc["sequence_id"];
        runLocalSequence(seqId);
    } 
    // Otherwise, handle it as a Cloud Sequence (JSON steps)
    else if (doc.containsKey("steps")) {
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

void onPlayMP3(const char * payload, size_t length) {
    #if HAS_MP3_MODULE
    DynamicJsonDocument doc(512);
    deserializeJson(doc, payload);
    
    // Check if payload has direct track parameter (legacy/direct calls)
    if (doc.containsKey("track") && !doc.containsKey("action")) {
        int track = doc["track"] | 0;
        if (track > 0) {
            mp3Play(track);
        } else {
            mp3Stop();
        }
        return;
    }

    if (doc.containsKey("action")) {
        String action = doc["action"];
        if (action == "play") {
            if (doc.containsKey("track")) {
                int track = doc["track"] | 1;
                mp3Play(track);
            } else {
                logPrint("🎵 MP3 Resume");
                sendMP3Command(0x0D, 0x00, 0x00);
            }
        }
        else if (action == "pause") {
            logPrint("⏸ MP3 Pause");
            sendMP3Command(0x0E, 0x00, 0x00);
        }
        else if (action == "stop") {
            mp3Stop();
        }
        else if (action == "next") {
            logPrint("⏭ MP3 Next track");
            sendMP3Command(0x01, 0x00, 0x00);
        }
        else if (action == "prev") {
            logPrint("⏮ MP3 Previous track");
            sendMP3Command(0x02, 0x00, 0x00);
        }
        else if (action == "volume") {
            int vol = doc["volume"] | 25;
            mp3SetVolume(vol);
        }
        else if (action == "loop_on") {
            int track = doc["track"] | 1;
            logPrint("🔁 MP3 Loop ON — Track: " + String(track));
            mp3Play(track);                           // start the track first
            delay(200);
            sendMP3Command(0x08, 0x00, track);        // 0x08 = loop single track
        }
        else if (action == "loop_off") {
            logPrint("➡ MP3 Loop OFF");
            sendMP3Command(0x0E, 0x00, 0x00);         // pause (keeps position)
            sendMP3Command(0x11, 0x00, 0x00);         // disable repeat-all just in case
        }
    }
    #endif
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

// ====================== MAIN SETUP & LOOP ======================

void setup() {
    Serial.begin(115200);
    
    // NOTE: Hardware Watchdog removed to prevent boot loops/compilation errors.
    // relying on Software Watchdog in loop().

    #if HAS_MP3_MODULE
    Serial.println("🔊 Initializing DFPlayer Mini Serial2 (9600 baud, RX=16, TX=17)...");
    Serial2.begin(9600, SERIAL_8N1, 16, 17);
    delay(1000); // 1 second delay for DFPlayer Mini power-on stabilization
    mp3SetVolume(25);
    #endif

    initDefaultPins();

    pinMode(BUTTON_PIN, INPUT_PULLUP);

    pinMode(BUZZER_PIN, OUTPUT);
    relayOff(BUZZER_PIN);
    for(const auto& c : pinConfigs) {
        pinMode(c.pin, OUTPUT);
        relayOff(c.pin);
    }

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to WiFi");
    
    unsigned long startM = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startM < 10000) {
        delay(500);
        Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✅ WiFi Connected: " + WiFi.localIP().toString());
    } else {
        Serial.println("\n❌ WiFi Failed (will retry in loop)");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("config", onConfig);
    socket.on("run_sequence", onRunSequence);
    socket.on("toggle_gpio", onToggleGPIO);
    socket.on("pulse_gpio", onPulseGPIO);
    socket.on("emergency_stop", onEmergencyStop);
    socket.on("reconnect_wifi", onReconnectWifi);
    socket.on("ota_update", onOTAUpdate);
    socket.on("play_mp3", onPlayMP3);

    socket.begin(host, port, path);
    lastHeartbeat = millis(); 
    
    server.on("/", HTTP_GET, handleRoot);
    server.on("/update", HTTP_GET, handleUpdateGet);
    server.on("/update", HTTP_POST, handleUpdatePost, handleUpdateUpload);
    server.begin();
}

void loop() {
    // 0. PHYSICAL TRIGGER BUTTON: Check for physical push button press
    int reading = digitalRead(BUTTON_PIN);
    if (reading != lastButtonState) {
        lastDebounceTime = millis();
    }
    if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY) {
        if (reading != currentButtonState) {
            currentButtonState = reading;
            if (currentButtonState == LOW) {
                if (!engine.isBusy()) {
                    logPrint("🔘 Physical Button Pressed: Requesting sequence start");
                    if (isSocketConnected) {
                        socket.emit("trigger_sequence", "{}");
                    } else {
                        logPrint("❌ Cannot trigger sequence: Socket not connected");
                    }
                } else {
                    logPrint("⚠️ Sequence already running, button press ignored");
                }
            }
        }
    }
    lastButtonState = reading;

    // 1. HARDWARE PRIORITY: Always Service Engine & Pulses FIRST
    // This ensures pumps/sequences never freeze even if WiFi dies
    rotateStepperBackground();
    engine.update();
    updatePulses();
    

    // 2. WiFi Auto-Recovery (Non-Blocking)
    if (WiFi.status() != WL_CONNECTED) {
        static unsigned long lastWifiReconnectAttempt = 0;
        if (millis() - lastWifiReconnectAttempt > 5000) {
            lastWifiReconnectAttempt = millis();
            Serial.println("⚠ WiFi Lost! Initiating non-blocking reconnect...");
            WiFi.disconnect();
            WiFi.reconnect();
        }
        // Do not block. Do not run socket.loop(). Just return to keep engine running.
        return; 
    }

    // 3. Service Network Loops (Only if WiFi is Up)
    socket.loop();
    server.handleClient();

    // 4. Connection Watchdog (3 Minutes)
    // If socket is disconnected for too long despite WiFi, reboot.
    if (isSocketConnected) {
        lastConnectionTime = millis();
    } else {
        // If WiFi is connected but Socket isn't (for > 3 mins)
        if (millis() - lastConnectionTime > WATCHDOG_TIMEOUT) {
            Serial.println("💀 Watchdog: Socket Offline > 3min. Rebooting...");
            delay(1000);
            ESP.restart();
        }
        
        // Force Re-init if Socket disconnected but WiFi OK
        static unsigned long lastSocketRetry = 0;
        if (millis() - lastSocketRetry > 5000) {
            lastSocketRetry = millis();
            // We are already in the !isSocketConnected block, so just retry.
            Serial.println("🔄 Retrying Socket Connection...");
            socket.begin(host, port, path);
        }
    }

    // 5. Daily Maintenance Reboot (24 Hours) - ONLY IF IDLE
    if (millis() > DAILY_REBOOT_INTERVAL && !engine.isBusy()) {
        Serial.println("✨ Daily Maintenance Reboot");
        delay(1000);
        ESP.restart();
    }

    // 6. Heartbeat
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
    
    // Fast Loop
    delay(10); 
}