import { Card, Flex, Spinner, Text } from "@bolid-ui/themes";
import { RadioTower, Timer } from "lucide-react";

export function DdsShiftPanel({
  fetching,
  incoming,
}: {
  fetching: boolean;
  incoming: number;
}) {
  return (
    <Card size="1" variant="classic" className="arm-dds-shift-panel">
      <Flex align="center" gap="2" className="arm-dds-shift-state">
        <span className="arm-dds-online-dot" aria-hidden />
        <RadioTower size={15} />
        <div>
          <Text as="p" size="2" weight="bold">
            Смена ДДС открыта
          </Text>
          <Text as="p" size="1" color="gray">
            Профильная очередь обновляется автоматически
          </Text>
        </div>
      </Flex>
      <div className="arm-dds-shift-count">
        {fetching && <Spinner size="1" />}
        <strong>{incoming}</strong>
        <span>карточек</span>
      </div>
      <div className="arm-dds-shift-norm">
        <Timer size={15} />
        <span>Первичный статус</span>
        <strong>00:30</strong>
      </div>
    </Card>
  );
}
