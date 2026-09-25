import { create } from "zustand";
import type { CallState } from "../contracts/call";
import type { GeoPoint, IncidentLocation } from "../contracts/geo";

type CallMapSnapshot = {
  callState: CallState;
  incident: IncidentLocation | null;
  isResolvingAddress: boolean;
};
type MapWindowState = CallMapSnapshot & {
  selectedPoint: GeoPoint | null;
  setSnapshot: (snapshot: CallMapSnapshot) => void;
  setSelectedPoint: (point: GeoPoint | null) => void;
};
type SharedState = Pick<
  MapWindowState,
  "callState" | "incident" | "isResolvingAddress" | "selectedPoint"
>;
type MapMessage =
  | { type: "state"; sender: string; state: SharedState }
  | { type: "request"; sender: string };

export const useMapWindowStore = create<MapWindowState>((set) => ({
  callState: "idle",
  incident: null,
  isResolvingAddress: false,
  selectedPoint: null,
  setSnapshot: set,
  setSelectedPoint: (selectedPoint) => set({ selectedPoint }),
}));

if (typeof BroadcastChannel !== "undefined") {
  const sender = crypto.randomUUID();
  const channel = new BroadcastChannel("incident-map-window");
  let applyingRemote = false;
  let timer: number | null = null;
  const snapshot = (): SharedState => {
    const { callState, incident, isResolvingAddress, selectedPoint } =
      useMapWindowStore.getState();
    return { callState, incident, isResolvingAddress, selectedPoint };
  };
  const publish = () =>
    channel.postMessage({
      type: "state",
      sender,
      state: snapshot(),
    } satisfies MapMessage);
  useMapWindowStore.subscribe(() => {
    if (applyingRemote || timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      publish();
    }, 25);
  });
  channel.addEventListener("message", (event: MessageEvent<MapMessage>) => {
    const message = event.data;
    if (!message || message.sender === sender) return;
    if (message.type === "request") {
      publish();
      return;
    }
    if (message.type === "state") {
      applyingRemote = true;
      useMapWindowStore.setState(message.state);
      applyingRemote = false;
    }
  });
  channel.postMessage({ type: "request", sender } satisfies MapMessage);
}
