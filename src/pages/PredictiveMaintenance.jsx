import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertTriangle, Clock } from "lucide-react";
import { phase2, phase3 } from "../api/client";
import {
  PageHeader,
  Card,
  Button,
  StatusPill,
  StatRow,
  ErrorState,
  LoadingSkeleton,
  CHART,
} from "../components/ui";
import { useVehicle } from "../context/VehicleContext";
import Gauge from "../components/Gauge";

const DEFAULT_SENSORS = {
  temperature: 85,
  pressure: 28,
  rpm: 2800,
  vibration: 0.3,
  battery_voltage: 12.4,
  battery_current: 40,
  battery_temp: 30,
  fault_count: 3,
};

const URGENCY_LEVEL = {
  CRITICAL: "crit",
  HIGH: "crit",
  WARNING: "warn",
  MEDIUM: "warn",
  LOW: "good",
  NORMAL: "good",
};

const SCENARIOS = [
  { id: "actual", label: "Actual Log" },
  { id: "cooling_degradation", label: "Cooling (P0118)" },
  { id: "ignition_misfire", label: "Misfire (P0300)" },
  { id: "catalytic_fuel_drift", label: "Catalyst (P0420)" },
  { id: "battery_alternator_sag", label: "Voltage (P0562)" },
];

function getBounds(key) {
  const min = key === "fault_count" ? 0 : key.includes("voltage") ? 9 : 0;
  const max =
    key === "rpm"
      ? 7000
      : key === "fault_count"
      ? 15
      : key.includes("temp")
      ? 140
      : key.includes("current")
      ? 150
      : key === "vibration"
      ? 2
      : key.includes("voltage")
      ? 14
      : 50;
  const step = key === "vibration" || key.includes("voltage") ? 0.1 : 1;
  return { min, max, step };
}

export default function PredictiveMaintenance() {
  const { vehicleId } = useVehicle();
  const [sensors, setSensors] = useState(DEFAULT_SENSORS);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [scenario, setScenario] = useState("actual");
  const [histData, setHistData] = useState(null);
  const [histLoading, setHistLoading] = useState(true);
  const [histError, setHistError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setHistLoading(true);
    setHistError(null);
    phase3
      .get(`/historical-obd/${encodeURIComponent(vehicleId)}`, {
        params: { scenario },
      })
      .then((r) => {
        if (!cancelled) setHistData(r.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setHistError(
            err.response?.data?.detail || "Failed to load historical OBD-II analysis."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setHistLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, scenario]);

  async function executePipeline(customSensors) {
    const activeSensors = customSensors || sensors;
    setRunning(true);
    setError(null);
    try {
      const { data: health } = await phase2.post("/score", activeSensors);
      const { data: prediction } = await phase3.post("/predict", {
        vehicle_id: vehicleId,
        ...activeSensors,
        engine_health: health.engine_health,
        battery_health: health.battery_health,
        vehicle_health: health.vehicle_health,
        ml_health_score: health.ml_health_score ?? 50,
        trip_readiness: health.trip_readiness,
        health_class_id: health.health_class_id,
      });

      setResult({ health, prediction });
    } catch (err) {
      setError(
        err.response?.data?.detail || "Pipeline unavailable."
      );
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    phase2
      .get(`/fleet/vehicle/${encodeURIComponent(vehicleId)}`)
      .then((r) => {
        if (cancelled) return;
        const vehSensors = r.data.sensors || DEFAULT_SENSORS;
        setSensors(vehSensors);
        executePipeline(vehSensors);
      })
      .catch(() => {
        if (!cancelled) executePipeline(DEFAULT_SENSORS);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const set = (key) => (e) => setSensors((s) => ({ ...s, [key]: parseFloat(e.target.value) }));

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="03. Maintenance"
        title="Predictive Maintenance"
        right={
          histData && (
            <StatusPill level={URGENCY_LEVEL[histData.overall_alert_status] || "neutral"}>
              {vehicleId} · {histData.overall_alert_status}
            </StatusPill>
          )
        }
      />

      {/* Dedicated Historical OBD-II Component Failure Alert & Analysis Section */}
      <div className="panel p-5 border-l-4 border-l-brand animate-fade-up">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-base-border">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="font-display font-bold text-base sm:text-lg text-ink">
              OBD-II Component Failure Predictor
            </h2>
            <span className="text-xs font-mono text-ink-faint">· {vehicleId}</span>
          </div>

          {histData && (
            <div className="flex items-center gap-2 text-xs font-mono text-ink-muted tabular-nums">
              <span className="text-ink font-semibold">
                Top Risk: {histData.highest_risk_component}
              </span>
              <span>·</span>
              <span>{histData.analyzed_scans_30d} scans</span>
              <span>·</span>
              <span>{histData.total_dtc_events_30d} DTCs</span>
            </div>
          )}
        </div>

        {/* Historical Pattern Scenario Selector */}
        <div className="flex items-center gap-2 flex-wrap py-3 border-b border-base-border/70">
          <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border flex-wrap">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScenario(s.id)}
                className={`text-xs px-2.5 py-1 rounded-md transition-all duration-150 whitespace-nowrap ${
                  scenario === s.id
                    ? "bg-white text-brand font-semibold shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {histLoading ? (
          <div className="py-6">
            <LoadingSkeleton rows={5} />
          </div>
        ) : histError ? (
          <ErrorState message={histError} />
        ) : (
          histData && (
            <div className="pt-4 space-y-5">
              {/* Active Component Failure Alerts */}
              <div>
                <h3 className="text-xs font-semibold text-ink-muted mb-2.5">
                  Active Alerts ({histData.active_alerts.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {histData.active_alerts.map((alert, idx) => {
                    const isCrit =
                      alert.alert_level === "CRITICAL" || alert.alert_level === "HIGH";
                    return (
                      <div
                        key={alert.alert_id || idx}
                        style={{ animationDelay: `${idx * 50}ms` }}
                        className={`rounded-xl p-4 border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md animate-scale-in ${
                          isCrit
                            ? "bg-crit/[0.04] border-crit/25"
                            : "bg-warn/[0.04] border-warn/25"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <AlertTriangle
                              size={15}
                              className={`shrink-0 ${isCrit ? "text-crit" : "text-warn"}`}
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-ink truncate">
                                {alert.component}
                              </h4>
                              <p className="text-[11px] text-ink-faint">{alert.subsystem}</p>
                            </div>
                          </div>
                          <StatusPill level={URGENCY_LEVEL[alert.alert_level] || "warn"}>
                            {alert.alert_level} · {alert.failure_risk_pct}%
                          </StatusPill>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap my-2 text-xs font-mono text-ink-muted">
                          <span className="font-semibold text-brand">{alert.primary_dtc}</span>
                          <span>·</span>
                          <span className="font-body truncate flex-1">{alert.dtc_description}</span>
                          <span>·</span>
                          <span className="text-ink-faint tabular-nums">
                            {alert.dtc_occurrences_30d}x / 30d
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-base-border/80 text-xs">
                          <span className="text-ink font-medium truncate">
                            {alert.recommended_action}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono text-ink-faint shrink-0 tabular-nums">
                            <Clock size={11} className="text-accent" />
                            RUL ~{alert.predicted_rul_days}d
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 6-Subsystem Component Failure Probability Grid */}
              <div>
                <h3 className="text-xs font-semibold text-ink-muted mb-2.5">
                  Subsystem Failure Matrix
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {histData.component_predictions.map((c, idx) => (
                    <div
                      key={c.id}
                      style={{ animationDelay: `${idx * 40}ms` }}
                      className="bg-base-inset/70 rounded-xl p-3.5 border border-base-border hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 animate-fade-up"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-ink truncate">
                            {c.component}
                          </div>
                          <div className="text-[10px] text-ink-faint">{c.subsystem}</div>
                        </div>
                        <StatusPill level={URGENCY_LEVEL[c.alert_level] || "good"}>
                          {c.failure_risk_pct}%
                        </StatusPill>
                      </div>

                      <div className="w-full h-1.5 bg-base-border/70 rounded-full overflow-hidden my-2">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            c.alert_level === "CRITICAL" || c.alert_level === "HIGH"
                              ? "bg-crit"
                              : c.alert_level === "WARNING"
                              ? "bg-warn"
                              : "bg-good"
                          }`}
                          style={{ width: `${Math.min(100, c.failure_risk_pct)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted mt-2 tabular-nums">
                        <span>Health {c.health_score}%</span>
                        <span>-{c.degradation_rate_per_day}%/d</span>
                        <span>RUL {c.predicted_rul_days}d</span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-base-border/70 text-[11px] font-mono">
                        <span className="text-brand font-semibold">
                          {c.primary_dtc} ({c.dtc_occurrences_30d}x)
                        </span>
                        <span className="text-ink-faint truncate max-w-[140px]">
                          {c.estimated_repair_window}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 30-Day Historical OBD-II Telemetry Trend & DTC Log */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                <div className="bg-base-inset/50 rounded-xl p-4 border border-base-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-ink">
                      30-Day Health vs. Failure Risk
                    </h4>
                    <span className="text-[11px] font-mono text-ink-faint">
                      {histData.highest_risk_component}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={205}>
                    <LineChart data={histData.historical_timeline}>
                      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="label" stroke={CHART.axis} fontSize={10} tickLine={false} />
                      <YAxis stroke={CHART.axis} fontSize={10} tickLine={false} domain={[0, 100]} />
                      <Tooltip contentStyle={CHART.tooltip} />
                      <Line
                        type="monotone"
                        dataKey="component_health"
                        stroke={CHART.primary}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={true}
                        animationDuration={700}
                        name="Health %"
                      />
                      <Line
                        type="monotone"
                        dataKey="failure_risk_pct"
                        stroke={CHART.danger}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={true}
                        animationDuration={700}
                        name="Risk %"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-base-inset/50 rounded-xl p-4 border border-base-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-ink">30-Day DTC Recurrence</h4>
                    <span className="text-[11px] font-mono text-ink-faint">Freeze-frames</span>
                  </div>
                  <div className="space-y-2 max-h-[205px] overflow-y-auto pr-1">
                    {histData.historical_dtc_log.map((log, i) => (
                      <div
                        key={i}
                        className="bg-white rounded-lg p-2.5 border border-base-border text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1 font-mono">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-brand">{log.code}</span>
                            <span>·</span>
                            <span className="font-body font-medium text-ink truncate">
                              {log.component}
                            </span>
                          </div>
                          <span className="text-[10px] text-ink-faint shrink-0 tabular-nums">
                            {log.occurrences_30d}x · {log.last_seen}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-base-border/60 text-[10px] font-mono text-ink-faint">
                          <span>{log.freeze_frame}</span>
                          <span className="text-crit">{log.predicted_impact}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Live Phase 2 -> Phase 3 Sensor Pipeline Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Sensor Input Pipeline" style={{ animationDelay: "50ms" }}>
          {Object.entries(sensors).map(([key, val]) => {
            const { min, max, step: stepVal } = getBounds(key);
            const pct = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
            return (
              <div key={key} className="mb-3.5 group">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-ink-muted capitalize group-hover:text-ink transition-colors">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-ink font-medium tabular-nums">{val}</span>
                </div>
                <div className="relative flex items-center">
                  <div
                    className="pointer-events-none absolute left-0 h-1.5 rounded-l-full bg-gradient-to-r from-brand to-accent transition-all duration-150"
                    style={{ width: `${pct}%` }}
                  />
                  <input
                    type="range"
                    className="relative z-10 w-full cursor-pointer"
                    min={min}
                    max={max}
                    step={stepVal}
                    value={val}
                    onChange={set(key)}
                  />
                </div>
              </div>
            );
          })}
          <Button onClick={() => executePipeline()} disabled={running} className="w-full mt-2">
            {running ? "Computing…" : "Recompute Prediction"}
          </Button>
          {error && (
            <div className="mt-4">
              <ErrorState message={error} onRetry={() => executePipeline()} />
            </div>
          )}
        </Card>

        <Card title="Live Sensor Prediction" style={{ animationDelay: "100ms" }}>
          {!result ? (
            <LoadingSkeleton rows={6} />
          ) : (
            <div className="animate-fade-up">
              <div className="flex flex-wrap justify-around gap-4 mb-5">
                <Gauge
                  value={result.prediction.predictions.failure_probability * 100}
                  label="Failure risk"
                  invert
                  size={104}
                />
                <Gauge
                  value={Math.min(100, result.prediction.predictions.rul_cycles / 3)}
                  sublabel={`${Math.round(result.prediction.predictions.rul_cycles)}c`}
                  label="RUL"
                  size={104}
                />
              </div>
              <div className="flex justify-center mb-4">
                <StatusPill
                  level={URGENCY_LEVEL[result.prediction.predictions.urgency] || "neutral"}
                >
                  {result.prediction.predictions.urgency} urgency
                </StatusPill>
              </div>

              <h4 className="text-xs font-semibold text-ink-muted mb-2 mt-5">
                Top Risk Sensors (SHAP)
              </h4>
              <div className="space-y-2">
                {result.prediction.top_risk_sensors.map((s, i) => {
                  const barPct = Math.min(100, Math.round(Math.abs(s.shap_value) * 220));
                  return (
                    <div key={i} className="py-1">
                      <StatRow label={s.sensor} value={s.shap_value.toFixed(3)} />
                      <div className="w-full h-1 bg-base-inset rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-gradient-to-r from-accent to-crit rounded-full transition-all duration-700 ease-out"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <h4 className="text-xs font-semibold text-ink-muted mb-2 mt-5">
                Recommended Actions
              </h4>
              <div className="space-y-2">
                {result.prediction.recommendations.map((r, i) => (
                  <div
                    key={i}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className="bg-base-inset/70 rounded-xl p-3 text-xs border border-base-border hover:border-accent/40 transition-all animate-fade-up"
                  >
                    <div className="flex justify-between mb-1 gap-2">
                      <span className="text-ink font-semibold">{r.action}</span>
                      <span className="text-ink-faint font-mono shrink-0 tabular-nums">
                        within {r.book_within_days}d
                      </span>
                    </div>
                    <p className="text-ink-muted">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
