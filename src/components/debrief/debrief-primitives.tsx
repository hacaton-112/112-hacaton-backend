import { Flex, Text } from "@bolid-ui/themes";
import type { ReactNode } from "react";

export function DebriefLine({
  label,
  value,
  bad = false,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <Flex align="start" justify="between" gap="3">
      <Text size="2" color="gray" className="shrink-0">
        {label}
      </Text>
      <Text size="2" color={bad ? "red" : undefined} className="text-right">
        {value}
      </Text>
    </Flex>
  );
}

export function DebriefNotice({ children }: { children: ReactNode }) {
  return (
    <Flex align="center" justify="center" className="h-full p-6">
      <Text size="2" color="gray">
        {children}
      </Text>
    </Flex>
  );
}
