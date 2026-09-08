import { isTauri } from "@tauri-apps/api/core";
import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";

import type { IncidentLocation } from "../components/map/incident-map";
import type { CallState } from "../hooks/use-call";

type MapWindowState = {
  callState: CallState;
  incident: IncidentLocation | null;
  isResolvingAddress: boolean;
  setSnapshot: (snapshot: Omit<MapWindowState, "setSnapshot">) => void;
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
  setSnapshot: set,
}));

if (isTauri()) {
  createTauriStore("incident-map-window", useMapWindowStore, {
    autoStart: true,
    filterKeys: ["callState", "incident", "isResolvingAddress"],
    filterKeysStrategy: "pick",
    save: false,
    syncStrategy: 25,
  });
}
