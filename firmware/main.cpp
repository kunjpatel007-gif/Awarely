/**
 * ============================================================================
 * The Vanishing Dose — ESP32 Dual-Mode Biosignal Telemetry Firmware
 * Author: Person B (Hardware & API Integration)
 * Repository Root: D:/manipal h/Hackathon-Manipal
 *
 * ARCHITECTURAL DESIGN & ASSUMPTIONS:
 * 1. DUAL-MODE SUPPORT:
 *    - Mode A (Physical Hardware): Probes I2C address 0x57 for MAX30102 pulse oximeter
 *      (SDA = GPIO 21, SCL = GPIO 22). If found, samples raw IR/Red photoplethysmogram (PPG).
 *    - Mode B (Simulation / Wokwi Fallback): If MAX30102 is not detected at boot
 *      or if FORCE_SIMULATION is set, generates a synthetic dicrotic-notch PPG waveform
 *      (1.2 Hz fundamental ~ 72 BPM, plus noise) at 50 Hz.
 * 2. TELEMETRY RATE:
 *    - Transmits 1 sample every 20ms (50 Hz sampling rate) matching backend SAMPLE_RATE_HZ = 50.
 * 3. CLOSED-LOOP JITAI:
 *    - Listens for incoming WebSocket messages from FastAPI gateway.
 *    - Triggers visual LED indicator (GPIO 2) when "JITAI_TRIGGERED" alert is received.
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "MAX30105.h"

// --- Configuration ---
// Set to true if running in Wokwi simulator or testing without physical sensor
#define FORCE_SIMULATION false

// WiFi Credentials
const char* WIFI_SSID = "Wokwi-GUEST"; // Default Wokwi WiFi; change for real AP
const char* WIFI_PASS = "";

// FastAPI Gateway WebSocket Host & Port
// For local physical testing, change to your PC's LAN IP (e.g., "192.168.1.50")
// In Wokwi with Wokwi Bridge: "localhost" or "host.wokwi.internal"
const char* WS_HOST = "127.0.0.1";
const int   WS_PORT = 8000;
const char* WS_PATH = "/ws/ppg";

// Pinout
#define LED_PIN 2       // ESP32 onboard blue LED
#define I2C_SDA 21      // MAX30102 SDA
#define I2C_SCL 22      // MAX30102 SCL

// Global Objects
WebSocketsClient webSocket;
MAX30105 particleSensor;

bool sensorConnected = false;
unsigned long lastSampleTime = 0;
const unsigned long SAMPLE_INTERVAL_MS = 20; // 50 Hz transmission

// WebSocket Event Handler
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("[WS] Disconnected from backend.");
            break;
        case WStype_CONNECTED:
            Serial.printf("[WS] Connected to %s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
            break;
        case WStype_TEXT: {
            // Check for JITAI alerts from backend
            JsonDocument doc;
            DeserializationError err = deserializeJson(doc, payload, length);
            if (!err) {
                const char* alert = doc["alert"];
                if (alert && strcmp(alert, "JITAI_TRIGGERED") == 0) {
                    Serial.println("[JITAI] High stress intervention triggered! Blinking LED.");
                    digitalWrite(LED_PIN, HIGH);
                    delay(80);
                    digitalWrite(LED_PIN, LOW);
                }
            }
            break;
        }
        default:
            break;
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n--- The Vanishing Dose: ESP32 Telemetry Unit Starting ---");

    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    // Initialize I2C for MAX30102
    Wire.begin(I2C_SDA, I2C_SCL);

    if (!FORCE_SIMULATION) {
        Serial.println("[HW] Probing for MAX30102 sensor at I2C 0x57...");
        if (particleSensor.begin(Wire, I2C_SPEED_FAST)) {
            sensorConnected = true;
            Serial.println("[HW] MAX30102 found! Configuring sensor registers...");
            // Configure sensor: LED brightness 60, sample average 4, mode 2 (Red+IR), sample rate 100, pulse width 411
            particleSensor.setup(60, 4, 2, 100, 411, 4096);
        } else {
            Serial.println("[HW] MAX30102 not detected. Auto-falling back to SIMULATION MODE.");
            sensorConnected = false;
        }
    } else {
        Serial.println("[SIM] FORCE_SIMULATION is set to true. Using synthetic PPG generator.");
        sensorConnected = false;
    }

    // Connect to WiFi
    Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25) {
        delay(300);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WiFi] Warning: Connection timeout. Continuing in offline buffer mode.");
    }

    // Initialize WebSocket client
    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(3000);
}

void loop() {
    webSocket.loop();

    unsigned long now = millis();
    if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {
        lastSampleTime = now;

        float ppg_val = 0.0;
        long raw_ir = 0;
        long raw_red = 0;
        const char* mode_source = "SYNTHETIC";

        if (sensorConnected) {
            raw_ir = particleSensor.getIR();
            raw_red = particleSensor.getRed();

            // Check if finger is placed (IR reading threshold)
            if (raw_ir > 50000) {
                mode_source = "MAX30102";
                // Normalize AC-coupled signal roughly around [-1.0, 1.0]
                static float dc_filter = 0.0;
                dc_filter = 0.95 * dc_filter + 0.05 * (float)raw_ir;
                ppg_val = ((float)raw_ir - dc_filter) / 1500.0;
            } else {
                // Finger removed, fall back to low-level idle signal
                mode_source = "MAX30102_NO_FINGER";
                ppg_val = 0.0;
            }
        }

        // If sensor disconnected or fallback required, generate synthetic pulse
        if (!sensorConnected || strcmp(mode_source, "SYNTHETIC") == 0) {
            mode_source = "SYNTHETIC";
            float t = now / 1000.0;
            // 1.2 Hz fundamental (~72 BPM) + 2.4 Hz dicrotic notch harmonic + slight noise
            float base = sin(t * 2.0 * PI * 1.2);
            float dicrotic = 0.35 * sin(t * 4.0 * PI * 1.2 + 0.5);
            float noise = ((float)random(-10, 10)) / 250.0;
            ppg_val = base + dicrotic + noise;
            raw_ir = (long)(55000 + ppg_val * 4000);
            raw_red = (long)(52000 + ppg_val * 3800);
        }

        // Send JSON payload to FastAPI WebSocket
        JsonDocument payloadDoc;
        payloadDoc["timestamp"] = now;
        payloadDoc["ppg"] = round(ppg_val * 1000.0) / 1000.0;
        payloadDoc["raw_ir"] = raw_ir;
        payloadDoc["source"] = mode_source;

        String jsonString;
        serializeJson(payloadDoc, jsonString);
        webSocket.sendTXT(jsonString);
    }
}
