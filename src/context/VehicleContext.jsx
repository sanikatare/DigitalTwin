import { createContext, useContext, useState } from "react";

const VehicleContext = createContext({
  vehicleId: "Vehicle_0001",
  setVehicleId: () => {},
});

export function VehicleProvider({ children }) {
  const [vehicleId, setVehicleId] = useState("Vehicle_0001");

  return (
    <VehicleContext.Provider value={{ vehicleId, setVehicleId }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  const context = useContext(VehicleContext);
  if (!context) {
    throw new Error("useVehicle must be used within a VehicleProvider");
  }
  return context;
}
