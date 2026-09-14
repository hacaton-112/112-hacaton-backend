import { isTauri } from "@tauri-apps/api/core";
import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";

import type { IncidentLocation } from "../components/map/incident-map";
import type { CallState } from "../hooks/use-call";
import type { GeoPoint } from "../services/incident-location";

type CallMapSnapshot = {
  callState: CallState;
  incident: IncidentLocation | null;
  isResolvingAddress: boolean;
};

type MapWindowState = CallMapSnapshot & {
  /** Место происшествия, отмеченное оператором в окне звонка. */
  selectedPoint: GeoPoint | null;
  setSnapshot: (snapshot: CallMapSnapshot) => void;
  setSelectedPoint: (point: GeoPoint | null) => void;
};

/**
 * This small presentation store is the only bridge between the operator and
 * map windows. Business actions stay in the operator window; the map receives
 * just the serializable snapshot it needs to render.
 */
export const useMapWindowStore = create<MapWindowState>((set) => ({
  callState: "idle",
  incident: null,
  isResolvingAddress: false,
  selectedPoint: null,
  setSnapshot: set,
  setSelectedPoint: (selectedPoint) => set({ selectedPoint }),
}));

if (isTauri()) {
  createTauriStore("incident-map-window", useMapWindowStore, {
    autoStart: true,
    filterKeys: [
      "callState",
      "incident",
      "isResolvingAddress",
      "selectedPoint",
    ],
    filterKeysStrategy: "pick",
    save: false,
    syncStrategy: 25,
  });
}
