import { useEffect, useState } from "react";
import { Car, ChevronLeft, ChevronRight } from "lucide-react";
import { ALL_SERVICES } from "../api/client";
import { useVehicle } from "../context/VehicleContext";

const PRESET_VEHICLES = ["Vehicle_0001", "Vehicle_0042", "Vehicle_0108"];

function ServiceStatus() {
  const [status, setStatus] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function check(svc) {
      try {
        await svc.client.get(svc.healthPath, { timeout: 5000 });
        if (!cancelled) setStatus((s) => ({ ...s, [svc.id]: "up" }));
      } catch {
        if (!cancelled) setStatus((s) => ({ ...s, [svc.id]: "down" }));
      }
    }

    ALL_SERVICES.forEach(check);
    const interval = setInterval(() => ALL_SERVICES.forEach(check), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const upCount = Object.values(status).filter((s) => s === "up").length;

  return (
    <div
      className="flex items-center gap-2 text-xs font-mono text-ink-muted"
      title="Backend service status"
    >
      <div className="flex items-center gap-1.5">
        {ALL_SERVICES.map((svc) => (
          <span
            key={svc.id}
            title={`${svc.name}: ${status[svc.id] ?? "checking"}`}
            className={`status-dot transition-transform duration-150 hover:scale-150 ${
              status[svc.id] === "up"
                ? "bg-good"
                : status[svc.id] === "down"
                ? "bg-crit animate-ping"
                : "bg-ink-faint animate-pulse"
            }`}
          />
        ))}
      </div>
      <span className="tabular-nums font-medium text-ink">
        {upCount}/{ALL_SERVICES.length}
      </span>
    </div>
  );
}

export default function TopBar() {
  const { vehicleId, setVehicleId } = useVehicle();

  function stepVehicle(delta) {
    const match = String(vehicleId).match(/^Vehicle_(\d+)$/i);
    const currentNum = match ? parseInt(match[1], 10) : 1;
    const nextNum = Math.min(2000, Math.max(1, currentNum + delta));
    const padded = String(nextNum).padStart(4, "0");
    setVehicleId(`Vehicle_${padded}`);
  }

  return (
    <header className="h-14 md:h-16 shrink-0 border-b border-base-border bg-white/95 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 z-10 animate-fade-up">
      {/* Zone 1: Vehicle Telemetry Target */}
      <div className="flex items-center gap-3">
        <div className="group flex items-center gap-2 bg-base border border-base-border rounded-lg px-2.5 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 transition-all duration-150">
          <Car
            size={14}
            className="text-brand shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          />
          <label className="sr-only" htmlFor="vehicle-id">
            Vehicle ID
          </label>
          <input
            id="vehicle-id"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            spellCheck={false}
            className="bg-transparent text-xs sm:text-sm font-mono font-medium text-ink outline-none w-28 sm:w-32"
            placeholder="Vehicle_0001"
          />
          <div className="flex items-center gap-0.5 border-l border-base-border pl-1.5">
            <button
              type="button"
              onClick={() => stepVehicle(-1)}
              title="Previous vehicle"
              className="p-1 rounded hover:bg-base-inset text-ink-muted hover:text-brand transition-colors active:scale-95"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              type="button"
              onClick={() => stepVehicle(1)}
              title="Next vehicle"
              className="p-1 rounded hover:bg-base-inset text-ink-muted hover:text-brand transition-colors active:scale-95"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Zone 2: Quick Vehicle Switcher */}
        <div className="hidden md:flex items-center gap-1 bg-base-inset p-1 rounded-lg border border-base-border">
          {PRESET_VEHICLES.map((vid) => (
            <button
              key={vid}
              type="button"
              onClick={() => setVehicleId(vid)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors whitespace-nowrap ${
                vehicleId === vid
                  ? "bg-white text-brand font-semibold shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {vid}
            </button>
          ))}
        </div>
      </div>

      {/* Zone 3: Service Status */}
      <div className="flex items-center gap-4">
        <ServiceStatus />
      </div>
    </header>
  );
}
