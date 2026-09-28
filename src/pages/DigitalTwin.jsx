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
import { phase4 } from "../api/client";
import {
  PageHeader,
  Card,
  Loading,
  ErrorState,
  Button,
  StatusPill,
  CHART,
  GaugeSkeleton,
  LoadingSkeleton,
} from "../components/ui";
import { useApi, errorMessage } from "../hooks/useApi";
import { useVehicle } from "../context/VehicleContext";
import Gauge from "../components/Gauge";

const SUBSYSTEM_COORDS = [
  { key: "engine", label: "Engine", cx: 95, cy: 70 },
  { key: "battery", label: "Battery", cx: 165, cy: 52 },
  { key: "fuel", label: "Fuel", cx: 235, cy: 70 },
  { key: "brake", label: "Brake", cx: 280, cy: 96 },
];

export default function DigitalTwin() {
  const { vehicleId } = useVehicle();
  const [simDays, setSimDays] = useState(30);
  const [simData, setSimData] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [activeNode, setActiveNode] = useState("engine");

  const {
    data: fleet,
    loading: fleetLoading,
    error: fleetError,
  } = useApi(() => phase4.get("/fleet").then((r) => r.data), []);

  const {
    data: current,
    loading: curLoading,
    error: curError,
    refetch,
  } = useApi(() => phase4.get(`/current/${vehicleId}`).then((r) => r.data), [vehicleId]);

  const {
    data: components,
    loading: compLoading,
    error: compError,
  } = useApi(() => phase4.get(`/components/${vehicleId}`).then((r) => r.data), [vehicleId]);

  async function runSimulation(daysOverride) {
    const horizon = daysOverride ?? simDays;
    if (daysOverride != null) setSimDays(daysOverride);
    setSimulating(true);
    try {
      const { data } = await phase4.post("/simulate", {
        vehicle_id: vehicleId,
        days: horizon,
      });
      setSimData(
        data.trajectory.map((p) => ({
          day: p.day,
          health: p.vehicle_health,
          risk: +(p.failure_probability * 100).toFixed(1),
        }))
      );
    } catch {
      setSimData(null);
    } finally {
      setSimulating(false);
    }
  }

  useEffect(() => {
    runSimulation(simDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const totalFleet = fleet?.total_vehicles || 1;
  const focusedComp = components?.[activeNode];

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="04. Twin"
        title="Digital Twin"
        right={
          current && (
            <StatusPill
              level={
                current.overall_failure_probability > 0.5
                  ? "crit"
                  : current.overall_failure_probability > 0.2
                  ? "warn"
                  : "good"
              }
            >
              {vehicleId} · {current.health_class}
            </StatusPill>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Simulated Fleet" style={{ animationDelay: "0ms" }}>
          {fleetLoading ? (
            <LoadingSkeleton rows={3} />
          ) : fleetError ? (
            <ErrorState message={errorMessage(fleetError, "Digital Twin")} />
          ) : (
            fleet && (
              <>
                <div className="text-2xl font-display font-bold text-ink font-mono tabular-nums">
                  {fleet.total_vehicles}
                </div>
                <div className="text-[11px] text-ink-muted mb-2.5">active twins</div>
                <div className="w-full h-2 rounded-full bg-base-inset overflow-hidden flex mb-3">
                  <div
                    className="bg-good h-full transition-all duration-700"
                    style={{ width: `${(fleet.excellent_count / totalFleet) * 100}%` }}
                  />
                  <div
                    className="bg-accent h-full transition-all duration-700"
                    style={{ width: `${(fleet.good_count / totalFleet) * 100}%` }}
                  />
                  <div
                    className="bg-warn h-full transition-all duration-700"
                    style={{ width: `${(fleet.warning_count / totalFleet) * 100}%` }}
                  />
                  <div
                    className="bg-crit h-full transition-all duration-700"
                    style={{ width: `${(fleet.critical_count / totalFleet) * 100}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2.5 text-[11px] font-mono tabular-nums">
                  <span className="text-good">{fleet.excellent_count} exc</span>
                  <span className="text-accent">{fleet.good_count} good</span>
                  <span className="text-warn">{fleet.warning_count} warn</span>
                  <span className="text-crit">{fleet.critical_count} crit</span>
                </div>
              </>
            )
          )}
        </Card>

        {curLoading ? (
          <>
            <Card>
              <GaugeSkeleton size={100} />
            </Card>
            <Card>
              <GaugeSkeleton size={100} />
            </Card>
            <Card>
              <LoadingSkeleton rows={2} />
            </Card>
          </>
        ) : curError ? (
          <div className="sm:col-span-2 xl:col-span-3 panel p-0 overflow-hidden">
            <ErrorState message={errorMessage(curError, "Digital Twin")} onRetry={refetch} />
          </div>
        ) : (
          current && (
            <>
              <Card title="Overall Health" style={{ animationDelay: "50ms" }}>
                <div className="flex justify-center">
                  <Gauge value={current.overall_health} label="Twin health" size={100} />
                </div>
              </Card>
              <Card title="Failure Risk" style={{ animationDelay: "100ms" }}>
                <div className="flex justify-center">
                  <Gauge
                    value={current.overall_failure_probability * 100}
                    label="Risk %"
                    invert
                    size={100}
                  />
                </div>
              </Card>
              <Card title="Twin Status" style={{ animationDelay: "150ms" }}>
                <div className="flex flex-col items-center justify-center h-full min-h-[104px] gap-2">
                  <StatusPill
                    level={
                      current.overall_failure_probability > 0.5
                        ? "crit"
                        : current.overall_failure_probability > 0.2
                        ? "warn"
                        : "good"
                    }
                  >
                    {current.health_class}
                  </StatusPill>
                  <span className="text-xs text-ink-faint font-mono">{vehicleId}</span>
                </div>
              </Card>
            </>
          )
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Interactive Subsystem Twin" style={{ animationDelay: "180ms" }}>
          {compLoading ? (
            <Loading label="Loading components…" />
          ) : compError ? (
            <ErrorState message={errorMessage(compError, "Digital Twin")} />
          ) : components ? (
            <div className="space-y-4">
              {/* Interactive Animated Vehicle Schematic */}
              <div className="relative bg-gradient-to-br from-[#001447] via-[#002878] to-[#0033A0] rounded-xl p-4 text-white overflow-hidden">
                <svg viewBox="0 0 380 130" className="w-full h-32 select-none">
                  {/* Animated Telemetry Grid Lines */}
                  <line
                    x1="20"
                    y1="105"
                    x2="360"
                    y2="105"
                    stroke="rgba(147,197,253,0.3)"
                    strokeWidth="1"
                    strokeDasharray="6 6"
                  />
                  {/* Vehicle Silhouette Blueprint */}
                  <path
                    d="M45 96 L75 96 L105 46 L235 46 L285 68 L335 74 L342 96 L45 96 Z"
                    fill="rgba(46, 125, 225, 0.15)"
                    stroke="#93C5FD"
                    strokeWidth="1.75"
                    strokeDasharray="280"
                    style={{ animation: "dashFlow 7s linear infinite" }}
                  />
                  <circle cx="102" cy="96" r="14" fill="#001447" stroke="#FFFFFF" strokeWidth="2" />
                  <circle cx="282" cy="96" r="14" fill="#001447" stroke="#FFFFFF" strokeWidth="2" />

                  {/* Interactive Subsystem Nodes */}
                  {SUBSYSTEM_COORDS.map((node) => {
                    const comp = components[node.key];
                    const isSelected = activeNode === node.key;
                    const nodeColor =
                      comp?.health_score >= 75
                        ? "#12B76A"
                        : comp?.health_score >= 50
                        ? "#F79009"
                        : "#F04438";
                    return (
                      <g
                        key={node.key}
                        onClick={() => setActiveNode(node.key)}
                        className="cursor-pointer"
                      >
                        {isSelected && (
                          <circle
                            cx={node.cx}
                            cy={node.cy}
                            r="15"
                            fill="none"
                            stroke={nodeColor}
                            strokeWidth="1.5"
                            style={{ animation: "pulseRing 2s ease-in-out infinite" }}
                          />
                        )}
                        <circle
                          cx={node.cx}
                          cy={node.cy}
                          r={isSelected ? 7 : 5.5}
                          fill={nodeColor}
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                        <text
                          x={node.cx}
                          y={node.cy - 11}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="9"
                          fontFamily='"Playfair Display", Georgia, serif'
                        >
                          {node.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {focusedComp && (
                  <div className="flex items-center justify-between text-xs font-mono pt-2 border-t border-white/15">
                    <span className="capitalize font-semibold text-sky-200">{activeNode} Node</span>
                    <span>Health {Math.round(focusedComp.health_score)}%</span>
                    <span>Risk {(focusedComp.failure_probability * 100).toFixed(1)}%</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {["engine", "battery", "fuel", "brake"].map(
                  (c, idx) =>
                    components[c] && (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setActiveNode(c)}
                        style={{ animationDelay: `${idx * 50}ms` }}
                        className={`text-left flex items-center gap-3.5 rounded-xl p-3 border transition-all duration-150 hover:-translate-y-0.5 animate-scale-in ${
                          activeNode === c
                            ? "bg-white border-brand shadow-sm"
                            : "bg-base-inset/70 border-base-border hover:border-accent/40"
                        }`}
                      >
                        <Gauge value={components[c].health_score} size={58} strokeWidth={5} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-ink capitalize">{c}</div>
                          <div className="text-[11px] text-ink-faint font-mono mt-0.5 tabular-nums">
                            Risk {(components[c].failure_probability * 100).toFixed(1)}%
                          </div>
                          <div className="w-full h-1 bg-base-border/70 rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-700"
                              style={{ width: `${Math.round(components[c].health_score)}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    )
                )}
              </div>
            </div>
          ) : null}
        </Card>

        <Card
          title="Forward Simulation"
          style={{ animationDelay: "220ms" }}
          right={
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border">
                {[30, 60, 90, 180].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => runSimulation(d)}
                    className={`px-2 py-1 rounded-md text-xs font-mono transition-all whitespace-nowrap ${
                      simDays === d
                        ? "bg-white text-brand font-semibold shadow-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <Button
                onClick={() => runSimulation()}
                disabled={simulating}
                className="!py-1 !px-3 !text-xs"
              >
                {simulating ? "…" : "Run"}
              </Button>
            </div>
          }
        >
          {simData ? (
            <div className="animate-fade-up">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={simData}>
                  <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke={CHART.axis} fontSize={11} tickLine={false} />
                  <YAxis stroke={CHART.axis} fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={CHART.tooltip} />
                  <Line
                    type="monotone"
                    dataKey="health"
                    stroke={CHART.primary}
                    strokeWidth={2.25}
                    dot={false}
                    isAnimationActive={true}
                    animationDuration={700}
                    name="Vehicle health"
                  />
                  <Line
                    type="monotone"
                    dataKey="risk"
                    stroke={CHART.danger}
                    strokeWidth={2.25}
                    dot={false}
                    isAnimationActive={true}
                    animationDuration={700}
                    name="Failure risk %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <LoadingSkeleton rows={5} />
          )}
        </Card>
      </div>
    </div>
  );
}
