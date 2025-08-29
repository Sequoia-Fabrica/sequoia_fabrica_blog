/*
  LiFePO4 12V pack monitor (INA228) — SoC with MPPT + always-on load
  Updates (data-driven):
    - ETA only on charge; ±10 mA deadband
    - CV plateau relaxed: |dV/dt| ≤ 30 mV/s (from 1 mV/s)
    - Tail threshold raised: |i_tail| ≤ 220 mA (EMA)
    - CV bucket leak reduced to 0.05 (more tolerant to PWM/clouds)
    - Optional float-based snap: V≥13.7 V for ≥60 min with |i| ≤150 mA, max 1 snap/day
    - Persist soc and i_bias_mA to NVS

  Requires:
    Adafruit_INA228 v3.x
    ArduinoJson v7.x
*/

#include <Arduino.h>
#include <Adafruit_INA228.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ---------- Pack & shunt ----------
constexpr float SHUNT_OHMS = 0.00075f; // 100 A / 75 mV
constexpr float PACK_CAP_AH = 10.0f;
constexpr float PACK_CAP_C = PACK_CAP_AH * 3600.0f;

// ---------- Integration ----------
constexpr float ETA_CHG = 0.995f; // charge efficiency (charge only)
constexpr float DT_MAX_S = 2.0f;
constexpr float INTEG_DEADBAND_mA = 10.0f;

// ---------- Filtering (EMAs) ----------
constexpr float I_EMA_ALPHA = 0.15f;    // current
constexpr float V_EMA_ALPHA = 0.10f;    // voltage
constexpr float TAIL_EMA_ALPHA = 0.10f; // tail current
constexpr float DVDT_EMA_ALPHA = 0.10f; // slope

// ---------- Bias learning ----------
constexpr float BIAS_LEARN_mA = 40.0f;      // near-zero region
constexpr float V_REST_JITTER = 0.02f;      // 20 mV
constexpr uint32_t BIAS_DWELL_MS = 30000UL; // 30 s quiet
constexpr float BIAS_EMA = 0.02f;
constexpr float BIAS_MAX_ABS_mA = 20.0f;

// ---------- CV (absorb) detection (relaxed) ----------
constexpr float V_CV_MIN = 14.10f;
constexpr float I_TAIL_ABS_mA = 220.0f;            // was 180 mA
constexpr float DVDT_ABS_VpS = 0.030f;             // 30 mV/s (was 1 mV/s)
constexpr uint32_t T_CV_MS = 10UL * 60UL * 1000UL; // 10 min
constexpr float CV_BUCKET_FILL = 1.0f;
constexpr float CV_BUCKET_LEAK = 0.05f; // gentler leak

// ---------- Float-based snap (guarded) ----------
constexpr float V_FLOAT_MIN = 13.70f;
constexpr uint32_t T_FLOAT_MS = 60UL * 60UL * 1000UL; // 60 min
constexpr float I_FLOAT_ABS_mA = 150.0f;
constexpr float FLOAT_BUCKET_FILL = 1.0f;
constexpr float FLOAT_BUCKET_LEAK = 0.05f;

// ---------- Persistence ----------
constexpr uint32_t SAVE_INTERVAL_MS = 10UL * 60UL * 1000UL;

Adafruit_INA228 ina;
StaticJsonDocument<256> doc;
Preferences prefs;

// ---------- State ----------
double soc = 0.80;
double Q_C = 0.0;
double E_J = 0.0;
float i_bias_mA = 0.0f;

unsigned long t_prev_ms = 0;
unsigned long biasQuietStart_ms = 0;

double v_prev = 0.0;
double i_ema_mA = 0.0;
double v_ema_V = 0.0;
double i_tail_ema_mA = 0.0;
double dvdt_ema = 0.0;

// Dwell buckets
double cv_bucket_ms = 0.0;
double float_bucket_ms = 0.0;

// Persistence cadence + daily snap guard
unsigned long lastSave_ms = 0;
int lastSnapY = -1, lastSnapM = -1, lastSnapD = -1;

static inline void rebaseToSOC(double s)
{
  soc = constrain(s, 0.0, 1.0);
  Q_C = 0.0;
}

static inline void today(int &Y, int &M, int &D)
{
  time_t t = time(nullptr);
  struct tm *tmv = localtime(&t);
  if (!tmv)
  {
    Y = M = D = -1;
    return;
  }
  Y = tmv->tm_year + 1900;
  M = tmv->tm_mon + 1;
  D = tmv->tm_mday;
}

static inline bool snappedToday()
{
  int Y, M, D;
  today(Y, M, D);
  return (Y == lastSnapY && M == lastSnapM && D == lastSnapD);
}

static inline void markSnapToday()
{
  today(lastSnapY, lastSnapM, lastSnapD);
}

void loadState()
{
  prefs.begin("pm", true);
  if (prefs.isKey("soc"))
    soc = prefs.getDouble("soc", soc);
  if (prefs.isKey("i_bias_mA"))
    i_bias_mA = prefs.getFloat("i_bias_mA", i_bias_mA);
  if (prefs.isKey("snapY"))
    lastSnapY = prefs.getInt("snapY", lastSnapY);
  if (prefs.isKey("snapM"))
    lastSnapM = prefs.getInt("snapM", lastSnapM);
  if (prefs.isKey("snapD"))
    lastSnapD = prefs.getInt("snapD", lastSnapD);
  prefs.end();
}

void saveState()
{
  prefs.begin("pm", false);
  prefs.putDouble("soc", soc);
  prefs.putFloat("i_bias_mA", i_bias_mA);
  prefs.putInt("snapY", lastSnapY);
  prefs.putInt("snapM", lastSnapM);
  prefs.putInt("snapD", lastSnapD);
  prefs.end();
}

void setup()
{
  Serial.begin(115200);
  while (!Serial)
    delay(5);

  loadState();

  if (!ina.begin())
  {
    Serial.println(F("INA228 not found"));
    while (1)
      delay(100);
  }
  ina.setShunt(SHUNT_OHMS, 100.0);
  ina.setAveragingCount(INA228_COUNT_16);
  ina.setVoltageConversionTime(INA228_TIME_150_us);
  ina.setCurrentConversionTime(INA228_TIME_280_us);

  delay(50);
  t_prev_ms = millis();

  double v0 = ina.getBusVoltage_V();
  double i0 = ina.getCurrent_mA();
  v_ema_V = v0;
  i_ema_mA = i0;
  i_tail_ema_mA = i0;
  v_prev = v0;
  lastSave_ms = t_prev_ms;
}

void loop()
{
  unsigned long now = millis();
  float dt = (now - t_prev_ms) * 1e-3f;
  t_prev_ms = now;
  if (dt <= 0)
    return;
  if (dt > DT_MAX_S)
    dt = DT_MAX_S;

  double v = ina.getBusVoltage_V();
  double i_raw_mA = ina.getCurrent_mA();

  // EMAs
  v_ema_V = (1.0 - V_EMA_ALPHA) * v_ema_V + V_EMA_ALPHA * v;
  i_ema_mA = (1.0 - I_EMA_ALPHA) * i_ema_mA + I_EMA_ALPHA * i_raw_mA;

  // dV/dt (EMA on slope)
  double dv = v_ema_V - v_prev;
  double dvdt = dv / max(dt, 1e-6f);
  dvdt_ema = (1.0 - DVDT_EMA_ALPHA) * dvdt_ema + DVDT_EMA_ALPHA * dvdt;
  v_prev = v_ema_V;

  // Bias learning (quiet window)
  bool near_zero_I = fabs(i_ema_mA) < BIAS_LEARN_mA;
  bool flat_bus = fabs(v - v_ema_V) < V_REST_JITTER;
  if (near_zero_I && flat_bus)
  {
    if (biasQuietStart_ms == 0)
      biasQuietStart_ms = now;
    if (now - biasQuietStart_ms >= BIAS_DWELL_MS)
    {
      i_bias_mA = (1.0f - BIAS_EMA) * i_bias_mA + BIAS_EMA * (float)i_raw_mA;
      if (i_bias_mA > BIAS_MAX_ABS_mA)
        i_bias_mA = BIAS_MAX_ABS_mA;
      if (i_bias_mA < -BIAS_MAX_ABS_mA)
        i_bias_mA = -BIAS_MAX_ABS_mA;
    }
  }
  else
  {
    biasQuietStart_ms = 0;
  }

  // Bias-corrected current & deadband
  double i_corr_mA = i_raw_mA - i_bias_mA;
  double i_A = (fabs(i_corr_mA) < INTEG_DEADBAND_mA) ? 0.0 : i_corr_mA * 1e-3;

  double p_W = v * i_A;
  double p_mW = p_W * 1e3;

  // Integrate (ETA on charge only)
  double eta = (i_A > 0.0) ? ETA_CHG : 1.0;
  Q_C += (i_A * dt) * eta;
  E_J += (p_W * dt);
  soc = constrain(soc + ((i_A * dt) * eta) / PACK_CAP_C, 0.0, 1.0);

  // Tail current EMA (for CV)
  i_tail_ema_mA = (1.0 - TAIL_EMA_ALPHA) * i_tail_ema_mA + TAIL_EMA_ALPHA * i_corr_mA;

  // CV detection (relaxed)
  bool cvV = (v_ema_V >= V_CV_MIN);
  bool cvDV = (fabs(dvdt_ema) <= DVDT_ABS_VpS);
  bool cvI = (fabs(i_tail_ema_mA) <= I_TAIL_ABS_mA);
  bool inCV = cvV && cvDV && cvI;

  double dms = dt * 1000.0;
  if (inCV)
    cv_bucket_ms += CV_BUCKET_FILL * dms;
  else
    cv_bucket_ms = max(0.0, cv_bucket_ms - CV_BUCKET_LEAK * dms);

  bool didSnap = false;
  if (cv_bucket_ms >= T_CV_MS)
  {
    rebaseToSOC(1.0);
    cv_bucket_ms = 0.0;
    didSnap = true;
  }

  // Float-based snap (once/day, guarded)
  bool floatV = (v_ema_V >= V_FLOAT_MIN);
  bool floatI = (fabs(i_ema_mA) <= I_FLOAT_ABS_mA);
  bool inFloat = floatV && floatI;

  if (inFloat)
    float_bucket_ms += FLOAT_BUCKET_FILL * dms;
  else
    float_bucket_ms = max(0.0, float_bucket_ms - FLOAT_BUCKET_LEAK * dms);

  if (!didSnap && !snappedToday() && float_bucket_ms >= T_FLOAT_MS)
  {
    rebaseToSOC(1.0);
    float_bucket_ms = 0.0;
    markSnapToday();
    didSnap = true;
  }

  // Persist periodically and on snap
  if (didSnap || (now - lastSave_ms >= SAVE_INTERVAL_MS))
  {
    saveState();
    lastSave_ms = now;
  }

  // Telemetry
  double sh_mV = i_corr_mA * 1e-3 * SHUNT_OHMS * 1000.0;
  doc.clear();
  doc["ms"] = now;
  doc["v"] = v;
  doc["i"] = i_corr_mA;
  doc["p"] = p_mW;
  doc["sh_mV"] = sh_mV;
  doc["q_C"] = Q_C;
  doc["e_J"] = E_J;
  doc["soc"] = soc;
  doc["v_ema"] = v_ema_V;
  doc["i_ema"] = i_ema_mA;
  doc["i_bias"] = i_bias_mA;
  doc["dvdt"] = dvdt_ema;
  doc["cv_ms"] = (uint32_t)cv_bucket_ms;
  doc["flt_ms"] = (uint32_t)float_bucket_ms;
  doc["snapped_today"] = snappedToday();
  serializeJson(doc, Serial);
  Serial.println();

  delay(1000);
}
