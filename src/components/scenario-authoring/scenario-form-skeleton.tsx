import { Card, Grid, Skeleton } from "@bolid-ui/themes";

/**
 * Сколько полей и в сколько колонок у каждого раздела формы.
 *
 * Повторяет настоящие сетки: когда черновик приходит, карточки остаются на
 * своих местах, и страница не прыгает.
 */
const SECTIONS: readonly { fields: number; columns: "2" | "4" }[] = [
  { fields: 4, columns: "2" },
  { fields: 8, columns: "2" },
  { fields: 8, columns: "4" },
  { fields: 12, columns: "4" },
  { fields: 8, columns: "4" },
];

/** Форма конструктора, пока помощник собирает черновик. */
export function ScenarioFormSkeleton() {
  return (
    <Grid gap="4" aria-busy="true" aria-label="Помощник заполняет черновик">
      {SECTIONS.map((section, index) => (
        <Card key={index} size="3" variant="classic">
          <Grid gap="2" mb="4">
            <Skeleton width="180px" height="20px" />
            <Skeleton width="min(420px, 70%)" height="16px" />
          </Grid>
          <Grid
            gap="3"
            columns={{ initial: "1", md: "2", lg: section.columns }}
          >
            {Array.from({ length: section.fields }, (_, field) => (
              <Grid key={field} gap="1">
                <Skeleton width="45%" height="16px" />
                <Skeleton width="100%" height="var(--space-6)" />
              </Grid>
            ))}
          </Grid>
        </Card>
      ))}
    </Grid>
  );
}
