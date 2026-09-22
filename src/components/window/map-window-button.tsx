import { Button } from "@bolid-ui/themes";
import { ExternalLink } from "lucide-react";

import { MAP_WINDOW_LABEL, MAP_WINDOW_URL } from "../../config/routes";

export function MapWindowButton({ label = "Карта" }: { label?: string }) {
  const showMap = () => {
    const popup = window.open(
      MAP_WINDOW_URL,
      MAP_WINDOW_LABEL,
      "popup=yes,width=1100,height=760,resizable=yes",
    );
    if (!popup) {
      window.alert(
        "Браузер заблокировал окно карты. Разрешите всплывающие окна для приложения",
      );
      return;
    }
    popup.focus();
  };

  return (
    <Button
      type="button"
      size="1"
      color="blue"
      variant="solid"
      className="max-w-full shadow-md"
      onClick={showMap}
    >
      <ExternalLink size={13} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Button>
  );
}
