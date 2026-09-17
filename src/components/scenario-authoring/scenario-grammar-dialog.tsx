import {
  Badge,
  Button,
  Dialog,
  Flex,
  Grid,
  ScrollArea,
  Text,
} from "@bolid-ui/themes";

import type { GrammarReport } from "../../contracts/grammar";

interface ScenarioGrammarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: GrammarReport | null;
  pending: boolean;
  error?: string;
}

/**
 * Результат принудительной проверки текстов сценария.
 *
 * Замечания показываются списком по полям и ничего не меняют в форме:
 * преподаватель сам решает, что исправлять, — проверка публикации не мешает.
 */
export function ScenarioGrammarDialog({
  open,
  onOpenChange,
  report,
  pending,
  error,
}: ScenarioGrammarDialogProps) {
  const fields =
    report?.fields.filter((field) => field.issues.length > 0) ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="560px">
        <Dialog.Title>Грамотность сценария</Dialog.Title>
        <Dialog.Description size="2" mb="3" color="gray">
          Проверяются тексты, которые вы написали: название, описание, реплики,
          факты, обязательные вопросы и эталонная карточка.
        </Dialog.Description>

        {pending && <Text size="2">Проверяем…</Text>}

        {!pending && error !== undefined && (
          <Text size="2" color="red">
            {error}
          </Text>
        )}

        {!pending && error === undefined && report !== null && (
          <Grid gap="3">
            <Flex align="center" gap="2" wrap="wrap">
              {report.errorCount > 0 && (
                <Badge color="red" variant="soft">
                  ошибок: {report.errorCount}
                </Badge>
              )}
              {report.styleCount > 0 && (
                <Badge color="amber" variant="soft">
                  замечаний к оформлению: {report.styleCount}
                </Badge>
              )}
              {report.errorCount === 0 && report.styleCount === 0 && (
                <Badge color="green" variant="soft">
                  замечаний нет
                </Badge>
              )}
            </Flex>

            {fields.length > 0 && (
              <ScrollArea
                type="auto"
                scrollbars="vertical"
                className="max-h-[50vh]"
              >
                <Grid gap="3" pr="3">
                  {fields.map((field) => (
                    <Grid key={field.id} gap="1">
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
                            {issue.severity === "error"
                              ? "ошибка"
                              : "оформление"}
                          </Badge>
                          <Grid gap="1" flexGrow="1" className="min-w-0">
                            <Text size="2">
                              «{issue.fragment}»
                              {issue.suggestion !== null &&
                                ` → «${issue.suggestion}»`}
                            </Text>
                            <Text size="1" color="gray">
                              {issue.message}
                            </Text>
                          </Grid>
                        </Flex>
                      ))}
                    </Grid>
                  ))}
                </Grid>
              </ScrollArea>
            )}
          </Grid>
        )}

        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Закрыть
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
