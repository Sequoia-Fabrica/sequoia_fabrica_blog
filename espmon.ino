/*
  LiFePO4 12V pack monitor (INA228) — MPPT + always-on load profile

  Scenario:
    - Continuous 2–4 W load; MPPT charger.
    - Pack rarely/never “rests,” so OCV→SoC is unreliable (surface charge, ripple).
    - Truth source: reaching/holding CV (absorb) with near-zero NET battery current.

  Strategy:
    1) Coulomb count SoC with a modest efficiency ETA.
    2) Learn a tiny zero-bias ONLY under super-strict conditions so we never “learn” real load.
    3) Recalibrate SoC to 100% ONLY after sustained CV (voltage high) with tail current near zero.

  What we DO NOT do here:
    - No OCV blending at “rest” (there isn’t real rest).
    - No “float hold” nudging (prevents creeping to 100% while floating with a background load).

  Outputs:
    v [V], i [mA], p [mW], sh_mV [mV], q_C [C], e_J [J], soc [0..1]

  Dependencies:
    Adafruit_INA228 v3.x
    ArduinoJson v7.x
*/

#include <Arduino.h>
#include <Adafruit_INA228.h>
#include <ArduinoJson.h>

// ---- Pack & shunt parameters ----
constexpr float SHUNT_OHMS   = 0.00075f;             // 100 A / 75 mV external shunt
constexpr float PACK_CAP_AH  = 10.0f;                // nameplate capacity; tune from a real discharge
constexpr float PACK_CAP_C   = PACK_CAP_AH * 3600.0f;

// ---- Integration controls ----
constexpr float ETA          = 0.995f;               // LiFePO4 charge efficiency
constexpr float DT_MAX_S     = 2.0f;                 // cap dt across stalls

// ---- Bias learning (strict so we DO NOT learn your constant load) ----
// We gate bias learning behind BOTH: very small current AND negligible ΔV.
// Also clamp max learned bias magnitude to a tiny window.
constexpr float IDLE_THRESH_mA = 15.0f;              // far below your 2–4 W load (150–300 mA)
constexpr float V_REST_JITTER  = 0.005f;             // ~5 mV; demands a very flat bus
constexpr float BIAS_EMA       = 0.05f;              // slow EMA (rarely triggers anyway)
constexpr float BIAS_MAX_ABS_mA= 20.0f;              // never “learn” >±20 mA

// ---- CV (absorb) detection for full-charge snap ----
// Pick thresholds to match your MPPT’s absorb setpoint & tail behavior.
// We require: high voltage for long enough, and NET battery current near zero.
// Note: “near zero” means charger is covering the house load and only trickle flows into the pack.
constexpr float V_CV_MIN      = 14.1f;               // start of absorb/CV region (tune to your charger)
constexpr unsigned long T_CV_MS = 10UL*60UL*1000UL;  // stay in CV ≥10 min
constexpr float I_TAIL_ABS_mA = 100.0f;              // |battery current| ≤ 100 mA ⇒ tail/near-zero

// ---- Globals ----
Adafruit_INA228 ina;
StaticJsonDocument<256> doc;

double soc = 0.80;             // [0..1]
double Q_C = 0.0;              // Coulombs since last rebase
double E_J = 0.0;              // Joules since start
float  i_bias_mA = 0.0f;       // learned zero offset (tiny by design)

unsigned long t_prev_ms = 0;
unsigned long cvStart_ms = 0;
double v_prev = 0.0;

// Rebase SoC and zero the delta integrator (keep E_J continuous).
static inline void rebaseToSOC(double s){
  soc = constrain(s, 0.0, 1.0);
  Q_C = 0.0;
}

void setup(){
  Serial.begin(115200);
  while(!Serial) delay(5);

  if(!ina.begin()){ Serial.println(F("INA228 not found")); while(1) delay(100); }
  ina.setShunt(SHUNT_OHMS, 100.0);                   // expected max A (for scaling)
  ina.setAveragingCount(INA228_COUNT_16);            // trade bandwidth for lower noise
  ina.setVoltageConversionTime(INA228_TIME_150_us);
  ina.setCurrentConversionTime(INA228_TIME_280_us);

  delay(50);
  t_prev_ms = millis();

  // No OCV init: with an always-on load this is likely wrong; start from last known or 80%.
  // If you have NVRAM/EEPROM, persist/restore SoC across reboots instead of hardcoding 0.80.
}

void loop(){
  // --- dt and clamp ---
  unsigned long now = millis();
  float dt = (now - t_prev_ms) * 1e-3f;
  t_prev_ms = now;
  if (dt <= 0) return;
  if (dt > DT_MAX_S) dt = DT_MAX_S;

  // --- Measurements ---
  double v = ina.getBusVoltage_V();      // [V]
  double i_raw_mA = ina.getCurrent_mA(); // [mA], charging > 0 with this wiring

  // --- Very strict "rest" detector (almost never true in this profile) ---
  bool ultra_rest = (fabs(i_raw_mA) < IDLE_THRESH_mA) && (fabs(v - v_prev) < V_REST_JITTER);
  v_prev = v;

  // --- Bias learning (only under ultra_rest, and clamped small) ---
  if (ultra_rest){
    i_bias_mA = (1.0f - BIAS_EMA)*i_bias_mA + BIAS_EMA*(float)i_raw_mA;
    if (i_bias_mA >  BIAS_MAX_ABS_mA) i_bias_mA =  BIAS_MAX_ABS_mA;
    if (i_bias_mA < -BIAS_MAX_ABS_mA) i_bias_mA = -BIAS_MAX_ABS_mA;
  }

  // --- Bias-corrected current & power ---
  double i_mA = i_raw_mA - i_bias_mA;   // battery current (charging > 0)
  double i_A  = i_mA * 1e-3;
  double p_W  = v * i_A;
  double p_mW = p_W * 1e3;

  // --- Integrate charge & energy ---
  Q_C += (i_A * dt) * ETA;              // Coulombs (efficiency applies to charge)
  E_J += (p_W * dt);                    // Joules

  // --- Update SoC from charge integration ---
  soc = constrain(soc + ((i_A * dt) * ETA) / PACK_CAP_C, 0.0, 1.0);

  // --- Full-charge snap using CV detection (the ONLY recalibration in this profile) ---
  // Conditions:
  //   - Voltage ≥ V_CV_MIN (absorb plateau implies dV/dt small, controller holds voltage)
  //   - |battery current| ≤ I_TAIL_ABS_mA (charger is supplying the house load; pack tail current is tiny)
  //   - Held for T_CV_MS continuously
  if (v >= V_CV_MIN && fabs(i_mA) <= I_TAIL_ABS_mA) {
    if (cvStart_ms == 0) cvStart_ms = now;
    if (now - cvStart_ms >= T_CV_MS) {
      rebaseToSOC(1.0);                 // We declare “full” after sustained CV with tail current
    }
  } else {
    cvStart_ms = 0;                      // Break the CV dwell if either condition fails
  }

  // --- Derived shunt mV for UI symmetry (Kelvin-safe via I*R) ---
  double sh_mV = i_mA * 1e-3 * SHUNT_OHMS * 1000.0;

  // --- JSON telemetry (1 Hz) ---
  doc.clear();
  doc["ms"]    = now;
  doc["v"]     = v;
  doc["i"]     = i_mA;
  doc["p"]     = p_mW;
  doc["sh_mV"] = sh_mV;
  doc["q_C"]   = Q_C;
  doc["e_J"]   = E_J;
  doc["soc"]   = soc;
  serializeJson(doc, Serial); Serial.println();

  delay(1000);
}

