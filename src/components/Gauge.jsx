import { useEffect, useState } from "react";

const TRACK = "#E4E7EC";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function colorFor(value, invert) {
  const v = invert ? 100 - value : value;
  if (v >= 75) return { stroke: "#12B76A", glow: "#12B76A33", bg: "rgba(18, 183, 106, 0.06)", label: "good" };
  if (v >= 50) return { stroke: "#F79009", glow: "#F7900933", bg: "rgba(247, 144, 9, 0.06)", label: "warn" };
  return { stroke: "#F04438", glow: "#F0443833", bg: "rgba(240, 68, 56, 0.06)", label: "crit" };
}

export default function Gauge({
  value = 0,
  max = 100,
  size = 128,
  label,
  sublabel,
  invert = false,
  strokeWidth = 10,
}) {
  const targetValue = Number.isFinite(value) ? clamp(value, 0, max) : 0;
  const [animatedVal, setAnimatedVal] = useState(0);

  useEffect(() => {
    let rafId;
    const startVal = animatedVal;
    const diff = targetValue - startVal;
    const duration = 650;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedVal(startVal + diff * eased);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    }

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue]);

  const pct = clamp(animatedVal / max, 0, 1);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweep = 0.75;
  const dash = circumference * sweep;
  const offset = dash * (1 - pct);
  const { stroke, glow, bg } = colorFor((targetValue / max) * 100, invert);

  return (
    <div
      className="group flex flex-col items-center justify-center animate-scale-in"
      style={{ width: size }}
    >
      <div
        className="relative transition-transform duration-300 group-hover:scale-105"
        style={{ width: size, height: size }}
      >
        {/* Subtle inner radial glow */}
        <div
          className="absolute inset-2 rounded-full transition-colors duration-500 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${bg} 0%, transparent 72%)` }}
        />

        <svg width={size} height={size} className="-rotate-[225deg]" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={TRACK}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${glow})`,
              transition: "stroke 0.4s ease",
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-display font-semibold text-2xl leading-none tabular-nums transition-colors duration-300"
            style={{ color: stroke, fontSize: size < 80 ? "1.05rem" : undefined }}
          >
            {Number.isFinite(value) ? Math.round(animatedVal) : "—"}
          </span>
          {sublabel && (
            <span className="text-[10px] text-ink-faint mt-1 font-mono tabular-nums">
              {sublabel}
            </span>
          )}
        </div>
      </div>
      {label && (
        <span className="eyebrow mt-2 text-center normal-case tracking-normal text-ink-muted group-hover:text-ink transition-colors">
          {label}
        </span>
      )}
    </div>
  );
}
