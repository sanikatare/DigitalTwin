import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { phase5 } from "../api/client";
import {
  PageHeader,
  Card,
  Button,
  StatusPill,
  StatRow,
  Loading,
  ErrorState,
} from "../components/ui";
import EngineTelemetryWidget from "../components/EngineTelemetryWidget";

const SEVERITY_LEVEL = {
  Critical: "crit",
  High: "crit",
  Medium: "warn",
  Low: "good",
  Unknown: "neutral",
};

const QUICK_CODES = ["P0420", "P0300", "P0171", "misfire", "catalyst"];

export default function OBDDiagnostics() {
  const [query, setQuery] = useState("P0420");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  const [codes, setCodes] = useState("P0420, P0300");
  const [engine, setEngine] = useState({
    temperature: 305,
    rpm: 2200,
    torque: 45,
    tool_wear: 120,
  });
  const [diagnosis, setDiagnosis] = useState(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagError, setDiagError] = useState(null);

  async function search(customQuery) {
    const q = (customQuery ?? query).trim();
    if (!q) return;
    if (customQuery != null) setQuery(customQuery);
    setSearching(true);
    setSearchError(false);
    try {
      const { data } = await phase5.get("/obd/search", { params: { q } });
      setResults(data);
    } catch {
      setResults(null);
      setSearchError(true);
    } finally {
      setSearching(false);
    }
  }

  async function runDiagnosis(customCodes, customEngine) {
    const activeCodes = customCodes ?? codes;
    const activeEngine = customEngine ?? engine;
    setDiagnosing(true);
    setDiagError(null);
    try {
      const { data } = await phase5.post("/diagnose", {
        fault_codes: activeCodes
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        ...activeEngine,
      });
      setDiagnosis(data);
    } catch (err) {
      setDiagnosis(null);
      setDiagError(err.response?.data?.detail || "OBD Diagnostics unavailable.");
    } finally {
      setDiagnosing(false);
    }
  }

  useEffect(() => {
    search("P0420");
    runDiagnosis("P0420, P0300", engine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        eyebrow="05. OBD-II"
        title="OBD-II Diagnostics"
        right={
          diagnosis && (
            <StatusPill
              level={
                diagnosis.trip_status === "OK"
                  ? "good"
                  : diagnosis.trip_status === "CAUTION"
                  ? "warn"
                  : "crit"
              }
            >
              Status: {diagnosis.trip_status}
            </StatusPill>
          )
        }
      />

      <EngineTelemetryWidget
        onApplyTelemetry={({ rpm, fault_code }) => {
          const nextEngine = { ...engine, rpm };
          setEngine(nextEngine);
          let nextCodes = codes;
          if (fault_code && !codes.toUpperCase().includes(fault_code)) {
            nextCodes = codes.trim() ? `${codes.trim()}, ${fault_code}` : fault_code;
            setCodes(nextCodes);
          }
          runDiagnosis(nextCodes, nextEngine);
        }}
      />

      <Card title="DTC Code Lookup" style={{ animationDelay: "40ms" }}>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 bg-base-inset border border-base-border rounded-xl px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 transition-all duration-150">
            <Search size={14} className="text-ink-faint shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search DTC code or symptom (e.g. P0420, misfire)"
              className="flex-1 bg-transparent py-2.5 text-sm outline-none text-ink min-w-0"
            />
          </div>
          <Button onClick={() => search()} disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>

        <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border flex-wrap mb-4">
          {QUICK_CODES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => search(c)}
              className={`text-xs font-mono px-2.5 py-1 rounded-md transition-all duration-150 whitespace-nowrap ${
                query.toLowerCase() === c.toLowerCase()
                  ? "bg-white text-brand font-semibold shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {searchError && (
          <ErrorState message="OBD Diagnostics unavailable." onRetry={() => search()} />
        )}
        {results && !searchError && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.length === 0 && (
              <p className="text-sm text-ink-faint col-span-2">No matches.</p>
            )}
            {results.slice(0, 6).map((r, idx) => (
              <div
                key={r.code}
                style={{ animationDelay: `${idx * 40}ms` }}
                className="bg-base-inset/70 rounded-xl p-3.5 border border-base-border hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-150 animate-fade-up"
              >
                <div className="flex justify-between items-center mb-1.5 gap-2">
                  <span className="font-mono text-sm text-brand font-semibold">{r.code}</span>
                  <StatusPill level={SEVERITY_LEVEL[r.severity] || "neutral"}>
                    {r.severity}
                  </StatusPill>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{r.description}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Diagnostic Pipeline Input" style={{ animationDelay: "80ms" }}>
          <label className="text-xs text-ink-muted block mb-1.5">
            Fault codes (comma-separated)
          </label>
          <input
            value={codes}
            onChange={(e) => setCodes(e.target.value)}
            className="w-full bg-base-inset border border-base-border rounded-xl px-3 py-2 text-sm font-mono outline-none mb-4 text-ink focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all"
          />
          {Object.entries(engine).map(([key, val]) => {
            const min = key === "temperature" ? 250 : 0;
            const max =
              key === "temperature"
                ? 400
                : key === "rpm"
                ? 7000
                : key === "tool_wear"
                ? 250
                : 200;
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
                    value={val}
                    onChange={(e) => setEngine((s) => ({ ...s, [key]: +e.target.value }))}
                  />
                </div>
              </div>
            );
          })}
          <Button onClick={() => runDiagnosis()} disabled={diagnosing} className="w-full mt-2">
            {diagnosing ? "Diagnosing…" : "Run Diagnosis"}
          </Button>
        </Card>

        <Card title="Diagnosis Output" style={{ animationDelay: "120ms" }}>
          {diagnosing ? (
            <Loading />
          ) : diagError ? (
            <ErrorState message={diagError} onRetry={() => runDiagnosis()} />
          ) : !diagnosis ? (
            <Loading />
          ) : (
            <div className="animate-fade-up">
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <StatusPill
                  level={
                    diagnosis.trip_status === "OK"
                      ? "good"
                      : diagnosis.trip_status === "CAUTION"
                      ? "warn"
                      : "crit"
                  }
                >
                  {diagnosis.trip_status}
                </StatusPill>
                <span className="text-xs font-mono text-ink-muted tabular-nums">
                  {(diagnosis.failure_probability * 100).toFixed(1)}% failure risk
                </span>
              </div>

              <div className="w-full h-1.5 bg-base-inset rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    diagnosis.failure_probability > 0.5
                      ? "bg-crit"
                      : diagnosis.failure_probability > 0.25
                      ? "bg-warn"
                      : "bg-good"
                  }`}
                  style={{ width: `${Math.min(100, diagnosis.failure_probability * 100)}%` }}
                />
              </div>

              <StatRow label="Primary Fault" value={diagnosis.description} mono={false} />
              <StatRow label="Remaining life" value={`${diagnosis.remaining_life} cycles`} />
              <StatRow label="Urgency" value={diagnosis.maintenance_urgency} />
              {diagnosis.obd_details?.length > 0 && (
                <div className="mt-4 space-y-2">
                  {diagnosis.obd_details.map((d, i) => (
                    <div
                      key={i}
                      style={{ animationDelay: `${i * 45}ms` }}
                      className="bg-base-inset/70 rounded-xl p-3 text-xs border border-base-border hover:border-accent/40 transition-all animate-fade-up"
                    >
                      <span className="font-mono text-brand font-semibold">{d.code}</span>
                      <p className="text-ink-muted mt-1 leading-relaxed">{d.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
