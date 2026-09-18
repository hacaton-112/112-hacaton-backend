import { Card, Text } from "@bolid-ui/themes";

export function DuplicateSuspicion() {
  return (
    <Card
      size="2"
      variant="classic"
      aria-labelledby="duplicate-title"
      className="arm-duplicate-card"
    >
      <Text id="duplicate-title" size="2" weight="bold">
        Подозрения на дубль/связь
      </Text>
      <Text as="p" size="1" color="gray" mt="2">
        Связанные обращения не найдены.
      </Text>
    </Card>
  );
}
