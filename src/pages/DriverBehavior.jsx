import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { phase9 } from "../api/client";
import {
  PageHeader,
  Card,
  Button,
  Loading,
  StatusPill,
  StatRow,
  ErrorState,
  GaugeSkeleton,
  LoadingSkeleton,
} from "../components/ui";
import { useApi, errorMessage } from "../hooks/useApi";
import Gauge from "../components/Gauge";
import DriverBehaviorAnalysis from "../components/DriverBehaviorAnalysis";

const PRIORITY_LEVEL = { high: "crit", medium: "warn", low: "good" };

export default function DriverBehavior() {
  const [pipelineReady, setPipelineReady] = useState(null);
  const [starting, setStarting] = useState(false);
  const [vehId, setVehId] = useState(8);

  const { error: healthError } = useApi(
    () =>
      phase9.get("/health").then((r) => {
        setPipelineReady(r.data.pipeline_ready);
        return r.data;
      }),
    []
  );

  const { data: drivers } = useApi(
    () => (pipelineReady ? phase9.get("/drivers").then((r) => r.data) : Promise.resolve(null)),
    [pipelineReady]
  );

  const {
    data: profile,
    loading: profileLoading,
    error: profileError,
    refetch,
  } = useApi(
    () =>
      pipelineReady
        ? phase9.get("/driver/profile", { params: { veh_id: vehId } }).then((r) => r.data)
        : Promise.resolve(null),
    [pipelineReady, vehId]
  );
  const { data: score } = useApi(
    () =>
      pipelineReady
        ? phase9.get("/driver/score", { params: { veh_id: vehId } }).then((r) => r.data)
        : Promise.resolve(null),
    [pipelineReady, vehId]
  );
  const { data: stats } = useApi(
    () =>
      pipelineReady
        ? phase9.get("/driver/statistics", { params: { veh_id: vehId } }).then((r) => r.data)
        : Promise.resolve(null),
    [pipelineReady, vehId]
  );
  const { data: coaching, loading: coachingLoading } = useApi(
    () =>
      pipelineReady
        ? phase9
            .get("/driver/coaching", { params: { veh_id: vehId, use_llm: false } })
            .then((r) => r.data)
        : Promise.resolve(null),
    [pipelineReady, vehId]
  );

  async function startPipeline() {
    setStarting(true);
    try {
      await phase9.post("/pipeline/run", null, {
        params: { source: "data/raw/VED_sample_small.csv" },
      });
      setPipelineReady(true);
    } catch {
      setPipelineReady(false);
    } finally {
      setStarting(false);
    }
  }

  if (healthError && pipelineReady === null) {
    return (
      <div className="max-w-6xl">
        <PageHeader eyebrow="09. Driver" title="Driver Behaviour" />
        <Card>
          <ErrorState message={errorMessage(healthError, "Driver Behaviour")} />
        </Card>
      </div>
    );
  }

  if (pipelineReady === false || pipelineReady === null) {
    return (
      <div className="max-w-6xl">
        <PageHeader eyebrow="09. Driver" title="Driver Behaviour" />
        <Card>
          <div className="flex flex-col items-center gap-4 py-12 px-4 animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-brand-light flex items-center justify-center animate-pulse">
              <PlayCircle size={24} className="text-brand" />
            </div>
            <Button onClick={startPipeline} disabled={starting}>
              {starting ? "Processing…" : "Initialize Driver Telemetry"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="09. Driver"
        title="Driver Behaviour"
        right={
          <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border flex-wrap">
            {(drivers?.veh_ids || [8, 10, 12, 15, 21]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setVehId(id)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all whitespace-nowrap ${
                  vehId === id
                    ? "bg-white text-brand font-semibold shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                Driver #{id}
              </button>
            ))}
          </div>
        }
      />

      {profileLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((k) => (
            <Card key={k}>
              <GaugeSkeleton size={100} />
            </Card>
          ))}
        </div>
      ) : profileError ? (
        <ErrorState message={errorMessage(profileError, "Driver Behaviour")} onRetry={refetch} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card title="Driver Score" style={{ animationDelay: "0ms" }}>
            <div className="flex justify-center">
              <Gauge value={score?.driver_score ?? 0} label="Score" size={100} />
            </div>
          </Card>
          <Card title="Driving Style" style={{ animationDelay: "50ms" }}>
            <div className="flex flex-col items-center justify-center h-full min-h-[104px] gap-2">
              <StatusPill level="neutral">{profile?.profile}</StatusPill>
              <span className="text-xs text-ink-faint font-mono tabular-nums">
                {profile?.trip_count} trips · {profile?.total_distance_km.toFixed(0)} km
              </span>
            </div>
          </Card>
          <Card title="Penalties / Bonuses" style={{ animationDelay: "100ms" }}>
            <StatRow label="Total penalty" value={score?.total_penalty.toFixed(1)} />
            <StatRow label="Total bonus" value={score?.total_bonus.toFixed(1)} />
          </Card>
          <Card title="Eco Score" style={{ animationDelay: "150ms" }}>
            <div className="flex justify-center">
              <Gauge value={stats?.avg_eco_driving_score ?? 0} size={90} strokeWidth={7} />
            </div>
          </Card>
        </div>
      )}

      <DriverBehaviorAnalysis vehId={vehId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Driving Statistics" style={{ animationDelay: "180ms" }}>
          {!stats ? (
            <LoadingSkeleton rows={6} />
          ) : (
            <div className="animate-fade-up">
              <StatRow label="Avg. speed" value={`${stats.avg_speed_kmh.toFixed(1)} km/h`} />
              <StatRow label="Harsh brakes" value={stats.total_harsh_brakes} />
              <StatRow
                label="Rapid accelerations"
                value={stats.total_aggressive_accelerations}
              />
              <StatRow label="Sharp turns" value={stats.total_sharp_turns} />
              <StatRow
                label="Fuel efficiency"
                value={
                  stats.avg_fuel_efficiency_km_per_l
                    ? `${stats.avg_fuel_efficiency_km_per_l.toFixed(1)} km/L`
                    : "—"
                }
              />
              <StatRow label="Total duration" value={`${stats.total_duration_hours.toFixed(1)} h`} />
            </div>
          )}
        </Card>

        <Card title="Driver Coaching" style={{ animationDelay: "220ms" }}>
          {coachingLoading ? (
            <Loading label="Loading coaching…" />
          ) : !coaching ? (
            <LoadingSkeleton rows={4} />
          ) : (
            <div className="space-y-2.5">
              {coaching.cards.map((c, i) => (
                <div
                  key={i}
                  style={{ animationDelay: `${i * 45}ms` }}
                  className="bg-base-inset/70 rounded-lg p-3.5 border border-base-border hover:border-accent/40 transition-all duration-150 animate-fade-up"
                >
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-xs font-semibold text-ink">{c.category}</span>
                    <StatusPill level={PRIORITY_LEVEL[c.priority?.toLowerCase()] || "neutral"}>
                      {c.priority}
                    </StatusPill>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">{c.message}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
