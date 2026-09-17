import { Badge, Flex, Grid, Text } from "@bolid-ui/themes";

import type {
  GrammarFieldReport,
  GrammarReport,
} from "../../contracts/grammar";

import { DebriefSection } from "./debrief-primitives";

/**
 * Замечания к тексту карточки.
 *
 * Отчёт о занятии включает грамотность, но на балл она не влияет, поэтому
 * раздел стоит рядом с карточкой, а не среди оценок. Пустой раздел не
 * прячется: «замечаний нет» — это результат проверки, а не её отсутствие.
 */
export function GrammarSection({ grammar }: { grammar: GrammarReport }) {
  const checked = grammar.fields.length;

  return (
    <DebriefSection title="Грамотность записей">
      <Grid gap="3">
        <Flex align="center" gap="2" wrap="wrap">
          {grammar.errorCount > 0 && (
            <Badge color="red" variant="soft">
              ошибок: {grammar.errorCount}
            </Badge>
          )}
          {grammar.styleCount > 0 && (
            <Badge color="amber" variant="soft">
              замечаний к оформлению: {grammar.styleCount}
            </Badge>
          )}
          {grammar.errorCount === 0 && grammar.styleCount === 0 && (
            <Badge color="green" variant="soft">
              {checked === 0 ? "текста в карточке нет" : "замечаний нет"}
            </Badge>
          )}
          {grammar.reviewedByModel && (
            <Text size="1" color="gray">
              текст дополнительно прочитала модель
            </Text>
          )}
        </Flex>

        {grammar.fields
          .filter((field) => field.issues.length > 0)
          .map((field) => (
            <GrammarField key={field.id} field={field} />
          ))}
      </Grid>
    </DebriefSection>
  );
}

function GrammarField({ field }: { field: GrammarFieldReport }) {
  return (
    <Grid gap="1">
      <Text size="1" color="gray">
        {field.label}
      </Text>
      {field.issues.map((issue, index) => (
        <Flex
          key={`${issue.kind}-${issue.offset}-${index}`}
          align="start"
          gap="2"
        >
          <Badge
            color={issue.severity === "error" ? "red" : "amber"}
            variant="soft"
            radius="full"
            className="mt-[2px] shrink-0"
          >
            {issue.severity === "error" ? "ошибка" : "оформление"}
          </Badge>
          <Grid gap="1" flexGrow="1" className="min-w-0">
            <Text size="2">
              «{issue.fragment}»
              {issue.suggestion !== null && ` → «${issue.suggestion}»`}
            </Text>
            <Text size="1" color="gray">
              {issue.message}
            </Text>
          </Grid>
        </Flex>
      ))}
    </Grid>
  );
}
