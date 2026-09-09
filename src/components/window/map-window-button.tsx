import { Button } from "@bolid-ui/themes";
import { isTauri } from "@tauri-apps/api/core";
import { Window } from "@tauri-apps/api/window";
import { ExternalLink } from "lucide-react";

const MAP_WINDOW_LABEL = "incident-map";

export function MapWindowButton({ label = "Карта" }: { label?: string }) {
  const showMap = async () => {
    if (!isTauri()) {
      window.open("/#/map", MAP_WINDOW_LABEL);
      return;
    }

    const mapWindow = await Window.getByLabel(MAP_WINDOW_LABEL);
    await mapWindow?.show();
    await mapWindow?.setFocus();
  };

  return (
    <Button
      type="button"
      size="1"
      variant="soft"
      onClick={() => void showMap()}
    >
      <ExternalLink size={13} /> {label}
    </Button>
  );
}
