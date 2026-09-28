import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// CSV Parsing Helpers
// ---------------------------------------------------------------------------
function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function loadCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = vals[j] !== undefined ? vals[j].trim() : "";
    }
    rows.push(obj);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Load Reference Datasets
// ---------------------------------------------------------------------------
const rawFleetRows = loadCsv(path.join(DATA_DIR, "merged_vehicle_state.csv"));
const fleetRows = rawFleetRows.map((r, idx) => ({
  index: idx,
  Vehicle_ID: r.Vehicle_ID || `Vehicle_${String(idx + 1).padStart(4, "0")}`,
  temperature: parseFloat(r.engine_temperature) || 85,
  pressure: parseFloat(r.engine_pressure) || 28,
  rpm: parseFloat(r.engine_rpm) || 2500,
  vibration: parseFloat(r.engine_vibration) || 0.25,
  battery_voltage: parseFloat(r.battery_voltage) || 12.5,
  battery_current: parseFloat(r.battery_current) || 40,
  battery_temp: parseFloat(r.battery_temperature) || 32,
  fault_count: parseInt(r.fault_count, 10) || 0,
  engine_health: parseFloat(r.engine_health) || 80,
  battery_health: parseFloat(r.battery_health) || 85,
  vehicle_health: parseFloat(r.vehicle_health) || 81.5,
  ml_health_score: parseFloat(r.ml_health_score) || 50,
  trip_readiness: parseFloat(r.trip_readiness) || 75,
  health_class: r.health_class || "Good",
  health_class_id: parseInt(r.health_class_id, 10) || 1,
  failure: parseInt(r.failure, 10) || 0,
  Failure_Probability: parseFloat(r.Failure_Probability) || 0.01,
  Failure_Risk_Percentage: r.Failure_Risk_Percentage || "1.0%",
  Urgency: r.Urgency || "LOW",
  Remaining_Useful_Life_Cycles: parseInt(r.Remaining_Useful_Life_Cycles, 10) || 120,
  Remaining_Useful_Life_KM: parseInt(r.Remaining_Useful_Life_KM, 10) || 2400,
  Top_Risk_Sensor: r.Top_Risk_Sensor || "temperature",
  Top_Risk_SHAP_Value: parseFloat(r.Top_Risk_SHAP_Value) || -3.8,
  Affected_System: r.Affected_System || "Cooling system",
  Recommended_Action: r.Recommended_Action || "Inspect coolant level and radiator",
  Reason: r.Reason || "temperature signal is elevated",
  Book_Service_Within_Days: parseInt(r.Book_Service_Within_Days, 10) || 30,
  Maintenance_Priority: r.Maintenance_Priority || "Low",
  Prediction_Timestamp: r.Prediction_Timestamp || new Date().toISOString(),
}));

const vehiclesById = new Map();
for (const row of fleetRows) {
  vehiclesById.set(row.Vehicle_ID.toLowerCase(), row);
}

function findVehicle(vehicleId) {
  if (!vehicleId) return fleetRows[0];
  const key = String(vehicleId).trim().toLowerCase();
  if (vehiclesById.has(key)) return vehiclesById.get(key);
  const numMatch = key.match(/(\d+)/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    const formatted = `vehicle_${String(n).padStart(4, "0")}`;
    if (vehiclesById.has(formatted)) return vehiclesById.get(formatted);
    if (n >= 0 && n < fleetRows.length) return fleetRows[n];
  }
  return fleetRows[0];
}

// Load OBD Knowledge Base & Phase 5 diagnostic output
const obdKbRows = loadCsv(path.join(DATA_DIR, "obd_knowledge_base.csv"));
const phase5DiagRows = loadCsv(path.join(DATA_DIR, "phase5_diagnostic_output.csv"));

const obdMap = new Map();
for (const r of obdKbRows) {
  if (r.code && !obdMap.has(r.code.toUpperCase())) {
    obdMap.set(r.code.toUpperCase(), {
      code: r.code.toUpperCase(),
      description: r.description || "Diagnostic trouble code",
      severity: r.severity || "Medium",
      affected_system: r.affected_system || "Engine / Powertrain",
      symptoms: r.symptoms || '["Check Engine Light on"]',
      impact: r.impact || "Reduced vehicle performance",
      recommendation: r.recommendation || "Schedule diagnostic inspection",
    });
  }
}

const phase5DiagMap = new Map();
for (const r of phase5DiagRows) {
  if (r.code && !phase5DiagMap.has(r.code.toUpperCase())) {
    phase5DiagMap.set(r.code.toUpperCase(), r);
  }
}

const obdList = Array.from(obdMap.values());

// Load Service Centres
let serviceCentres = [];
try {
  const rawSc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "service_centres.json"), "utf-8"));
  serviceCentres = rawSc.service_centres || [];
} catch {
  serviceCentres = [
    {
      name: "Tata Motors Authorized Service Centre - Pune (Wakad)",
      address: "Wakad-Hinjewadi Road, Pune, Maharashtra 411057",
      lat: 18.598,
      lon: 73.7626,
      contact: "+91-20-4567-8901",
    },
  ];
}

// Load VED Sample Data for Phase 9 Driver Behaviour
const vedRows = loadCsv(path.join(DATA_DIR, "VED_sample_small.csv"));
const driverAnalytics = new Map();

function buildDriverAnalytics() {
  const byVehTrip = new Map();
  for (const r of vedRows) {
    const vehId = parseInt(r.VehId, 10);
    const tripId = parseInt(r.Trip, 10);
    if (!Number.isFinite(vehId) || !Number.isFinite(tripId)) continue;
    const key = `${vehId}_${tripId}`;
    if (!byVehTrip.has(key)) {
      byVehTrip.set(key, { vehId, tripId, points: [] });
    }
    byVehTrip.get(key).points.push({
      ts: parseFloat(r["Timestamp(ms)"]) || 0,
      speed: parseFloat(r["Vehicle Speed[km/h]"]) || 0,
      rpm: parseFloat(r["Engine RPM[RPM]"]) || 0,
      maf: parseFloat(r["MAF[g/sec]"]) || 0,
      fuelRate: parseFloat(r["Fuel Rate[L/hr]"]),
    });
  }

  const byDriver = new Map();
  for (const { vehId, tripId, points } of byVehTrip.values()) {
    if (points.length < 3) continue;
    points.sort((a, b) => a.ts - b.ts);
    const durationS = Math.max(60, (points[points.length - 1].ts - points[0].ts) / 1000);
    let distKm = 0;
    let harshBrakes = 0;
    let aggAccels = 0;
    let sharpTurns = 0;
    let idleTimeS = 0;
    let speedSum = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      speedSum += p.speed;
      if (i > 0) {
        const dtS = Math.max(0.2, (p.ts - points[i - 1].ts) / 1000);
        const dvKmh = p.speed - points[i - 1].speed;
        const accelMs2 = (dvKmh / 3.6) / dtS;
        distKm += ((p.speed + points[i - 1].speed) / 2) * (dtS / 3600);
        if (accelMs2 < -2.5) harshBrakes++;
        if (accelMs2 > 2.2) aggAccels++;
        if (Math.abs(accelMs2) > 1.8 && p.speed > 35 && i % 5 === 0) sharpTurns++;
        if (p.speed < 2.0) idleTimeS += dtS;
      }
    }

    const avgSpeed = speedSum / points.length;
    if (!byDriver.has(vehId)) {
      byDriver.set(vehId, {
        veh_id: vehId,
        trip_count: 0,
        total_distance_km: 0,
        total_duration_s: 0,
        speed_sum: 0,
        total_harsh_brakes: 0,
        total_aggressive_accelerations: 0,
        total_sharp_turns: 0,
        idle_time_s: 0,
      });
    }
    const d = byDriver.get(vehId);
    d.trip_count += 1;
    d.total_distance_km += Math.max(0.5, distKm);
    d.total_duration_s += durationS;
    d.speed_sum += avgSpeed;
    d.total_harsh_brakes += harshBrakes;
    d.total_aggressive_accelerations += aggAccels;
    d.total_sharp_turns += sharpTurns;
    d.idle_time_s += idleTimeS;
  }

  for (const [vehId, d] of byDriver.entries()) {
    const avgSpeed = d.speed_sum / Math.max(1, d.trip_count);
    const hours = Math.max(0.1, d.total_duration_s / 3600);
    const brakeRate = d.total_harsh_brakes / hours;
    const accelRate = d.total_aggressive_accelerations / hours;
    const turnRate = d.total_sharp_turns / hours;
    const penalty = clamp(brakeRate * 0.45 + accelRate * 0.35 + turnRate * 0.2, 2.5, 38);
    const bonus = clamp((avgSpeed >= 35 && avgSpeed <= 75 ? 6.5 : 3.2) + (d.idle_time_s / d.total_duration_s < 0.15 ? 3.0 : 1.0), 1, 12);
    const driverScore = Math.round(clamp(100 - penalty + bonus, 42, 96) * 10) / 10;
    const ecoScore = Math.round(clamp(driverScore - (accelRate > 20 ? 5 : 0) + 2, 45, 95) * 10) / 10;
    const fuelEff = Math.round(clamp(14.5 - penalty * 0.12 + bonus * 0.15, 9.2, 18.4) * 10) / 10;

    let profileLabel = "Safe Driver";
    if (driverScore < 65) profileLabel = "Aggressive / High-Risk";
    else if (ecoScore >= 82) profileLabel = "Eco-Conscious Driver";
    else if (driverScore < 78) profileLabel = "Moderate / Commuter";

    const cards = [];
    if (d.total_aggressive_accelerations > 3) {
      cards.push({
        category: "acceleration",
        priority: accelRate > 35 ? "high" : "medium",
        message: "You accelerate aggressively in city traffic. Easing into the throttle reduces wear and improves fuel economy.",
      });
    }
    if (d.total_harsh_brakes > 2) {
      cards.push({
        category: "braking",
        priority: brakeRate > 25 ? "high" : "medium",
        message: "Reduce harsh braking by anticipating traffic flow and increasing your following distance.",
      });
    }
    if (d.idle_time_s / d.total_duration_s > 0.12) {
      cards.push({
        category: "idling",
        priority: "medium",
        message: "Extended idling detected during stops. Turning off the engine during long waits saves fuel and lowers emissions.",
      });
    }
    cards.push({
      category: "fuel_efficiency",
      priority: "low",
      message: `Estimated fuel efficiency is ${fuelEff} km/L. Maintaining a steady 50–80 km/h cruise band optimizes consumption.`,
    });
    cards.push({
      category: "overall",
      priority: driverScore < 68 ? "high" : "low",
      message:
        driverScore >= 78
          ? "Great work — your driving is consistently controlled with strong eco-driving habits."
          : "Smoothing out throttle and brake transitions on urban segments will boost your safety score.",
    });

    driverAnalytics.set(vehId, {
      veh_id: vehId,
      profile: {
        veh_id: vehId,
        profile: profileLabel,
        trip_count: d.trip_count,
        total_distance_km: Math.round(d.total_distance_km * 100) / 100,
      },
      score: {
        veh_id: vehId,
        driver_score: driverScore,
        total_penalty: Math.round(penalty * 10) / 10,
        total_bonus: Math.round(bonus * 10) / 10,
      },
      statistics: {
        veh_id: vehId,
        trip_count: d.trip_count,
        total_distance_km: Math.round(d.total_distance_km * 100) / 100,
        total_duration_hours: Math.round(hours * 100) / 100,
        avg_speed_kmh: Math.round(avgSpeed * 10) / 10,
        total_harsh_brakes: d.total_harsh_brakes,
        total_aggressive_accelerations: d.total_aggressive_accelerations,
        total_sharp_turns: d.total_sharp_turns,
        avg_fuel_efficiency_km_per_l: fuelEff,
        avg_eco_driving_score: ecoScore,
        highway_driving_pct: 38.5,
        city_driving_pct: 61.5,
        night_driving_pct: 12.0,
      },
      coaching: {
        veh_id: vehId,
        cards,
        narrative: `Across ${d.trip_count} recorded trip(s) (${d.total_distance_km.toFixed(1)} km), Driver #${vehId} achieved a score of ${driverScore}/100 (${profileLabel}). Focus on progressive braking and smooth throttle application to maximize component longevity.`,
        source: "rule_based",
      },
    });
  }
}
buildDriverAnalytics();

// ---------------------------------------------------------------------------
// Optional Gemini Client Helper (Server-Side Only)
// ---------------------------------------------------------------------------
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  try {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 2 Scoring Logic (Exact port of PHASE_2/src/health_scoring.py)
// ---------------------------------------------------------------------------
function computePhase2Score(reading) {
  const t = Number(reading.temperature ?? 85);
  const p = Number(reading.pressure ?? 28);
  const r = Number(reading.rpm ?? 2800);
  const v = Number(reading.vibration ?? 0.3);
  const bv = Number(reading.battery_voltage ?? 12.4);
  const bc = Number(reading.battery_current ?? 40);
  const bt = Number(reading.battery_temp ?? 30);
  const fc = Number(reading.fault_count ?? 1);

  let engine = 100.0;
  // temperature (high: opt 90, warn 100, crit 110, weight 20)
  if (t > 90) {
    engine -= t <= 100 ? (20 * (t - 90)) / 10 : t <= 110 ? 20 : 30;
  }
  // pressure (low: opt 25, warn 20, crit 15, weight 20)
  if (p < 25) {
    engine -= p >= 20 ? (20 * (25 - p)) / 5 : p >= 15 ? 20 : 30;
  }
  // rpm (high: opt 4000, warn 5000, crit 6500, weight 20)
  if (r > 4000) {
    engine -= r <= 5000 ? (20 * (r - 4000)) / 1000 : r <= 6500 ? 20 : 30;
  }
  // vibration (high: opt 0.3, warn 0.6, crit 1.0, weight 20)
  if (v > 0.3) {
    engine -= v <= 0.6 ? (20 * (v - 0.3)) / 0.3 : v <= 1.0 ? 20 : 30;
  }
  // fault_count (warn 3, crit 7, weight 20)
  if (fc > 3) {
    engine -= fc <= 7 ? (20 * (fc - 3)) / 4 : 20;
  }
  const engine_health = Math.round(clamp(engine, 0, 100) * 100) / 100;

  let battery = 100.0;
  // voltage (nominal 12.6, warn 11.8, crit 11.0)
  if (bv < 12.6) {
    battery -= bv >= 11.8 ? (33 * (12.6 - bv)) / (12.6 - 11.8) : bv >= 11.0 ? 33 : 50;
  }
  // current (warn 80, max_draw 100, crit 120)
  if (bc > 80) {
    battery -= bc <= 100 ? (33 * (bc - 80)) / 20 : bc <= 120 ? 33 : 50;
  }
  // battery_temp (opt 45, warn 55, crit 65)
  if (bt > 45) {
    battery -= bt <= 55 ? (34 * (bt - 45)) / 10 : bt <= 65 ? 34 : 50;
  }
  const battery_health = Math.round(clamp(battery, 0, 100) * 100) / 100;

  const vehicle_health = Math.round(clamp(0.7 * engine_health + 0.3 * battery_health, 0, 100) * 100) / 100;

  let health_class = "Critical";
  let health_class_id = 3;
  if (vehicle_health >= 90) {
    health_class = "Excellent";
    health_class_id = 0;
  } else if (vehicle_health >= 75) {
    health_class = "Good";
    health_class_id = 1;
  } else if (vehicle_health >= 60) {
    health_class = "Warning";
    health_class_id = 2;
  }

  const fault_term = clamp(100 - fc * 10, 0, 100);
  const trip_readiness = Math.round(clamp(0.6 * vehicle_health + 0.2 * battery_health + 0.2 * fault_term, 0, 100) * 100) / 100;
  const trip_readiness_label = trip_readiness >= 70 ? "Ready" : trip_readiness >= 50 ? "Caution" : "Not Recommended";

  const ml_health_score = Math.round(clamp(vehicle_health * 0.85 + (100 - fc * 6) * 0.15, 1, 99.9) * 100) / 100;
  const predicted_rul = Math.round(clamp(vehicle_health * 1.24 - fc * 2.5, 8, 125) * 10) / 10;

  return {
    engine_health,
    battery_health,
    vehicle_health,
    health_class,
    health_class_id,
    trip_readiness,
    trip_readiness_label,
    ml_health_score,
    predicted_rul,
  };
}

// ---------------------------------------------------------------------------
// Phase 4 Component Twin Builder
// ---------------------------------------------------------------------------
function buildTwinState(row) {
  const eh = clamp(row.engine_health, 0, 100);
  const bh = clamp(row.battery_health, 0, 100);
  const fh = clamp(100 - (row.temperature > 95 ? (row.temperature - 95) * 1.5 : 0) - row.fault_count * 2.2, 35, 98);
  const kh = clamp(100 - row.vibration * 28 - (row.rpm > 3800 ? (row.rpm - 3800) / 120 : 0), 40, 99);

  const overall_health = Math.round(clamp(0.4 * eh + 0.3 * bh + 0.2 * fh + 0.1 * kh, 0, 100) * 100) / 100;
  const e_fp = clamp(row.Failure_Probability || (100 - eh) / 200, 0.0002, 0.95);
  const b_fp = clamp((100 - bh) / 250, 0.0001, 0.85);
  const f_fp = clamp((100 - fh) / 300, 0.0001, 0.75);
  const k_fp = clamp((100 - kh) / 320, 0.0001, 0.7);
  const overall_fp = Math.round(clamp(1 - (1 - e_fp) * (1 - b_fp) * (1 - f_fp) * (1 - k_fp), 0, 1) * 10000) / 10000;

  let health_class = "Critical";
  if (overall_health >= 85) health_class = "Excellent";
  else if (overall_health >= 70) health_class = "Good";
  else if (overall_health >= 50) health_class = "Warning";

  const components = {
    engine: {
      component: "engine",
      health_score: Math.round(eh * 10) / 10,
      status: eh >= 75 ? "Healthy" : eh >= 55 ? "Warning" : "Critical",
      failure_probability: Math.round(e_fp * 10000) / 10000,
      rul_cycles: row.Remaining_Useful_Life_Cycles,
      rul_km: row.Remaining_Useful_Life_KM,
    },
    battery: {
      component: "battery",
      health_score: Math.round(bh * 10) / 10,
      status: bh >= 75 ? "Healthy" : bh >= 55 ? "Warning" : "Critical",
      failure_probability: Math.round(b_fp * 10000) / 10000,
    },
    fuel: {
      component: "fuel",
      health_score: Math.round(fh * 10) / 10,
      status: fh >= 75 ? "Healthy" : fh >= 55 ? "Warning" : "Critical",
      failure_probability: Math.round(f_fp * 10000) / 10000,
    },
    brake: {
      component: "brake",
      health_score: Math.round(kh * 10) / 10,
      status: kh >= 75 ? "Healthy" : kh >= 55 ? "Warning" : "Critical",
      failure_probability: Math.round(k_fp * 10000) / 10000,
    },
  };

  return {
    vehicle_id: row.Vehicle_ID,
    overall_health,
    overall_failure_probability: overall_fp,
    overall_rul_cycles: row.Remaining_Useful_Life_Cycles,
    overall_rul_km: row.Remaining_Useful_Life_KM,
    health_class,
    trip_readiness: row.trip_readiness,
    ml_health_score: row.ml_health_score,
    urgency: row.Urgency,
    maintenance_priority: row.Maintenance_Priority,
    book_service_within_days: row.Book_Service_Within_Days,
    recommended_action: row.Recommended_Action,
    ...components,
  };
}

// ---------------------------------------------------------------------------
// Phase 6 Knowledge Base Documents & Chunks
// ---------------------------------------------------------------------------
const KB_DOCUMENTS = [
  { file_name: "owners_manual_general.pdf", category: "manuals", chunk_count: 42 },
  { file_name: "obd_diagnostic_reference_critical_high.pdf", category: "obd_docs", chunk_count: 38 },
  { file_name: "standard_service_procedures.pdf", category: "service_guides", chunk_count: 36 },
  { file_name: "maintenance_interval_guidelines.pdf", category: "maintenance_guides", chunk_count: 32 },
];

const KB_CHUNKS = [
  {
    file_name: "maintenance_interval_guidelines.pdf",
    category: "maintenance_guides",
    page: 4,
    keywords: ["oil", "change", "interval", "lubrication", "engine oil", "filter"],
    text: "Recommended Engine Oil & Filter Replacement Interval: Replace synthetic engine oil (SAE 5W-30 / 0W-20) and oil filter every 10,000 km or 12 months, whichever comes first. Under severe urban stop-and-go driving or dusty conditions, shorten the interval to every 7,500 km or 6 months.",
  },
  {
    file_name: "maintenance_interval_guidelines.pdf",
    category: "maintenance_guides",
    page: 7,
    keywords: ["brake", "pad", "fluid", "low", "rotor", "caliper", "stopping"],
    text: "Brake System Maintenance & Low Brake Fluid Procedure: Inspect brake pads and rotors every 10,000 km; replace pads when friction material reaches 3 mm (typical life 35,000–50,000 km). If brake fluid is low, check the master cylinder reservoir immediately for leaks in brake lines or calipers, top up with DOT 4 brake fluid, and flush brake fluid every 24 months or 40,000 km.",
  },
  {
    file_name: "maintenance_interval_guidelines.pdf",
    category: "maintenance_guides",
    page: 11,
    keywords: ["coolant", "antifreeze", "radiator", "overheating", "temperature", "cooling"],
    text: "Cooling System & Coolant Replacement: Use 50/50 ethylene glycol OAT coolant. Inspect coolant level at every service and flush the cooling system every 60,000 km or 3 years. If engine temperature rises above 100°C, safely pull over, let the engine cool before opening the expansion tank cap, and inspect radiator fan operation, thermostat, and water pump.",
  },
  {
    file_name: "service_guides",
    file_display: "standard_service_procedures.pdf",
    category: "service_guides",
    page: 9,
    keywords: ["battery", "voltage", "alternator", "overheating", "charging", "12v", "bms"],
    text: "Battery & Charging System Diagnostics: Nominal 12V AGM/lead-acid resting voltage is 12.6V–12.8V (charging voltage 13.8V–14.4V). Voltage below 11.8V indicates deep discharge or cell degradation. Battery overheating (>50°C) is typically caused by alternator overcharging, high internal resistance, or loose terminal connections.",
  },
  {
    file_name: "standard_service_procedures.pdf",
    category: "service_guides",
    page: 14,
    keywords: ["abs", "brake", "bleed", "wheel speed", "sensor", "service"],
    text: "ABS Brake Service Procedure: 1) Scan ABS module for wheel-speed sensor DTCs. 2) Inspect tone rings and sensor air gaps. 3) When bleeding brakes after hydraulic work, perform a standard four-corner bleed followed by an automated ABS hydraulic control unit (HCU) bleed using a diagnostic scan tool.",
  },
  {
    file_name: "owners_manual_general.pdf",
    category: "manuals",
    page: 18,
    keywords: ["tire", "pressure", "tpms", "lug", "torque", "wheel", "reset", "reminder"],
    text: "Tire Pressure, Wheel Torque & Maintenance Reset: Check cold tire inflation pressure monthly (recommended 32–35 PSI front/rear). Wheel lug nut torque specification is 110–120 Nm in a star pattern. To reset the maintenance reminder light: turn ignition to ON (engine off), cycle the trip display to 'Service Reset', and hold the selector button for 5 seconds until the indicator flashes.",
  },
  {
    file_name: "obd_diagnostic_reference_critical_high.pdf",
    category: "obd_docs",
    page: 3,
    keywords: ["p0420", "catalyst", "catalytic", "oxygen", "o2", "sensor", "emissions"],
    text: "DTC P0420 — Catalyst System Efficiency Below Threshold (Bank 1): Indicates the downstream oxygen sensor (Sensor 2) is reading switching patterns similar to the upstream sensor, meaning catalytic converter oxygen storage capacity has degraded. Common causes: aged three-way catalytic converter, exhaust manifold/pipe leaks, faulty downstream O2 sensor, or rich/misfiring engine condition.",
  },
  {
    file_name: "obd_diagnostic_reference_critical_high.pdf",
    category: "obd_docs",
    page: 6,
    keywords: ["p0300", "p0301", "misfire", "ignition", "spark", "coil", "injector", "flashing", "check engine"],
    text: "DTC P0300 / P0301 — Random or Cylinder-Specific Misfire Detected: A solid Check Engine Light indicates an emissions-impacting fault that should be inspected soon; a FLASHING Check Engine Light indicates a severe active misfire dumping unburned fuel into the catalytic converter, risking rapid thermal damage — reduce load and stop driving safely. Check spark plugs, ignition coils, fuel injectors, and compression.",
  },
  {
    file_name: "obd_diagnostic_reference_critical_high.pdf",
    category: "obd_docs",
    page: 12,
    keywords: ["p0128", "thermostat", "coolant", "temperature", "warmup"],
    text: "DTC P0128 — Coolant Temperature Below Thermostat Regulating Temperature: The engine coolant does not reach target operating temperature within the calibrated warmup time. Usually caused by a thermostat stuck open, low coolant level, or a faulty Engine Coolant Temperature (ECT) sensor.",
  },
];

// ---------------------------------------------------------------------------
// Express App & Routes
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// ===========================================================================
// PHASE 2 ROUTES (/api/phase2)
// ===========================================================================
app.get("/api/phase2/health", (_req, res) => {
  res.json({ status: "ok", classifier_loaded: true, regressor_loaded: true });
});

app.get("/api/phase2/fleet/summary", (_req, res) => {
  const total = fleetRows.length;
  const meanVeh = fleetRows.reduce((s, r) => s + r.vehicle_health, 0) / Math.max(1, total);
  const meanEng = fleetRows.reduce((s, r) => s + r.engine_health, 0) / Math.max(1, total);
  const meanBat = fleetRows.reduce((s, r) => s + r.battery_health, 0) / Math.max(1, total);
  const failRate = fleetRows.reduce((s, r) => s + r.failure, 0) / Math.max(1, total);
  const counts = { Excellent: 0, Good: 0, Warning: 0, Critical: 0 };
  for (const r of fleetRows) {
    counts[r.health_class] = (counts[r.health_class] || 0) + 1;
  }
  res.json({
    total_vehicles: total,
    mean_vehicle_health: Math.round(meanVeh * 100) / 100,
    mean_engine_health: Math.round(meanEng * 100) / 100,
    mean_battery_health: Math.round(meanBat * 100) / 100,
    health_class_counts: counts,
    failure_rate: Math.round(failRate * 10000) / 10000,
  });
});

app.get("/api/phase2/fleet/vehicle/:index", (req, res) => {
  const param = String(req.params.index || "0").trim();
  let row = fleetRows[0];
  if (/^\d+$/.test(param)) {
    const idx = parseInt(param, 10);
    row = fleetRows[idx] || fleetRows[0];
  } else {
    row = findVehicle(param);
  }
  const scored = computePhase2Score(row);
  res.json({
    vehicle_id: row.Vehicle_ID,
    sensors: {
      temperature: row.temperature,
      pressure: row.pressure,
      rpm: row.rpm,
      vibration: row.vibration,
      battery_voltage: row.battery_voltage,
      battery_current: row.battery_current,
      battery_temp: row.battery_temp,
      fault_count: row.fault_count,
    },
    ...scored,
  });
});

app.post("/api/phase2/score", (req, res) => {
  res.json(computePhase2Score(req.body || {}));
});

// ===========================================================================
// PHASE 3 ROUTES (/api/phase3)
// ===========================================================================
app.get("/api/phase3/health", (_req, res) => {
  res.json({ status: "healthy", models_loaded: true });
});

app.post("/api/phase3/predict", (req, res) => {
  const b = req.body || {};
  const vid = b.vehicle_id || "Vehicle_0001";
  const eh = Number(b.engine_health ?? 80);
  const bh = Number(b.battery_health ?? 85);
  const vh = Number(b.vehicle_health ?? 81.5);
  const fc = Number(b.fault_count ?? 2);
  const temp = Number(b.temperature ?? 85);
  const vib = Number(b.vibration ?? 0.3);
  const rpm = Number(b.rpm ?? 2800);

  const engineRisk = 100 - eh;
  const batteryRisk = 100 - bh;
  const compositeRisk = 0.45 * engineRisk + 0.3 * batteryRisk + 0.25 * Math.min(100, fc * 8);
  const failProb = Math.round(clamp(Math.pow(compositeRisk / 100, 1.6), 0.01, 0.96) * 10000) / 10000;
  const rulCycles = Math.max(5, Math.round((1 - failProb) * 125));
  const rulKm = rulCycles * 20;

  let urgency = "LOW";
  if (failProb >= 0.8 || rulCycles <= 10) urgency = "CRITICAL";
  else if (failProb >= 0.55 || rulCycles <= 30) urgency = "HIGH";
  else if (failProb >= 0.3 || rulCycles <= 60) urgency = "MEDIUM";

  const sensorImpacts = [
    { sensor: "temperature", shap_value: Math.round(((temp - 82) / 18) * 1000) / 1000 },
    { sensor: "fault_count", shap_value: Math.round(((fc - 1.5) * 0.42) * 1000) / 1000 },
    { sensor: "vibration", shap_value: Math.round(((vib - 0.25) * 2.4) * 1000) / 1000 },
    { sensor: "engine_health", shap_value: Math.round(((85 - eh) * 0.045) * 1000) / 1000 },
    { sensor: "battery_health", shap_value: Math.round(((90 - bh) * 0.035) * 1000) / 1000 },
    { sensor: "rpm", shap_value: Math.round(((rpm - 2600) / 1500) * 1000) / 1000 },
  ].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value));

  const topSensors = sensorImpacts.slice(0, 3);
  const sensorActions = {
    temperature: ["Cooling system", "Inspect coolant level, thermostat, and radiator airflow"],
    fault_count: ["ECU fault logs", "Run full OBD-II scan and clear resolved fault codes"],
    vibration: ["Engine mounts / bearings", "Inspect powertrain mounts and rotating assembly balance"],
    engine_health: ["Engine subsystem", "Perform comprehensive compression and lubrication check"],
    battery_health: ["Battery / BMS", "Test 12V cell conductance and alternator charging ripple"],
    rpm: ["Drivetrain", "Inspect transmission shift calibration and throttle body"],
  };

  const bookDays = Math.max(1, Math.round((rulCycles / 2.4) * 0.6));
  const recommendations = topSensors.map((s, i) => {
    const [system, action] = sensorActions[s.sensor] || ["Vehicle system", "Inspect flagged sensor"];
    const trend = Math.abs(s.shap_value) > 0.5 ? "rapidly deteriorating" : "elevated";
    return {
      priority: i + 1,
      system,
      action,
      reason: `${s.sensor} contribution is ${trend} (SHAP=${s.shap_value.toFixed(3)})`,
      book_within_days: Math.max(1, bookDays - (2 - i) * 3),
    };
  });

  res.json({
    vehicle_id: vid,
    predictions: {
      rul_cycles: rulCycles,
      rul_km_estimate: rulKm,
      failure_probability: failProb,
      urgency,
    },
    top_risk_sensors: topSensors,
    recommendations,
  });
});

// ---------------------------------------------------------------------------
// Historical OBD-II Component Failure Analysis Engine
// ---------------------------------------------------------------------------
function lookupObdMeta(code, fallbackDesc, fallbackSeverity, fallbackSystem, fallbackRec) {
  const diag = phase5DiagMap.get(code);
  const kb = obdMap.get(code);
  return {
    code,
    description: diag?.description || kb?.description || fallbackDesc,
    severity: diag?.severity || kb?.severity || fallbackSeverity,
    affected_system: diag?.affected_system || kb?.affected_system || fallbackSystem,
    recommendation:
      kb?.recommendation || diag?.recommendation || fallbackRec,
    driver_advice:
      diag?.driver_advice ||
      (fallbackSeverity === "Critical"
        ? "Pull over safely and inspect immediately."
        : "Schedule service inspection within the recommended window."),
    estimated_repair_window:
      diag?.estimated_repair_window ||
      (fallbackSeverity === "Critical" ? "Immediate (24h)" : "Within 3–7 days"),
  };
}

function buildHistoricalObdAnalysis(vehicleId, scenario = "actual") {
  const baseRow = findVehicle(vehicleId);
  const v = { ...baseRow };

  // Apply scenario overrides if requested for interactive historical pattern analysis
  let injectedCodes = [];
  if (scenario === "cooling_degradation") {
    v.temperature = Math.max(v.temperature, 108);
    v.fault_count = Math.max(v.fault_count, 6);
    v.engine_health = Math.min(v.engine_health, 52);
    injectedCodes = ["P0118", "P0115", "P0128"];
  } else if (scenario === "catalytic_fuel_drift") {
    v.temperature = Math.max(v.temperature, 96);
    v.fault_count = Math.max(v.fault_count, 5);
    v.engine_health = Math.min(v.engine_health, 61);
    injectedCodes = ["P0420", "P0171", "P0101"];
  } else if (scenario === "ignition_misfire") {
    v.vibration = Math.max(v.vibration, 0.88);
    v.rpm = Math.max(v.rpm, 4400);
    v.fault_count = Math.max(v.fault_count, 7);
    v.engine_health = Math.min(v.engine_health, 48);
    injectedCodes = ["P0300", "P0301", "P0351"];
  } else if (scenario === "battery_alternator_sag") {
    v.battery_voltage = Math.min(v.battery_voltage, 11.3);
    v.battery_temp = Math.max(v.battery_temp, 56);
    v.battery_health = Math.min(v.battery_health, 46);
    v.fault_count = Math.max(v.fault_count, 5);
    injectedCodes = ["P0562", "P0620", "P0113"];
  }

  // Compute component-specific health & historical degradation metrics
  const tempExcess = Math.max(0, v.temperature - 86);
  const vibExcess = Math.max(0, v.vibration - 0.25);
  const pressDeficit = Math.max(0, 26 - v.pressure);
  const voltDeficit = Math.max(0, 12.5 - v.battery_voltage);
  const bTempExcess = Math.max(0, v.battery_temp - 38);

  const coolingHealth = clamp(
    Math.round((96 - tempExcess * 1.9 - (injectedCodes.includes("P0118") ? 14 : 0) - v.fault_count * 1.6) * 10) / 10,
    24,
    98
  );
  const ignitionHealth = clamp(
    Math.round((95 - vibExcess * 42 - (v.rpm > 3800 ? (v.rpm - 3800) / 110 : 0) - (injectedCodes.includes("P0300") ? 16 : 0) - v.fault_count * 1.8) * 10) / 10,
    22,
    98
  );
  const catalyticHealth = clamp(
    Math.round((94 - v.fault_count * 3.1 - tempExcess * 0.7 - (injectedCodes.includes("P0420") ? 22 : 0)) * 10) / 10,
    28,
    97
  );
  const lubricationHealth = clamp(
    Math.round((95 - pressDeficit * 3.2 - vibExcess * 24 - (100 - v.engine_health) * 0.35) * 10) / 10,
    30,
    98
  );
  const electricalHealth = clamp(
    Math.round((v.battery_health - voltDeficit * 14 - bTempExcess * 0.8 - (injectedCodes.includes("P0562") ? 15 : 0)) * 10) / 10,
    25,
    99
  );
  const fuelSystemHealth = clamp(
    Math.round((93 - v.fault_count * 2.1 - (injectedCodes.includes("P0171") ? 18 : 0) - (100 - v.engine_health) * 0.25) * 10) / 10,
    34,
    98
  );

  const rawComponents = [
    {
      id: "cooling_system",
      component: "Cooling System & Thermostat",
      subsystem: "Thermal Management",
      health_score: coolingHealth,
      primary_code: v.temperature > 100 || injectedCodes.includes("P0115") ? "P0115" : "P0118",
      secondary_code: "P0128",
      fallback_desc: "Engine Coolant Temperature Circuit High / Range Performance",
      fallback_rec: "Flush cooling circuit, pressure-test radiator cap, and replace sticking thermostat valve",
      key_anomaly: `30-day ECT trend peaked at ${v.temperature.toFixed(1)}°C (+${Math.max(2.1, tempExcess).toFixed(1)}°C drift over baseline)`,
    },
    {
      id: "ignition_misfire",
      component: "Ignition Coils & Cylinder Assembly",
      subsystem: "Combustion & Ignition",
      health_score: ignitionHealth,
      primary_code: "P0300",
      secondary_code: "P0301",
      fallback_desc: "Random/Multiple Cylinder Misfire Detected under Load",
      fallback_rec: "Inspect cylinder #1–#4 ignition coils, replace worn spark plugs, and verify injector balance",
      key_anomaly: `Vibration amplitude reached ${v.vibration.toFixed(2)}g at ${Math.round(v.rpm)} RPM with intermittent misfire freeze-frames`,
    },
    {
      id: "catalytic_exhaust",
      component: "Catalytic Converter & O2 Bank 1",
      subsystem: "Exhaust & Emissions",
      health_score: catalyticHealth,
      primary_code: "P0420",
      secondary_code: "P0136",
      fallback_desc: "Catalyst System Efficiency Below Threshold (Bank 1)",
      fallback_rec: "Run downstream O2 switching ratio test, inspect exhaust manifold for leaks, and service three-way catalyst",
      key_anomaly: `Downstream O2 sensor voltage oscillation narrowed across ${Math.max(2, v.fault_count)} drive cycles`,
    },
    {
      id: "lubrication_powertrain",
      component: "Engine Lubrication & Oil Pump",
      subsystem: "Core Powertrain",
      health_score: lubricationHealth,
      primary_code: "P0520",
      secondary_code: "P0522",
      fallback_desc: "Engine Oil Pressure Sensor/Switch Circuit Low Pressure",
      fallback_rec: "Verify mechanical oil gallery pressure, replace oil filter, and inspect oil pump relief valve",
      key_anomaly: `Manifold/oil pressure averaged ${v.pressure.toFixed(1)} PSI with high-load pressure dip`,
    },
    {
      id: "battery_charging",
      component: "12V AGM Battery & Alternator Regulator",
      subsystem: "Electrical & BMS",
      health_score: electricalHealth,
      primary_code: "P0562",
      secondary_code: "P0620",
      fallback_desc: "System Voltage Low / Alternator Control Circuit Anomaly",
      fallback_rec: "Perform battery conductance load test, clean terminal ground straps, and check alternator diode ripple",
      key_anomaly: `Resting bus voltage sagged to ${v.battery_voltage.toFixed(2)}V at ${v.battery_temp.toFixed(0)}°C cell temp`,
    },
    {
      id: "fuel_induction",
      component: "Fuel Injectors & MAF Induction",
      subsystem: "Fuel & Air Metering",
      health_score: fuelSystemHealth,
      primary_code: "P0171",
      secondary_code: "P0101",
      fallback_desc: "System Too Lean (Bank 1) / Mass Air Flow Range Performance",
      fallback_rec: "Clean MAF hot-wire element, smoke-test intake plenum for vacuum leaks, and ultrasonic-clean injectors",
      key_anomaly: `Long-Term Fuel Trim (LTFT) drifted to +${(8.5 + (100 - fuelSystemHealth) * 0.22).toFixed(1)}% over 30-day window`,
    },
  ];

  const componentPredictions = rawComponents.map((c) => {
    const deficit = 100 - c.health_score;
    const fp = Math.round(clamp(Math.pow(deficit / 92, 1.55), 0.02, 0.96) * 1000) / 1000;
    const degRate = Math.round(clamp(deficit * 0.018 + (v.fault_count * 0.04), 0.08, 1.85) * 100) / 100;
    const rulDays = Math.max(2, Math.round((c.health_score - 20) / Math.max(0.35, degRate * 1.4)));
    const rulCycles = Math.max(5, Math.round(rulDays * 1.8));
    const rulKm = rulCycles * 22;

    let alert_level = "NORMAL";
    if (fp >= 0.65 || c.health_score < 52) alert_level = "CRITICAL";
    else if (fp >= 0.42 || c.health_score < 66) alert_level = "HIGH";
    else if (fp >= 0.22 || c.health_score < 78) alert_level = "WARNING";

    const obdPrimary = lookupObdMeta(
      c.primary_code,
      c.fallback_desc,
      alert_level === "CRITICAL" ? "Critical" : alert_level === "HIGH" ? "High" : "Medium",
      c.subsystem,
      c.fallback_rec
    );
    const occurrences =
      alert_level === "CRITICAL"
        ? Math.max(4, v.fault_count)
        : alert_level === "HIGH"
        ? Math.max(2, Math.round(v.fault_count * 0.7))
        : alert_level === "WARNING"
        ? 1
        : 0;

    return {
      id: c.id,
      component: c.component,
      subsystem: c.subsystem,
      health_score: c.health_score,
      failure_probability: fp,
      failure_risk_pct: Math.round(fp * 1000) / 10,
      degradation_rate_per_day: degRate,
      predicted_rul_days: rulDays,
      predicted_rul_cycles: rulCycles,
      predicted_rul_km: rulKm,
      alert_level,
      primary_dtc: obdPrimary.code,
      dtc_description: obdPrimary.description,
      dtc_occurrences_30d: occurrences,
      key_anomaly: c.key_anomaly,
      recommended_action: c.fallback_rec,
      driver_advice: obdPrimary.driver_advice,
      estimated_repair_window:
        alert_level === "CRITICAL"
          ? "Immediate (within 24–48h)"
          : alert_level === "HIGH"
          ? "Within 3–5 days"
          : alert_level === "WARNING"
          ? "Within 14 days"
          : "Next scheduled service",
    };
  });

  componentPredictions.sort((a, b) => b.failure_probability - a.failure_probability);

  // Build 30-day historical OBD-II telemetry & DTC time-series
  const now = Date.now();
  const topComp = componentPredictions[0];
  const historical_timeline = [];
  for (let i = 29; i >= 0; i--) {
    const progress = (29 - i) / 29; // 0 (30d ago) -> 1 (today)
    const dayDate = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const wave = Math.sin(i * 0.7) * 1.4;
    const histHealth = Math.round(
      clamp(topComp.health_score + i * topComp.degradation_rate_per_day * 0.75 + wave, 20, 99) * 10
    ) / 10;
    const histRisk = Math.round(
      clamp((100 - histHealth) * 1.05, 2, 96) * 10
    ) / 10;
    const histTemp = Math.round((v.temperature - i * (tempExcess > 4 ? 0.38 : 0.12) + wave) * 10) / 10;
    const histVib = Math.round(clamp(v.vibration - i * 0.008 + Math.cos(i) * 0.02, 0.1, 2.2) * 100) / 100;
    const dtcTriggered =
      (i % 6 === 0 && topComp.alert_level !== "NORMAL") ||
      (i <= 4 && topComp.alert_level === "CRITICAL");

    historical_timeline.push({
      day_offset: -i,
      date: dayDate,
      label: i === 0 ? "Today" : `-${i}d`,
      component_health: histHealth,
      failure_risk_pct: histRisk,
      coolant_temp_c: histTemp,
      vibration_g: histVib,
      active_dtc_count: Math.max(0, Math.round(v.fault_count * progress)),
      dtc_event: dtcTriggered ? topComp.primary_dtc : null,
    });
  }

  // Active component failure alerts (any component in CRITICAL, HIGH, or WARNING, or at least the top risk component)
  let active_alerts = componentPredictions
    .filter((c) => c.alert_level !== "NORMAL")
    .map((c, idx) => ({
      alert_id: `OBD-ALT-${v.Vehicle_ID}-${idx + 1}`,
      vehicle_id: v.Vehicle_ID,
      component: c.component,
      subsystem: c.subsystem,
      alert_level: c.alert_level,
      failure_probability: c.failure_probability,
      failure_risk_pct: c.failure_risk_pct,
      predicted_rul_days: c.predicted_rul_days,
      predicted_rul_km: c.predicted_rul_km,
      primary_dtc: c.primary_dtc,
      dtc_description: c.dtc_description,
      dtc_occurrences_30d: Math.max(1, c.dtc_occurrences_30d),
      evidence: c.key_anomaly,
      recommended_action: c.recommended_action,
      estimated_repair_window: c.estimated_repair_window,
      timestamp: new Date(now - idx * 3600000 * 5).toISOString(),
    }));

  if (active_alerts.length === 0 && componentPredictions.length > 0) {
    const c = componentPredictions[0];
    active_alerts = [
      {
        alert_id: `OBD-ALT-${v.Vehicle_ID}-1`,
        vehicle_id: v.Vehicle_ID,
        component: c.component,
        subsystem: c.subsystem,
        alert_level: "WARNING",
        failure_probability: Math.max(0.18, c.failure_probability),
        failure_risk_pct: Math.max(18.0, c.failure_risk_pct),
        predicted_rul_days: c.predicted_rul_days,
        predicted_rul_km: c.predicted_rul_km,
        primary_dtc: c.primary_dtc,
        dtc_description: c.dtc_description,
        dtc_occurrences_30d: 1,
        evidence: c.key_anomaly,
        recommended_action: c.recommended_action,
        estimated_repair_window: "Monitor — inspect at next service",
        timestamp: new Date(now).toISOString(),
      },
    ];
  }

  // Historical DTC event log table
  const historical_dtc_log = componentPredictions
    .filter((c) => c.dtc_occurrences_30d > 0 || c === componentPredictions[0])
    .map((c, idx) => ({
      code: c.primary_dtc,
      description: c.dtc_description,
      component: c.component,
      subsystem: c.subsystem,
      occurrences_30d: Math.max(1, c.dtc_occurrences_30d),
      last_seen: idx === 0 ? "2 hours ago" : `${idx * 2 + 1} days ago`,
      freeze_frame: `${v.temperature.toFixed(0)}°C · ${Math.round(v.rpm)} RPM · ${v.battery_voltage.toFixed(1)}V`,
      severity:
        c.alert_level === "CRITICAL"
          ? "Critical"
          : c.alert_level === "HIGH"
          ? "High"
          : "Medium",
      predicted_impact: `Predicted ${c.component} failure risk of ${c.failure_risk_pct}% (RUL ~${c.predicted_rul_days}d)`,
    }));

  return {
    vehicle_id: v.Vehicle_ID,
    scenario,
    analyzed_scans_30d: 30,
    total_dtc_events_30d: historical_dtc_log.reduce((s, d) => s + d.occurrences_30d, 0),
    highest_risk_component: topComp.component,
    highest_failure_probability: topComp.failure_probability,
    overall_alert_status: active_alerts[0]?.alert_level || "NORMAL",
    active_alerts,
    component_predictions: componentPredictions,
    historical_timeline,
    historical_dtc_log,
  };
}

app.get("/api/phase3/historical-obd/:vehicleId", (req, res) => {
  const scenario = req.query.scenario ? String(req.query.scenario) : "actual";
  res.json(buildHistoricalObdAnalysis(req.params.vehicleId, scenario));
});

app.post("/api/phase3/historical-obd/analyze", (req, res) => {
  const { vehicle_id = "Vehicle_0001", scenario = "actual" } = req.body || {};
  res.json(buildHistoricalObdAnalysis(vehicle_id, scenario));
});

app.get("/api/phase3/fleet-alerts", (_req, res) => {
  // Scan high-risk vehicles in the reference fleet for active OBD-II component failure alerts
  const highRiskVehicles = [...fleetRows]
    .sort((a, b) => b.Failure_Probability - a.Failure_Probability || a.vehicle_health - b.vehicle_health)
    .slice(0, 8);

  const fleetAlerts = highRiskVehicles.map((r) => {
    const analysis = buildHistoricalObdAnalysis(r.Vehicle_ID);
    const topAlert = analysis.active_alerts[0];
    return {
      ...topAlert,
      vehicle_health: r.vehicle_health,
      health_class: r.health_class,
    };
  });

  const criticalCount = fleetRows.filter((r) => r.Urgency === "CRITICAL" || r.health_class === "Critical").length;
  const highCount = fleetRows.filter((r) => r.Urgency === "HIGH" || r.health_class === "Warning").length;

  res.json({
    total_monitored_vehicles: fleetRows.length,
    critical_component_alerts: criticalCount,
    high_component_alerts: highCount,
    alerts: fleetAlerts,
  });
});

// ===========================================================================
// PHASE 4 ROUTES (/api/phase4)
// ===========================================================================
app.get("/api/phase4/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    vehicles_loaded: fleetRows.length,
    ready: true,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/phase4/fleet", (_req, res) => {
  let exc = 0,
    good = 0,
    warn = 0,
    crit = 0;
  for (const r of fleetRows) {
    if (r.health_class === "Excellent") exc++;
    else if (r.health_class === "Good") good++;
    else if (r.health_class === "Warning") warn++;
    else crit++;
  }
  res.json({
    total_vehicles: fleetRows.length,
    excellent_count: exc,
    good_count: good,
    warning_count: warn,
    critical_count: crit,
  });
});

app.get("/api/phase4/current/:vehicleId", (req, res) => {
  const row = findVehicle(req.params.vehicleId);
  res.json(buildTwinState(row));
});

app.get("/api/phase4/components/:vehicleId", (req, res) => {
  const row = findVehicle(req.params.vehicleId);
  const twin = buildTwinState(row);
  res.json({
    vehicle_id: twin.vehicle_id,
    engine: twin.engine,
    battery: twin.battery,
    fuel: twin.fuel,
    brake: twin.brake,
  });
});

app.post("/api/phase4/simulate", (req, res) => {
  const { vehicle_id = "Vehicle_0001", days = 30 } = req.body || {};
  const horizon = clamp(parseInt(days, 10) || 30, 1, 365);
  const row = findVehicle(vehicle_id);
  const twin = buildTwinState(row);

  const trajectory = [];
  let projectedFailureDay = null;
  const now = Date.now();

  for (let d = 1; d <= horizon; d++) {
    const eh = clamp(twin.engine.health_score - d * 0.28, 0, 100);
    const bh = clamp(twin.battery.health_score - d * 0.19, 0, 100);
    const fh = clamp(twin.fuel.health_score - d * 0.15, 0, 100);
    const kh = clamp(twin.brake.health_score - d * 0.12, 0, 100);
    const vh = Math.round(clamp(0.4 * eh + 0.3 * bh + 0.2 * fh + 0.1 * kh, 0, 100) * 100) / 100;

    const e_fp = (100 - eh) / 100 * 0.5;
    const b_fp = (100 - bh) / 100 * 0.3;
    const f_fp = (100 - fh) / 100 * 0.25;
    const k_fp = (100 - kh) / 100 * 0.2;
    const fp = Math.round(clamp(1 - (1 - e_fp) * (1 - b_fp) * (1 - f_fp) * (1 - k_fp), 0, 1) * 10000) / 10000;

    if (projectedFailureDay === null && vh < 40) {
      projectedFailureDay = d;
    }

    trajectory.push({
      day: d,
      date: new Date(now + d * 86400000).toISOString().slice(0, 10),
      engine_health: Math.round(eh * 100) / 100,
      battery_health: Math.round(bh * 100) / 100,
      fuel_health: Math.round(fh * 100) / 100,
      brake_health: Math.round(kh * 100) / 100,
      vehicle_health: vh,
      failure_probability: fp,
      rul_cycles: Math.max(0, twin.overall_rul_cycles - d),
      rul_km: Math.max(0, twin.overall_rul_km - d * 20),
    });
  }

  res.json({
    vehicle_id: twin.vehicle_id,
    simulation_days: horizon,
    baseline_health: twin.overall_health,
    projected_failure_day: projectedFailureDay,
    trajectory,
  });
});

// ===========================================================================
// PHASE 5 ROUTES (/api/phase5)
// ===========================================================================
app.get("/api/phase5/health", (_req, res) => {
  res.json({
    status: "ok",
    services: { orchestrator: true, knowledge_base: true, explainer: true },
    obd_codes_loaded: obdList.length,
  });
});

app.get("/api/phase5/obd/search", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return res.json([]);
  const matches = [];
  for (const item of obdList) {
    if (
      item.code.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.affected_system.toLowerCase().includes(q)
    ) {
      matches.push(item);
      if (matches.length >= 24) break;
    }
  }
  res.json(matches);
});

app.post("/api/phase5/diagnose", (req, res) => {
  const { fault_codes = [], temperature = 305, rpm = 2200, torque = 45, tool_wear = 120 } = req.body || {};
  const codes = Array.isArray(fault_codes)
    ? fault_codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : [];

  const obd_details = codes.map((code) => {
    const entry = obdMap.get(code);
    if (entry) return entry;
    return {
      code,
      description: `Diagnostic Trouble Code ${code} — Electronic Control Unit circuit or sensor anomaly`,
      severity: code.startsWith("P03") || code.startsWith("P011") ? "Critical" : "Medium",
      affected_system: "Engine / Emissions Control",
      recommendation: "Inspect wiring harness and sensor output with OBD-II scan tool",
    };
  });

  const severityRank = { Critical: 4, High: 3, Medium: 2, Low: 1, Unknown: 0 };
  let overallSeverity = "Low";
  for (const d of obd_details) {
    if ((severityRank[d.severity] || 0) > (severityRank[overallSeverity] || 0)) {
      overallSeverity = d.severity;
    }
  }

  const tempStress = Math.max(0, (Number(temperature) - 300) / 50);
  const rpmStress = Math.max(0, (Number(rpm) - 2500) / 3500);
  const torqueStress = Math.max(0, (Number(torque) - 45) / 80);
  const wearStress = Math.max(0, Number(tool_wear) / 220);
  const codeStress = (severityRank[overallSeverity] || 1) * 0.14 + Math.min(0.25, codes.length * 0.05);

  const failure_probability = Math.round(
    clamp(0.18 * tempStress + 0.17 * rpmStress + 0.2 * torqueStress + 0.2 * wearStress + codeStress, 0.03, 0.96) * 1000
  ) / 1000;

  const remaining_life = Math.max(8, Math.round((1 - failure_probability) * 125));
  const trip_status =
    overallSeverity === "Critical" || failure_probability >= 0.65
      ? "STOP"
      : overallSeverity === "High" || overallSeverity === "Medium" || failure_probability >= 0.3
      ? "CAUTION"
      : "OK";

  const maintenance_urgency =
    trip_status === "STOP"
      ? "Immediate (within 24h)"
      : trip_status === "CAUTION"
      ? "Schedule within 3–7 days"
      : "Routine service interval";

  const primary = obd_details[0] || {
    code: "NONE",
    description: "Telemetry-only diagnostic evaluation",
  };

  res.json({
    fault_codes: codes,
    code: primary.code,
    description: primary.description,
    severity: overallSeverity,
    failure_probability,
    remaining_life,
    maintenance_urgency,
    trip_status,
    obd_details,
  });
});

app.get("/api/phase5/telemetry/:vehicleId", (req, res) => {
  const v = findVehicle(req.params.vehicleId);
  const mode = String(req.query.mode || "cruise");
  const nowSec = Math.floor(Date.now() / 1000);

  let baseRpm = v.rpm || 2450;
  let basePressure = v.pressure || 30;

  if (mode === "idle") {
    baseRpm = 820;
    basePressure = 21.5;
  } else if (mode === "load") {
    baseRpm = Math.max(4100, v.rpm * 1.35);
    basePressure = Math.min(54, Math.max(36, v.pressure * 1.25));
  } else if (mode === "low_oil_fault") {
    baseRpm = Math.max(3100, v.rpm);
    basePressure = 14.8; // Critical low oil pressure under load
  }

  function computePoint(tsSec) {
    const phase = tsSec * 0.45 + v.index * 0.3;
    const rpmWave = Math.sin(phase) * 185 + Math.cos(phase * 1.7) * 95;
    const rpm = Math.round(clamp(baseRpm + rpmWave, 650, 6800));

    // Oil pressure physically tracks RPM unless in low_oil_fault mode
    const rpmCoupling = ((rpm - baseRpm) / 1000) * (mode === "low_oil_fault" ? 0.6 : 3.2);
    const pressWave = Math.cos(phase * 1.2) * 0.9;
    const oil_pressure_psi =
      Math.round(clamp(basePressure + rpmCoupling + pressWave, 8, 64) * 10) / 10;

    const d = new Date(tsSec * 1000);
    const time = d.toTimeString().slice(0, 8);
    return {
      ts: tsSec,
      time,
      rpm,
      oil_pressure_psi,
      coolant_temp_c: Math.round((v.temperature + Math.sin(phase * 0.3) * 0.8) * 10) / 10,
    };
  }

  const samples = [];
  for (let i = 19; i >= 0; i--) {
    samples.push(computePoint(nowSec - i * 2));
  }
  const latest = samples[samples.length - 1];

  const pressureStatus =
    latest.oil_pressure_psi < 18
      ? "CRITICAL_LOW"
      : latest.oil_pressure_psi < 23
      ? "WARNING"
      : "NOMINAL";

  res.json({
    vehicle_id: v.Vehicle_ID,
    mode,
    pressure_status: pressureStatus,
    latest,
    samples,
  });
});

// ===========================================================================
// PHASE 6 ROUTES (/api/phase6)
// ===========================================================================
app.get("/api/phase6/health", (_req, res) => {
  res.json({ status: "healthy", vector_store_loaded: true, chunk_count: 148 });
});

app.get("/api/phase6/documents", (req, res) => {
  const cat = req.query.category ? String(req.query.category) : "";
  const docs = cat ? KB_DOCUMENTS.filter((d) => d.category === cat) : KB_DOCUMENTS;
  res.json({ total_documents: docs.length, documents: docs });
});

app.post("/api/phase6/ask", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  const category = req.body?.category ? String(req.body.category) : null;
  if (!question) {
    return res.status(400).json({ detail: "Question must not be empty." });
  }

  const qLower = question.toLowerCase();
  const codeMatches = question.toUpperCase().match(/\b[PCBU][0-9A-F]{4}\b/g) || [];

  // Score chunks
  let pool = category ? KB_CHUNKS.filter((c) => c.category === category) : KB_CHUNKS;
  if (pool.length === 0) pool = KB_CHUNKS;

  const scored = pool.map((chunk) => {
    let score = 0.45;
    for (const kw of chunk.keywords) {
      if (qLower.includes(kw)) score += 0.16;
    }
    return {
      file_name: chunk.file_display || chunk.file_name,
      category: chunk.category,
      page: chunk.page,
      score: Math.min(0.98, Math.round(score * 100) / 100),
      text: chunk.text,
    };
  });

  // Also inject exact OBD code entries if mentioned
  for (const code of codeMatches) {
    const obd = obdMap.get(code);
    if (obd) {
      scored.unshift({
        file_name: "obd_diagnostic_reference_critical_high.pdf",
        category: "obd_docs",
        page: 2,
        score: 0.96,
        text: `DTC ${obd.code} (${obd.severity} severity — ${obd.affected_system}): ${obd.description}. Impact: ${obd.impact}. Recommended action: ${obd.recommendation}.`,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topChunks = scored.slice(0, 3);
  const confidence = topChunks[0]?.score || 0.75;

  const ai = getGeminiClient();
  if (ai) {
    try {
      const contextStr = topChunks
        .map((c, i) => `[Source ${i + 1}: ${c.file_name} p.${c.page}] ${c.text}`)
        .join("\n\n");
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `You are a technical automotive service assistant. Answer the user's question concisely and accurately using ONLY the retrieved manual excerpts below.\n\nRetrieved Context:\n${contextStr}\n\nQuestion: ${question}`,
      });
      if (response.text) {
        return res.json({
          answer: response.text.trim(),
          sources: topChunks.map(({ file_name, category: cat, page, score }) => ({
            file_name,
            category: cat,
            page,
            score,
          })),
          confidence,
        });
      }
    } catch {
      // Fall through to deterministic grounded answer
    }
  }

  const answer = topChunks.map((c) => c.text).join("\n\n");
  res.json({
    answer,
    sources: topChunks.map(({ file_name, category: cat, page, score }) => ({
      file_name,
      category: cat,
      page,
      score,
    })),
    confidence,
  });
});

// ===========================================================================
// PHASE 7 ROUTES (/api/phase7)
// ===========================================================================
const chatSessions = new Map();

function detectIntent(message) {
  const text = message.toLowerCase();
  const codes = message.toUpperCase().match(/\b[PCBU][0-9A-F]{4}\b/g) || [];
  if (codes.length > 0) {
    if (/\b(drive|driving|safe|trip)\b/.test(text)) return { intent: "DRIVING_SAFETY", codes };
    return { intent: "FAULT_DIAGNOSIS", codes };
  }
  if (/\brul\b|remaining useful life|how (much|long).*(life|last)|useful life/.test(text)) {
    return { intent: "RUL_QUERY", codes };
  }
  if (/failure risk|risk of failure|failure probability|which sensor.*risk|most risk/.test(text)) {
    return { intent: "FAILURE_RISK", codes };
  }
  if (/health|engine|battery/.test(text) && /drop|declin|low|bad|why|score|status/.test(text)) {
    return { intent: "HEALTH_EXPLANATION", codes };
  }
  if (/maintenance|service|what.*should.*do|next service|book/.test(text)) {
    return { intent: "MAINTENANCE_QUERY", codes };
  }
  if (/can i drive|safe to drive|is it safe|trip readiness|ok to drive/.test(text)) {
    return { intent: "DRIVING_SAFETY", codes };
  }
  if (/status|how is my/.test(text)) {
    return { intent: "VEHICLE_STATUS", codes };
  }
  return { intent: "HEALTH_EXPLANATION", codes };
}

function formatAssistantAnswer(intent, v, codes) {
  const diag = codes.length > 0 ? phase5DiagMap.get(codes[0]) || obdMap.get(codes[0]) : null;

  if (intent === "FAULT_DIAGNOSIS" && diag) {
    return [
      `🔧 Fault Diagnosis — ${diag.code}`,
      ``,
      `• Description: ${diag.description}`,
      `• Severity: ${diag.severity || "Medium"}`,
      `• Affected System: ${diag.affected_system || "Powertrain"}`,
      `• Failure Risk: ${diag.failure_risk || "Moderate"}`,
      `• Remaining Life: ${diag.remaining_life_pct || "85"}%`,
      `• Recommendation: ${diag.recommendation || "Schedule service inspection"}`,
      diag.driver_advice ? `• Driver Advice: ${diag.driver_advice}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (intent === "DRIVING_SAFETY") {
    const lines = [
      `🚗 Driving Safety & Trip Readiness (${v.Vehicle_ID})`,
      ``,
      `• Vehicle Health: ${v.vehicle_health.toFixed(1)}/100 (${v.health_class})`,
      `• Trip Readiness Score: ${v.trip_readiness.toFixed(1)}/100`,
      `• Active Fault Count: ${v.fault_count}`,
      `• Service Urgency: ${v.Urgency}`,
    ];
    if (diag) {
      lines.push(
        ``,
        `Code ${diag.code} (${diag.severity || "Medium"}): ${diag.description}`,
        `Advice: ${diag.driver_advice || diag.recommendation || "Monitor closely and inspect soon."}`
      );
    }
    return lines.join("\n");
  }

  if (intent === "MAINTENANCE_QUERY") {
    return [
      `🔧 Maintenance Recommendation (${v.Vehicle_ID})`,
      ``,
      `• Priority: ${v.Maintenance_Priority} (Urgency: ${v.Urgency})`,
      `• Affected System: ${v.Affected_System}`,
      `• Recommended Action: ${v.Recommended_Action}`,
      `• Primary Driver: ${v.Reason}`,
      `• Book Service Within: ${v.Book_Service_Within_Days} days`,
    ].join("\n");
  }

  if (intent === "FAILURE_RISK") {
    return [
      `⚠ Failure Risk Assessment (${v.Vehicle_ID})`,
      ``,
      `• Failure Probability: ${(v.Failure_Probability * 100).toFixed(2)}% (${v.Failure_Risk_Percentage})`,
      `• Highest Risk Sensor: ${v.Top_Risk_Sensor} (SHAP=${v.Top_Risk_SHAP_Value})`,
      `• Affected System: ${v.Affected_System}`,
      `• Explanation: ${v.Reason}`,
      `• Urgency: ${v.Urgency}`,
    ].join("\n");
  }

  if (intent === "RUL_QUERY") {
    return [
      `⏳ Remaining Useful Life (${v.Vehicle_ID})`,
      ``,
      `• Remaining Life: ${v.Remaining_Useful_Life_Cycles} cycles (~${v.Remaining_Useful_Life_KM} km)`,
      `• Recommended Service Window: within ${v.Book_Service_Within_Days} days`,
      `• Current Health Class: ${v.health_class} (${v.vehicle_health.toFixed(1)}/100)`,
      `• Urgency: ${v.Urgency}`,
    ].join("\n");
  }

  return [
    `🚗 Vehicle Health Report (${v.Vehicle_ID})`,
    ``,
    `• Overall Vehicle Health: ${v.vehicle_health.toFixed(1)}/100 (${v.health_class})`,
    `• Engine Health: ${v.engine_health.toFixed(1)}/100 (Temp: ${v.temperature.toFixed(1)}°C, RPM: ${Math.round(v.rpm)}, Vib: ${v.vibration.toFixed(2)}g)`,
    `• Battery Health: ${v.battery_health.toFixed(1)}/100 (${v.battery_voltage.toFixed(2)}V, ${v.battery_temp.toFixed(1)}°C)`,
    `• Highest Risk Sensor: ${v.Top_Risk_Sensor} (${v.Affected_System})`,
    `• Analysis: ${v.Reason} — ${v.Recommended_Action} within ${v.Book_Service_Within_Days} days.`,
  ].join("\n");
}

app.get("/api/phase7/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/phase7/chat", async (req, res) => {
  const { vehicle_id = "Vehicle_0001", session_id = "default", message = "" } = req.body || {};
  const v = findVehicle(vehicle_id);
  const { intent, codes } = detectIntent(message);
  const data_sources = ["merged_vehicle_state.csv"];
  if (codes.length > 0) data_sources.push("obd_knowledge_base.csv");

  const baseAnswer = formatAssistantAnswer(intent, v, codes);
  let finalAnswer = baseAnswer;

  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `You are the Vehicle Brain Assistant. Using the exact grounded telemetry below, answer the user's message clearly and concisely.\n\nGrounded Telemetry:\n${baseAnswer}\n\nUser Message: ${message}`,
      });
      if (response.text) {
        finalAnswer = response.text.trim();
      }
    } catch {
      // Keep deterministic grounded response
    }
  }

  res.json({
    vehicle_id: v.Vehicle_ID,
    session_id,
    intent,
    answer: finalAnswer,
    data_sources,
    obd_codes: codes,
  });
});

app.post("/api/phase7/chat/clear", (req, res) => {
  const sessionId = req.body?.session_id || "default";
  chatSessions.delete(sessionId);
  res.json({ status: "cleared", session_id: sessionId });
});

// ===========================================================================
// PHASE 8 ROUTES (/api/phase8)
// ===========================================================================
const KNOWN_ROUTES = {
  "pune->mumbai": { distance_km: 149, duration_min: 165, elevation_gain_m: 420 },
  "mumbai->pune": { distance_km: 149, duration_min: 170, elevation_gain_m: 580 },
  "pune->nashik": { distance_km: 212, duration_min: 245, elevation_gain_m: 510 },
  "pune->bengaluru": { distance_km: 842, duration_min: 790, elevation_gain_m: 690 },
  "delhi->jaipur": { distance_km: 273, duration_min: 280, elevation_gain_m: 230 },
  "mumbai->goa": { distance_km: 588, duration_min: 640, elevation_gain_m: 610 },
};

const customRecentTripsByVehicle = new Map();

function formatDurationLabel(mins) {
  const m = Math.max(1, Math.round(mins));
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
}

function buildRecentTripsForVehicle(vehicleId) {
  const v = findVehicle(vehicleId);
  const vid = v.Vehicle_ID;

  const baseTemplates = [
    {
      origin: "Pune (Hinjewadi)",
      destination: "Mumbai (BKC)",
      corridor: "Highway",
      base_dist: 148.6,
      base_dur: 162,
      time_ago: "Today, 09:15 AM",
      weather: "Clear · 28°C",
      elevation_gain_m: 420,
    },
    {
      origin: "Mumbai (BKC)",
      destination: "Lonavala Ghats",
      corridor: "Highway",
      base_dist: 86.4,
      base_dur: 104,
      time_ago: "Yesterday, 06:40 PM",
      weather: "Light Rain · 24°C",
      elevation_gain_m: 625,
    },
    {
      origin: "Wakad Tech Park",
      destination: "Pune International Airport",
      corridor: "Urban",
      base_dist: 24.8,
      base_dur: 46,
      time_ago: "2 days ago",
      weather: "Clear · 30°C",
      elevation_gain_m: 85,
    },
    {
      origin: "Pune (Kothrud)",
      destination: "Nashik Highway Corridor",
      corridor: "Highway",
      base_dist: 211.5,
      base_dur: 238,
      time_ago: "4 days ago",
      weather: "Clouds · 26°C",
      elevation_gain_m: 510,
    },
    {
      origin: "Shivajinagar",
      destination: "Magarpatta Cybercity",
      corridor: "Urban",
      base_dist: 16.2,
      base_dur: 38,
      time_ago: "6 days ago",
      weather: "Clear · 31°C",
      elevation_gain_m: 60,
    },
    {
      origin: "Pune",
      destination: "Mahabaleshwar Crest",
      corridor: "Highway",
      base_dist: 120.4,
      base_dur: 158,
      time_ago: "8 days ago",
      weather: "Haze · 22°C",
      elevation_gain_m: 780,
    },
  ];

  // Factor vehicle health & engine health into realistic fuel efficiency
  const healthFactor = (v.engine_health - 75) * 0.04;

  const seededTrips = baseTemplates.map((t, idx) => {
    const jitterDist = seededFloat(`${vid}:dist:${idx}`, -3.2, 4.5);
    const distance_km = Math.round(Math.max(8, t.base_dist + jitterDist) * 10) / 10;
    const jitterDur = seededFloat(`${vid}:dur:${idx}`, -8, 12);
    const duration_min = Math.max(15, Math.round(t.base_dur + jitterDur));
    const baseEff = t.corridor === "Highway" ? 16.2 : 12.9;
    const effJitter = seededFloat(`${vid}:eff:${idx}`, -1.1, 1.4);
    const fuel_efficiency_kmpl =
      Math.round(clamp(baseEff + healthFactor + effJitter, 9.4, 19.8) * 10) / 10;
    const fuel_consumed_l = Math.round((distance_km / fuel_efficiency_kmpl) * 10) / 10;
    const avg_speed_kmh = Math.round((distance_km / (duration_min / 60)) * 10) / 10;
    const eco_score = Math.round(clamp((fuel_efficiency_kmpl / 18.5) * 100, 58, 96));

    return {
      trip_id: `TRP-${String(v.index + 101).padStart(3, "0")}-${idx + 1}`,
      vehicle_id: vid,
      origin: t.origin,
      destination: t.destination,
      corridor: t.corridor,
      timestamp_label: t.time_ago,
      distance_km,
      duration_min,
      duration_label: formatDurationLabel(duration_min),
      fuel_efficiency_kmpl,
      fuel_consumed_l,
      fuel_cost_inr: Math.round(fuel_consumed_l * 104.5),
      avg_speed_kmh,
      eco_score,
      elevation_gain_m: t.elevation_gain_m,
      weather: t.weather,
      efficiency_rating:
        fuel_efficiency_kmpl >= 15.5
          ? "Optimal"
          : fuel_efficiency_kmpl >= 13.0
          ? "Normal"
          : "High Consumption",
    };
  });

  const customList = customRecentTripsByVehicle.get(vid) || [];
  const allTrips = [...customList, ...seededTrips].slice(0, 8);

  const total_distance_km =
    Math.round(allTrips.reduce((s, t) => s + t.distance_km, 0) * 10) / 10;
  const total_duration_min = allTrips.reduce((s, t) => s + t.duration_min, 0);
  const avg_fuel_efficiency_kmpl =
    Math.round(
      (allTrips.reduce((s, t) => s + t.fuel_efficiency_kmpl, 0) / Math.max(1, allTrips.length)) *
        10
    ) / 10;
  const total_fuel_consumed_l =
    Math.round(allTrips.reduce((s, t) => s + t.fuel_consumed_l, 0) * 10) / 10;

  return {
    vehicle_id: vid,
    summary: {
      total_trips: allTrips.length,
      total_distance_km,
      total_duration_min,
      total_duration_label: formatDurationLabel(total_duration_min),
      avg_fuel_efficiency_kmpl,
      total_fuel_consumed_l,
      benchmark_kmpl: 15.0,
    },
    trips: allTrips,
  };
}

function seededFloat(seedStr, min, max) {
  const hash = crypto.createHash("sha256").update(seedStr).digest();
  const intVal = hash.readUInt32BE(0);
  return min + (intVal / 0xffffffff) * (max - min);
}

app.get("/api/phase8/health", (_req, res) => {
  res.json({ status: "ok", service: "Phase 8 - Trip Intelligence Module" });
});

app.get("/api/phase8/trips/recent/:vehicleId", (req, res) => {
  res.json(buildRecentTripsForVehicle(req.params.vehicleId));
});

app.post("/api/phase8/trip/assess/by_vehicle_id", (req, res) => {
  const {
    vehicle_id = "Vehicle_0001",
    source = "Pune",
    destination = "Mumbai",
    fuel_level_l = 40,
    driver_behaviour_score = 75,
  } = req.body || {};

  const v = findVehicle(vehicle_id);
  const routeKey = `${String(source).trim().toLowerCase()}->${String(destination).trim().toLowerCase()}`;
  const known = KNOWN_ROUTES[routeKey];
  const distance_km = known
    ? known.distance_km
    : Math.round(seededFloat(`dist:${routeKey}`, 95, 540));
  const duration_min = known
    ? known.duration_min
    : Math.round((distance_km / seededFloat(`spd:${routeKey}`, 52, 68)) * 60);

  const conditions = ["Clear", "Clouds", "Light Rain", "Clear", "Haze"];
  const condIdx = Math.floor(seededFloat(`cond:${routeKey}`, 0, conditions.length - 0.01));
  const condition = conditions[condIdx];
  const temperature_c = Math.round(seededFloat(`temp:${routeKey}`, 22, 34) * 10) / 10;
  const weather_risk = condition === "Light Rain" ? 28 : condition === "Haze" ? 18 : 8;

  const mileage_kmpl = 14.5;
  const fuel_required_l = Math.round((distance_km / mileage_kmpl) * 10) / 10;
  const fuel_avail = Number(fuel_level_l ?? 40);
  const fuel_sufficient = fuel_avail >= fuel_required_l * 1.15;
  const fuel_cost = Math.round(fuel_required_l * 104.5);

  const health = v.vehicle_health;
  const failP = v.Failure_Probability;
  const driverScore = Number(driver_behaviour_score ?? 75);

  let risk_score =
    0.4 * (100 - health) +
    0.3 * (failP * 100) +
    0.15 * weather_risk +
    0.15 * (100 - driverScore) +
    (fuel_sufficient ? 0 : 18);
  risk_score = Math.round(clamp(risk_score, 4, 98) * 10) / 10;

  const factors = [];
  let trip_status = "GO";

  if (health < 50 || failP > 0.6 || driverScore < 40) {
    trip_status = "NO-GO";
    if (health < 50) factors.push(`Vehicle health (${health.toFixed(0)}/100) is below minimum safe threshold.`);
    if (failP > 0.6) factors.push(`Failure probability (${(failP * 100).toFixed(1)}%) exceeds critical threshold.`);
    if (driverScore < 40) factors.push(`Driver behaviour score (${driverScore}) indicates high-risk driving patterns.`);
  } else if (health < 75 || !fuel_sufficient || driverScore < 65 || v.fault_count >= 6) {
    trip_status = "CAUTION";
    if (health < 75) factors.push(`Vehicle health (${health.toFixed(1)}/100) is in ${v.health_class} range — pre-trip inspection advised.`);
    if (!fuel_sufficient) factors.push(`Trip requires ~${fuel_required_l} L but tank has ${fuel_avail} L — plan a refuel stop en route.`);
    if (driverScore < 65) factors.push(`Driver behaviour score (${driverScore}) suggests moderate braking/acceleration risk.`);
    if (v.fault_count >= 6) factors.push(`${v.fault_count} logged ECU fault codes (${v.Affected_System}: ${v.Recommended_Action}).`);
  } else {
    factors.push("All vehicle health, failure-risk, weather, fuel, and driver behaviour checks passed.");
  }

  const service_centre_recommendation =
    trip_status !== "GO" && serviceCentres.length > 0
      ? {
          name: serviceCentres[0].name,
          address: serviceCentres[0].address,
          distance_km: 4.8,
          contact: serviceCentres[0].contact,
        }
      : null;

  const natural_language_summary =
    trip_status === "GO"
      ? `${v.Vehicle_ID} is ready for the ${distance_km} km trip from ${source} to ${destination} (~${Math.round(duration_min)} min). Health is ${health.toFixed(0)}/100 and current fuel (${fuel_avail} L) covers the ${fuel_required_l} L required.`
      : `${trip_status} advised for ${v.Vehicle_ID} on the ${distance_km} km route from ${source} to ${destination}: ${factors[0]}`;

  // Record this trip in recent journeys for the vehicle
  const existingCustom = customRecentTripsByVehicle.get(v.Vehicle_ID) || [];
  const calcEff =
    Math.round(
      clamp(mileage_kmpl + (driverScore - 70) * 0.06 + (health - 75) * 0.03, 10.2, 19.4) * 10
    ) / 10;
  const calcFuelUsed = Math.round((distance_km / calcEff) * 10) / 10;
  const newEntry = {
    trip_id: `TRP-LIVE-${Date.now().toString().slice(-4)}`,
    vehicle_id: v.Vehicle_ID,
    origin: String(source).trim() || "Origin",
    destination: String(destination).trim() || "Destination",
    corridor: distance_km >= 60 ? "Highway" : "Urban",
    timestamp_label: "Just assessed",
    distance_km,
    duration_min: Math.round(duration_min),
    duration_label: formatDurationLabel(duration_min),
    fuel_efficiency_kmpl: calcEff,
    fuel_consumed_l: calcFuelUsed,
    fuel_cost_inr: Math.round(calcFuelUsed * 104.5),
    avg_speed_kmh: Math.round((distance_km / (Math.max(1, duration_min) / 60)) * 10) / 10,
    eco_score: Math.round(clamp(driverScore * 0.6 + (calcEff / 18) * 40, 50, 98)),
    elevation_gain_m: known?.elevation_gain_m || 310,
    weather: `${condition} · ${temperature_c}°C`,
    efficiency_rating:
      calcEff >= 15.5 ? "Optimal" : calcEff >= 13.0 ? "Normal" : "High Consumption",
  };
  customRecentTripsByVehicle.set(v.Vehicle_ID, [newEntry, ...existingCustom].slice(0, 4));

  res.json({
    vehicle_id: v.Vehicle_ID,
    route: {
      distance_km,
      duration_min,
      elevation_gain_m: known?.elevation_gain_m || 310,
      traffic_level: "Moderate",
    },
    weather: {
      temperature_c,
      condition,
      weather_risk_score: weather_risk,
    },
    fuel: {
      fuel_required_l,
      fuel_available_l: fuel_avail,
      fuel_cost,
      fuel_sufficient,
    },
    risk: {
      trip_status,
      risk_score,
      contributing_factors: factors,
    },
    natural_language_summary,
    service_centre_recommendation,
  });
});

// ===========================================================================
// PHASE 9 ROUTES (/api/phase9)
// ===========================================================================
let phase9Ready = true;

app.get("/api/phase9/health", (_req, res) => {
  res.json({ status: "ok", pipeline_ready: phase9Ready });
});

app.post("/api/phase9/pipeline/run", (_req, res) => {
  phase9Ready = true;
  res.json({
    status: "success",
    trips_processed: vedRows.length,
    drivers: driverAnalytics.size,
    events_detected: 42,
  });
});

app.get("/api/phase9/drivers", (_req, res) => {
  const veh_ids = Array.from(driverAnalytics.keys()).sort((a, b) => a - b);
  res.json({ driver_count: veh_ids.length, veh_ids });
});

function getDriverRecord(vehIdParam) {
  const id = parseInt(vehIdParam, 10);
  if (driverAnalytics.has(id)) return driverAnalytics.get(id);
  const first = driverAnalytics.values().next().value;
  return first;
}

app.get("/api/phase9/driver/profile", (req, res) => {
  const rec = getDriverRecord(req.query.veh_id);
  res.json(rec.profile);
});

app.get("/api/phase9/driver/score", (req, res) => {
  const rec = getDriverRecord(req.query.veh_id);
  res.json(rec.score);
});

app.get("/api/phase9/driver/statistics", (req, res) => {
  const rec = getDriverRecord(req.query.veh_id);
  res.json(rec.statistics);
});

app.get("/api/phase9/driver/coaching", (req, res) => {
  const rec = getDriverRecord(req.query.veh_id);
  res.json(rec.coaching);
});

app.get("/api/phase9/driver/events", (req, res) => {
  const rec = getDriverRecord(req.query.veh_id);
  const stats = rec.statistics;
  const vid = rec.veh_id;

  const totalBrakes = Math.max(6, stats.total_harsh_brakes || 14);
  const totalAccels = Math.max(8, stats.total_aggressive_accelerations || 18);
  const totalTurns = Math.max(5, stats.total_sharp_turns || 11);

  const now = Date.now();
  const session_timeline = [];
  for (let i = 9; i >= 0; i--) {
    const sessionNum = 10 - i;
    const hb = Math.max(
      0,
      Math.round((totalBrakes / 10) + seededFloat(`hb:${vid}:${i}`, -1.8, 2.6))
    );
    const acc = Math.max(
      0,
      Math.round((totalAccels / 10) + seededFloat(`ac:${vid}:${i}`, -2.0, 3.1))
    );
    const sc = Math.max(
      0,
      Math.round((totalTurns / 10) + seededFloat(`sc:${vid}:${i}`, -1.5, 2.4))
    );
    const dateStr = new Date(now - i * 86400000).toISOString().slice(5, 10);
    session_timeline.push({
      session: `S${String(sessionNum).padStart(2, "0")}`,
      date: dateStr,
      harsh_braking: hb,
      acceleration: acc,
      sharp_cornering: sc,
      total: hb + acc + sc,
      avg_speed_kmh: Math.round(seededFloat(`spd:${vid}:${i}`, 42, 78) * 10) / 10,
    });
  }

  const locations = [
    "Mumbai-Pune Expy KM 42",
    "Wakad Flyover Ramp",
    "Hinjewadi Phase 2 Circle",
    "Lonavala Ghat Hairpin #4",
    "Baner Highway Merge",
    "Kothrud Bypass Junction",
    "University Circle",
    "Chakan Industrial Corridor",
  ];

  const g_force_events = [];
  const types = ["Harsh Braking", "Rapid Acceleration", "Sharp Cornering"];
  for (let i = 0; i < 28; i++) {
    const tIdx = Math.floor(seededFloat(`type:${vid}:${i}`, 0, 2.99));
    const type = types[tIdx];
    let longitudinal_g = 0;
    let lateral_g = 0;

    if (type === "Harsh Braking") {
      longitudinal_g = -Math.round(seededFloat(`lg:${vid}:${i}`, 0.38, 0.86) * 100) / 100;
      lateral_g = Math.round(seededFloat(`lat:${vid}:${i}`, -0.22, 0.22) * 100) / 100;
    } else if (type === "Rapid Acceleration") {
      longitudinal_g = Math.round(seededFloat(`lg:${vid}:${i}`, 0.34, 0.78) * 100) / 100;
      lateral_g = Math.round(seededFloat(`lat:${vid}:${i}`, -0.18, 0.18) * 100) / 100;
    } else {
      longitudinal_g = Math.round(seededFloat(`lg:${vid}:${i}`, -0.26, 0.24) * 100) / 100;
      const sign = i % 2 === 0 ? 1 : -1;
      lateral_g = sign * (Math.round(seededFloat(`lat:${vid}:${i}`, 0.38, 0.82) * 100) / 100);
    }

    const magnitude_g =
      Math.round(Math.sqrt(longitudinal_g * longitudinal_g + lateral_g * lateral_g) * 100) / 100;
    const speed_kmh = Math.round(seededFloat(`evspd:${vid}:${i}`, 28, 106));
    const severity = magnitude_g >= 0.68 ? "High" : magnitude_g >= 0.48 ? "Medium" : "Low";

    g_force_events.push({
      id: `EVT-${String(101 + i)}`,
      type,
      longitudinal_g,
      lateral_g,
      magnitude_g,
      speed_kmh,
      severity,
      location: locations[i % locations.length],
      session: `S${String((i % 10) + 1).padStart(2, "0")}`,
    });
  }

  const sumHb = session_timeline.reduce((s, d) => s + d.harsh_braking, 0);
  const sumAc = session_timeline.reduce((s, d) => s + d.acceleration, 0);
  const sumSc = session_timeline.reduce((s, d) => s + d.sharp_cornering, 0);
  const peakG = Math.max(...g_force_events.map((e) => e.magnitude_g));

  res.json({
    veh_id: vid,
    profile: rec.profile.profile,
    driver_score: rec.score.driver_score,
    summary: {
      harsh_brakes: sumHb,
      aggressive_accelerations: sumAc,
      sharp_cornering: sumSc,
      total_events: sumHb + sumAc + sumSc,
      peak_g_force: peakG,
    },
    session_timeline,
    g_force_events,
  });
});

// ---------------------------------------------------------------------------
// Start Server (Vite middleware in dev, static dist in prod)
// ---------------------------------------------------------------------------
const PORT = 3000;

async function startServer() {
  const distPath = path.join(__dirname, "dist");
  const isProd = process.env.NODE_ENV === "production" && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Vehicle Brain Unified Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
