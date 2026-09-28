import axios from "axios";

function makeClient(baseURL) {
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export const phase2 = makeClient("/api/phase2");
export const phase3 = makeClient("/api/phase3");
export const phase4 = makeClient("/api/phase4");
export const phase5 = makeClient("/api/phase5");
export const phase6 = makeClient("/api/phase6");
export const phase7 = makeClient("/api/phase7");
export const phase8 = makeClient("/api/phase8");
export const phase9 = makeClient("/api/phase9");

export const ALL_SERVICES = [
  { id: "phase2", name: "Phase 2 · Health Score", client: phase2, healthPath: "/health" },
  { id: "phase3", name: "Phase 3 · Predictive Maintenance", client: phase3, healthPath: "/health" },
  { id: "phase4", name: "Phase 4 · Digital Twin", client: phase4, healthPath: "/health" },
  { id: "phase5", name: "Phase 5 · OBD Diagnostics", client: phase5, healthPath: "/health" },
  { id: "phase6", name: "Phase 6 · Knowledge Base", client: phase6, healthPath: "/health" },
  { id: "phase7", name: "Phase 7 · Assistant", client: phase7, healthPath: "/health" },
  { id: "phase8", name: "Phase 8 · Trip Planner", client: phase8, healthPath: "/health" },
  { id: "phase9", name: "Phase 9 · Driver Behaviour", client: phase9, healthPath: "/health" },
];
