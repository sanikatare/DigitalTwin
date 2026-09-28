import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  HeartPulse,
  Wrench,
  Boxes,
  ScanLine,
  BookOpen,
  MessageSquare,
  Map,
  Gauge as GaugeIcon,
  ArrowRight,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { phase2, phase3 } from "../api/client";
import {
  Card,
  ErrorState,
  GaugeSkeleton,
  StatusPill,
  LoadingSkeleton,
} from "../components/ui";
import { useVehicle } from "../context/VehicleContext";
import Gauge from "../components/Gauge";
import RecentTrips from "../components/RecentTrips";
import EngineTelemetryWidget from "../components/EngineTelemetryWidget";
import DriverBehaviorAnalysis from "../components/DriverBehaviorAnalysis";

const PHASES = [
  { to: "/health", n: "02", title: "Health Score", icon: HeartPulse },
  { to: "/maintenance", n: "03", title: "Predictive Maintenance", icon: Wrench },
  { to: "/twin", n: "04", title: "Digital Twin", icon: Boxes },
  { to: "/obd", n: "05", title: "OBD Diagnostics", icon: ScanLine },
  { to: "/knowledge", n: "06", title: "Knowledge Base", icon: BookOpen },
  { to: "/assistant", n: "07", title: "Assistant", icon: MessageSquare },
  { to: "/trip", n: "08", title: "Trip Planner", icon: Map },
  { to: "/driver", n: "09", title: "Driver Behaviour", icon: GaugeIcon },
];

const SCENARIOS = [
  { id: "actual", label: "Actual Log" },
  { id: "cooling_degradation", label: "Cooling (P0118)" },
  { id: "ignition_misfire", label: "Misfire (P0300)" },
  { id: "catalytic_fuel_drift", label: "Catalyst (P0420)" },
  { id: "battery_alternator_sag", label: "Voltage (P0562)" },
];

const ALERT_PILL = {
  CRITICAL: "crit",
  HIGH: "crit",
  WARNING: "warn",
  NORMAL: "good",
};

function MetricCard({ title, loading, error, delay = 0, children }) {
  return (
    <Card title={title} style={{ animationDelay: `${delay}ms` }}>
      {loading ? (
        <GaugeSkeleton size={112} />
      ) : error ? (
        <ErrorState message="Health Score unavailable." />
      ) : (
        children
      )}
    </Card>
  );
}

export default function Overview() {
  const { vehicleId, setVehicleId } = useVehicle();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [scenario, setScenario] = useState("actual");
  const [obdAnalysis, setObdAnalysis] = useState(null);
  const [obdLoading, setObdLoading] = useState(true);
  const [fleetAlerts, setFleetAlerts] = useState(null);
  const [viewMode, setViewMode] = useState("vehicle");
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0, cx: 50, cy: 50 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    phase2
      .get(`/fleet/vehicle/${encodeURIComponent(vehicleId)}`)
      .then((r) => {
        if (!cancelled) setHealth(r.data);
      })
      .catch(() => {
        if (!cancelled) {
          setHealth(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  useEffect(() => {
    let cancelled = false;
    setObdLoading(true);
    phase3
      .get(`/historical-obd/${encodeURIComponent(vehicleId)}`, {
        params: { scenario },
      })
      .then((r) => {
        if (!cancelled) setObdAnalysis(r.data);
      })
      .catch(() => {
        if (!cancelled) setObdAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setObdLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, scenario]);

  useEffect(() => {
    let cancelled = false;
    phase3
      .get("/fleet-alerts")
      .then((r) => {
        if (!cancelled) setFleetAlerts(r.data);
      })
      .catch(() => {
        if (!cancelled) setFleetAlerts(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const alertsToDisplay =
    viewMode === "fleet"
      ? fleetAlerts?.alerts?.slice(0, 4) || []
      : obdAnalysis?.active_alerts || [];

  function handleHeroMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setHeroTilt({
      x: ny * -8,
      y: nx * 8,
      cx: ((e.clientX - rect.left) / rect.width) * 100,
      cy: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* Interactive QClay-Inspired 3D Kinetic Hero Banner */}
      <div
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={() => setHeroTilt({ x: 0, y: 0, cx: 50, cy: 50 })}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#001447] via-[#0033A0] to-[#001E66] text-white p-6 sm:p-7 shadow-lg animate-fade-up"
      >
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{
            background: `radial-gradient(480px circle at ${heroTilt.cx}% ${heroTilt.cy}%, rgba(96, 165, 250, 0.25), transparent 65%)`,
          }}
        />

        {/* Animated Orbital Rings in Hero Backdrop */}
        <div
          className="pointer-events-none absolute -right-16 -top-24 w-80 h-80 opacity-35 transition-transform duration-150 ease-out"
          style={{
            transform: `perspective(800px) rotateX(${heroTilt.x}deg) rotateY(${heroTilt.y}deg)`,
          }}
        >
          <svg
            viewBox="0 0 300 300"
            className="w-full h-full"
            style={{ animation: "orbitSlow 24s linear infinite" }}
          >
            <circle
              cx="150"
              cy="150"
              r="130"
              fill="none"
              stroke="rgba(147, 197, 253, 0.5)"
              strokeWidth="1.5"
              strokeDasharray="8 12"
            />
            <circle
              cx="150"
              cy="150"
              r="98"
              fill="none"
              stroke="rgba(255, 255, 255, 0.35)"
              strokeWidth="2"
              strokeDasharray="60 90"
              strokeLinecap="round"
            />
            <circle cx="150" cy="20" r="4" fill="#93C5FD" />
            <circle cx="280" cy="150" r="4" fill="#93C5FD" />
          </svg>
        </div>

        <svg
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="pointer-events-none absolute bottom-0 left-0 w-full h-16 opacity-30"
        >
          <path
            d="M 0 60 Q 150 15, 300 60 T 600 60 T 900 60 T 1200 60"
            fill="none"
            stroke="rgba(147, 197, 253, 0.7)"
            strokeWidth="1.5"
            strokeDasharray="10 8"
            style={{ animation: "dashFlow 6s linear infinite" }}
          />
        </svg>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-sky-200 mb-2">
              <span className="w-2 h-2 rounded-full bg-good animate-ping" />
              <span>DIGITWIN TELEMETRY</span>
              <span>·</span>
              <span>{vehicleId}</span>
              {health && (
                <>
                  <span>·</span>
                  <span className="text-white font-semibold">{health.health_class}</span>
                </>
              )}
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-white">
              Vehicle Intelligence Twin
            </h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {health && (
              <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-4 py-2.5 font-mono text-xs">
                <div>
                  <div className="text-[10px] text-sky-200">HEALTH</div>
                  <div className="text-base font-bold tabular-nums">{health.vehicle_health}%</div>
                </div>
                <div className="h-6 w-px bg-white/15" />
                <div>
                  <div className="text-[10px] text-sky-200">RUL</div>
                  <div className="text-base font-bold tabular-nums">{health.predicted_rul}c</div>
                </div>
                <div className="h-6 w-px bg-white/15" />
                <div>
                  <div className="text-[10px] text-sky-200">READINESS</div>
                  <div className="text-base font-bold tabular-nums">{health.trip_readiness_label}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4 Core Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Vehicle Health" loading={loading} error={error && !health} delay={0}>
          {health && (
            <div className="flex justify-center">
              <Gauge value={health.vehicle_health} label={vehicleId} size={112} />
            </div>
          )}
        </MetricCard>
        <MetricCard title="Engine" loading={loading} error={error && !health} delay={50}>
          {health && (
            <div className="flex justify-center">
              <Gauge value={health.engine_health} label="Engine" size={112} />
            </div>
          )}
        </MetricCard>
        <MetricCard title="Battery" loading={loading} error={error && !health} delay={100}>
          {health && (
            <div className="flex justify-center">
              <Gauge value={health.battery_health} label="Battery" size={112} />
            </div>
          )}
        </MetricCard>
        <MetricCard title="Trip Readiness" loading={loading} error={error && !health} delay={150}>
          {health && (
            <div className="flex justify-center">
              <Gauge value={health.trip_readiness} label={health.trip_readiness_label} size={112} />
            </div>
          )}
        </MetricCard>
      </div>

      {/* Dedicated Historical OBD-II Component Failure Alert Section */}
      <div
        className="panel relative overflow-hidden p-5 animate-fade-up border-l-4 border-l-brand"
        style={{ animationDelay: "140ms" }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-base-border">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display font-bold text-base sm:text-lg text-ink tracking-tight">
              OBD-II Component Failure Alerts
            </h2>
            {obdAnalysis && (
              <StatusPill level={ALERT_PILL[obdAnalysis.overall_alert_status] || "neutral"}>
                {obdAnalysis.overall_alert_status}
              </StatusPill>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border">
              <button
                type="button"
                onClick={() => setViewMode("vehicle")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  viewMode === "vehicle"
                    ? "bg-white text-brand shadow-sm font-semibold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {vehicleId}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("fleet")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  viewMode === "fleet"
                    ? "bg-white text-brand shadow-sm font-semibold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                Fleet Alerts
                {fleetAlerts ? ` (${fleetAlerts.critical_component_alerts})` : ""}
              </button>
            </div>

            <Link
              to="/maintenance"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-dark transition-all shadow-sm hover:-translate-y-0.5 whitespace-nowrap"
            >
              <span>Analyzer</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {viewMode === "vehicle" && (
          <div className="flex items-center justify-between gap-3 flex-wrap py-3 border-b border-base-border/70">
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

            {obdAnalysis && (
              <div className="flex items-center gap-2 text-xs font-mono text-ink-muted tabular-nums">
                <span>{obdAnalysis.analyzed_scans_30d} scans</span>
                <span>·</span>
                <span>{obdAnalysis.total_dtc_events_30d} DTCs (30d)</span>
              </div>
            )}
          </div>
        )}

        <div className="pt-4">
          {obdLoading && viewMode === "vehicle" ? (
            <LoadingSkeleton rows={3} />
          ) : alertsToDisplay.length === 0 ? (
            <p className="text-sm text-ink-faint py-6 text-center">No active alerts.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {alertsToDisplay.map((alert, idx) => {
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
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AlertTriangle
                          size={16}
                          className={`shrink-0 ${isCrit ? "text-crit" : "text-warn"}`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-ink truncate">
                              {alert.component}
                            </h3>
                            {viewMode === "fleet" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVehicleId(alert.vehicle_id);
                                  setViewMode("vehicle");
                                }}
                                className="text-xs font-mono text-brand font-semibold hover:underline"
                              >
                                · {alert.vehicle_id}
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-ink-faint">{alert.subsystem}</p>
                        </div>
                      </div>
                      <StatusPill level={ALERT_PILL[alert.alert_level] || "warn"}>
                        {alert.alert_level} · {alert.failure_risk_pct}%
                      </StatusPill>
                    </div>

                    <div className="w-full h-1.5 bg-base-border/70 rounded-full overflow-hidden mb-2.5">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isCrit ? "bg-crit" : "bg-warn"
                        }`}
                        style={{ width: `${Math.min(100, alert.failure_risk_pct)}%` }}
                      />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mb-2 text-xs font-mono text-ink-muted">
                      <span className="font-semibold text-brand">{alert.primary_dtc}</span>
                      <span>·</span>
                      <span className="font-body truncate flex-1">{alert.dtc_description}</span>
                      <span>·</span>
                      <span className="text-ink-faint tabular-nums">
                        {alert.dtc_occurrences_30d}x
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
          )}
        </div>
      </div>

      <EngineTelemetryWidget />

      <RecentTrips compact />

      <DriverBehaviorAnalysis compact />

      {/* Clean Bento Module Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {PHASES.map(({ to, n, title, icon: Icon }, idx) => (
          <Link
            key={to}
            to={to}
            style={{ animationDelay: `${160 + idx * 35}ms` }}
            className="panel panel-interactive relative overflow-hidden p-4 flex items-center justify-between gap-3 group animate-fade-up"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-brand-light flex items-center justify-center shrink-0 transition-all duration-200 group-hover:bg-brand group-hover:scale-105">
                <Icon
                  size={16}
                  className="text-brand transition-colors duration-200 group-hover:text-white"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-ink-faint">0{n.slice(-1)}</div>
                <h3 className="text-xs sm:text-sm font-semibold text-ink group-hover:text-brand transition-colors truncate">
                  {title}
                </h3>
              </div>
            </div>
            <ArrowRight
              size={14}
              className="text-ink-faint group-hover:text-brand group-hover:translate-x-0.5 transition-all duration-150 shrink-0"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
