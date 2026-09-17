import {
  Badge,
  Button,
  Card,
  Dialog,
  Flex,
  Heading,
  Text,
} from "@bolid-ui/themes";
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Users,
} from "lucide-react";
import { useState } from "react";

import type { GroupStudent, TrainingAssignment, TrainingGroup } from "../../contracts/training";
import { downloadFile, generateGroupProtocolCsv } from "../../lib/group-protocol-export";
import { formatDateTime, formatDuration, formatScore } from "./training-labels";

interface GroupAnalyticsTabProps {
  group: TrainingGroup;
  students: GroupStudent[];
  assignments: TrainingAssignment[];
  instructorName?: string;
}

export function GroupAnalyticsTab({
  group,
  students,
  assignments,
  instructorName,
}: GroupAnalyticsTabProps) {
  const [protocolOpen, setProtocolOpen] = useState(false);

  // Расчет общих показателей
  const totalStudents = students.length;
  const totalAttempts = students.reduce((sum, s) => sum + s.stats.attempts, 0);
  const totalEvaluated = students.reduce((sum, s) => sum + s.stats.evaluatedCalls, 0);
  const totalPassed = students.reduce((sum, s) => sum + s.stats.passedCalls, 0);
  const passPercent = totalEvaluated > 0 ? Math.round((totalPassed / totalEvaluated) * 100) : 0;

  const validScores = students
    .map((s) => s.stats.averageScore)
    .filter((s): s is number => s !== null);
  const avgScore = validScores.length > 0
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : null;

  const validAnswers = students
    .map((s) => s.stats.averageAnswerSeconds)
    .filter((s): s is number => s !== null);
  const avgAnswerTime = validAnswers.length > 0
    ? Math.round(validAnswers.reduce((a, b) => a + b, 0) / validAnswers.length)
    : null;

  // Категории успеваемости
  const excellent = students.filter((s) => (s.stats.averageScore ?? 0) >= 90);
  const good = students.filter((s) => (s.stats.averageScore ?? 0) >= 75 && (s.stats.averageScore ?? 0) < 90);
  const needWork = students.filter((s) => s.stats.averageScore !== null && (s.stats.averageScore ?? 0) < 75);
  const noAttempts = students.filter((s) => s.stats.averageScore === null);

  const handleExportCsv = () => {
    const csv = generateGroupProtocolCsv({
      group,
      students,
      assignments,
      instructorName,
    });
    const filename = `Протокол_группы_${group.code}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(csv, filename);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Верхняя панель действий */}
      <Flex justify="between" align="center" wrap="wrap" gap="3">
        <div>
          <Heading size="4">Сводная аналитика успеваемости</Heading>
          <Text size="2" color="gray">
            Данные по всем проведённым тренировочным звонкам и нормативам группы.
          </Text>
        </div>
        <Flex gap="2">
          <Button variant="soft" onClick={() => setProtocolOpen(true)}>
            <FileText size={16} /> Протокол занятия
          </Button>
          <Button variant="solid" onClick={handleExportCsv}>
            <Download size={16} /> Экспорт в Excel / CSV
          </Button>
        </Flex>
      </Flex>

      {/* KPI плитки */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card size="2">
          <Flex align="center" gap="2" mb="1">
            <Users size={16} className="text-(--accent-9)" />
            <Text size="1" color="gray">Курсантов в группе</Text>
          </Flex>
          <Text size="6" weight="bold">{totalStudents}</Text>
          <Text size="1" color="gray" mt="1">Активных участников</Text>
        </Card>

        <Card size="2">
          <Flex align="center" gap="2" mb="1">
            <BarChart3 size={16} className="text-(--accent-9)" />
            <Text size="1" color="gray">Всего попыток</Text>
          </Flex>
          <Text size="6" weight="bold">{totalAttempts}</Text>
          <Text size="1" color="gray" mt="1">{totalEvaluated} звонков оценено</Text>
        </Card>

        <Card size="2">
          <Flex align="center" gap="2" mb="1">
            <CheckCircle2 size={16} className={passPercent >= 75 ? "text-(--green-9)" : "text-(--amber-9)"} />
            <Text size="1" color="gray">Успешная сдача</Text>
          </Flex>
          <Text size="6" weight="bold" color={passPercent >= 75 ? "green" : undefined}>
            {passPercent}%
          </Text>
          <Text size="1" color="gray" mt="1">{totalPassed} выше порога</Text>
        </Card>

        <Card size="2">
          <Flex align="center" gap="2" mb="1">
            <Award size={16} className="text-(--accent-9)" />
            <Text size="1" color="gray">Средний балл</Text>
          </Flex>
          <Text size="6" weight="bold">{formatScore(avgScore)}</Text>
          <Text size="1" color="gray" mt="1">Порог нормы: 75 баллов</Text>
        </Card>

        <Card size="2">
          <Flex align="center" gap="2" mb="1">
            <Clock size={16} className="text-(--accent-9)" />
            <Text size="1" color="gray">Время ответа, сред.</Text>
          </Flex>
          <Text size="6" weight="bold">
            {avgAnswerTime !== null ? formatDuration(avgAnswerTime) : "—"}
          </Text>
          <Text size="1" color="gray" mt="1">Скорость снятия трубки</Text>
        </Card>
      </div>

      {/* График / Распределение оценок */}
      <Card size="3">
        <Heading size="3" mb="3">Распределение успеваемости курсантов</Heading>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-(--radius-3) border border-(--green-a6) bg-(--green-a2) p-3">
            <Flex justify="between" align="center">
              <Text size="2" weight="bold" color="green">Отлично (≥ 90 б.)</Text>
              <Badge color="green">{excellent.length}</Badge>
            </Flex>
            <Text size="1" color="gray" mt="2">
              {totalStudents > 0 ? Math.round((excellent.length / totalStudents) * 100) : 0}% состава группы
            </Text>
          </div>

          <div className="rounded-(--radius-3) border border-(--blue-a6) bg-(--blue-a2) p-3">
            <Flex justify="between" align="center">
              <Text size="2" weight="bold" color="blue">Хорошо (75–89 б.)</Text>
              <Badge color="blue">{good.length}</Badge>
            </Flex>
            <Text size="1" color="gray" mt="2">
              {totalStudents > 0 ? Math.round((good.length / totalStudents) * 100) : 0}% состава группы
            </Text>
          </div>

          <div className="rounded-(--radius-3) border border-(--red-a6) bg-(--red-a2) p-3">
            <Flex justify="between" align="center">
              <Text size="2" weight="bold" color="red">Требует повтора (&lt; 75 б.)</Text>
              <Badge color="red">{needWork.length}</Badge>
            </Flex>
            <Text size="1" color="gray" mt="2">
              {totalStudents > 0 ? Math.round((needWork.length / totalStudents) * 100) : 0}% состава группы
            </Text>
          </div>

          <div className="rounded-(--radius-3) border border-(--gray-a6) bg-(--gray-a2) p-3">
            <Flex justify="between" align="center">
              <Text size="2" weight="bold" color="gray">Не приступали</Text>
              <Badge color="gray">{noAttempts.length}</Badge>
            </Flex>
            <Text size="1" color="gray" mt="2">
              {totalStudents > 0 ? Math.round((noAttempts.length / totalStudents) * 100) : 0}% состава группы
            </Text>
          </div>
        </div>
      </Card>

      {/* Диалог официального протокола занятия */}
      <Dialog.Root open={protocolOpen} onOpenChange={setProtocolOpen}>
        <Dialog.Content maxWidth="800px">
          <Dialog.Title>
            <Flex justify="between" align="center">
              <span>Протокол учебного занятия</span>
              <Flex gap="2">
                <Button size="1" variant="soft" onClick={handlePrint}>
                  <Printer size={14} /> Печать / PDF
                </Button>
                <Button size="1" variant="solid" onClick={handleExportCsv}>
                  <FileSpreadsheet size={14} /> Скачать Excel
                </Button>
              </Flex>
            </Flex>
          </Dialog.Title>

          <Dialog.Description size="1" color="gray" mb="3">
            Официальная форма ведомости по методике проведения практических занятий Системы-112.
          </Dialog.Description>

          <div className="mt-4 flex flex-col gap-4 text-sm print:m-0 print:p-0">
            {/* Паспортная часть */}
            <div className="rounded-(--radius-2) border p-3 bg-(--gray-a2)">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div><strong>Группа:</strong> {group.name} ({group.code})</div>
                <div><strong>Организация:</strong> {group.organization}</div>
                <div><strong>Преподаватель:</strong> {instructorName ?? "—"}</div>
                <div><strong>Дата формирования:</strong> {formatDateTime(new Date().toISOString())}</div>
                <div><strong>Всего обучающихся:</strong> {students.length} чел.</div>
                <div><strong>Сдано выше порога:</strong> {totalPassed} из {totalEvaluated} ({passPercent}%)</div>
                <div><strong>Средний балл группы:</strong> {formatScore(avgScore)}</div>
                <div><strong>Среднее время ответа:</strong> {avgAnswerTime !== null ? formatDuration(avgAnswerTime) : "—"}</div>
                <div><strong>Статус группы:</strong> {group.status === "active" ? "Активна" : "В архиве"}</div>
              </div>
            </div>

            {/* Назначенные занятия и нормативы */}
            {assignments.length > 0 && (
              <div>
                <Text size="2" weight="bold" mb="2" as="p">Назначенные практические занятия</Text>
                <div className="overflow-x-auto rounded-(--radius-2) border">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b bg-(--gray-a3)">
                        <th className="p-2">Занятие</th>
                        <th className="p-2">Сценарий</th>
                        <th className="p-2 text-center">Сложность</th>
                        <th className="p-2 text-center">Норматив</th>
                        <th className="p-2 text-center">Порог</th>
                        <th className="p-2 text-center">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => (
                        <tr key={a.id} className="border-b">
                          <td className="p-2 font-medium">{a.title}</td>
                          <td className="p-2">{a.scenarioCode} · {a.scenarioTitle}</td>
                          <td className="p-2 text-center">{a.difficulty} из 5</td>
                          <td className="p-2 text-center">{formatDuration(a.answerNormSeconds)}</td>
                          <td className="p-2 text-center">{a.passThreshold} б.</td>
                          <td className="p-2 text-center">
                            <Badge size="1" variant="soft">
                              {a.status === "in_progress" ? "Запущено" : a.status === "completed" ? "Завершено" : a.status === "draft" ? "Черновик" : "В архиве"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Таблица обучающихся */}
            <div>
              <Text size="2" weight="bold" mb="2" as="p">Сводная ведомость успеваемости обучающихся</Text>
              <div className="overflow-x-auto rounded-(--radius-2) border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b bg-(--gray-a3)">
                      <th className="p-2">№</th>
                      <th className="p-2">ФИО обучающегося</th>
                      <th className="p-2">Служба</th>
                      <th className="p-2 text-center">Попыток</th>
                      <th className="p-2 text-center">Сдано</th>
                      <th className="p-2 text-center">Ср. балл</th>
                      <th className="p-2 text-center">Лучший</th>
                      <th className="p-2 text-center">Ср. время</th>
                      <th className="p-2 text-center">Решение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student, idx) => {
                      const score = student.stats.averageScore;
                      const passed = score !== null && score >= 75;
                      return (
                        <tr key={student.userId} className="border-b">
                          <td className="p-2">{idx + 1}</td>
                          <td className="p-2 font-medium">{student.fullName}</td>
                          <td className="p-2">{student.serviceTag}</td>
                          <td className="p-2 text-center">{student.stats.attempts}</td>
                          <td className="p-2 text-center">{student.stats.passedCalls}</td>
                          <td className="p-2 text-center font-bold">{formatScore(score)}</td>
                          <td className="p-2 text-center">{formatScore(student.stats.bestScore)}</td>
                          <td className="p-2 text-center">
                            {student.stats.averageAnswerSeconds !== null
                              ? formatDuration(student.stats.averageAnswerSeconds)
                              : "—"}
                          </td>
                          <td className="p-2 text-center">
                            {score === null ? (
                              <span className="text-gray-500">Не приступал</span>
                            ) : passed ? (
                              <span className="text-green-600 font-semibold">Зачтено</span>
                            ) : (
                              <span className="text-red-600 font-semibold">Повтор</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Подписи и заключение */}
            <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-semibold mb-1">Решение преподавателя по группе:</p>
                <p className="text-gray-600">
                  [ ] Занятие зачтено &nbsp;&nbsp;&nbsp; [ ] Требуется повторное занятие &nbsp;&nbsp;&nbsp; [ ] Назначить доп. подготовку
                </p>
                <p className="mt-3">Преподаватель: ___________________ / {instructorName ?? "___________________"} /</p>
              </div>
              <div className="text-right flex flex-col justify-between">
                <div>
                  <p className="font-semibold mb-1">Печать учебного центра</p>
                  <p className="text-gray-400">М.П.</p>
                </div>
                <p>Дата: «___» ____________ 2026 г.</p>
              </div>
            </div>
          </div>

          <Flex justify="end" gap="2" mt="4">
            <Dialog.Close>
              <Button variant="soft" color="gray">Закрыть</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
