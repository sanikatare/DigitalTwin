import { useState, useEffect } from "react";
import { MapPin, Fuel, CloudRain, Car } from "lucide-react";
import { phase8 } from "../api/client";
import { PageHeader, Card, Button, StatusPill, ErrorState, LoadingSkeleton } from "../components/ui";
import RecentTrips from "../components/RecentTrips";
import { useVehicle } from "../context/VehicleContext";
import Gauge from "../components/Gauge";

const STATUS_LEVEL = { GO: "good", CAUTION: "warn", "NO-GO": "crit" };

const QUICK_ROUTES = [
  { src: "Pune", dest: "Mumbai" },
  { src: "Pune", dest: "Nashik" },
  { src: "Mumbai", dest: "Bengaluru" },
  { src: "Delhi", dest: "Jaipur" },
];

export default function TripPlanner() {
  const { vehicleId } = useVehicle();
  const [source, setSource] = useState("Pune");
  const [destination, setDestination] = useState("Mumbai");
  const [fuelLevel, setFuelLevel] = useState(40);
  const [driverScore, setDriverScore] = useState(75);
  const [assessing, setAssessing] = useState(false);
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);
  const [tripsRefreshKey, setTripsRefreshKey] = useState(0);

  async function assess(srcOverride, destOverride, recordRefresh = true) {
    const activeSrc = srcOverride ?? source;
    const activeDest = destOverride ?? destination;
    setAssessing(true);
    setError(null);
    try {
      const { data } = await phase8.post("/trip/assess/by_vehicle_id", {
        vehicle_id: vehicleId,
        source: activeSrc,
        destination: activeDest,
        fuel_level_l: fuelLevel,
        driver_behaviour_score: driverScore,
      });
      setTrip(data);
      if (recordRefresh) {
        setTripsRefreshKey((k) => k + 1);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Trip assessment failed.");
      setTrip(null);
    } finally {
      setAssessing(false);
    }
  }

  useEffect(() => {
    assess(source, destination, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const fuelPct = Math.min(100, Math.max(0, (fuelLevel / 80) * 100));
  const driverPct = Math.min(100, Math.max(0, driverScore));

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="08. Trip"
        title="Trip Planner"
        right={
          trip && (
            <StatusPill level={STATUS_LEVEL[trip.risk.trip_status] || "neutral"}>
              {vehicleId} · {trip.risk.trip_status}
            </StatusPill>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Route Parameters" style={{ animationDelay: "40ms" }}>
          <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border flex-wrap mb-4">
            {QUICK_ROUTES.map((r) => {
              const active =
                source.toLowerCase() === r.src.toLowerCase() &&
                destination.toLowerCase() === r.dest.toLowerCase();
              return (
                <button
                  key={`${r.src}-${r.dest}`}
                  type="button"
                  onClick={() => {
                    setSource(r.src);
                    setDestination(r.dest);
                    assess(r.src, r.dest, true);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    active
                      ? "bg-white text-brand font-semibold shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {r.src} → {r.dest}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-ink-muted block mb-1.5">Origin</label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full bg-base-inset border border-base-border rounded-xl px-3 py-2 text-sm outline-none text-ink focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-ink-muted block mb-1.5">Destination</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full bg-base-inset border border-base-border rounded-xl px-3 py-2 text-sm outline-none text-ink focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all"
              />
            </div>
          </div>

          {/* Animated Route Preview Strip */}
          <div className="flex items-center justify-between gap-3 bg-base-inset/80 border border-base-border rounded-xl px-3.5 py-2.5 mb-4">
            <span className="text-xs font-mono font-medium text-ink truncate max-w-[110px]">
              {source || "Origin"}
            </span>
            <div className="flex-1 flex items-center relative h-4 overflow-hidden">
              <div className="w-full border-t border-dashed border-accent/60" />
              <Car
                size={14}
                className="text-brand absolute left-1/2 -translate-x-1/2 bg-base-inset px-0.5"
                style={{ animation: "carDrive 3s ease-in-out infinite" }}
              />
            </div>
            <span className="text-xs font-mono font-medium text-ink truncate max-w-[110px] text-right">
              {destination || "Destination"}
            </span>
          </div>

          <div className="mb-3.5 group">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-ink-muted group-hover:text-ink transition-colors">
                Fuel level
              </span>
              <span className="font-mono text-ink font-medium tabular-nums">{fuelLevel} L</span>
            </div>
            <div className="relative flex items-center">
              <div
                className="pointer-events-none absolute left-0 h-1.5 rounded-l-full bg-gradient-to-r from-brand to-accent transition-all duration-150"
                style={{ width: `${fuelPct}%` }}
              />
              <input
                type="range"
                min={0}
                max={80}
                value={fuelLevel}
                onChange={(e) => setFuelLevel(+e.target.value)}
                className="relative z-10 w-full cursor-pointer"
              />
            </div>
          </div>

          <div className="mb-5 group">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-ink-muted group-hover:text-ink transition-colors">
                Driver score
              </span>
              <span className="font-mono text-ink font-medium tabular-nums">{driverScore}</span>
            </div>
            <div className="relative flex items-center">
              <div
                className="pointer-events-none absolute left-0 h-1.5 rounded-l-full bg-gradient-to-r from-brand to-accent transition-all duration-150"
                style={{ width: `${driverPct}%` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={driverScore}
                onChange={(e) => setDriverScore(+e.target.value)}
                className="relative z-10 w-full cursor-pointer"
              />
            </div>
          </div>

          <Button onClick={() => assess()} disabled={assessing} className="w-full">
            {assessing ? "Assessing…" : "Assess Readiness"}
          </Button>
          {error && (
            <div className="mt-4">
              <ErrorState message={error} onRetry={() => assess()} />
            </div>
          )}
        </Card>

        <Card title="Readiness Telemetry" style={{ animationDelay: "90ms" }}>
          {!trip ? (
            <LoadingSkeleton rows={6} />
          ) : (
            <div className="animate-fade-up">
              <div className="flex flex-wrap items-center justify-center gap-6 mb-5">
                <Gauge value={100 - trip.risk.risk_score} label="Readiness" size={104} />
                <StatusPill level={STATUS_LEVEL[trip.risk.trip_status] || "neutral"}>
                  {trip.risk.trip_status}
                </StatusPill>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="bg-base-inset/70 rounded-xl p-3 text-center border border-base-border animate-scale-in">
                  <MapPin size={15} className="text-accent mx-auto mb-1" />
                  <div className="text-sm font-mono font-semibold text-ink tabular-nums">
                    {trip.route.distance_km.toFixed(0)} km
                  </div>
                  <div className="text-[11px] font-mono text-ink-faint tabular-nums">
                    {Math.round(trip.route.duration_min)} min
                  </div>
                </div>
                <div
                  style={{ animationDelay: "50ms" }}
                  className="bg-base-inset/70 rounded-xl p-3 text-center border border-base-border animate-scale-in"
                >
                  <CloudRain size={15} className="text-accent mx-auto mb-1" />
                  <div className="text-sm font-mono font-semibold text-ink tabular-nums">
                    {trip.weather.temperature_c.toFixed(0)}°C
                  </div>
                  <div className="text-[11px] text-ink-faint">{trip.weather.condition}</div>
                </div>
                <div
                  style={{ animationDelay: "100ms" }}
                  className="bg-base-inset/70 rounded-xl p-3 text-center border border-base-border animate-scale-in"
                >
                  <Fuel size={15} className="text-accent mx-auto mb-1" />
                  <div className="text-sm font-mono font-semibold text-ink tabular-nums">
                    ₹{trip.fuel.fuel_cost.toFixed(0)}
                  </div>
                  <div className="text-[11px] text-ink-faint">
                    {trip.fuel.fuel_sufficient ? "Sufficient" : "Refuel needed"}
                  </div>
                </div>
              </div>

              {trip.risk.contributing_factors?.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {trip.risk.contributing_factors.map((f, i) => (
                    <div
                      key={i}
                      className="text-xs text-ink-muted bg-base-inset/60 px-3 py-2 rounded-lg border border-base-border"
                    >
                      {f}
                    </div>
                  ))}
                </div>
              )}

              {trip.service_centre_recommendation && (
                <div className="bg-warn/10 border border-warn/25 rounded-xl p-3 text-xs animate-scale-in">
                  <span className="text-warn font-semibold">Service Centre: </span>
                  <span className="text-ink-muted font-mono">
                    {trip.service_centre_recommendation.name} ·{" "}
                    {trip.service_centre_recommendation.distance_km.toFixed(1)} km
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <RecentTrips
        refreshKey={tripsRefreshKey}
        onSelectRoute={(orig, dest) => {
          setSource(orig);
          setDestination(dest);
          assess(orig, dest, true);
        }}
      />
    </div>
  );
}
