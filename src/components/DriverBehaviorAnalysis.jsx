import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { phase9 } from "../api/client";
import { StatusPill, LoadingSkeleton, ErrorState } from "./ui";

const EVENT_COLORS = {
  "Harsh Braking": "#F04438",
  "Rapid Acceleration": "#F79009",
  "Sharp Cornering": "#2E7DE1",
};

const SERIES_META = [
  { key: "harsh_braking", label: "Harsh Braking", color: "#F04438" },
  { key: "acceleration", label: "Rapid Acceleration", color: "#F79009" },
  { key: "sharp_cornering", label: "Sharp Cornering", color: "#2E7DE1" },
];

export default function DriverBehaviorAnalysis({ vehId = 8, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartMode, setChartMode] = useState("grouped");
  const [activeFilter, setActiveFilter] = useState("All");
  const [hoveredSession, setHoveredSession] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [barTooltip, setBarTooltip] = useState(null);
  const [gForceTooltip, setGForceTooltip] = useState(null);

  const barSvgRef = useRef(null);
  const barContainerRef = useRef(null);
  const gForceSvgRef = useRef(null);
  const gForceContainerRef = useRef(null);

  function fetchEvents() {
    setLoading(true);
    setError(null);
    phase9
      .get("/driver/events", { params: { veh_id: vehId } })
      .then((r) => {
        setData(r.data);
        if (r.data?.g_force_events?.length > 0) {
          setSelectedEvent(r.data.g_force_events[0]);
        }
      })
      .catch((err) =>
        setError(
          err.response?.data?.detail || "Unable to load driver kinematic event telemetry."
        )
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehId]);

  // D3.js Chart 1: Session Timeline Grouped / Stacked Bar Chart
  useEffect(() => {
    if (!data?.session_timeline || !barSvgRef.current) return;

    const timeline = data.session_timeline;
    const svg = d3.select(barSvgRef.current);
    svg.selectAll("*").remove();

    const width = 520;
    const height = 240;
    const margin = { top: 16, right: 14, bottom: 32, left: 34 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const activeSeries = SERIES_META.filter(
      (s) => activeFilter === "All" || s.label === activeFilter
    );
    const keys = activeSeries.map((s) => s.key);

    const x0 = d3
      .scaleBand()
      .domain(timeline.map((d) => d.session))
      .range([0, innerW])
      .paddingInner(0.24)
      .paddingOuter(0.1);

    const maxVal =
      chartMode === "stacked"
        ? d3.max(timeline, (d) => d3.sum(keys, (k) => d[k])) || 10
        : d3.max(timeline, (d) => d3.max(keys, (k) => d[k])) || 8;

    const y = d3
      .scaleLinear()
      .domain([0, Math.ceil(maxVal * 1.15)])
      .nice()
      .range([innerH, 0]);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(""))
      .call((grid) => grid.select(".domain").remove())
      .call((grid) =>
        grid
          .selectAll("line")
          .attr("stroke", "#E4E7EC")
          .attr("stroke-dasharray", "3,3")
      );

    // Interactive Session Band Highlight Backdrop
    const hoverBand = g
      .append("rect")
      .attr("class", "hover-session-band")
      .attr("y", 0)
      .attr("height", innerH)
      .attr("width", x0.bandwidth() + 8)
      .attr("rx", 6)
      .attr("fill", "#2E7DE1")
      .attr("fill-opacity", 0)
      .style("pointer-events", "none");

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x0).tickSize(0))
      .call((ax) => ax.select(".domain").attr("stroke", "#D0D5DD"))
      .call((ax) =>
        ax
          .selectAll("text")
          .attr("dy", "1.1em")
          .attr("fill", "#475467")
          .attr("font-size", "10px")
          .attr("font-family", '"Playfair Display", Georgia, serif')
      );

    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickSize(0))
      .call((ax) => ax.select(".domain").remove())
      .call((ax) =>
        ax
          .selectAll("text")
          .attr("dx", "-0.4em")
          .attr("fill", "#98A2B3")
          .attr("font-size", "10px")
          .attr("font-family", '"Playfair Display", Georgia, serif')
      );

    const colorMap = Object.fromEntries(SERIES_META.map((s) => [s.key, s.color]));
    const labelMap = Object.fromEntries(SERIES_META.map((s) => [s.key, s.label]));

    function updateBarTooltipPos(event, sessionObj, focusedKey) {
      if (!barContainerRef.current) return;
      const [mx, my] = d3.pointer(event, barContainerRef.current);
      const containerW = barContainerRef.current.clientWidth || 420;
      setHoveredSession(sessionObj);
      setBarTooltip({
        x: mx,
        y: my,
        containerW,
        sessionData: sessionObj,
        focusedKey,
        focusedLabel: labelMap[focusedKey] || focusedKey,
        focusedValue: sessionObj[focusedKey] ?? 0,
        focusedColor: colorMap[focusedKey] || "#2E7DE1",
      });
    }

    if (chartMode === "grouped") {
      const x1 = d3
        .scaleBand()
        .domain(keys)
        .range([0, x0.bandwidth()])
        .padding(0.12);

      const sessionGroups = g
        .selectAll(".session-group")
        .data(timeline)
        .join("g")
        .attr("class", "session-group")
        .attr("transform", (d) => `translate(${x0(d.session)},0)`);

      sessionGroups
        .selectAll("rect")
        .data((d) =>
          keys.map((key) => ({
            key,
            value: d[key],
            session: d.session,
            sessionData: d,
          }))
        )
        .join("rect")
        .attr("x", (d) => x1(d.key))
        .attr("y", innerH)
        .attr("width", x1.bandwidth())
        .attr("height", 0)
        .attr("rx", 3)
        .attr("fill", (d) => colorMap[d.key])
        .attr("stroke", "#FFFFFF")
        .attr("stroke-width", 0)
        .style("cursor", "pointer")
        .on("mouseenter", function (event, d) {
          hoverBand
            .attr("x", (x0(d.session) || 0) - 4)
            .transition()
            .duration(150)
            .attr("fill-opacity", 0.07);
          d3.select(this)
            .transition()
            .duration(150)
            .attr("stroke-width", 1.5)
            .attr("opacity", 1);
          updateBarTooltipPos(event, d.sessionData, d.key);
        })
        .on("mousemove", function (event, d) {
          updateBarTooltipPos(event, d.sessionData, d.key);
        })
        .on("mouseleave", function () {
          hoverBand.transition().duration(150).attr("fill-opacity", 0);
          d3.select(this).transition().duration(150).attr("stroke-width", 0);
          setHoveredSession(null);
          setBarTooltip(null);
        })
        .transition()
        .duration(600)
        .delay((_d, i) => i * 35)
        .ease(d3.easeCubicOut)
        .attr("y", (d) => y(d.value))
        .attr("height", (d) => Math.max(0, innerH - y(d.value)));
    } else {
      const stackedData = d3.stack().keys(keys)(timeline);

      const layers = g
        .selectAll(".layer")
        .data(stackedData)
        .join("g")
        .attr("class", "layer")
        .attr("fill", (d) => colorMap[d.key]);

      layers
        .selectAll("rect")
        .data((layer) => layer.map((seg) => ({ ...seg, key: layer.key })))
        .join("rect")
        .attr("x", (d) => x0(d.data.session))
        .attr("y", innerH)
        .attr("height", 0)
        .attr("width", x0.bandwidth())
        .attr("rx", 2.5)
        .attr("stroke", "#FFFFFF")
        .attr("stroke-width", 0)
        .style("cursor", "pointer")
        .on("mouseenter", function (event, d) {
          hoverBand
            .attr("x", (x0(d.data.session) || 0) - 4)
            .transition()
            .duration(150)
            .attr("fill-opacity", 0.07);
          d3.select(this).transition().duration(150).attr("stroke-width", 1.5);
          updateBarTooltipPos(event, d.data, d.key);
        })
        .on("mousemove", function (event, d) {
          updateBarTooltipPos(event, d.data, d.key);
        })
        .on("mouseleave", function () {
          hoverBand.transition().duration(150).attr("fill-opacity", 0);
          d3.select(this).transition().duration(150).attr("stroke-width", 0);
          setHoveredSession(null);
          setBarTooltip(null);
        })
        .transition()
        .duration(600)
        .ease(d3.easeCubicOut)
        .attr("y", (d) => y(d[1]))
        .attr("height", (d) => Math.max(0, y(d[0]) - y(d[1])));
    }
  }, [data, chartMode, activeFilter]);

  // D3.js Chart 2: G-Force Friction Circle
  useEffect(() => {
    if (!data?.g_force_events || !gForceSvgRef.current) return;

    const events = data.g_force_events.filter(
      (e) => activeFilter === "All" || e.type === activeFilter
    );

    const svg = d3.select(gForceSvgRef.current);
    svg.selectAll("*").remove();

    const size = 260;
    const center = size / 2;
    const maxRadius = center - 26;

    const root = svg.attr("viewBox", `0 0 ${size} ${size}`).append("g");

    const rScale = d3.scaleLinear().domain([0, 1.0]).range([0, maxRadius]);
    const xScale = d3.scaleLinear().domain([-1.0, 1.0]).range([center - maxRadius, center + maxRadius]);
    const yScale = d3.scaleLinear().domain([-1.0, 1.0]).range([center + maxRadius, center - maxRadius]);

    const rings = [0.25, 0.5, 0.75, 1.0];
    root
      .selectAll(".g-ring")
      .data(rings)
      .join("circle")
      .attr("class", "g-ring")
      .attr("cx", center)
      .attr("cy", center)
      .attr("r", (d) => rScale(d))
      .attr("fill", (d) => (d === 0.75 ? "rgba(240, 68, 56, 0.03)" : "none"))
      .attr("stroke", (d) => (d === 0.75 ? "#F0443866" : "#E4E7EC"))
      .attr("stroke-width", (d) => (d === 0.75 ? 1.25 : 1))
      .attr("stroke-dasharray", (d) => (d === 0.75 ? "4,3" : "2,2"));

    root
      .selectAll(".g-label")
      .data([0.5, 0.75])
      .join("text")
      .attr("x", center + 4)
      .attr("y", (d) => center - rScale(d) + 10)
      .attr("fill", "#98A2B3")
      .attr("font-size", "8px")
      .attr("font-family", '"Playfair Display", Georgia, serif')
      .text((d) => `${d.toFixed(2)}g`);

    root
      .append("line")
      .attr("x1", center - maxRadius)
      .attr("y1", center)
      .attr("x2", center + maxRadius)
      .attr("y2", center)
      .attr("stroke", "#D0D5DD")
      .attr("stroke-width", 1);

    root
      .append("line")
      .attr("x1", center)
      .attr("y1", center - maxRadius)
      .attr("x2", center)
      .attr("y2", center + maxRadius)
      .attr("stroke", "#D0D5DD")
      .attr("stroke-width", 1);

    const axisLabels = [
      { x: center, y: 13, text: "+G ACCEL", anchor: "middle" },
      { x: center, y: size - 5, text: "-G BRAKE", anchor: "middle" },
      { x: 6, y: center - 4, text: "LEFT", anchor: "start" },
      { x: size - 6, y: center - 4, text: "RIGHT", anchor: "end" },
    ];
    root
      .selectAll(".dir-label")
      .data(axisLabels)
      .join("text")
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .attr("text-anchor", (d) => d.anchor)
      .attr("fill", "#475467")
      .attr("font-size", "8.5px")
      .attr("font-weight", "600")
      .attr("font-family", '"Playfair Display", Georgia, serif')
      .text((d) => d.text);

    // Interactive Crosshair Guides on Hover
    const crosshairGroup = root
      .append("g")
      .attr("class", "g-crosshair")
      .style("opacity", 0)
      .style("pointer-events", "none");

    const crossX = crosshairGroup
      .append("line")
      .attr("stroke", "#2E7DE1")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3");

    const crossY = crosshairGroup
      .append("line")
      .attr("stroke", "#2E7DE1")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3");

    const hoverHalo = crosshairGroup
      .append("circle")
      .attr("r", 13)
      .attr("fill", "none")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.55);

    function updateGForceTooltip(event, d) {
      if (!gForceContainerRef.current) return;
      const [mx, my] = d3.pointer(event, gForceContainerRef.current);
      const containerW = gForceContainerRef.current.clientWidth || 260;
      setSelectedEvent(d);
      setGForceTooltip({
        x: mx,
        y: my,
        containerW,
        event: d,
      });
    }

    const nodes = root
      .selectAll(".event-dot")
      .data(events, (d) => d.id)
      .join("circle")
      .attr("class", "event-dot")
      .attr("cx", center)
      .attr("cy", center)
      .attr("r", 0)
      .attr("fill", (d) => EVENT_COLORS[d.type] || "#2E7DE1")
      .attr("fill-opacity", 0.85)
      .attr("stroke", "#FFFFFF")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseenter", function (event, d) {
        const cx = xScale(d.lateral_g);
        const cy = yScale(d.longitudinal_g);
        const color = EVENT_COLORS[d.type] || "#2E7DE1";

        crossX
          .attr("x1", cx)
          .attr("y1", cy)
          .attr("x2", cx)
          .attr("y2", center)
          .attr("stroke", color);
        crossY
          .attr("x1", cx)
          .attr("y1", cy)
          .attr("x2", center)
          .attr("y2", cy)
          .attr("stroke", color);
        hoverHalo.attr("cx", cx).attr("cy", cy).attr("stroke", color);
        crosshairGroup.transition().duration(150).style("opacity", 1);

        d3.select(this)
          .raise()
          .transition()
          .duration(150)
          .attr("r", 9)
          .attr("stroke-width", 2.25)
          .attr("fill-opacity", 1);
        updateGForceTooltip(event, d);
      })
      .on("mousemove", function (event, d) {
        updateGForceTooltip(event, d);
      })
      .on("mouseleave", function (_event, d) {
        crosshairGroup.transition().duration(150).style("opacity", 0);
        d3.select(this)
          .transition()
          .duration(150)
          .attr("r", Math.max(4.5, Math.min(7.5, d.speed_kmh / 16)))
          .attr("stroke-width", 1.5)
          .attr("fill-opacity", 0.85);
        setGForceTooltip(null);
      });

    nodes
      .transition()
      .duration(650)
      .delay((_d, i) => i * 16)
      .ease(d3.easeBackOut)
      .attr("cx", (d) => xScale(d.lateral_g))
      .attr("cy", (d) => yScale(d.longitudinal_g))
      .attr("r", (d) => Math.max(4.5, Math.min(7.5, d.speed_kmh / 16)));
  }, [data, activeFilter]);

  const summary = data?.summary;
  const filteredEvents =
    data?.g_force_events?.filter(
      (e) => activeFilter === "All" || e.type === activeFilter
    ) || [];

  return (
    <section
      className="panel relative overflow-hidden p-5 animate-fade-up"
      style={{ animationDelay: "120ms" }}
    >
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand/0 via-accent/60 to-brand/0" />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-base-border">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="font-display font-bold text-base sm:text-lg text-ink tracking-tight">
            Driver Behavior Analysis
          </h2>
          <span className="text-xs font-mono text-ink-faint">· Driver #{vehId}</span>
          {summary && (
            <StatusPill
              level={
                summary.peak_g_force >= 0.75
                  ? "crit"
                  : summary.peak_g_force >= 0.55
                  ? "warn"
                  : "good"
              }
            >
              Peak {summary.peak_g_force}g
            </StatusPill>
          )}
        </div>

        {/* Event Category Filter & Bar Mode Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border flex-wrap">
            {["All", "Harsh Braking", "Rapid Acceleration", "Sharp Cornering"].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                  activeFilter === f
                    ? "bg-white text-brand shadow-sm font-semibold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg bg-base-inset p-1 border border-base-border">
            <button
              type="button"
              onClick={() => setChartMode("grouped")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                chartMode === "grouped"
                  ? "bg-white text-brand shadow-sm font-semibold"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Grouped
            </button>
            <button
              type="button"
              onClick={() => setChartMode("stacked")}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                chartMode === "stacked"
                  ? "bg-white text-brand shadow-sm font-semibold"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              Stacked
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-6">
          <LoadingSkeleton rows={5} />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchEvents} />
      ) : (
        data && (
          <div className="pt-4 space-y-5">
            {/* 3 Event Type Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="bg-crit/[0.04] border border-crit/20 rounded-xl p-3.5 flex items-center justify-between animate-scale-in">
                <div>
                  <div className="text-xs font-semibold text-crit">Harsh Braking</div>
                  <div className="text-[11px] font-mono text-ink-muted mt-0.5">&lt; -0.38g</div>
                </div>
                <span className="text-2xl font-display font-bold text-crit font-mono tabular-nums">
                  {summary.harsh_brakes}
                </span>
              </div>

              <div
                style={{ animationDelay: "50ms" }}
                className="bg-warn/[0.05] border border-warn/20 rounded-xl p-3.5 flex items-center justify-between animate-scale-in"
              >
                <div>
                  <div className="text-xs font-semibold text-warn">Rapid Acceleration</div>
                  <div className="text-[11px] font-mono text-ink-muted mt-0.5">&gt; +0.34g</div>
                </div>
                <span className="text-2xl font-display font-bold text-warn font-mono tabular-nums">
                  {summary.aggressive_accelerations}
                </span>
              </div>

              <div
                style={{ animationDelay: "100ms" }}
                className="bg-accent/[0.05] border border-accent/20 rounded-xl p-3.5 flex items-center justify-between animate-scale-in"
              >
                <div>
                  <div className="text-xs font-semibold text-accent">Sharp Cornering</div>
                  <div className="text-[11px] font-mono text-ink-muted mt-0.5">&gt; ±0.38g</div>
                </div>
                <span className="text-2xl font-display font-bold text-accent font-mono tabular-nums">
                  {summary.sharp_cornering}
                </span>
              </div>
            </div>

            {/* D3.js Dual Visualization Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* D3 Session Bar Chart (7 cols) */}
              <div className="lg:col-span-7 bg-base-inset/50 rounded-xl p-4 border border-base-border flex flex-col justify-between">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-ink">
                    Session Event Distribution (D3.js)
                  </h3>
                  {hoveredSession ? (
                    <div className="text-[11px] font-mono text-ink animate-scale-in">
                      <strong>{hoveredSession.session}</strong> ({hoveredSession.date}) ·{" "}
                      <span className="text-crit">{hoveredSession.harsh_braking}B</span> ·{" "}
                      <span className="text-warn">{hoveredSession.acceleration}A</span> ·{" "}
                      <span className="text-accent">{hoveredSession.sharp_cornering}C</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 text-[11px]">
                      {SERIES_META.map((s) => (
                        <span key={s.key} className="inline-flex items-center gap-1 text-ink-muted">
                          <span
                            className="w-2 h-2 rounded-sm inline-block"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div ref={barContainerRef} className="relative w-full overflow-visible">
                  <svg
                    ref={barSvgRef}
                    className="w-full h-auto max-h-[240px] select-none"
                    role="img"
                    aria-label="D3.js driver behavior session bar chart"
                  />

                  {barTooltip && barTooltip.sessionData && (
                    <div
                      key={`${barTooltip.sessionData.session}-${barTooltip.focusedKey}`}
                      style={{
                        left: `${Math.min(
                          Math.max(12, barTooltip.x + 14),
                          Math.max(20, (barTooltip.containerW || 420) - 235)
                        )}px`,
                        top: `${Math.max(6, barTooltip.y - 18)}px`,
                      }}
                      className="pointer-events-none absolute z-30 panel bg-white/95 backdrop-blur-md border border-base-border rounded-xl p-3 shadow-xl w-[225px] animate-scale-in"
                    >
                      {/* Tooltip Header */}
                      <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-base-border">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full animate-pulse"
                            style={{ backgroundColor: barTooltip.focusedColor }}
                          />
                          <span className="text-xs font-bold text-ink font-mono">
                            Session {barTooltip.sessionData.session}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-ink-faint">
                          {barTooltip.sessionData.date} · {barTooltip.sessionData.avg_speed_kmh} km/h
                        </span>
                      </div>

                      {/* Focused Hovered Metric */}
                      <div className="bg-base-inset/80 rounded-lg p-2 mb-2 animate-slide-right">
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className="font-semibold"
                            style={{ color: barTooltip.focusedColor }}
                          >
                            {barTooltip.focusedLabel}
                          </span>
                          <span className="font-mono font-bold text-ink tabular-nums">
                            {barTooltip.focusedValue} events
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-ink-faint mt-0.5">
                          <span>Session Share</span>
                          <span>
                            {barTooltip.sessionData.total > 0
                              ? Math.round(
                                  (barTooltip.focusedValue / barTooltip.sessionData.total) * 100
                                )
                              : 0}
                            % of {barTooltip.sessionData.total} total
                          </span>
                        </div>
                      </div>

                      {/* Full Session Breakdown */}
                      <div className="space-y-1 text-[11px] animate-fade-up">
                        {SERIES_META.map((s) => {
                          const count = barTooltip.sessionData[s.key] ?? 0;
                          const isFocused = s.key === barTooltip.focusedKey;
                          return (
                            <div
                              key={s.key}
                              className={`flex items-center justify-between px-1.5 py-0.5 rounded ${
                                isFocused ? "bg-brand-light/60 font-semibold text-ink" : "text-ink-muted"
                              }`}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: s.color }}
                                />
                                {s.label}
                              </span>
                              <span className="font-mono tabular-nums text-ink">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* D3 2D G-Force Friction Circle (5 cols) */}
              <div className="lg:col-span-5 bg-base-inset/50 rounded-xl p-4 border border-base-border flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-xs font-semibold text-ink">G-Force Envelope (D3.js)</h3>
                  <span className="text-[11px] font-mono text-crit">0.75g Limit</span>
                </div>

                <div
                  ref={gForceContainerRef}
                  className="relative flex items-center justify-center my-1"
                >
                  <svg
                    ref={gForceSvgRef}
                    className="w-full max-w-[240px] h-auto select-none"
                    role="img"
                    aria-label="D3.js 2D G-force friction circle chart"
                  />

                  {gForceTooltip && gForceTooltip.event && (
                    <div
                      key={gForceTooltip.event.id}
                      style={{
                        left: `${Math.min(
                          Math.max(8, gForceTooltip.x - 105),
                          Math.max(12, (gForceTooltip.containerW || 260) - 220)
                        )}px`,
                        top: `${
                          gForceTooltip.y > 135
                            ? Math.max(4, gForceTooltip.y - 148)
                            : gForceTooltip.y + 16
                        }px`,
                      }}
                      className="pointer-events-none absolute z-30 panel bg-white/95 backdrop-blur-md border border-base-border rounded-xl p-3 shadow-xl w-[215px] animate-scale-in"
                    >
                      <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-base-border">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0 animate-ping"
                            style={{
                              backgroundColor:
                                EVENT_COLORS[gForceTooltip.event.type] || "#2E7DE1",
                            }}
                          />
                          <span className="text-xs font-bold text-ink truncate">
                            {gForceTooltip.event.type}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-semibold text-brand shrink-0">
                          {gForceTooltip.event.id}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-[11px] animate-slide-right">
                        <div className="flex items-center justify-between">
                          <span className="text-ink-muted">Resultant Vector</span>
                          <span
                            className="font-mono font-bold tabular-nums"
                            style={{
                              color:
                                EVENT_COLORS[gForceTooltip.event.type] || "#2E7DE1",
                            }}
                          >
                            {gForceTooltip.event.magnitude_g.toFixed(2)}g (
                            {Math.round((gForceTooltip.event.magnitude_g / 0.75) * 100)}% limit)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] pt-0.5">
                          <div className="bg-base-inset/80 rounded px-2 py-1">
                            <div className="text-ink-faint">Longitudinal</div>
                            <div className="font-semibold text-ink tabular-nums">
                              {gForceTooltip.event.longitudinal_g > 0 ? "+" : ""}
                              {gForceTooltip.event.longitudinal_g.toFixed(2)}g
                            </div>
                          </div>
                          <div className="bg-base-inset/80 rounded px-2 py-1">
                            <div className="text-ink-faint">Lateral</div>
                            <div className="font-semibold text-ink tabular-nums">
                              {gForceTooltip.event.lateral_g > 0 ? "+" : ""}
                              {gForceTooltip.event.lateral_g.toFixed(2)}g
                            </div>
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-base-border/80 flex items-center justify-between text-[10px] font-mono text-ink-muted animate-fade-up">
                          <span className="truncate max-w-[130px]">
                            {gForceTooltip.event.location}
                          </span>
                          <span className="font-semibold text-ink shrink-0">
                            {gForceTooltip.event.speed_kmh} km/h
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {selectedEvent && (
                  <div className="bg-white rounded-lg p-2.5 border border-base-border text-[11px] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: EVENT_COLORS[selectedEvent.type] }}
                        />
                        <span className="font-semibold text-ink truncate">
                          {selectedEvent.type} · {selectedEvent.id}
                        </span>
                      </div>
                      <div className="text-ink-faint truncate mt-0.5">
                        {selectedEvent.location} · {selectedEvent.speed_kmh} km/h
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0 tabular-nums">
                      <div className="font-semibold text-ink">{selectedEvent.magnitude_g}g</div>
                      <div className="text-[10px] text-ink-faint">
                        {selectedEvent.longitudinal_g}g / {selectedEvent.lateral_g}g
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Recent High-G Kinematic Incident Feed */}
            {!compact && (
              <div>
                <h3 className="text-xs font-semibold text-ink-muted mb-2.5">
                  High-G Kinematic Log ({filteredEvents.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {filteredEvents.slice(0, 8).map((ev, idx) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                      style={{ animationDelay: `${idx * 35}ms` }}
                      className={`text-left rounded-lg p-3 border transition-all duration-150 hover:-translate-y-0.5 animate-fade-up ${
                        selectedEvent?.id === ev.id
                          ? "bg-white border-brand shadow-sm"
                          : "bg-base-inset/70 border-base-border hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1 font-mono text-[11px]">
                        <span className="text-brand font-semibold">
                          {ev.id} · {ev.session}
                        </span>
                        <span
                          className="font-semibold tabular-nums"
                          style={{ color: EVENT_COLORS[ev.type] }}
                        >
                          {ev.magnitude_g}g
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-ink truncate">{ev.type}</div>
                      <div className="text-[10px] text-ink-faint truncate mt-0.5">
                        {ev.location} · {ev.speed_kmh} km/h
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}
    </section>
  );
}
