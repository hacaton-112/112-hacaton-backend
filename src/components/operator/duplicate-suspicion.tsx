import { Button, Card, Flex, RadioGroup, Table, Text } from "@bolid-ui/themes";

export function DuplicateSuspicion() {
  return (
    <Card size="2" variant="classic" aria-labelledby="duplicate-title">
      <Flex align="center" justify="between" gap="2">
        <Text id="duplicate-title" size="2" weight="bold">
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

      <div className="overflow-x-auto">
        <Table.Root
          size="1"
          variant="surface"
          layout="fixed"
          mt="2"
          className="min-w-[680px]"
        >
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell width="210px">
                Адрес
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                Описание со слов заявителя
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell width="130px">
                Тип происшествия
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell width="110px">
                Дата
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row className="bg-green-2" align="center">
              <Table.Cell>
                Московская область, ул. Караидельская, д. 54/1, п. 5, эт. 3333,
                кв. 144, домофон 12342
              </Table.Cell>
              <Table.Cell>Стреляют в воздух</Table.Cell>
              <Table.Cell>Стрельба</Table.Cell>
              <Table.Cell>
                <Flex align="center" justify="between" gap="2">
                  <span className="tabular-nums">22-03-2024 11:48</span>
                  <span className="bg-green-9 size-3 shrink-0 rounded-full" />
                </Flex>
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </div>
    </Card>
  );
}
