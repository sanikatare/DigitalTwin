import { useEffect, useState } from "react";
import {
  Clock,
  MapPin,
  Fuel,
  Car,
  RotateCw,
  ArrowUpRight,
} from "lucide-react";
import { phase8 } from "../api/client";
import { StatusPill, LoadingSkeleton, ErrorState } from "./ui";
import { useVehicle } from "../context/VehicleContext";

const RATING_LEVEL = {
  Optimal: "good",
  Normal: "neutral",
  "High Consumption": "warn",
};

export default function RecentTrips({
  refreshKey = 0,
  onSelectRoute,
  compact = false,
}) {
  const { vehicleId } = useVehicle();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [corridorFilter, setCorridorFilter] = useState("All");
  const [sortBy, setSortBy] = useState("recent");

  function fetchTrips() {
    setLoading(true);
    setError(null);
    phase8
      .get(`/trips/recent/${encodeURIComponent(vehicleId)}`)
      .then((r) => setData(r.data))
      .catch((err) =>
        setError(err.response?.data?.detail || "Unable to load recent trips.")
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, refreshKey]);

  const rawTrips = data?.trips || [];
  const filteredTrips = rawTrips
    .filter((t) => corridorFilter === "All" || t.corridor === corridorFilter)
    .sort((a, b) => {
      if (sortBy === "efficiency") return b.fuel_efficiency_kmpl - a.fuel_efficiency_kmpl;
      if (sortBy === "distance") return b.distance_km - a.distance_km;
      return 0;
    });

  const displayTrips = compact ? filteredTrips.slice(0, 4) : filteredTrips;
  const summary = data?.summary;

  return (
    <section
      className="panel relative overflow-hidden p-5 animate-fade-up"
      style={{ animationDelay: "120ms" }}
    >
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand/0 via-accent/50 to-brand/0" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-base-border">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display font-bold text-base sm:text-lg text-ink tracking-tight">
            Recent Trips
          </h2>
          <span className="text-xs font-mono text-ink-faint">· {vehicleId}</span>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border">
            {["All", "Highway", "Urban"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCorridorFilter(c)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                  corridorFilter === c
                    ? "bg-white text-brand shadow-sm font-semibold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort recent trips"
            className="bg-base-inset border border-base-border rounded-lg px-2.5 py-1.5 text-xs text-ink-muted outline-none focus:border-accent transition-colors"
          >
            <option value="recent">Recent</option>
            <option value="efficiency">Efficiency</option>
            <option value="distance">Distance</option>
          </select>

          <button
            type="button"
            onClick={fetchTrips}
            title="Refresh trips"
            className="p-1.5 rounded-lg bg-base-inset border border-base-border text-ink-muted hover:text-brand hover:border-accent/40 transition-all active:scale-95"
          >
            <RotateCw size={13} className={loading ? "animate-spin text-brand" : ""} />
          </button>
        </div>
      </div>

      {/* Aggregate KPI Summary Strip */}
      {summary && !loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3.5 border-b border-base-border/80">
          <div
            style={{ animationDelay: "40ms" }}
            className="bg-base-inset/60 rounded-lg px-3.5 py-2.5 animate-scale-in"
          >
            <div className="text-[11px] text-ink-faint">Total Distance</div>
            <div className="text-base font-display font-bold text-ink font-mono mt-0.5 tabular-nums">
              {summary.total_distance_km} km
            </div>
          </div>

          <div
            style={{ animationDelay: "80ms" }}
            className="bg-base-inset/60 rounded-lg px-3.5 py-2.5 animate-scale-in"
          >
            <div className="text-[11px] text-ink-faint">Total Duration</div>
            <div className="text-base font-display font-bold text-ink font-mono mt-0.5 tabular-nums">
              {summary.total_duration_label}
            </div>
          </div>

          <div
            style={{ animationDelay: "120ms" }}
            className="bg-base-inset/60 rounded-lg px-3.5 py-2.5 animate-scale-in"
          >
            <div className="text-[11px] text-ink-faint">Avg. Fuel Efficiency</div>
            <div className="text-base font-display font-bold text-ink font-mono mt-0.5 tabular-nums">
              {summary.avg_fuel_efficiency_kmpl} km/L
            </div>
          </div>

          <div
            style={{ animationDelay: "160ms" }}
            className="bg-base-inset/60 rounded-lg px-3.5 py-2.5 animate-scale-in"
          >
            <div className="text-[11px] text-ink-faint">Fuel Consumed</div>
            <div className="text-base font-display font-bold text-ink font-mono mt-0.5 tabular-nums">
              {summary.total_fuel_consumed_l} L
            </div>
          </div>
        </div>
      )}

      {/* Trips List */}
      <div className="pt-4">
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchTrips} />
        ) : displayTrips.length === 0 ? (
          <p className="text-sm text-ink-faint text-center py-8">
            No journeys match the selected filter.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {displayTrips.map((trip, idx) => {
              const effPct = Math.min(
                100,
                Math.max(15, Math.round((trip.fuel_efficiency_kmpl / 20) * 100))
              );
              const effColor =
                trip.fuel_efficiency_kmpl >= 15.5
                  ? "bg-good"
                  : trip.fuel_efficiency_kmpl >= 13.0
                  ? "bg-accent"
                  : "bg-warn";

              return (
                <div
                  key={trip.trip_id}
                  style={{ animationDelay: `${60 + idx * 50}ms` }}
                  className="group bg-base-inset/50 hover:bg-white rounded-xl p-4 border border-base-border hover:border-accent/40 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 animate-fade-up"
                >
                  {/* Top Row: Unboxed Metadata & Status */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-mono text-ink-muted">
                      <span className="font-semibold text-brand">{trip.trip_id}</span>
                      <span aria-hidden>·</span>
                      <span>{trip.corridor}</span>
                      <span aria-hidden>·</span>
                      <span className="text-ink-faint">{trip.timestamp_label}</span>
                    </div>
                    <StatusPill level={RATING_LEVEL[trip.efficiency_rating] || "neutral"}>
                      {trip.efficiency_rating}
                    </StatusPill>
                  </div>

                  {/* Animated Origin -> Destination Route Bar */}
                  <div className="flex items-center justify-between gap-2.5 bg-white rounded-lg px-3 py-2 border border-base-border mb-3">
                    <div className="min-w-0">
                      <div className="text-[10px] text-ink-faint">Origin</div>
                      <div className="text-xs font-semibold text-ink truncate">{trip.origin}</div>
                    </div>

                    <div className="flex-1 flex items-center relative h-4 max-w-[90px] overflow-hidden">
                      <div className="w-full border-t border-dashed border-accent/50" />
                      <Car
                        size={13}
                        className="text-brand absolute left-1/2 -translate-x-1/2 bg-white px-0.5"
                        style={{ animation: "carDrive 3.2s ease-in-out infinite" }}
                      />
                    </div>

                    <div className="min-w-0 text-right">
                      <div className="text-[10px] text-ink-faint">Destination</div>
                      <div className="text-xs font-semibold text-ink truncate">
                        {trip.destination}
                      </div>
                    </div>
                  </div>

                  {/* Core 3 Metrics: Duration, Distance, Fuel Efficiency */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white rounded-lg p-2.5 border border-base-border/80 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-ink-faint mb-0.5">
                        <Clock size={11} className="text-accent" /> Duration
                      </div>
                      <div className="text-xs font-mono font-semibold text-ink tabular-nums">
                        {trip.duration_label}
                      </div>
                      <div className="text-[10px] text-ink-faint font-mono tabular-nums">
                        {trip.duration_min} min
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-2.5 border border-base-border/80 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-ink-faint mb-0.5">
                        <MapPin size={11} className="text-brand" /> Distance
                      </div>
                      <div className="text-xs font-mono font-semibold text-ink tabular-nums">
                        {trip.distance_km} km
                      </div>
                      <div className="text-[10px] text-ink-faint font-mono tabular-nums">
                        {trip.avg_speed_kmh} km/h
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-2.5 border border-base-border/80 text-center">
                      <div className="flex items-center justify-center gap-1 text-[10px] text-ink-faint mb-0.5">
                        <Fuel size={11} className="text-good" /> Efficiency
                      </div>
                      <div className="text-xs font-mono font-semibold text-ink tabular-nums">
                        {trip.fuel_efficiency_kmpl} km/L
                      </div>
                      <div className="text-[10px] text-ink-faint font-mono tabular-nums">
                        {trip.fuel_consumed_l} L
                      </div>
                    </div>
                  </div>

                  {/* Animated Fuel Efficiency Progress Bar + Footer */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted mb-1">
                      <span>Eco {trip.eco_score}/100</span>
                      <span>{trip.weather}</span>
                    </div>
                    <div className="w-full h-1.5 bg-base-border/70 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${effColor}`}
                        style={{ width: `${effPct}%` }}
                      />
                    </div>

                    {onSelectRoute && (
                      <div className="mt-2.5 pt-2 border-t border-base-border/70 flex justify-end">
                        <button
                          type="button"
                          onClick={() => onSelectRoute(trip.origin, trip.destination)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:text-accent transition-colors whitespace-nowrap"
                        >
                          Load route
                          <ArrowUpRight size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
