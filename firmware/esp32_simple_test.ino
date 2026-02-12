/*
 * Minimal ESP32 Socket.IO Test
 * Connects to Node.js server and toggles GPIO 2 on command.
 * 
 * Required Libraries:
 * 1. SocketIoClient (by timum-viw)
 * 2. ArduinoJson
 * 3. WiFi
 */

#include <WiFi.h>
#include <SocketIoClient.h>
#include <ArduinoJson.h>

const char* ssid = "PM";
const char* password = "123456789";

// YOUR PC IP ADDRESS
// char host[] = "10.241.32.3"; 
// int port = 3000;

// DIRECT LOCAL CONNECTION
char host[] = "10.241.32.3";
int port = 3000;
char path[] = "/socket.io/?transport=websocket"; 

#define MACHINE_ID  "RNSIT_01"
#define TEST_PIN    2

SocketIoClient socket;

void onConnect(const char * payload, size_t length) {
  Serial.println("✅ Connected to Server!");
  socket.emit("register", "{\"machine_id\":\"" MACHINE_ID "\"}");
}

void onDisconnect(const char * payload, size_t length) {
  Serial.println("❌ Disconnected");
}

void onToggle(const char * payload, size_t length) {
  Serial.printf("📩 Toggle Command: %s\n", payload);
  int current = digitalRead(TEST_PIN);
  digitalWrite(TEST_PIN, !current);
  Serial.printf("💡 Pin %d set to %s\n", TEST_PIN, (!current ? "HIGH" : "LOW"));
  
  // Ack back to server (optional, for debugging)
  socket.emit("log", "{\"msg\":\"Pin toggled\"}");
}

void setup() {
  Serial.begin(115200);
  pinMode(TEST_PIN, OUTPUT);
  digitalWrite(TEST_PIN, LOW); // Start Off

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());

  // Setup Socket Events
  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  socket.on("toggle_gpio", onToggle); // Matches backend event

  socket.begin(host, port, path);
}

void loop() {
  socket.loop();
  
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint > 2000) {
    lastPrint = millis();
    if(WiFi.status() == WL_CONNECTED) {
        // Simple heartbeat
        socket.emit("heartbeat", "{\"machine_id\":\"" MACHINE_ID "\", \"status\":\"alive\"}");
    } else {
        Serial.println("WiFi Lost...");
    }
  }
}
