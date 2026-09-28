import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  HeartPulse,
  Wrench,
  Boxes,
  ScanLine,
  BookOpen,
  MessageSquare,
  Map,
  Gauge as GaugeIcon,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true, idxLabel: "01" },
  { to: "/health", label: "Health Score", icon: HeartPulse, idxLabel: "02" },
  { to: "/maintenance", label: "Maintenance", icon: Wrench, idxLabel: "03" },
  { to: "/twin", label: "Digital Twin", icon: Boxes, idxLabel: "04" },
  { to: "/obd", label: "OBD Diagnostics", icon: ScanLine, idxLabel: "05" },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen, idxLabel: "06" },
  { to: "/assistant", label: "Assistant", icon: MessageSquare, idxLabel: "07" },
  { to: "/trip", label: "Trip Planner", icon: Map, idxLabel: "08" },
  { to: "/driver", label: "Driver Behaviour", icon: GaugeIcon, idxLabel: "09" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 h-full bg-gradient-to-b from-brand via-brand to-brand-dark border-r border-brand-dark flex flex-col text-white select-none shadow-lg z-20 animate-slide-right">
      <div className="px-5 py-5 border-b border-white/15">
        <NavLink to="/" className="group flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shadow-inner transition-transform duration-200 group-hover:scale-105 group-hover:bg-white/25">
            <GaugeIcon
              size={17}
              className="text-white transition-transform duration-300 group-hover:rotate-45"
              strokeWidth={2.25}
            />
          </div>
          <span className="font-display font-bold text-base tracking-wider leading-none">
            DIGITWIN
          </span>
        </NavLink>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, end, idxLabel }, idx) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            style={{ animationDelay: `${idx * 30}ms` }}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 animate-slide-right whitespace-nowrap ${
                isActive
                  ? "bg-white text-brand font-semibold shadow-md translate-x-0.5"
                  : "text-white/80 hover:text-white hover:bg-white/10 hover:translate-x-1"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-accent"
                    aria-hidden
                  />
                )}
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.25 : 2}
                  className={`shrink-0 transition-transform duration-150 ${
                    isActive ? "scale-110 text-brand" : "group-hover:scale-110"
                  }`}
                />
                <span className="flex-1 truncate">{label}</span>
                <span
                  className={`text-[10px] font-mono tabular-nums transition-colors ${
                    isActive
                      ? "text-brand/70 font-semibold"
                      : "text-white/40 group-hover:text-white/75"
                  }`}
                >
                  {idxLabel}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
