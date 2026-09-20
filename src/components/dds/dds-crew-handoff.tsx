import { Badge, Card, Flex, Text } from "@bolid-ui/themes";
import { PhoneCall } from "lucide-react";

import type { DdsCrewHandoff } from "../../contracts/dds-exercise";
import { crewCallVerdict } from "./dds-formatters";

/**
 * Передача карточки наряду по телефону.
 *
 * Звонит диспетчер с SIP-телефона рабочего места, а не из интерфейса: здесь
 * справочник нарядов своей службы и журнал того, кому и чем закончился звонок.
 */
export function DdsCrewHandoffBlock({ handoff }: { handoff: DdsCrewHandoff }) {
  return (
    <Card
      size="2"
      variant="surface"
      className="arm-dds-info-block grid gap-3"
      aria-label="Передача наряду"
    >
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Flex align="center" gap="2">
          <PhoneCall size={17} />
          <Text size="2" weight="bold">
            Передача наряду
          </Text>
        </Flex>
        <Badge color={handoff.notified ? "green" : "amber"} variant="soft">
          {handoff.notified ? "Карточка передана" : "Наряд не оповещён"}
        </Badge>
      </Flex>

      {!handoff.notified && (
        <Text size="1" color="gray">
          Наберите номер наряда на телефоне рабочего места и зачитайте карточку.
          Начало реагирования станет доступно, когда наряд примет её.
        </Text>
      )}

      {handoff.crews.length > 0 ? (
        <div className="grid gap-1" aria-label="Наряды службы">
          {handoff.crews.map((crew) => (
            <Flex
              key={crew.phoneNumber}
              align="center"
              justify="between"
              gap="3"
            >
              <Text size="2">{crew.callsign}</Text>
              <Text size="2" weight="bold" className="font-mono tabular-nums">
                {crew.phoneNumber}
              </Text>
            </Flex>
          ))}
        </div>
      ) : (
        <Text size="1" color="gray">
          В справочнике нет нарядов этой службы.
        </Text>
      )}

      {handoff.calls.length > 0 && (
        <div className="grid gap-1" aria-label="Звонки нарядам">
          {handoff.calls.map((call) => {
            const verdict = crewCallVerdict(call);

            return (
              <Flex
                key={call.startedAt}
                align="center"
                justify="between"
                gap="3"
                wrap="wrap"
              >
                <Text size="1" color="gray" className="tabular-nums">
                  {new Date(call.startedAt).toLocaleTimeString("ru-RU")} ·{" "}
                  <span className="font-mono">{call.dialedNumber}</span>
                  {" · "}
                  {call.callsign ?? "номер не найден"}
                </Text>
                <Badge color={verdict.color} variant="soft">
                  {verdict.label}
                </Badge>
              </Flex>
            );
          })}
        </div>
      )}
    </Card>
  );
}
