import { Box, Card, Flex, Heading, ScrollArea, Text } from "@bolid-ui/themes";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

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

/**
 * Блок разбора: заголовок и содержимое.
 *
 * В макете карточка колонки одна, а внутри неё несколько блоков, разделённых
 * линиями. Поэтому собственной рамки у блока нет — её рисует {@link DebriefPanel}.
 */
export function DebriefSection({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  /** Управление справа от заголовка: переключатель, кнопка. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Box asChild className={cn("p-5", className)}>
      <section>
        {(title !== undefined || action !== undefined) && (
          <Flex align="center" justify="between" gap="3" mb="4">
            {title !== undefined && (
              <Heading as="h2" size="3" weight="bold" trim="both">
                {title}
              </Heading>
            )}
            {action}
          </Flex>
        )}
        {children}
      </section>
    </Box>
  );
}

/**
 * Колонка макета: карточка без собственных отступов — отступы задают блоки
 * внутри, иначе линии-разделители не дотягиваются до краёв.
 *
 * Высоту карточке задаёт раскладка страницы; всё, что в неё не влезло,
 * прокручивается внутри. Когда высота не задана (узкий экран), прокрутка
 * просто не включается: область растёт вместе с содержимым.
 */
export function DebriefPanel({
  children,
  className,
  scroll = true,
}: {
  children: ReactNode;
  className?: string;
  /** `false` — прокрутку внутри устраивает само содержимое, как у вкладок. */
  scroll?: boolean;
}) {
  return (
    <Card
      size="2"
      variant="classic"
      className={cn("flex min-h-0 flex-col p-0!", className)}
    >
      {scroll ? <DebriefScroll>{children}</DebriefScroll> : children}
    </Card>
  );
}

/**
 * Вертикальная прокрутка, занимающая остаток колонки.
 *
 * Прямой потомок вьюпорта ScrollArea получает `width: fit-content`, и короткая
 * таблица сжимается до ширины текста — растягиваем его на всю ширину явно.
 */
export function DebriefScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ScrollArea scrollbars="vertical" type="auto" className="min-h-0 flex-1">
      <Box className={cn("w-full!", className)}>{children}</Box>
    </ScrollArea>
  );
}
