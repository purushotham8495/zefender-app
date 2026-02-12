                /**
                * Zefender Machine Control Firmware (ESP32 Wrover Compatible)
                * 
                * Features:
                * - Socket.IO Real-time Link
                * - Remote GPIO Control/*
                Robust ESP32 + Socket.IO (WebSocket) vending/automation driver
                - Non-blocking sanitization state machine with Dynamic Steps
                - Socket.IO for real-time control and heartbeat
                - WiFi event handling + auto-reconnect
                - Standard WebServer for OTA (Resolves Compilation Issues)
                */

                #include <WiFi.h>
                #include <SocketIoClient.h> // Requires "SocketIoClient" library by timum-viw
                #include <ArduinoJson.h>    // Requires ArduinoJson v6+
                #include <WebServer.h>      // Standard ESP32 WebServer
                #include <Update.h>
                #include <HTTPClient.h>
                #include <HTTPUpdate.h>
                #include <vector>
                #include <esp_wifi.h>

                // ====================== CONFIG (change as required) ======================
                #define WIFI_SSID       "SPK"
                #define WIFI_PASSWORD   "Spk@0209"

                // REPLACE WITH YOUR SERVER URL (e.g. http://192.168.1.100:3000 or ngrok url)
                // REPLACE WITH YOUR SERVER URL (e.g. http://192.168.1.100:3000 or ngrok url)
                char host[] = "antiquewhite-quetzal-291895.hostingersite.com"; 
                int port = 80;
                char path[] = "/socket.io/"; 

                #define MACHINE_ID      "RNSIT_01"

                // OTA password
                #define OTA_PASS        "Healthmet@123"

                // Default Relay pins
                #define PIN_PUMP      4
                #define PIN_HEATER    5
                #define PIN_FAN       18
                #define PIN_UV        19

                // Buzzer relay pin
                #define BUZZER_PIN    23 

                // State tracking
                bool isRunningSequence = false;
                unsigned long lastHeartbeat = 0;
                const unsigned long HEARTBEAT_INTERVAL = 5000;

                SocketIoClient socket;
                WebServer server(80); // Standard WebServer

                // ====================== LOGGING HELPER ======================
                void logPrint(const String &msg) {
                    Serial.println(msg);
                    
                    // Remote Logging Bridge
                    DynamicJsonDocument doc(512);
                    doc["message"] = msg;
                    doc["timestamp"] = millis();
                    String output;
                    serializeJson(doc, output);
                    socket.emit("machine_log", output.c_str());
                }

                // ====================== PIN POLARITY ENGINE ======================
                struct PinConfig {
                    int pin;
                    bool isActiveLow;
                };
                std::vector<PinConfig> pinConfigs;

                // Default configuration (Initial)
                void initDefaultPins() {
                    pinConfigs.clear();
                    int defaults[] = {4, 5, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
                    for(int p : defaults) {
                        pinConfigs.push_back({p, true}); // Assume Active Low (most relays) by default
                    }
                }

                bool pinIsActiveLow(int pin) {
                    for(const auto& c : pinConfigs) {
                        if(c.pin == pin) return c.isActiveLow;
                    }
                    return true; // Default
                }

                // ====================== RELAY HELPERS ======================
                void relayOn(int pin)  { 
                    if (pin > 0) {
                        bool isLow = pinIsActiveLow(pin);
                        pinMode(pin, OUTPUT); 
                        digitalWrite(pin, isLow ? LOW : HIGH); 
                        logPrint("📍 Pin " + String(pin) + " ON (" + (isLow ? "LOW" : "HIGH") + ")");
                    }
                }

                void relayOff(int pin) { 
                    if (pin > 0) {
                        bool isLow = pinIsActiveLow(pin);
                        pinMode(pin, OUTPUT);
                        digitalWrite(pin, isLow ? HIGH : LOW); 
                        logPrint("📍 Pin " + String(pin) + " OFF (" + (isLow ? "HIGH" : "LOW") + ")");
                    }
                }

                // Buzzer helpers
                void buzzerOn()  { relayOn(BUZZER_PIN); }
                void buzzerOff() { relayOff(BUZZER_PIN); }

                void playMelodyBlocking(const int durations[], int length) {
                // Simple beep loop
                for (int i = 0; i < length; i++) {
                    int beepDuration = 3000 / durations[i];
                    buzzerOn();
                    delay(beepDuration);
                    buzzerOff();
                    delay(beepDuration * 0.3);
                }
                }

                // ====================== DYNAMIC GENERATOR ENGINE ======================
                enum StepAction { ACTION_ON, ACTION_OFF, ACTION_WAIT };

                struct SequenceStep {
                int stepIndex;
                int pin;
                StepAction action;
                unsigned long duration; // ms
                String description;
                };

                class SequenceEngine {
                public:
                SequenceEngine() : running(false), stepIndex(0), stepStart(0) {}

                void loadSequence(const JsonArray& stepsJson) {
                    steps.clear();
                    logPrint("🔄 Loading new sequence with " + String(stepsJson.size()) + " steps.");
                    
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
                    if (steps.empty()) {
                    logPrint("⚠ No sequence loaded!");
                    return;
                    }
                    if (running) return;
                    
                    running = true;
                    isRunningSequence = true;
                    stepIndex = 0;
                    stepStart = millis();
                    logPrint("🚀 Starting Sequence");
                    playMelodyBlocking((const int[]){4,8,4}, 3); // Start sound
                    
                    executeStep(steps[stepIndex]);
                }

                void stop() {
                    running = false;
                    isRunningSequence = false;
                    
                    // Safety: Turn off all known pins in sequence
                    for(const auto& s : steps) {
                    if(s.pin > 0) relayOff(s.pin);
                    }
                    logPrint("🛑 Sequence Stopped/Finished");
                    
                    // Notify Server
                    socket.emit("sequence_complete", "{}");
                }

                void update() {
                    if (!running) return;

                    if (stepIndex >= steps.size()) {
                    stop();
                    playMelodyBlocking((const int[]){4,4,4,4}, 4); // End sound
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

                // ====================== SOCKET.IO HANDLERS ======================

                void onConfig(const char * payload, size_t length) {
                    logPrint("📩 Received GPIO Configuration");
                    DynamicJsonDocument doc(2048);
                    DeserializationError error = deserializeJson(doc, payload);
                    if (error) {
                        logPrint("❌ Config JSON Error: " + String(error.c_str()));
                        return;
                    }

                    if (doc.containsKey("gpios")) {
                        pinConfigs.clear();
                        JsonArray gpios = doc["gpios"].as<JsonArray>();
                        for (JsonObject g : gpios) {
                            int pin = g["pin_number"];
                            bool isLow = g["is_active_low"] | false;
                            
                            pinConfigs.push_back({pin, isLow});
                            pinMode(pin, OUTPUT);
                            relayOff(pin); // Reset to default OFF state on reconfig
                            logPrint("📍 Configured Pin " + String(pin) + " (ActiveLow: " + String(isLow) + ")");
                        }
                    }
                }

                void onConnect(const char * payload, size_t length) {
                logPrint("✅ Connected to Socket Server");
                // Register Machine
                String regJson = "{\"machine_id\":\"" + String(MACHINE_ID) + "\"}";
                socket.emit("register", regJson.c_str());
                }

                void onDisconnect(const char * payload, size_t length) {
                logPrint("⚠ Disconnected from Socket Server");
                }

                void onRunSequence(const char * payload, size_t length) {
                logPrint("📩 Command: Run Sequence");
                
                DynamicJsonDocument doc(4096);
                DeserializationError error = deserializeJson(doc, payload); // payload is { "steps": [...] }
                
                if (error) {
                    logPrint("❌ JSON Error: " + String(error.c_str()));
                    return;
                }

                if (doc.containsKey("steps")) {
                    engine.loadSequence(doc["steps"].as<JsonArray>());
                    engine.start();
                }
                }

                // ====================== PULSE ENGINE ======================
                struct PulsingPin {
                    int pin;
                    unsigned long endTime;
                };
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
                    // payload: { "pin": 4, "duration": 5000 }
                    DynamicJsonDocument doc(256);
                    deserializeJson(doc, payload);
                    int pin = doc["pin"];
                    int duration = doc["duration"] | 5000;

                    if (pin > 0) {
                        relayOn(pin);
                        
                        // Remove existing pulse for this pin if any
                        for (int i = 0; i < activePulses.size(); i++) {
                            if (activePulses[i].pin == pin) {
                                activePulses.erase(activePulses.begin() + i);
                                break;
                            }
                        }
                        
                        PulsingPin p = { pin, millis() + duration };
                        activePulses.push_back(p);
                    }
                }

                void onToggleGPIO(const char * payload, size_t length) {
                    // payload: { "pin": 4 } OR { "action": "ALL_ON" }
                    DynamicJsonDocument doc(256);
                    deserializeJson(doc, payload);
                    
                    if (doc.containsKey("action")) {
                        String act = doc["action"];
                        if (act == "ALL_ON") {
                            for(const auto& c : pinConfigs) relayOn(c.pin);
                            logPrint("⚡ ALL PINS ON");
                        } else if (act == "ALL_OFF") {
                            for(const auto& c : pinConfigs) relayOff(c.pin);
                            logPrint("🌑 ALL PINS OFF");
                        }
                        return;
                    }

                    int pin = doc["pin"];
                    if (pin > 0) {
                        pinMode(pin, OUTPUT); 
                        int val = digitalRead(pin);
                        if (val == HIGH) digitalWrite(pin, LOW);
                        else digitalWrite(pin, HIGH);
                        
                        logPrint("🔌 Toggled Pin " + String(pin));
                        lastHeartbeat = 0; 
                    }
                }

                void onEmergencyStop(const char * payload, size_t length) {
                    logPrint("🚨 EMERGENCY STOP RECEIVED");
                    engine.stop();
                    activePulses.clear(); // Clear all pulses
                    for(const auto& c : pinConfigs) relayOff(c.pin);
                }

                void onReconnectWifi(const char * payload, size_t length) {
                    logPrint("🔄 Remote WiFi Reconnect requested");
                    ESP.restart();
                }

                void onOTAUpdate(const char * payload, size_t length) {
                    logPrint("📩 Centralized OTA Request Received");
                    DynamicJsonDocument doc(512);
                    DeserializationError err = deserializeJson(doc, payload);
                    if (err) {
                        logPrint("❌ OTA JSON Error: " + String(err.c_str()));
                        return;
                    }
                    
                    if (doc.containsKey("url")) {
                        String url = doc["url"];
                        logPrint("🌐 Fetching Firmware from: " + url);
                        
                        // Start Update
                        WiFiClient client;
                        
                        // Set longer timeout for OTA
                        // client.setTimeout(120); 

                        t_httpUpdate_return ret = httpUpdate.update(client, url);

                        switch (ret) {
                            case HTTP_UPDATE_FAILED:
                                logPrint("❌ OTA Update Failed. Error (" + String(httpUpdate.getLastError()) + "): " + httpUpdate.getLastErrorString());
                                break;
                            case HTTP_UPDATE_NO_UPDATES:
                                logPrint("ℹ OTA No Updates");
                                break;
                            case HTTP_UPDATE_OK:
                                logPrint("✅ OTA Update Success! Restarting...");
                                break;
                        }
                    }
                }

                // ====================== OTA HANDLERS ======================
                // ... (rest of OTA code same as before) ...
                const char* otaHTML = 
                "<form method='POST' action='/update' enctype='multipart/form-data'>"
                "<input type='file' name='update'>"
                "<input type='submit' value='Update'>"
                "</form>";

                void handleRoot() {
                    server.send(200, "text/plain", "ESP32 Controller Online");
                }

                void handleUpdateGet() {
                    if (!server.authenticate("admin", OTA_PASS)) {
                        return server.requestAuthentication();
                    }
                    server.send(200, "text/html", otaHTML);
                }

                void handleUpdatePost() {
                    if (!server.authenticate("admin", OTA_PASS)) {
                        return server.requestAuthentication();
                    }
                    server.send(200, "text/plain", (Update.hasError()) ? "FAIL" : "OK");
                    ESP.restart();
                }

                void handleUpdateUpload() {
                    if (!server.authenticate("admin", OTA_PASS)) return;
                    
                    HTTPUpload& upload = server.upload();
                    if (upload.status == UPLOAD_FILE_START) {
                        logPrint("Update: " + upload.filename);
                        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                            Update.printError(Serial);
                        }
                    } else if (upload.status == UPLOAD_FILE_WRITE) {
                        if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
                            Update.printError(Serial);
                        }
                    } else if (upload.status == UPLOAD_FILE_END) {
                        if (Update.end(true)) {
                            logPrint("Update Success: " + String(upload.totalSize));
                        } else {
                            Update.printError(Serial);
                        }
                    }
                }

                // ====================== SETUP / LOOP ======================

                void setup() {
                    Serial.begin(115200);
                    
                    // Init default pins first
                    initDefaultPins();

                    // Init Pins
                    pinMode(BUZZER_PIN, OUTPUT);
                    relayOff(BUZZER_PIN);
                    
                    for(const auto& c : pinConfigs) {
                        pinMode(c.pin, OUTPUT);
                        relayOff(c.pin);
                    }

                    // WiFi
                    WiFi.mode(WIFI_STA);
                    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
                    Serial.print("Connecting to WiFi");
                    while (WiFi.status() != WL_CONNECTED) {
                        delay(500);
                        Serial.print(".");
                    }
                    Serial.println("\nWiFi Connected. IP: " + WiFi.localIP().toString());

                    // Socket.IO Events
                    socket.on("connect", onConnect);
                    socket.on("disconnect", onDisconnect);
                    socket.on("config", onConfig);
                    socket.on("run_sequence", onRunSequence);
                    socket.on("toggle_gpio", onToggleGPIO);
                    socket.on("pulse_gpio", onPulseGPIO); // New Handler
                    socket.on("emergency_stop", onEmergencyStop);
                    socket.on("reconnect_wifi", onReconnectWifi);
                    socket.on("ota_update", onOTAUpdate);

                    // Start Socket
                    // Note: Library expects (host, port, path)
                    socket.begin(host, port, path);

                    // OTA Server (Standard)
                    server.on("/", HTTP_GET, handleRoot);
                    server.on("/update", HTTP_GET, handleUpdateGet);
                    server.on("/update", HTTP_POST, handleUpdatePost, handleUpdateUpload);
                    server.begin();
                }

                void loop() {
                    socket.loop();
                    server.handleClient();
                    engine.update();
                    updatePulses(); // Check pulse timers

                    // Heartbeat
                    if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
                        lastHeartbeat = millis();
                        
                        DynamicJsonDocument doc(2048);
                        doc["is_running_sequence"] = engine.isBusy();
                        
                        JsonObject states = doc.createNestedObject("states");
                        for(const auto& c : pinConfigs) {
                            // Determine Active status based on polarity
                            bool rawVal = digitalRead(c.pin);
                            bool isActive = c.isActiveLow ? (rawVal == LOW) : (rawVal == HIGH);
                            states[String(c.pin)] = isActive;
                        }

                        JsonObject net = doc.createNestedObject("network");
                        net["ssid"] = WiFi.SSID();
                        net["rssi"] = WiFi.RSSI();
                        net["ip"] = WiFi.localIP().toString();
                        
                        String output;
                        serializeJson(doc, output);
                        socket.emit("heartbeat", output.c_str());
                    }
                }
                