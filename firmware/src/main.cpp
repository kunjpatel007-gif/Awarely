#include <Arduino.h>
#include <WiFi.h>
#include <Wire.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "MAX30105.h"

#define FORCE_SIMULATION false
#define CLOUD_MODE true  // true = Cloud Run (wss), false = localhost (ws)

const char* WIFI_SSID = "WifiH";
const char* WIFI_PASS = "12345678";

#if CLOUD_MODE
  const char* WS_HOST = "awarely-443293282760.asia-south1.run.app";
  const int   WS_PORT = 443;
#else
  const char* WS_HOST = "10.221.129.235";
  const int   WS_PORT = 8000;
#endif

const char* WS_PATH = "/ws/ppg";

#define LED_PIN 2
#define I2C_SDA 21
#define I2C_SCL 22

WebSocketsClient webSocket;
MAX30105 particleSensor;

// ---- Config ----
const unsigned long SAMPLE_INTERVAL_MS = 20;    // 50 Hz (synthetic mode)
const unsigned long SENSOR_TIMEOUT_MS  = 2000;  // no FIFO data for this long => sensor lost
const unsigned long LED_BLINK_MS       = 80;
const long  FINGER_THRESHOLD = 50000;
const float DC_ALPHA = 0.03f;                   // baseline tracker (~0.24 Hz high-pass at 50 Hz)
const float PPG_SCALE = 1500.0f;

// ---- State ----
bool sensorConnected = false;
bool wsConnected = false;

unsigned long lastSyntheticTime = 0;
unsigned long lastSensorSampleTime = 0;

bool ledOn = false;
unsigned long ledOnSince = 0;

float dcFilter = 0.0f;
bool dcSeeded = false;

void sendSample(unsigned long ts, float ppg, long rawIr, const char* source) {
    if (!wsConnected) return;  // nothing is buffered offline; don't waste cycles

    JsonDocument doc;
    doc["timestamp"] = ts;
    doc["ppg"] = round(ppg * 1000.0f) / 1000.0f;
    doc["raw_ir"] = rawIr;
    doc["source"] = source;

    char buf[128];  // avoids a heap String allocation every 20 ms
    size_t n = serializeJson(doc, buf, sizeof(buf));
    webSocket.sendTXT(buf, n);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            wsConnected = false;
            Serial.println("[WS] Disconnected from backend.");
            break;

        case WStype_CONNECTED:
            wsConnected = true;
            Serial.printf("[WS] Connected to %s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
            break;

        case WStype_TEXT: {
            JsonDocument doc;
            DeserializationError err = deserializeJson(doc, payload, length);
            if (!err) {
                const char* alert = doc["alert"];
                if (alert && strcmp(alert, "JITAI_TRIGGERED") == 0) {
                    Serial.println("[JITAI] High stress intervention triggered! Blinking LED.");
                    // Non-blocking blink: never delay() inside the WS callback
                    digitalWrite(LED_PIN, HIGH);
                    ledOn = true;
                    ledOnSince = millis();
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

    Wire.begin(I2C_SDA, I2C_SCL);

    if (!FORCE_SIMULATION) {
        Serial.println("[HW] Probing for MAX30102 sensor at I2C 0x57...");
        if (particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
            sensorConnected = true;
            Serial.println("[HW] MAX30102 found! Configuring sensor registers...");
            // brightness 60, avg 4, mode 2 (Red+IR), 200 sps, pw 411, adc 4096
            // 200 sps / avg 4 = 50 Hz effective, matching the 20 ms send rate
            particleSensor.setup(60, 4, 2, 200, 411, 4096);
        } else {
            Serial.println("[HW] MAX30102 not detected. Auto-falling back to SIMULATION MODE.");
        }
    } else {
        Serial.println("[SIM] FORCE_SIMULATION is set to true. Using synthetic PPG generator.");
    }

    Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);  // modem sleep adds latency/jitter to a 50 Hz stream
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
        Serial.println("\n[WiFi] Timeout. ESP32 will keep retrying in the background.");
    }

    webSocket.onEvent(webSocketEvent);  // register before begin
#if CLOUD_MODE
    webSocket.beginSSL(WS_HOST, WS_PORT, WS_PATH);
#else
    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
#endif
    webSocket.setReconnectInterval(3000);
    webSocket.enableHeartbeat(15000, 3000, 2);  // detect dead links (Cloud Run/proxies drop idle sockets)

    lastSyntheticTime = millis();
    lastSensorSampleTime = millis();
}

void loop() {
    webSocket.loop();
    unsigned long now = millis();

    if (ledOn && now - ledOnSince >= LED_BLINK_MS) {
        digitalWrite(LED_PIN, LOW);
        ledOn = false;
    }

    // ---------- Real sensor path: send exactly one message per new FIFO sample ----------
    if (sensorConnected) {
        particleSensor.check();  // non-blocking FIFO read (getIR()/getRed() block up to 250 ms each)

        while (particleSensor.available()) {
            long ir = particleSensor.getFIFOIR();
            particleSensor.nextSample();
            lastSensorSampleTime = now;

            if (ir > FINGER_THRESHOLD) {
                if (!dcSeeded) {          // seed baseline so the first samples aren't huge spikes
                    dcFilter = (float)ir;
                    dcSeeded = true;
                }
                dcFilter += DC_ALPHA * ((float)ir - dcFilter);
                sendSample(now, ((float)ir - dcFilter) / PPG_SCALE, ir, "MAX30102");
            } else {
                dcSeeded = false;         // re-seed when the finger comes back
                sendSample(now, 0.0f, ir, "MAX30102_NO_FINGER");
            }
        }

        if (now - lastSensorSampleTime > SENSOR_TIMEOUT_MS) {
            Serial.println("[HW] MAX30102 stopped responding. Falling back to SIMULATION MODE.");
            sensorConnected = false;
            lastSyntheticTime = now;
        }
        return;
    }

    // ---------- Synthetic path ----------
    if (now - lastSyntheticTime >= SAMPLE_INTERVAL_MS) {
        lastSyntheticTime += SAMPLE_INTERVAL_MS;                              // drift-free
        if (now - lastSyntheticTime >= SAMPLE_INTERVAL_MS) lastSyntheticTime = now;  // don't burst after a stall

        float t = now / 1000.0f;
        // 1.2 Hz fundamental (~72 BPM) + 2nd harmonic for dicrotic shape + noise
        float base = sin(t * 2.0f * PI * 1.2f);
        float dicrotic = 0.35f * sin(t * 4.0f * PI * 1.2f + 0.5f);
        float noise = (float)random(-10, 11) / 250.0f;  // upper bound is exclusive
        float ppg = base + dicrotic + noise;

        sendSample(now, ppg, (long)(55000 + ppg * 4000), "SYNTHETIC");
    }
}
