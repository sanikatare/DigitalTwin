import { useState, useEffect } from "react";
import { phase2 } from "../api/client";
import {
  PageHeader,
  Card,
  ErrorState,
  StatRow,
  Button,
  StatusPill,
  LoadingSkeleton,
} from "../components/ui";
import { useApi, errorMessage } from "../hooks/useApi";
import { useVehicle } from "../context/VehicleContext";
import Gauge from "../components/Gauge";

const DEFAULTS = {
  temperature: 85,
  pressure: 28,
  rpm: 2800,
  vibration: 0.3,
  battery_voltage: 12.4,
  battery_current: 40,
  battery_temp: 30,
  fault_count: 1,
};

function Slider({ label, unit, value, min, max, step, onChange }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="mb-3.5 group">
      <div className="flex justify-between items-center text-xs mb-1">
        <span className="text-ink-muted group-hover:text-ink transition-colors">{label}</span>
        <span className="font-mono text-ink font-medium tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <div className="relative flex items-center">
        <div
          className="pointer-events-none absolute left-0 h-1.5 rounded-l-full bg-gradient-to-r from-brand to-accent transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="relative z-10 w-full cursor-pointer"
        />
      </div>
    </div>
  );
}

const CLASS_COLOR = {
  Excellent: "bg-good",
  Good: "bg-accent",
  Warning: "bg-warn",
  Critical: "bg-crit",
};

export default function HealthScore() {
  const { vehicleId } = useVehicle();
  const [reading, setReading] = useState(DEFAULTS);
  const [result, setResult] = useState(null);
  const [scoring, setScoring] = useState(false);

  const {
    data: summary,
    loading: summaryLoading,
    error: summaryError,
  } = useApi(() => phase2.get("/fleet/summary").then((r) => r.data), []);

  useEffect(() => {
    let cancelled = false;
    phase2
      .get(`/fleet/vehicle/${encodeURIComponent(vehicleId)}`)
      .then((r) => {
        if (cancelled) return;
        if (r.data.sensors) {
          setReading(r.data.sensors);
        }
        setResult(r.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  const set = (key) => (val) => setReading((r) => ({ ...r, [key]: val }));

  async function computeScore() {
    setScoring(true);
    try {
      const { data } = await phase2.post("/score", reading);
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setScoring(false);
    }
  }

  const totalVehicles = summary?.total_vehicles || 1;

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="02. Health"
        title="Health Score"
        right={
          result && (
            <StatusPill
              level={
                result.health_class === "Excellent" || result.health_class === "Good"
                  ? "good"
                  : result.health_class === "Warning"
                  ? "warn"
                  : "crit"
              }
            >
              {vehicleId} · {result.health_class}
            </StatusPill>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card title="Fleet Summary" style={{ animationDelay: "40ms" }}>
          {summaryLoading ? (
            <LoadingSkeleton rows={5} />
          ) : summaryError ? (
            <ErrorState message={errorMessage(summaryError, "Health Score")} />
          ) : (
            <>
              <StatRow label="Total vehicles" value={summary.total_vehicles} />
              <StatRow label="Avg. vehicle health" value={summary.mean_vehicle_health} />
              <StatRow label="Avg. engine health" value={summary.mean_engine_health} />
              <StatRow label="Avg. battery health" value={summary.mean_battery_health} />
              <StatRow
                label="Failure rate"
                value={`${(summary.failure_rate * 100).toFixed(2)}%`}
              />
            </>
          )}
        </Card>

        <Card
          title="Health Class Distribution"
          className="lg:col-span-2"
          style={{ animationDelay: "80ms" }}
        >
          {summaryLoading ? (
            <LoadingSkeleton rows={4} />
          ) : summaryError ? (
            <ErrorState message="Health Score unavailable." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(summary.health_class_counts).map(([cls, count], idx) => {
                const share = Math.round((count / totalVehicles) * 100);
                return (
                  <div
                    key={cls}
                    style={{ animationDelay: `${100 + idx * 45}ms` }}
                    className="bg-base-inset/70 rounded-xl p-3.5 text-center border border-base-border hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200 animate-scale-in"
                  >
                    <div className="text-xl font-display font-bold text-ink font-mono tabular-nums">
                      {count}
                    </div>
                    <div className="text-xs text-ink-muted mt-0.5 font-medium">{cls}</div>
                    <div className="w-full h-1.5 bg-base-border/70 rounded-full overflow-hidden mt-2.5">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                          CLASS_COLOR[cls] || "bg-brand"
                        }`}
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <div className="text-[11px] font-mono text-ink-faint mt-1 tabular-nums">
                      {share}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`Sensor Parameters · ${vehicleId}`} style={{ animationDelay: "120ms" }}>
          <Slider
            label="Temperature"
            unit="°C"
            value={reading.temperature}
            min={30}
            max={140}
            step={1}
            onChange={set("temperature")}
          />
          <Slider
            label="Pressure"
            unit=" PSI"
            value={reading.pressure}
            min={5}
            max={50}
            step={1}
            onChange={set("pressure")}
          />
          <Slider
            label="RPM"
            unit=""
            value={reading.rpm}
            min={0}
            max={7000}
            step={50}
            onChange={set("rpm")}
          />
          <Slider
            label="Vibration"
            unit="g"
            value={reading.vibration}
            min={0}
            max={2}
            step={0.05}
            onChange={set("vibration")}
          />
          <Slider
            label="Battery voltage"
            unit="V"
            value={reading.battery_voltage}
            min={9}
            max={14}
            step={0.1}
            onChange={set("battery_voltage")}
          />
          <Slider
            label="Battery current"
            unit="A"
            value={reading.battery_current}
            min={0}
            max={150}
            step={1}
            onChange={set("battery_current")}
          />
          <Slider
            label="Battery temp"
            unit="°C"
            value={reading.battery_temp}
            min={0}
            max={80}
            step={1}
            onChange={set("battery_temp")}
          />
          <Slider
            label="Fault codes"
            unit=""
            value={reading.fault_count}
            min={0}
            max={15}
            step={1}
            onChange={set("fault_count")}
          />
          <Button onClick={computeScore} disabled={scoring} className="w-full mt-2">
            {scoring ? "Computing…" : "Compute Health Score"}
          </Button>
        </Card>

        <Card title="Computed Telemetry" style={{ animationDelay: "160ms" }}>
          {!result ? (
            <LoadingSkeleton rows={6} />
          ) : (
            <div className="animate-fade-up">
              <div className="flex justify-around mb-5 flex-wrap gap-3">
                <Gauge value={result.engine_health} label="Engine" size={104} />
                <Gauge value={result.battery_health} label="Battery" size={104} />
                <Gauge value={result.vehicle_health} label="Vehicle" size={104} />
              </div>
              <div className="flex justify-center mb-4">
                <StatusPill
                  level={
                    result.health_class === "Excellent" || result.health_class === "Good"
                      ? "good"
                      : result.health_class === "Warning"
                      ? "warn"
                      : "crit"
                  }
                >
                  {result.health_class}
                </StatusPill>
              </div>
              <StatRow
                label="Trip readiness"
                value={`${result.trip_readiness} (${result.trip_readiness_label})`}
              />
              {result.ml_health_score != null && (
                <StatRow label="ML health score" value={result.ml_health_score} />
              )}
              {result.predicted_rul != null && (
                <StatRow label="Predicted RUL" value={`${result.predicted_rul} cycles`} />
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
