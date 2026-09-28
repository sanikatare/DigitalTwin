import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import { VehicleProvider } from "./context/VehicleContext";
import Assistant from "./pages/Assistant";
import Overview from "./pages/Overview";
import HealthScore from "./pages/HealthScore";
import PredictiveMaintenance from "./pages/PredictiveMaintenance";
import DigitalTwin from "./pages/DigitalTwin";
import OBDDiagnostics from "./pages/OBDDiagnostics";
import KnowledgeBase from "./pages/KnowledgeBase";
import TripPlanner from "./pages/TripPlanner";
import DriverBehavior from "./pages/DriverBehavior";

function KineticShowcaseOverlay({ onClose }) {
  const containerRef = useRef(null);
  const [exiting, setExiting] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0, cursorX: 50, cursorY: 50 });

  const triggerExit = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  useEffect(() => {
    containerRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        triggerExit();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      x: ny * -14,
      y: nx * 14,
      cursorX: ((e.clientX - rect.left) / rect.width) * 100,
      cursorY: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }

  const letters = "DIGITWIN".split("");

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onClick={triggerExit}
      onMouseMove={handleMouseMove}
      className={`fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-gradient-to-br from-[#001447] via-[#0033A0] to-[#001E66] text-white flex flex-col items-center justify-center select-none cursor-pointer outline-none transition-all duration-300 ${
        exiting ? "opacity-0 scale-105" : "opacity-100 scale-100"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          background: `radial-gradient(600px circle at ${tilt.cursorX}% ${tilt.cursorY}%, rgba(96, 165, 250, 0.28), transparent 65%)`,
        }}
      />

      <div className="pointer-events-none absolute -top-28 -left-28 w-96 h-96 rounded-full bg-sky-400/20 blur-3xl animate-blob" />
      <div
        className="pointer-events-none absolute -bottom-28 -right-28 w-[420px] h-[420px] rounded-full bg-blue-400/20 blur-3xl animate-blob"
        style={{ animationDelay: "4s" }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center transition-transform duration-150 ease-out"
        style={{
          transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
      >
        <div className="relative w-[500px] h-[500px] sm:w-[680px] sm:h-[680px] flex items-center justify-center">
          <svg
            viewBox="0 0 600 600"
            className="absolute inset-0 w-full h-full opacity-40"
            style={{ animation: "orbitSlow 30s linear infinite" }}
          >
            <circle
              cx="300"
              cy="300"
              r="272"
              fill="none"
              stroke="rgba(147, 197, 253, 0.4)"
              strokeWidth="1.25"
              strokeDasharray="6 14"
            />
            <circle
              cx="300"
              cy="300"
              r="245"
              fill="none"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1.75"
              strokeDasharray="100 170"
              strokeLinecap="round"
            />
            <circle cx="300" cy="28" r="4" fill="#93C5FD" />
            <circle cx="572" cy="300" r="4" fill="#93C5FD" />
            <circle cx="300" cy="572" r="4" fill="#93C5FD" />
            <circle cx="28" cy="300" r="4" fill="#93C5FD" />
          </svg>

          <svg
            viewBox="0 0 600 600"
            className="absolute inset-0 w-full h-full opacity-50"
            style={{ animation: "orbitReverse 20s linear infinite" }}
          >
            <circle
              cx="300"
              cy="300"
              r="210"
              fill="none"
              stroke="rgba(96, 165, 250, 0.5)"
              strokeWidth="2"
              strokeDasharray="140 90 40 110"
              strokeLinecap="round"
            />
            <circle
              cx="300"
              cy="300"
              r="172"
              fill="none"
              stroke="rgba(255, 255, 255, 0.18)"
              strokeWidth="1"
              strokeDasharray="4 10"
            />
          </svg>

          <div
            className="w-[300px] h-[300px] sm:w-[380px] sm:h-[380px] rounded-full border border-sky-300/35 bg-sky-400/5"
            style={{ animation: "pulseRing 4.5s ease-in-out infinite" }}
          />
        </div>
      </div>

      <svg
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        className="pointer-events-none absolute bottom-10 left-0 w-full h-36 opacity-35"
      >
        <path
          d="M 0 110 Q 180 35, 360 110 T 720 110 T 1080 110 T 1440 110"
          fill="none"
          stroke="rgba(147, 197, 253, 0.65)"
          strokeWidth="1.5"
          strokeDasharray="12 8"
          style={{ animation: "dashFlow 7s linear infinite" }}
        />
        <path
          d="M 0 140 Q 240 195, 480 140 T 960 140 T 1440 140"
          fill="none"
          stroke="rgba(255, 255, 255, 0.35)"
          strokeWidth="1.2"
          strokeDasharray="20 10"
          style={{ animation: "dashFlow 11s linear infinite reverse" }}
        />
      </svg>

      <div
        className="relative z-10 flex flex-col items-center px-6 transition-transform duration-150 ease-out"
        style={{
          transform: `perspective(900px) rotateX(${tilt.x * 0.65}deg) rotateY(${tilt.y * 0.65}deg)`,
        }}
      >
        <div className="flex flex-col items-center" style={{ animation: "floatWave 5.5s ease-in-out infinite" }}>
          <svg viewBox="0 0 260 64" className="w-48 sm:w-60 h-14 mb-5 opacity-95" fill="none">
            <path
              d="M22 46 L48 46 L68 22 L152 22 L188 34 L232 38 L238 46 L22 46 Z"
              stroke="rgba(147, 197, 253, 0.85)"
              strokeWidth="1.85"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="240"
              style={{ animation: "dashFlow 5.5s linear infinite" }}
            />
            <circle cx="66" cy="46" r="9" stroke="#FFFFFF" strokeWidth="2" fill="#002878" />
            <circle cx="196" cy="46" r="9" stroke="#FFFFFF" strokeWidth="2" fill="#002878" />
            <line
              x1="78"
              y1="34"
              x2="176"
              y2="34"
              stroke="rgba(147,197,253,0.5)"
              strokeWidth="1.2"
              strokeDasharray="6 6"
            />
          </svg>

          <h1
            aria-label="DIGITWIN"
            className="font-display font-bold text-6xl sm:text-8xl md:text-9xl tracking-[0.24em] text-white flex items-center justify-center pl-[0.24em] drop-shadow-[0_14px_38px_rgba(0,0,0,0.4)]"
          >
            {letters.map((char, i) => (
              <span
                key={i}
                className="inline-block hover:text-sky-200 transition-colors duration-200"
                style={{
                  animation: `letterReveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.065}s both`,
                }}
              >
                {char}
              </span>
            ))}
          </h1>

          <div className="relative w-64 sm:w-80 h-[2px] bg-white/15 rounded-full overflow-hidden mt-7">
            <div
              className="w-1/2 h-full bg-gradient-to-r from-transparent via-sky-300 to-transparent"
              style={{ animation: "scanSweep 2.2s ease-in-out infinite" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [showShowcase, setShowShowcase] = useState(false);

  return (
    <VehicleProvider>
      <BrowserRouter>
        {showShowcase && <KineticShowcaseOverlay onClose={() => setShowShowcase(false)} />}
        <div className="relative flex h-screen overflow-hidden bg-base">
          {/* Ambient Kinetic Background Orbs in Dashboard */}
          <div className="pointer-events-none fixed top-0 right-1/4 w-96 h-96 rounded-full bg-accent/[0.04] blur-3xl animate-blob" />
          <div
            className="pointer-events-none fixed bottom-0 left-1/3 w-96 h-96 rounded-full bg-brand/[0.04] blur-3xl animate-blob"
            style={{ animationDelay: "5s" }}
          />

          <Sidebar />
          <div className="relative z-10 flex-1 flex flex-col min-w-0">
            <TopBar onOpenShowcase={() => setShowShowcase(true)} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
              <Routes>
                <Route path="/" element={<Overview onOpenShowcase={() => setShowShowcase(true)} />} />
                <Route path="/health" element={<HealthScore />} />
                <Route path="/maintenance" element={<PredictiveMaintenance />} />
                <Route path="/twin" element={<DigitalTwin />} />
                <Route path="/obd" element={<OBDDiagnostics />} />
                <Route path="/knowledge" element={<KnowledgeBase />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/trip" element={<TripPlanner />} />
                <Route path="/driver" element={<DriverBehavior />} />
              </Routes>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </VehicleProvider>
  );
}
