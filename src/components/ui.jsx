import { useState } from "react";
import { Loader2, WifiOff } from "lucide-react";

/** Shared Recharts styling for light theme */
export const CHART = {
  grid: "#E4E7EC",
  axis: "#98A2B3",
  tooltip: {
    background: "#FFFFFF",
    border: "1px solid #E4E7EC",
    borderRadius: 10,
    fontSize: 12,
    fontFamily: '"Playfair Display", Georgia, serif',
    color: "#101828",
    boxShadow: "0 8px 24px rgba(16, 24, 40, 0.10)",
  },
  primary: "#2E7DE1",
  danger: "#F04438",
};

export function PageHeader({ eyebrow, title, right }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 animate-fade-up">
      <div className="flex items-center gap-3">
        {eyebrow && (
          <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-brand">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" aria-hidden />
            <span>{eyebrow}</span>
            <span className="text-ink-faint" aria-hidden>
              /
            </span>
          </div>
        )}
        <h1 className="font-display font-bold text-xl sm:text-2xl text-ink tracking-tight">
          {title}
        </h1>
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "", title, right, style }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, active: false });

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      active: true,
    });
  }

  return (
    <div
      style={style}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setMousePos((m) => ({ ...m, active: false }))}
      className={`group panel panel-interactive relative overflow-hidden p-5 animate-fade-up ${className}`}
    >
      {/* Dynamic cursor-following spotlight aura */}
      {mousePos.active && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{
            background: `radial-gradient(320px circle at ${mousePos.x}px ${mousePos.y}px, rgba(46, 125, 225, 0.06), transparent 70%)`,
          }}
        />
      )}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand/0 via-accent/60 to-brand/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      {(title || right) && (
        <div className="relative z-10 flex items-center justify-between mb-4 gap-3">
          {title && (
            <h3 className="text-xs font-semibold tracking-wide text-ink-muted group-hover:text-ink transition-colors">
              {title}
            </h3>
          )}
          {right}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function StatRow({ label, value, mono = true }) {
  return (
    <div className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg border-b border-base-border last:border-0 gap-4 hover:bg-base-inset/80 transition-all duration-150">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`text-sm font-medium text-ink text-right tabular-nums ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function StatusPill({ level, children }) {
  const styles = {
    good: "text-good",
    warn: "text-warn",
    crit: "text-crit",
    neutral: "text-ink-muted",
  };
  const dotStyles = {
    good: "bg-good",
    warn: "bg-warn",
    crit: "bg-crit",
    neutral: "bg-ink-faint",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-mono font-semibold transition-colors duration-150 whitespace-nowrap ${
        styles[level] || styles.neutral
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dotStyles[level] || dotStyles.neutral} ${
          level === "crit" ? "animate-ping" : "animate-pulse"
        }`}
        aria-hidden
      />
      {children}
    </span>
  );
}

export function Skeleton({ className = "", style }) {
  return <div style={style} className={`rounded-lg skeleton-shimmer ${className}`} aria-hidden />;
}

export function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function GaugeSkeleton({ size = 128 }) {
  return (
    <div className="flex flex-col items-center py-2">
      <Skeleton className="rounded-full" style={{ width: size, height: size }} />
      <Skeleton className="h-3 w-20 mt-3" />
    </div>
  );
}

export function Loading({ label = "Syncing…" }) {
  return (
    <div
      className="flex items-center gap-2 text-ink-muted text-sm py-8 justify-center animate-fade-up"
      role="status"
    >
      <Loader2 size={16} className="animate-spin text-accent" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({ message = "Service unavailable.", onRetry }) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center py-8 px-4 animate-scale-in">
      <div className="w-10 h-10 rounded-full bg-crit/10 flex items-center justify-center">
        <WifiOff size={18} className="text-crit" aria-hidden />
      </div>
      <p className="text-xs font-medium text-ink-muted max-w-sm">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-semibold text-accent hover:text-accent-dim transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function Button({ children, className = "", variant = "primary", ...props }) {
  const variants = {
    primary:
      "bg-gradient-to-r from-brand to-accent text-white font-medium hover:opacity-95 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]",
    ghost:
      "border border-base-border text-ink bg-white hover:bg-base-inset hover:-translate-y-0.5 active:scale-[0.99]",
    accent:
      "bg-accent text-white font-medium hover:bg-accent-dim shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]",
  };
  return (
    <button
      type="button"
      className={`px-4 py-2 rounded-xl text-sm transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 whitespace-nowrap ${
        variants[variant] || variants.primary
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
