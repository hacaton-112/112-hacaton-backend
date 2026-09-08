import { Button, Flex, RadioGroup, Table, Text } from "@bolid-ui/themes";
import { Check, Link2 } from "lucide-react";

export function DuplicateSuspicion() {
  return (
    <section className="border-grayA-5 mt-2 border-t pt-3">
      <Flex align="center" justify="between" gap="2">
        <Text size="2" weight="bold">
          Подозрения на дубль/связь
        </Text>
        <Button type="button" size="1" variant="ghost">
          К главной карточке
        </Button>
      </Flex>

      <RadioGroup.Root defaultValue="related" size="1" mt="2">
        <Flex align="center" gap="3">
          <Text as="label" size="1">
            <Flex align="center" gap="1">
              <RadioGroup.Item value="duplicate" />
              Дубль
            </Flex>
          </Text>
          <Text as="label" size="1" color="blue">
            <Flex align="center" gap="1">
              <RadioGroup.Item value="related" />
              Связь
            </Flex>
          </Text>
        </Flex>
      </RadioGroup.Root>

      <Table.Root size="1" variant="surface" layout="fixed" mt="2">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell width="32px" />
            <Table.ColumnHeaderCell minWidth="180px">
              Адрес
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell minWidth="170px">
              Описание со слов заявителя
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell minWidth="100px">
              Тип происшествия
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="100px">Дата</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="48px" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row className="bg-green-2" align="center">
            <Table.Cell justify="center">
              <Link2 size={14} aria-label="Связанное обращение" />
            </Table.Cell>
            <Table.Cell>
              Московская область, ул. Карандельская, д. 54/1, п. 5, эт. 3, кв.
              144
            </Table.Cell>
            <Table.Cell>Стреляют в воздух</Table.Cell>
            <Table.Cell>Стрельба</Table.Cell>
            <Table.Cell className="tabular-nums">22.03.2024 11:48</Table.Cell>
            <Table.Cell justify="center">
              <Button
                type="button"
                size="1"
                color="green"
                variant="solid"
                radius="full"
                aria-label="Подтвердить связь"
              >
                <Check size={14} aria-hidden />
              </Button>
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    </section>
  );
}
