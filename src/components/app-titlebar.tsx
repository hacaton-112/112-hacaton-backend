import { Flex, Text } from "@bolid-ui/themes";
import { RadioTower } from "lucide-react";

const APP_NAME = "Учебный симулятор службы 112";

export function AppTitlebar() {
  return (
    <Flex
      align="center"
      gap="2"
      px="3"
      className="border-grayA-4 h-[var(--app-titlebar-height)] shrink-0 border-b"
    >
      <RadioTower size={14} className="text-accent-9" aria-hidden />
      <Text size="1" color="gray">
        {APP_NAME}
      </Text>
    </Flex>
  );
}
