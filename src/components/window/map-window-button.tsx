import { Button } from "@bolid-ui/themes";
import { isTauri } from "@tauri-apps/api/core";
import { Window } from "@tauri-apps/api/window";
import { ExternalLink } from "lucide-react";

import { MAP_WINDOW_LABEL, MAP_WINDOW_URL } from "../../config/routes";

export function MapWindowButton({ label = "Карта" }: { label?: string }) {
  const showMap = async () => {
    if (!isTauri()) {
      window.open(MAP_WINDOW_URL, MAP_WINDOW_LABEL);
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
      color="blue"
      variant="solid"
      className="max-w-full shadow-md"
      onClick={() => void showMap()}
    >
      <ExternalLink size={13} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Button>
  );
}
