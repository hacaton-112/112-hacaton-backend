import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Select,
  Text,
  TextField,
} from "@bolid-ui/themes";
import { AlertTriangle, PhoneCall } from "lucide-react";
import { useState } from "react";

import type { AuthUser } from "../../contracts/auth";
import { useTelephonyWorkstations } from "../../hooks/use-telephony-workstations";

const EXTENSION = /^\d{2,6}$/u;

/**
 * Рабочие места ДДС в учебной IP-АТС.
 *
 * Asterisk знает только внутренний номер телефона, с которого звонят наряду.
 * Кто сидит за этим телефоном, задаёт администратор: по этой привязке звонок
 * относится к карточке нужного диспетчера.
 */
export function TelephonyWorkstationsCard({
  users,
}: {
  users: readonly AuthUser[];
}) {
  const { workstations, seat, free } = useTelephonyWorkstations();
  const [extension, setExtension] = useState("");
  const [userId, setUserId] = useState<string>();
  const trainees = users.filter(
    (user) => user.isActive && user.role === "operator",
  );
  const extensionValid = EXTENSION.test(extension.trim());
  const failure = workstations.error ?? seat.error ?? free.error;

  const submit = () => {
    if (!extensionValid || !userId) return;
    seat.mutate(
      { extension: extension.trim(), userId },
      { onSuccess: () => setExtension("") },
    );
  };

  return (
    <Card size="3" variant="classic" className="grid gap-3">
      <Flex align="center" gap="2">
        <PhoneCall size={18} />
        <Heading size="4">Рабочие места ДДС</Heading>
      </Flex>
      <Text size="2" color="gray">
        Диспетчер ДДС передаёт карточку наряду со своего SIP-телефона. Укажите,
        кто сидит за каким внутренним номером учебной АТС, — иначе звонок наряду
        не отнесётся к его карточке.
      </Text>

      {failure && (
        <Callout.Root color="red" role="alert" size="1">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{failure.message}</Callout.Text>
        </Callout.Root>
      )}

      <div className="grid gap-2" aria-label="Занятые рабочие места">
        {(workstations.data ?? []).map((workstation) => (
          <Flex
            key={workstation.extension}
            align="center"
            justify="between"
            gap="3"
          >
            <Flex align="center" gap="2">
              <Badge variant="soft" className="font-mono">
                {workstation.extension}
              </Badge>
              <Text size="2">{workstation.fullName}</Text>
            </Flex>
            <Button
              type="button"
              size="1"
              variant="soft"
              color="gray"
              disabled={free.isPending}
              onClick={() => free.mutate(workstation.extension)}
            >
              Освободить
            </Button>
          </Flex>
        ))}
        {workstations.data?.length === 0 && (
          <Text size="1" color="gray">
            Пока никто не посажен за телефоны.
          </Text>
        )}
      </div>

      <Flex gap="2" wrap="wrap" align="end">
        <TextField.Root
          className="w-32"
          aria-label="Внутренний номер"
          placeholder="201"
          inputMode="numeric"
          value={extension}
          onChange={(event) => setExtension(event.target.value)}
        />
        <Select.Root value={userId} onValueChange={setUserId}>
          <Select.Trigger
            className="min-w-64"
            placeholder="Диспетчер"
            aria-label="Диспетчер за телефоном"
          />
          <Select.Content>
            {trainees.map((user) => (
              <Select.Item key={user.id} value={user.id}>
                {user.fullName}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Button
          type="button"
          disabled={!extensionValid || !userId || seat.isPending}
          onClick={submit}
        >
          Посадить за телефон
        </Button>
      </Flex>
    </Card>
  );
}
