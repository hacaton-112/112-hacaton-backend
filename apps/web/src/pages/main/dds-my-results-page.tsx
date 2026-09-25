import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Skeleton,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { useNavigate, useParams } from "react-router";

import { DdsReportCardDetails } from "../../components/dds/dds-report-card-details";
import { ROUTES } from "../../config/routes";
import { useMyDdsResult, useMyDdsResults } from "../../hooks/use-dds-report";

export default function DdsMyResultsPage() {
  const { exerciseId } = useParams();
  return exerciseId ? (
    <ResultDetails exerciseId={exerciseId} />
  ) : (
    <ResultsList />
  );
}

function ResultsList() {
  const query = useMyDdsResults();
  const navigate = useNavigate();
  if (query.isPending)
    return (
      <main className="grid gap-3 p-4 md:p-6">
        <Skeleton height="56px" />
        <Skeleton height="300px" />
      </main>
    );
  if (query.error) return <ErrorMessage message={query.error.message} />;
  return (
    <main className="grid gap-4 overflow-auto p-4 md:p-6">
      <div>
        <Heading size="6">Мои результаты ДДС</Heading>
        <Text color="gray">Завершённые и текущие попытки по занятиям</Text>
      </div>
      {query.data?.lessons.length === 0 && (
        <Card>
          <Text color="gray">Результатов пока нет</Text>
        </Card>
      )}
      {query.data?.lessons.map((lesson) => (
        <Card key={lesson.lessonId} size="3" className="grid gap-3">
          <Flex justify="between" gap="3" wrap="wrap">
            <div>
              <Heading size="4">{lesson.title}</Heading>
              <Text size="2" color="gray">
                {new Date(lesson.startedAt).toLocaleString("ru-RU")} ·{" "}
                {lesson.cards} карточек
              </Text>
            </div>
            <Badge>
              {lesson.averageScore === null
                ? "Без оценки"
                : `Средний балл ${lesson.averageScore}`}
            </Badge>
          </Flex>
          <div className="grid gap-2">
            {lesson.attempts.map((attempt) => (
              <Flex
                key={attempt.exerciseId}
                justify="between"
                align="center"
                gap="3"
                wrap="wrap"
              >
                <Text size="2">
                  {attempt.scenarioTitle} · {attempt.finalScore ?? "—"}
                </Text>
                <Button
                  size="1"
                  variant="soft"
                  onClick={() => navigate(ROUTES.ddsResult(attempt.exerciseId))}
                >
                  Подробнее <ArrowRight size={14} />
                </Button>
              </Flex>
            ))}
          </div>
        </Card>
      ))}
    </main>
  );
}

function ResultDetails({ exerciseId }: { exerciseId: string }) {
  const query = useMyDdsResult(exerciseId);
  const navigate = useNavigate();
  if (query.isPending)
    return (
      <main className="grid gap-3 p-4 md:p-6">
        <Skeleton height="56px" />
        <Skeleton height="400px" />
      </main>
    );
  if (query.error || !query.data)
    return (
      <ErrorMessage message={query.error?.message ?? "Результат не найден"} />
    );
  return (
    <main className="grid gap-4 overflow-auto p-4 md:p-6">
      <div>
        <Button variant="ghost" onClick={() => navigate(ROUTES.ddsResults())}>
          <ArrowLeft size={15} />К списку
        </Button>
        <Heading size="6" mt="2">
          {query.data.lesson.title}
        </Heading>
        <Text color="gray">Результат отдельной попытки</Text>
      </div>
      <DdsReportCardDetails card={query.data.card} />
    </main>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <main className="p-4 md:p-6">
      <Callout.Root color="red">
        <Callout.Icon>
          <AlertTriangle />
        </Callout.Icon>
        <Callout.Text>{message}</Callout.Text>
      </Callout.Root>
    </main>
  );
}
