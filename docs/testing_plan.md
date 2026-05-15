# Smart Laser Distance Meter — Full Testing Plan
## CO321/CO324/CO325/CO328 | Milestone 2 | Week 14

---

## Table of Contents
1. [Testing Overview](#1-testing-overview)
2. [Hardware Testing](#2-hardware-testing)
   - 2.1 VL53L0X Sensor Accuracy Test
   - 2.2 BLE Range & Packet Loss Test
   - 2.3 Button Debounce Test
   - 2.4 Buzzer Feedback Test
   - 2.5 SD Card Data Persistence Test
   - 2.6 OLED Display State Transition Test
   - 2.7 Firmware State Machine Test
3. [Software Testing](#3-software-testing)
   - 3.1 Unit Test — BLE Packet Decoder
   - 3.2 Integration Test — BLE End-to-End Measurement Flow
   - 3.3 API Test — Authentication Endpoints
   - 3.4 API Test — Project & Sync Endpoints
   - 3.5 Cloud Sync Roundtrip Test
   - 3.6 Offline Mode Test
   - 3.7 Sketch Feature Tests
   - 3.8 Export Tests
4. [Test Results Table](#4-test-results-table)
5. [Known Limitations & Gaps](#5-known-limitations--gaps)

---

## 1. Testing Overview

| Layer | Testing Type | Tools / Method |
|---|---|---|
| Firmware (ESP32) | Manual + Serial monitor | PlatformIO Serial at 115200 baud |
| BLE Communication | Integration (manual) | Flutter app + physical device |
| Flutter App | Manual UI + Unit | Flutter test framework |
| Backend API | Functional (manual) | curl / Postman / REST client |
| Database | Integration | Backend route execution, psql queries |
| End-to-End | System test | All layers together |

**Backend URL:** `https://e21-3yp-smart-laser-distance-meter-production.up.railway.app`

---

## 2. Hardware Testing

### 2.1 VL53L0X Sensor Accuracy Test

**Objective:** Verify that the VL53L0X Time-of-Flight sensor returns accurate distance readings within acceptable tolerance.

**Background:** The sensor uses infrared laser pulses (940 nm) to measure time-of-flight. The firmware reads via `sensor.readRangeContinuousMillimeters()` with a 500 ms timeout. Values ≥ 2000 mm are treated as out-of-range errors (`doMeasure()` at `main.cpp:299`).

**Equipment needed:**
- ESP32 device (powered via USB)
- Flat, non-reflective white wall or cardboard target
- Measuring tape (reference)
- PlatformIO Serial Monitor at 115200 baud

**Test Cases:**

| Test ID | Target Distance | Reference (tape) | Sensor Reading | Error (mm) | Error (%) | Pass/Fail |
|---|---|---|---|---|---|---|
| ACC-01 | 200 mm | 200 mm | ___ mm | ___ | ___ | |
| ACC-02 | 500 mm | 500 mm | ___ mm | ___ | ___ | |
| ACC-03 | 1000 mm | 1000 mm | ___ mm | ___ | ___ | |
| ACC-04 | 1500 mm | 1500 mm | ___ mm | ___ | ___ | |
| ACC-05 | 1900 mm | 1900 mm | ___ mm | ___ | ___ | |
| ACC-06 | 2100 mm (out of range) | — | Expected: -1 / "Out of range" | — | — | |
| ACC-07 | 500 mm (dark surface) | 500 mm | ___ mm | ___ | ___ | |
| ACC-08 | 500 mm (bright sunlight) | 500 mm | ___ mm | ___ | ___ | |

**Acceptance Criterion:** Reading within ±5% of actual distance for 200–1900 mm range on a standard white/grey matte surface indoors.

**How to run:**
1. Flash firmware via `pio run -t upload`
2. Open Serial Monitor: `pio device monitor --baud 115200`
3. Power on device (GPIO 25 button) → Mode Select → Normal Mode
4. Place sensor at each test distance, press MEASURE button (GPIO 32)
5. Read value from OLED display AND Serial monitor (`showResult()` at `main.cpp:154`)
6. Compare to tape measure reference

**Expected Serial output:**
```
Ready - press PWR to start
```
After measurement, OLED shows result in mm (< 1000 mm) or in metres (≥ 1000 mm).

---

### 2.2 BLE Range & Packet Loss Test

**Objective:** Verify BLE GATT notification reliability at varying distances in a typical indoor environment.

**Background:** The ESP32 advertises as "SmartMeasure Pro" using Service UUID `4fafc201-1fb5-459e-8fcc-c5c9c331914b`. Each measurement sends a 4-byte NOTIFY packet. The Flutter app connects and listens via `BleManager.connectToDevice()` (`ble_manager.dart:18`).

**Equipment needed:**
- ESP32 device in BLE Mode
- Android/iOS phone with SmartMeasure app installed
- Tape measure or room with known dimensions
- Open area with no major obstructions

**Test Cases:**

| Test ID | Distance (m) | Total Packets Sent | Packets Received | Loss Rate (%) | Pass/Fail |
|---|---|---|---|---|---|
| BLE-01 | 1 m (same room, direct line) | 10 | ___ | ___ | |
| BLE-02 | 5 m (same room) | 10 | ___ | ___ | |
| BLE-03 | 10 m (same room) | 10 | ___ | ___ | |
| BLE-04 | 15 m (borderline range) | 10 | ___ | ___ | |
| BLE-05 | 5 m (through one wall) | 10 | ___ | ___ | |
| BLE-06 | Connection establishment time at 3 m | — | Time to connect: ___ s | — | |

**Acceptance Criterion:**
- 0% packet loss at 1–5 m
- ≤ 20% packet loss at 10 m
- Connection established within 12 seconds (app timeout is 12 s in `ble_connection_screen.dart`)

**How to run:**
1. Put device into BLE Mode (Power → Mode Select → DOWN → SELECT)
2. OLED shows "Waiting for app..." with "BLE" header
3. Open Flutter app → "Start Room Sketch" → BleConnectionScreen scans for "SmartMeasure Pro"
4. Walk to each test distance after connecting
5. Press MEASURE 10 times at each distance
6. Count how many packets appear in app (visible as wall measurements updating)
7. Record connection time from tapping "Connect" to "App Connected!" on OLED

**BLE Packet format (for verification):**
```
Byte 0: distance high byte  (dist >> 8) & 0xFF
Byte 1: distance low byte    dist & 0xFF
Byte 2: battery percent      0x50 = 80%
Byte 3: flags                0x01 = capturing, 0x00 = measurement sent
```
Source: `main.cpp:303–312` (`bleSend` function) and `ble_packet.dart:12–26`

---

### 2.3 Button Debounce Test

**Objective:** Verify that the 50 ms debounce filter in `updateButton()` (`main.cpp:61–72`) prevents accidental double-triggers on rapid/noisy button presses.

**Button pin mapping:**
- PWR: GPIO 25
- SEL: GPIO 27
- DOWN: GPIO 33
- MEASURE: GPIO 32

All buttons: INPUT_PULLUP — LOW when pressed, HIGH when released.

**Test Cases:**

| Test ID | Button | Action | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| DBN-01 | MEASURE (GPIO 32) | Press and release normally | 1 trigger | ___ triggers | |
| DBN-02 | MEASURE | Rapid press 5 times in 200 ms | 5 triggers (not more) | ___ triggers | |
| DBN-03 | MEASURE | Hold pressed 2 seconds | 1 trigger only (not continuous) | ___ triggers | |
| DBN-04 | SEL (GPIO 27) | Press and release at mode select | Move cursor once | ___ moves | |
| DBN-05 | DOWN (GPIO 33) | Press 3 times slowly | 3 menu moves | ___ moves | |
| DBN-06 | PWR (GPIO 25) | Short press at IDLE state | Screen turns off | ___ | |

**Debounce logic explanation:**
```cpp
// main.cpp:61-72
// trigger only fires on HIGH→LOW transition (button press)
// requires 50ms stable LOW before registering
if ((millis() - btn.lastChangeTime) > 50) {
    if (btn.stable == true && reading == false) btn.triggered = true;
    btn.stable = reading;
}
```

**How to run:**
1. Open Serial Monitor at 115200 baud
2. Add `Serial.println("BTN_MEAS triggered");` after each `btnMeas.triggered` check (or observe OLED state transitions)
3. Perform each button action from table above
4. Count state transitions on OLED display

---

### 2.4 Buzzer Feedback Test

**Objective:** Verify that buzzer patterns (`beep()` at `main.cpp:74–83`) give correct audio feedback for each system event.

**Buzzer pin:** GPIO 26

| Test ID | Event | Expected Pattern | Pass/Fail |
|---|---|---|---|
| BUZ-01 | Power on → MODE_SELECT | 1 short beep (80 ms) | |
| BUZ-02 | Mode selected | 2 short beeps | |
| BUZ-03 | Measurement saved to SD | 3 short beeps | |
| BUZ-04 | Out-of-range error | 1 long beep (600 ms) | |
| BUZ-05 | BLE app connected | 2 short beeps | |
| BUZ-06 | Cancel measurement (PWR press) | No beep expected (immediate state reset) | |

---

### 2.5 SD Card Data Persistence Test

**Objective:** Verify that measurements are correctly saved to `/readings.csv` on the micro SD card and survive power cycles.

**CSV format** (`saveToSD()` at `main.cpp:278–288`):
```
count,mm,millis
1,1234.5,123456789
2,5678.9,123457001
```

| Test ID | Action | Expected | Actual | Pass/Fail |
|---|---|---|---|---|
| SD-01 | Insert SD card, power on | `sdReady = true`, `/readings.csv` created if not exists | | |
| SD-02 | Take 3 measurements, save each | recordCount = 3, CSV has 3 data rows | | |
| SD-03 | Power off, power on again | recordCount reads from existing CSV (increments from last) | | |
| SD-04 | Enter HISTORY view | Shows last 3 records on OLED | | |
| SD-05 | Scroll history (SEL/DOWN) | Scrolls through all saved records | | |
| SD-06 | Remove SD card mid-session | `sdReady = false`, "SD not available" shown in history | | |
| SD-07 | Measure without SD card | Measurement works, save fails silently (returns false) | | |

**How to verify:** Remove SD card after test, insert into PC, open `/readings.csv` in any text editor.

---

### 2.6 OLED Display State Transition Test

**Objective:** Verify all OLED screens appear correctly at each state machine transition.

**Screen states** (`main.cpp:85–93`):
```
OFF → MODE_SELECT → NORMAL or BLE_MODE
NORMAL: IDLE → LASER_ON → MEASURED → (IDLE or HISTORY)
BLE_MODE: waiting → connected → BLE_LASER_ON → BLE_SENT → BLE_IDLE
```

| Test ID | State Transition | Expected OLED Content | Pass/Fail |
|---|---|---|---|
| OLED-01 | Power button → OFF to MODE_SELECT | "SmartMeasure Pro" title, "> Normal Mode" highlighted | |
| OLED-02 | DOWN button at MODE_SELECT | ">" moves to "Bluetooth Mode" | |
| OLED-03 | SELECT at Normal Mode | "NRM" header, "Press MEASURE to start", record count | |
| OLED-04 | MEASURE in IDLE | "** LASER ON **", "Aim at target" | |
| OLED-05 | MEASURE again in LASER_ON | "Measuring..." briefly, then result in mm | |
| OLED-06 | MEASURE at result (save) | ">> SAVED! <<" with value, total count | |
| OLED-07 | SELECT at MODE_SELECT (BLE) | "BLE" header, "Waiting for app..." | |
| OLED-08 | App connects via BLE | "App Connected!", "Select wall in app", "Sent: 0" | |
| OLED-09 | MEASURE in BLE mode | Laser fires, ">> WALL UPDATED <<" with mm value | |
| OLED-10 | App disconnects | "App disconnected", "Waiting for app..." | |

---

### 2.7 Firmware State Machine Test

**Objective:** Full end-to-end firmware walkthrough verifying state transitions and recovery from errors.

| Test ID | Sequence | Expected Behaviour | Pass/Fail |
|---|---|---|---|
| FSM-01 | Power on → Normal → measure valid range → save | Full cycle works, record saved | |
| FSM-02 | Power on → Normal → measure (>2000 mm) | "Out of range! Move closer" displayed, long beep | |
| FSM-03 | Power on → BLE Mode → wait 60s (no app) | Still advertising, no crash | |
| FSM-04 | BLE connected → disconnect phone → reconnect | Auto-advertises, reconnects cleanly | |
| FSM-05 | Normal mode → PWR at LASER_ON | Laser turns off, returns to IDLE | |
| FSM-06 | Power off from any state | Screen clears, device off | |

---

## 3. Software Testing

### 3.1 Unit Test — BLE Packet Decoder

**File under test:** [code/lib/ble/ble_packet.dart](../code/lib/ble/ble_packet.dart)

**What is being tested:** `BlePacket.fromBytes(List<int> bytes)` factory constructor.

**Decoding logic:**
```dart
// ble_packet.dart:20-25
final int dist = (bytes[0] << 8) | bytes[1];
distanceMm: dist.toDouble(),
batteryPercent: bytes[2],
isCapturing: (bytes[3] & 0x01) != 0,
```

**Test Cases — run manually or via `flutter test`:**

```dart
// Create test file: code/test/ble_packet_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:smart_measure/ble/ble_packet.dart';

void main() {
  group('BlePacket.fromBytes', () {

    test('TC-PKT-01: decodes 500 mm distance correctly', () {
      // 500 mm = 0x01F4 → bytes[0]=0x01, bytes[1]=0xF4
      final packet = BlePacket.fromBytes([0x01, 0xF4, 80, 0x00]);
      expect(packet.distanceMm, equals(500.0));
      expect(packet.batteryPercent, equals(80));
      expect(packet.isCapturing, isFalse);
    });

    test('TC-PKT-02: decodes 1000 mm distance correctly', () {
      // 1000 mm = 0x03E8 → bytes[0]=0x03, bytes[1]=0xE8
      final packet = BlePacket.fromBytes([0x03, 0xE8, 75, 0x00]);
      expect(packet.distanceMm, equals(1000.0));
      expect(packet.batteryPercent, equals(75));
      expect(packet.isCapturing, isFalse);
    });

    test('TC-PKT-03: decodes 1500 mm distance correctly', () {
      // 1500 mm = 0x05DC → bytes[0]=0x05, bytes[1]=0xDC
      final packet = BlePacket.fromBytes([0x05, 0xDC, 80, 0x00]);
      expect(packet.distanceMm, equals(1500.0));
    });

    test('TC-PKT-04: isCapturing flag = true when byte[3] bit0 = 1', () {
      final packet = BlePacket.fromBytes([0x01, 0xF4, 80, 0x01]);
      expect(packet.isCapturing, isTrue);
    });

    test('TC-PKT-05: isCapturing = false when byte[3] = 0x00', () {
      final packet = BlePacket.fromBytes([0x01, 0xF4, 80, 0x00]);
      expect(packet.isCapturing, isFalse);
    });

    test('TC-PKT-06: empty/short bytes list returns zero packet', () {
      // Guard in ble_packet.dart:13-18 handles bytes.length < 4
      final packet = BlePacket.fromBytes([]);
      expect(packet.distanceMm, equals(0.0));
      expect(packet.batteryPercent, equals(0));
      expect(packet.isCapturing, isFalse);
    });

    test('TC-PKT-07: 3 bytes (too short) returns zero packet', () {
      final packet = BlePacket.fromBytes([0x01, 0xF4, 80]);
      expect(packet.distanceMm, equals(0.0));
    });

    test('TC-PKT-08: maximum valid distance 1999 mm', () {
      // 1999 mm = 0x07CF → bytes[0]=0x07, bytes[1]=0xCF
      final packet = BlePacket.fromBytes([0x07, 0xCF, 80, 0x00]);
      expect(packet.distanceMm, equals(1999.0));
    });

    test('TC-PKT-09: zero distance (device error state)', () {
      final packet = BlePacket.fromBytes([0x00, 0x00, 80, 0x01]);
      expect(packet.distanceMm, equals(0.0));
      expect(packet.isCapturing, isTrue);
    });

    test('TC-PKT-10: battery 100%', () {
      final packet = BlePacket.fromBytes([0x01, 0xF4, 100, 0x00]);
      expect(packet.batteryPercent, equals(100));
    });
  });
}
```

**Run command:**
```bash
cd code
flutter test test/ble_packet_test.dart --reporter expanded
```

**Expected output:** All 10 tests PASS

---

### 3.2 Integration Test — BLE End-to-End Measurement Flow

**Objective:** Verify the complete flow from firmware → BLE notification → Flutter app display → wall label update in SketchScreen.

**Components involved:**
- ESP32 firmware (`main.cpp:303` `bleSend()`)
- `BleManager.connectToDevice()` (`ble_manager.dart:18`)
- `BlePacket.fromBytes()` (`ble_packet.dart:12`)
- `SketchScreen` wall measurement capture (`sketch_screen.dart`)

**Test Cases:**

| Test ID | Steps | Expected | Pass/Fail |
|---|---|---|---|
| INT-01 | Open app → "Start Room Sketch" → BleConnectionScreen | Scan starts, "Scanning..." shown | |
| INT-02 | ESP32 in BLE Mode → app finds "SmartMeasure Pro" | Connection established within 10 seconds | |
| INT-03 | Connected → OLED shows "App Connected!" with "Sent: 0" | App shows BLE connected indicator | |
| INT-04 | Draw 3-point shape in SketchScreen, tap on a wall, press BLE measure button | Wall selected highlighted | |
| INT-05 | Press MEASURE on ESP32 (GPIO 32) | OLED: laser pulses → "Measuring..." → ">> WALL UPDATED <<" | |
| INT-06 | After MEASURE pressed | App receives 4-byte packet, `packetStream` emits `BlePacket` | |
| INT-07 | Packet received with `isCapturing = false` | Wall label on sketch updates with real mm value | |
| INT-08 | Measure 4 walls of a room | All 4 walls show real mm labels | |
| INT-09 | Disconnect phone BT | OLED shows "App disconnected", app shows disconnected | |
| INT-10 | Re-enable phone BT | App can reconnect to same device | |

**Manual verification steps:**
1. Flash firmware, enter BLE Mode on device
2. Launch app → Skip login → "Start Room Sketch"
3. In BleConnectionScreen: wait for scan to find "SmartMeasure Pro"
4. Draw a simple 4-wall rectangle by tapping 4 points in SketchScreen
5. Tap wall 1 to select it
6. Press MEASURE button on ESP32
7. Observe: OLED shows flash sequence (3 × 150 ms) → "Measuring..." → result
8. Observe: App wall 1 label changes to actual measurement value
9. Repeat for walls 2, 3, 4
10. Tap "Save Project" → confirm appears in ProjectListScreen

---

### 3.3 API Test — Authentication Endpoints

**Base URL:** `https://e21-3yp-smart-laser-distance-meter-production.up.railway.app`

**Source:** [code/smartmeasure-backend/src/routes/auth.js](../code/smartmeasure-backend/src/routes/auth.js)

#### Health Check
```bash
curl -X GET https://e21-3yp-smart-laser-distance-meter-production.up.railway.app/health
```
Expected: `200 OK` with `{"status":"ok"}` or similar

---

#### TC-AUTH-01: Successful Registration
```bash
curl -X POST https://e21-3yp-smart-laser-distance-meter-production.up.railway.app/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123"}'
```
Expected response `201 Created`:
```json
{
  "message": "Registration successful",
  "user": { "id": 1, "email": "testuser@example.com" }
}
```

---

#### TC-AUTH-02: Duplicate Email Registration
```bash
curl -X POST .../auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123"}'
```
Expected response `409 Conflict`:
```json
{ "error": "Email already registered" }
```
Source: `auth.js:25-27` — checks existing users before insert

---

#### TC-AUTH-03: Password Too Short
```bash
curl -X POST .../auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com","password":"abc"}'
```
Expected response `400 Bad Request`:
```json
{ "error": "Password must be at least 6 characters" }
```
Source: `auth.js:17-19` — `password.length < 6` check

---

#### TC-AUTH-04: Missing Fields
```bash
curl -X POST .../auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```
Expected response `400 Bad Request`:
```json
{ "error": "Email and password are required" }
```

---

#### TC-AUTH-05: Successful Login
```bash
curl -X POST .../auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123"}'
```
Expected response `200 OK`:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "email": "testuser@example.com" }
}
```
Token expires in 7 days (source: `auth.js:77` — `expiresIn: '7d'`)

---

#### TC-AUTH-06: Wrong Password
```bash
curl -X POST .../auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"wrongpassword"}'
```
Expected response `401 Unauthorized`:
```json
{ "error": "Invalid email or password" }
```

---

#### TC-AUTH-07: Non-existent Email
```bash
curl -X POST .../auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","password":"anything"}'
```
Expected response `401 Unauthorized`:
```json
{ "error": "Invalid email or password" }
```
Note: Same error message for wrong password vs non-existent user — intentional security practice (prevents user enumeration).

---

#### TC-AUTH-08: Access Protected Route Without Token
```bash
curl -X GET .../projects
```
Expected response `401 Unauthorized`:
```json
{ "error": "Access denied. No token provided." }
```

---

### 3.4 API Test — Project & Sync Endpoints

**Prerequisites:** Use JWT token from TC-AUTH-05 login response.

Set token in shell variable:
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### TC-PROJ-01: List Projects (empty)
```bash
curl -X GET .../projects \
  -H "Authorization: Bearer $TOKEN"
```
Expected `200 OK`: `[]` (empty array for new user)

---

#### TC-PROJ-02: Upload Project (Full Sync)
Source: `sync.js:12–108` — uses PostgreSQL transaction

```bash
curl -X POST .../sync/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project": { "name": "Living Room", "local_id": 1 },
    "shapes": [
      {
        "shape_index": 0,
        "is_closed": true,
        "points": [
          {"order_index": 0, "x": 100.0, "y": 100.0},
          {"order_index": 1, "x": 500.0, "y": 100.0},
          {"order_index": 2, "x": 500.0, "y": 400.0},
          {"order_index": 3, "x": 100.0, "y": 400.0}
        ],
        "wall_real_mm": [
          {"wall_index": 0, "real_mm": 3500.0},
          {"wall_index": 1, "real_mm": 4200.0}
        ],
        "wall_angles": [
          {"order_index": 0, "angle": 0.0},
          {"order_index": 1, "angle": 90.0}
        ],
        "wall_lengths": [
          {"order_index": 0, "length": 400.0},
          {"order_index": 1, "length": 300.0}
        ]
      }
    ],
    "roomObjects": [
      {
        "object_id": "door_1",
        "type": "door",
        "wall_index": 0,
        "position_along": 0.5,
        "width_mm": 900.0,
        "height_mm": 2100.0,
        "elevation_mm": 0.0
      }
    ]
  }'
```

Expected `200 OK`:
```json
{
  "message": "Project uploaded successfully",
  "cloud_project_id": 1
}
```

---

#### TC-PROJ-03: List Projects (after upload)
```bash
curl -X GET .../projects \
  -H "Authorization: Bearer $TOKEN"
```
Expected: Array with 1 project: `[{"id":1,"name":"Living Room","local_id":1,...}]`

---

#### TC-PROJ-04: Download Project
```bash
curl -X GET .../sync/download/1 \
  -H "Authorization: Bearer $TOKEN"
```
Expected `200 OK`: Full project JSON with all shapes, points, wall measurements, room objects matching what was uploaded.

**Verify round-trip integrity:**
- `project.name` = "Living Room"
- `shapes[0].is_closed` = true
- `shapes[0].points` has 4 entries with correct x/y values
- `shapes[0].wall_real_mm` has wall_index=0 with real_mm=3500.0
- `roomObjects[0].type` = "door", width_mm = 900.0

---

#### TC-PROJ-05: Download Another User's Project (Ownership Check)
Login as a different user, attempt to download project ID 1:
```bash
curl -X GET .../sync/download/1 \
  -H "Authorization: Bearer $OTHER_USER_TOKEN"
```
Expected `404 Not Found`:
```json
{ "error": "Project not found" }
```
Source: `sync.js:117-122` — queries `WHERE id = $1 AND user_id = $2`

---

#### TC-PROJ-06: Delete Project
```bash
curl -X DELETE .../projects/1 \
  -H "Authorization: Bearer $TOKEN"
```
Expected: `200 OK` or `204 No Content`

Verify: `GET /projects` returns empty array again.

---

### 3.5 Cloud Sync Roundtrip Test

**Objective:** Verify that a complete project (sketch + wall measurements + doors/windows) can be uploaded, locally deleted, and fully restored with all data intact.

**Steps:**

1. **Create project in app:**
   - Login with valid account
   - Draw a 4-wall room (close shape)
   - Measure all 4 walls via BLE (or manually enter test values)
   - Add 1 door and 1 window to the sketch
   - Save locally → confirm in "My Projects"

2. **Upload to cloud:**
   - Tap "Cloud Backup" in SketchScreen toolbar
   - Verify upload toast/success message
   - Confirm via `GET /projects` (shows 1 project)

3. **Delete local data:**
   - Go to "My Projects"
   - Delete the project
   - Confirm it no longer appears

4. **Restore from cloud:**
   - Home → "Restore from Cloud"
   - CloudProjectsScreen shows the uploaded project
   - Tap to restore

5. **Verify restored data:**

| Item | Expected After Restore | Actual | Pass/Fail |
|---|---|---|---|
| Room shape (4 walls) | Polygon with 4 points intact | | |
| Wall real mm values | All 4 measurements match original | | |
| Door position | Same wall_index and position_along | | |
| Window dimensions | Same width_mm and height_mm | | |
| Room name/label | Same as before backup | | |
| PDF export works | Exports without error | | |

---

### 3.6 Offline Mode Test

**Objective:** Verify that the Flutter app works fully without internet connectivity (local SQLite only).

**Architecture:** All sketch data stored locally in `smartmeasure.db` (SQLite) via `DatabaseHelper`. Cloud sync is a separate, optional step. Source: `code/lib/database/database_helper.dart`.

| Test ID | Steps | Expected | Pass/Fail |
|---|---|---|---|
| OFF-01 | Disable Wi-Fi + mobile data → open app → tap "Skip for now" | Opens HomeScreen without login | |
| OFF-02 | Offline → "Start Room Sketch" → skip BLE | Opens SketchScreen with test mode | |
| OFF-03 | Offline → draw a room → "Save Project" | Saves to local SQLite, confirmation shown | |
| OFF-04 | Offline → "My Projects" | Shows locally saved projects | |
| OFF-05 | Offline → open saved project → continue sketching | Loads and edits normally | |
| OFF-06 | Offline → tap "Cloud Backup" | Shows error or "no internet" message | |
| OFF-07 | Re-enable internet → tap "Cloud Backup" | Upload succeeds | |
| OFF-08 | Login required for cloud, skip → offline sketch | Full sketch functionality with local save only | |

---

### 3.7 Sketch Feature Tests

**File under test:** [code/lib/sketch/sketch_screen.dart](../code/lib/sketch/sketch_screen.dart)

| Test ID | Feature | Steps | Expected | Pass/Fail |
|---|---|---|---|---|
| SKT-01 | Add point | Tap empty canvas area | New point appears at tap location | |
| SKT-02 | Close shape | Long-press on first point after ≥3 points | Polygon closes, fill visible | |
| SKT-03 | Angle snapping | Draw wall near 90° | Snaps to exactly 90° | |
| SKT-04 | Undo | Draw 3 points → undo 3 times | Each undo removes last point | |
| SKT-05 | Redo | After undo → redo | Points restored in order | |
| SKT-06 | Add door | Close shape → select wall → add door | Door symbol appears on wall | |
| SKT-07 | Add window | Close shape → select wall → add window | Window symbol appears on wall | |
| SKT-08 | Multi-room | Close shape 1 → tap "Add Room" → draw shape 2 | Second room drawn independently | |
| SKT-09 | Wall measurement | BLE connected → select wall → MEASURE | Wall label shows real mm value | |
| SKT-10 | 3D view | Tap "3D View" with closed room | Room3DScreen opens with 3D model | |
| SKT-11 | PDF export | "Export" → "PDF" | PDF generated, shareable | |
| SKT-12 | DXF export | "Export" → "DXF" | .dxf file generated (AutoCAD R2000) | |

---

### 3.8 Export Tests

**PDF Export** — Source: `code/lib/sketch/sketch_pdf_export.dart`

| Test ID | Check | Expected | Pass/Fail |
|---|---|---|---|
| EXP-01 | Generate PDF | No crash, PDF file created | |
| EXP-02 | Wall dimensions shown | All measured walls labeled in mm | |
| EXP-03 | Perimeter listed | Correct sum of all wall lengths | |
| EXP-04 | Area listed | Correct area calculation | |
| EXP-05 | Door/window markers | Visible on correct walls | |

**DXF Export** — Source: `code/lib/screens/dxf_exporter.dart`

| Test ID | Check | Expected | Pass/Fail |
|---|---|---|---|
| EXP-06 | Generate DXF | File with `.dxf` extension created | |
| EXP-07 | Open in AutoCAD / DXF viewer | Valid AutoCAD R2000 format (AC1015) | |
| EXP-08 | Scale correct | 5 mm per unit (as set in exporter) | |
| EXP-09 | Walls present | All drawn walls appear as LINE entities | |

---

## 4. Test Results Table

Fill this in during testing for milestone presentation:

| Test ID | Test Name | Result | Notes |
|---|---|---|---|
| ACC-01–08 | Sensor accuracy | | |
| BLE-01–06 | BLE range | | |
| DBN-01–06 | Button debounce | | |
| BUZ-01–06 | Buzzer patterns | | |
| SD-01–07 | SD card persistence | | |
| OLED-01–10 | Display states | | |
| FSM-01–06 | State machine | | |
| TC-PKT-01–10 | BLE packet decode | | |
| INT-01–10 | BLE integration | | |
| TC-AUTH-01–08 | Auth API | | |
| TC-PROJ-01–06 | Projects API | | |
| Sync roundtrip | Cloud sync | | |
| OFF-01–08 | Offline mode | | |
| SKT-01–12 | Sketch features | | |
| EXP-01–09 | Exports | | |

---

## 5. Known Limitations & Gaps

| Area | Limitation | Status |
|---|---|---|
| Sensor range | VL53L0X max ~2 m; walls farther than 2 m return error | Known limitation |
| Battery monitoring | Battery % hardcoded to 80% in firmware (`main.cpp:309`: `packet[2] = 80`) | Future work |
| BLE encryption | BLE packets are unencrypted; proximity sniffing possible | Future work |
| Rate limiting | No rate limiting on `/auth/register` or `/auth/login` | Security gap |
| IMU integration | MPU6050/BNO055 referenced in docs but not in firmware | Not yet implemented |
| Riverpod | Imported in `pubspec.yaml` but not used in codebase | Technical debt |
| Refresh tokens | JWT is 7-day, no refresh mechanism; users re-login after expiry | Future work |
| Automated tests | No automated test suite exists yet; all testing is manual | Future work |

---

*Document prepared for CO321/CO324/CO325/CO328 Milestone 2 — Week 14 Progress Review*
*Project: Smart Laser Distance Meter (e21-3yp)*
