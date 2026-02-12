#include <WiFi.h>
#include <SocketIoClient.h>
#include <ArduinoJson.h>

// --- Configuration ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* server_url = "clecha-taunya-haggardly.ngrok-free.dev"; // Active ngrok URL
const int server_port = 80;
const char* machine_id = "KAL_02";

// --- GPIO Definition ---
struct GPIOConfig {
    int pin;
    bool state;       // Logical state (true=ON, false=OFF)
    bool activeLow;  // True if LOW trigger
};

GPIOConfig gpios[] = { 
    {16, false, true}, {17, false, true}, {18, false, true}, {19, false, true}, 
    {21, false, true}, {22, false, true}, {23, false, true}, {25, false, true}, 
    {26, false, true}, {27, false, true}, {32, false, true}, {33, false, true} 
};
const int gpio_count = sizeof(gpios) / sizeof(gpios[0]);

// --- Sequence State ---
struct SequenceStep {
    int pin;
    bool action; // 1 for ON, 0 for OFF
    unsigned long duration;
};

SequenceStep current_sequence[20];
int sequence_length = 0;
int current_step = -1;
unsigned long step_start_time = 0;
bool is_running_sequence = false;

// --- Objects ---
SocketIoClient socket;
unsigned long last_heartbeat = 0;
const unsigned long heartbeat_interval = 5000;

// --- Functions ---
void setGPIO(int pin, bool logicalState) {
    for (int i = 0; i < gpio_count; i++) {
        if (gpios[i].pin == pin) {
            gpios[i].state = logicalState;
            bool physicalLevel = gpios[i].activeLow ? !logicalState : logicalState;
            digitalWrite(pin, physicalLevel ? HIGH : LOW);
            break;
        }
    }
}

void reportHeartbeat() {
    StaticJsonDocument<512> doc;
    JsonObject states = doc.createNestedObject("states");
    for (int i = 0; i < gpio_count; i++) {
        states[String(gpios[i].pin)] = gpios[i].state ? 1 : 0;
    }
    doc["is_running_sequence"] = is_running_sequence;
    
    JsonObject network = doc.createNestedObject("network");
    network["ssid"] = WiFi.SSID();
    network["rssi"] = WiFi.RSSI();
    
    String output;
    serializeJson(doc, output);
    socket.emit("heartbeat", output.c_str());
}

void onToggleGPIO(const char* payload, size_t length) {
    StaticJsonDocument<100> doc;
    deserializeJson(doc, payload);
    int pin = doc["pin"];
    // Toggle logic: find current state and flip it
    bool current = false;
    for(int i=0; i<gpio_count; i++) {
        if(gpios[i].pin == pin) current = gpios[i].state;
    }
    setGPIO(pin, !current);
    reportHeartbeat();
}

void onRunSequence(const char* payload, size_t length) {
    StaticJsonDocument<2048> doc;
    deserializeJson(doc, payload);
    
    JsonArray steps = doc["steps"];
    sequence_length = steps.size();
    for (int i = 0; i < sequence_length; i++) {
        current_sequence[i].pin = steps[i]["pin_number"];
        current_sequence[i].action = (steps[i]["action"] == "ON");
        current_sequence[i].duration = steps[i]["duration_ms"];
    }
    
    current_step = 0;
    is_running_sequence = true;
    step_start_time = millis();
    
    // Execute first step
    setGPIO(current_sequence[0].pin, current_sequence[0].action);
    reportHeartbeat();
}

void handleSequence() {
    if (!is_running_sequence) return;
    
    if (millis() - step_start_time >= current_sequence[current_step].duration) {
        current_step++;
        if (current_step >= sequence_length) {
            is_running_sequence = false;
            current_step = -1;
            socket.emit("sequence_complete", "{}");
            reportHeartbeat();
        } else {
            setGPIO(current_sequence[current_step].pin, current_sequence[current_step].action);
            step_start_time = millis();
            reportHeartbeat();
        }
    }
}

void setup() {
    Serial.begin(115200);
    
    for (int i = 0; i < gpio_count; i++) {
        pinMode(gpios[i].pin, OUTPUT);
        // Set initial state based on activeLow (usually Relays stay HIGH/OFF on boot)
        digitalWrite(gpios[i].pin, gpios[i].activeLow ? HIGH : LOW);
    }

    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected");

    socket.on("toggle_gpio", onToggleGPIO);
    socket.on("run_sequence", onRunSequence);
    
    socket.on("connect", [] (const char* payload, size_t length) {
        Serial.println("Connected to server");
        String reg_data = "{\"machine_id\":\"" + String(machine_id) + "\"}";
        socket.emit("register", reg_data.c_str());
    });
    
    socket.begin(server_url, server_port);
}

void loop() {
    socket.loop();
    handleSequence();
    
    if (millis() - last_heartbeat > heartbeat_interval) {
        reportHeartbeat();
        last_heartbeat = millis();
    }
}
