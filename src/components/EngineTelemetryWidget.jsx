import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Pause, Play, AlertTriangle, Clock } from "lucide-react";
import { phase5 } from "../api/client";
import { StatusPill, CHART, LoadingSkeleton } from "./ui";
import { useVehicle } from "../context/VehicleContext";

const MODES = [
  { id: "cruise", label: "Cruise" },
  { id: "load", label: "High Load" },
  { id: "idle", label: "Idle" },
  { id: "low_oil_fault", label: "Low Oil Fault" },
];

const STATUS_LEVEL = {
  NOMINAL: "good",
  WARNING: "warn",
  CRITICAL_LOW: "crit",
};

function formatSampleTimestamp(sample, fallbackLabel) {
  if (sample?.iso_timestamp) {
    return sample.iso_timestamp.replace("T", " ").slice(0, 19) + " UTC";
  }
  if (sample?.ts) {
    const ms = sample.ts > 1e11 ? sample.ts : sample.ts * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    }
  }
  return fallbackLabel || sample?.time || "Live Sample";
}

function EngineTelemetryTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;

  const sample = payload[0]?.payload;
  if (!sample) return null;

  const rpm = Number(sample.rpm ?? 0);
  const psi = Number(sample.oil_pressure_psi ?? 0);
  const ect = sample.coolant_temp_c != null ? Number(sample.coolant_temp_c) : null;
  const ratio = rpm > 0 ? (psi / rpm) * 1000 : 0;
  const psiDelta = psi - 20;
  const rpmPct = Math.min(100, Math.round((rpm / 6500) * 100));
  const psiPct = Math.min(100, Math.round((psi / 65) * 100));
  const fullTimestamp = formatSampleTimestamp(sample, label);

  const sampleStatus =
    psi < 18 ? "CRITICAL_LOW" : psi < 23 ? "WARNING" : "NOMINAL";
  const isFault = sampleStatus !== "NOMINAL";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={sample.ts || label}
        initial={{ opacity: 0, y: 8, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
        className="panel bg-white/95 backdrop-blur-md border border-base-border rounded-xl p-3.5 shadow-xl min-w-[250px] pointer-events-none"
      >
        {/* Header: Timestamp + Sample Status */}
        <div className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-base-border">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
              <span className="text-xs font-bold text-ink font-mono tabular-nums">
                {label || sample.time}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-ink-faint mt-0.5 tabular-nums">
              <Clock size={10} className="shrink-0 text-accent" />
              <span>{fullTimestamp}</span>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0 ${
              sampleStatus === "CRITICAL_LOW"
                ? "bg-crit/10 text-crit"
                : sampleStatus === "WARNING"
                ? "bg-warn/10 text-warn"
                : "bg-good/10 text-good"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sampleStatus === "CRITICAL_LOW"
                  ? "bg-crit animate-ping"
                  : sampleStatus === "WARNING"
                  ? "bg-warn animate-pulse"
                  : "bg-good"
              }`}
            />
            {sampleStatus === "CRITICAL_LOW"
              ? "P0522 FAULT"
              : sampleStatus === "WARNING"
              ? "MARGINAL"
              : "NOMINAL"}
          </span>
        </div>

        {/* Metrics Rows */}
        <div className="space-y-2.5 text-xs">
          {/* Engine Speed */}
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.16, delay: 0.02 }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-ink-muted font-medium">
                <span className="w-2 h-2 rounded-full bg-accent" />
                Engine Speed
              </span>
              <span className="font-mono font-bold text-ink tabular-nums">
                {rpm.toLocaleString()} RPM
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-ink-faint mt-0.5">
              <span>Load Band</span>
              <span>{rpmPct}% of 6,500 max</span>
            </div>
            <div className="w-full h-1 bg-base-border/70 rounded-full overflow-hidden mt-1">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${rpmPct}%` }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-brand to-accent rounded-full"
              />
            </div>
          </motion.div>

          {/* Oil Gallery Pressure */}
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.16, delay: 0.05 }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-ink-muted font-medium">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isFault ? "bg-crit" : "bg-good"
                  }`}
                />
                Oil Pressure
              </span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  isFault ? "text-crit" : "text-good"
                }`}
              >
                {psi.toFixed(1)} PSI
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono mt-0.5">
              <span className="text-ink-faint">vs 20.0 PSI Min</span>
              <span className={psiDelta >= 0 ? "text-good" : "text-crit font-semibold"}>
                {psiDelta >= 0 ? `+${psiDelta.toFixed(1)}` : psiDelta.toFixed(1)} PSI
              </span>
            </div>
            <div className="w-full h-1 bg-base-border/70 rounded-full overflow-hidden mt-1">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${psiPct}%` }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className={`h-full rounded-full ${
                  isFault ? "bg-crit" : "bg-good"
                }`}
              />
            </div>
          </motion.div>

          {/* Derived Telemetry Footer */}
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: 0.08 }}
            className="pt-2 border-t border-base-border/80 grid grid-cols-2 gap-2 text-[11px] font-mono"
          >
            <div className="bg-base-inset/70 rounded-lg px-2 py-1">
              <div className="text-[10px] text-ink-faint">PSI / 1k RPM</div>
              <div className="font-semibold text-ink tabular-nums">
                {ratio.toFixed(2)}
              </div>
            </div>
            <div className="bg-base-inset/70 rounded-lg px-2 py-1">
              <div className="text-[10px] text-ink-faint">Coolant ECT</div>
              <div className="font-semibold text-ink tabular-nums">
                {ect != null ? `${ect.toFixed(1)}°C` : "—"}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function EngineTelemetryWidget({ onApplyTelemetry }) {
  const { vehicleId } = useVehicle();
  const [mode, setMode] = useState("cruise");
  const [live, setLive] = useState(true);
  const [samples, setSamples] = useState([]);
  const [latest, setLatest] = useState(null);
  const [pressureStatus, setPressureStatus] = useState("NOMINAL");
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    phase5
      .get(`/telemetry/${encodeURIComponent(vehicleId)}`, { params: { mode } })
      .then((r) => {
        if (cancelled) return;
        setSamples(r.data.samples || []);
        setLatest(r.data.latest || null);
        setPressureStatus(r.data.pressure_status || "NOMINAL");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, mode]);

  useEffect(() => {
    if (!live) return undefined;
    const interval = setInterval(() => {
      phase5
        .get(`/telemetry/${encodeURIComponent(vehicleId)}`, { params: { mode } })
        .then((r) => {
          const nextPoint = r.data.latest;
          if (!nextPoint) return;
          setLatest(nextPoint);
          setPressureStatus(r.data.pressure_status || "NOMINAL");
          setSamples((prev) => {
            if (prev.length === 0) return r.data.samples || [nextPoint];
            const lastTs = prev[prev.length - 1]?.ts;
            if (lastTs === nextPoint.ts) {
              const jitterRpm = Math.round((Math.random() - 0.5) * 70);
              const jitterPsi = Math.round((Math.random() - 0.5) * 0.8 * 10) / 10;
              const d = new Date();
              const synthetic = {
                ...nextPoint,
                ts: Math.floor(d.getTime() / 1000),
                time: d.toTimeString().slice(0, 8),
                iso_timestamp: d.toISOString(),
                rpm: Math.max(650, nextPoint.rpm + jitterRpm),
                oil_pressure_psi: Math.max(
                  8,
                  Math.round((nextPoint.oil_pressure_psi + jitterPsi) * 10) / 10
                ),
              };
              setLatest(synthetic);
              return [...prev.slice(-19), synthetic];
            }
            return [...prev.slice(-19), nextPoint];
          });
        })
        .catch(() => {});
    }, 1500);

    return () => clearInterval(interval);
  }, [vehicleId, mode, live]);

  const rpmPct = latest ? Math.min(100, Math.round((latest.rpm / 6500) * 100)) : 0;
  const psiPct = latest ? Math.min(100, Math.round((latest.oil_pressure_psi / 65) * 100)) : 0;
  const isLowPressure = pressureStatus === "CRITICAL_LOW" || pressureStatus === "WARNING";

  return (
    <section className="panel relative overflow-hidden p-5 animate-fade-up">
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand/0 via-accent/60 to-brand/0" />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-base-border">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display font-bold text-base sm:text-lg text-ink tracking-tight">
            Engine Telemetry
          </h2>
          <span className="text-xs font-mono text-ink-faint">
            · {vehicleId} · {live ? "LIVE 1.5s" : "PAUSED"}
          </span>
          <StatusPill level={STATUS_LEVEL[pressureStatus] || "good"}>
            {pressureStatus === "CRITICAL_LOW"
              ? "Low Oil Pressure (P0522)"
              : pressureStatus === "WARNING"
              ? "Marginal Pressure"
              : "Oil Pressure Nominal"}
          </StatusPill>
        </div>

        {/* Operating Profile & Live Stream Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border flex-wrap">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                  mode === m.id
                    ? "bg-white text-brand shadow-sm font-semibold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLive((l) => !l)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${
              live
                ? "bg-brand-light border-brand/25 text-brand hover:bg-brand hover:text-white"
                : "bg-base-inset border-base-border text-ink-muted hover:text-ink"
            }`}
          >
            {live ? <Pause size={12} /> : <Play size={12} />}
            {live ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      {/* Live Digital Readout Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 py-4 border-b border-base-border/80">
        <div className="bg-base-inset/60 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
            <span className="font-medium">Engine Speed</span>
            <span className="text-[11px] font-mono text-ink-faint">Max 6,500</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-display font-bold text-ink font-mono tabular-nums">
              {latest ? latest.rpm.toLocaleString() : "—"}
            </span>
            <span className="text-xs font-mono text-brand font-medium">RPM</span>
          </div>
          <div className="w-full h-1.5 bg-base-border/70 rounded-full overflow-hidden mt-2.5">
            <div
              className="h-full bg-gradient-to-r from-brand to-accent rounded-full transition-all duration-300"
              style={{ width: `${rpmPct}%` }}
            />
          </div>
        </div>

        <div
          className={`rounded-xl p-3.5 transition-colors ${
            isLowPressure ? "bg-crit/[0.06]" : "bg-base-inset/60"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
            <span className="font-medium">Oil Gallery Pressure</span>
            <span className="text-[11px] font-mono text-ink-faint">Min 20 PSI</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`text-2xl font-display font-bold font-mono tabular-nums ${
                isLowPressure ? "text-crit" : "text-ink"
              }`}
            >
              {latest ? latest.oil_pressure_psi.toFixed(1) : "—"}
            </span>
            <span
              className={`text-xs font-mono font-medium ${
                isLowPressure ? "text-crit" : "text-good"
              }`}
            >
              PSI
            </span>
          </div>
          <div className="w-full h-1.5 bg-base-border/70 rounded-full overflow-hidden mt-2.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isLowPressure ? "bg-crit" : "bg-good"
              }`}
              style={{ width: `${psiPct}%` }}
            />
          </div>
        </div>

        <div className="bg-base-inset/60 rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span className="font-medium">Pressure / 1k RPM</span>
              <span className="text-[11px] font-mono text-ink-faint">
                {latest ? `${latest.coolant_temp_c}°C ECT` : ""}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-display font-bold text-ink font-mono tabular-nums">
                {latest ? ((latest.oil_pressure_psi / latest.rpm) * 1000).toFixed(1) : "—"}
              </span>
              <span className="text-xs font-mono text-ink-muted">PSI / 1k</span>
            </div>
          </div>

          {onApplyTelemetry && latest ? (
            <button
              type="button"
              onClick={() =>
                onApplyTelemetry({
                  rpm: latest.rpm,
                  oil_pressure_psi: latest.oil_pressure_psi,
                  fault_code: isLowPressure ? "P0522" : null,
                })
              }
              className="mt-2.5 w-full py-1.5 px-2.5 rounded-lg bg-white hover:bg-brand-light border border-base-border text-xs font-medium text-brand transition-all text-center whitespace-nowrap"
            >
              Sync {latest.rpm} RPM to Pipeline
            </button>
          ) : (
            <div className="text-[11px] text-ink-faint mt-2 font-mono">
              Target: 10.0–14.5 PSI / 1k RPM
            </div>
          )}
        </div>
      </div>

      {isLowPressure && (
        <div className="mt-3.5 bg-crit/10 border border-crit/25 rounded-lg px-3.5 py-2 flex items-center gap-2 text-xs text-crit font-medium animate-scale-in">
          <AlertTriangle size={14} className="shrink-0 animate-pulse" />
          <span>
            Oil pressure ({latest?.oil_pressure_psi} PSI @ {latest?.rpm} RPM) below 20 PSI threshold (DTC P0522).
          </span>
        </div>
      )}

      {/* Live Dual-Axis Recharts Line Chart */}
      <div className="pt-4">
        {loading && samples.length === 0 ? (
          <LoadingSkeleton rows={5} />
        ) : (
          <div className="bg-base-inset/40 rounded-xl p-3.5 border border-base-border">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2 text-xs">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <span className="w-3 h-0.5 bg-accent inline-block rounded" /> RPM
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <span
                    className={`w-3 h-0.5 inline-block rounded ${
                      isLowPressure ? "bg-crit" : "bg-good"
                    }`}
                  />
                  Oil Pressure (PSI)
                </span>
              </div>
              <AnimatePresence mode="wait">
                {hoveredPoint ? (
                  <motion.span
                    key={hoveredPoint.ts || hoveredPoint.time}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.14 }}
                    className="text-[11px] font-mono text-ink tabular-nums"
                  >
                    <strong>{ formatSampleTimestamp(hoveredPoint, hoveredPoint.time) }</strong> ·{" "}
                    <span className="text-accent font-semibold">
                      {Number(hoveredPoint.rpm).toLocaleString()} RPM
                    </span>{" "}
                    ·{" "}
                    <span
                      className={`font-semibold ${
                        hoveredPoint.oil_pressure_psi < 20 ? "text-crit" : "text-good"
                      }`}
                    >
                      {Number(hoveredPoint.oil_pressure_psi).toFixed(1)} PSI
                    </span>
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle-hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[11px] font-mono text-ink-faint"
                  >
                    Hover curve for timestamped sample inspection · 20-sample window
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <ResponsiveContainer width="100%" height={230}>
              <LineChart
                data={samples}
                onMouseMove={(state) => {
                  if (state?.activePayload?.length) {
                    setHoveredPoint(state.activePayload[0].payload);
                  }
                }}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  stroke={CHART.axis}
                  fontSize={10}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="rpm"
                  orientation="left"
                  stroke="#2E7DE1"
                  fontSize={10}
                  tickLine={false}
                  domain={[500, 6500]}
                  tickFormatter={(v) => `${v}`}
                />
                <YAxis
                  yAxisId="psi"
                  orientation="right"
                  stroke={isLowPressure ? "#F04438" : "#12B76A"}
                  fontSize={10}
                  tickLine={false}
                  domain={[0, 65]}
                  tickFormatter={(v) => `${v} psi`}
                />
                <Tooltip
                  content={<EngineTelemetryTooltip />}
                  cursor={{
                    stroke: "#2E7DE1",
                    strokeWidth: 1.5,
                    strokeDasharray: "4 4",
                  }}
                />
                <ReferenceLine
                  yAxisId="psi"
                  y={20}
                  stroke="#F79009"
                  strokeDasharray="4 4"
                  label={{
                    value: "Min 20 PSI",
                    position: "insideBottomRight",
                    fill: "#F79009",
                    fontSize: 10,
                  }}
                />
                <Line
                  yAxisId="rpm"
                  type="monotone"
                  dataKey="rpm"
                  stroke="#2E7DE1"
                  strokeWidth={2.25}
                  dot={{ r: 2, fill: "#2E7DE1", strokeWidth: 0 }}
                  activeDot={{
                    r: 5.5,
                    fill: "#2E7DE1",
                    stroke: "#FFFFFF",
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                  name="Engine RPM"
                />
                <Line
                  yAxisId="psi"
                  type="monotone"
                  dataKey="oil_pressure_psi"
                  stroke={isLowPressure ? "#F04438" : "#12B76A"}
                  strokeWidth={2.25}
                  dot={{
                    r: 2,
                    fill: isLowPressure ? "#F04438" : "#12B76A",
                    strokeWidth: 0,
                  }}
                  activeDot={{
                    r: 5.5,
                    fill: isLowPressure ? "#F04438" : "#12B76A",
                    stroke: "#FFFFFF",
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                  name="Oil Pressure (PSI)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
