import type {
  InstructorReportAttempt,
  InstructorReportStats,
  InstructorReportStudent,
} from "../dto/instructor-report.dto";

const average = (values: readonly number[]): number | null =>
  values.length === 0
    ? null
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

export const summarizeReportAttempts = (
  attempts: readonly InstructorReportAttempt[],
): InstructorReportStats => {
  const scores = attempts.flatMap(({ score }) =>
    score === null ? [] : [score],
  );
  const answerSeconds = attempts.flatMap(({ answerSeconds: value }) =>
    value === null ? [] : [value],
  );
  const durationSeconds = attempts.flatMap(({ durationSeconds: value }) =>
    value === null ? [] : [value],
  );
  const passedAttempts = attempts.filter(
    ({ passed }) => passed === true,
  ).length;

  return {
    attempts: attempts.length,
    completedAttempts: attempts.filter(({ status }) => status === "completed")
      .length,
    evaluatedAttempts: scores.length,
    passedAttempts,
    passRate:
      scores.length === 0
        ? null
        : Math.round((passedAttempts / scores.length) * 100),
    averageScore: average(scores),
    bestScore: scores.length === 0 ? null : Math.max(...scores),
    averageAnswerSeconds: average(answerSeconds),
    averageDurationSeconds: average(durationSeconds),
    lastAttemptAt: attempts.reduce<string | null>(
      (latest, { offeredAt }) =>
        latest === null || offeredAt > latest ? offeredAt : latest,
      null,
    ),
  };
};

export interface ReportStudentIdentity {
  id: string;
  fullName: string;
  email: string | null;
  serviceTags: readonly string[];
}

export const summarizeReportStudents = (
  students: readonly ReportStudentIdentity[],
  attempts: readonly InstructorReportAttempt[],
): InstructorReportStudent[] => {
  const attemptsByStudent = new Map<string, InstructorReportAttempt[]>();
  for (const attempt of attempts) {
    const rows = attemptsByStudent.get(attempt.operatorId) ?? [];
    rows.push(attempt);
    attemptsByStudent.set(attempt.operatorId, rows);
  }

  const identities = new Map(students.map((student) => [student.id, student]));
  for (const attempt of attempts) {
    if (!identities.has(attempt.operatorId)) {
      identities.set(attempt.operatorId, {
        id: attempt.operatorId,
        fullName: attempt.operatorName,
        email: null,
        serviceTags: [],
      });
    }
  }

  return [...identities.values()]
    .map((student) => ({
      operatorId: student.id,
      operatorName: student.fullName,
      email: student.email,
      serviceTags: [...new Set(student.serviceTags)].sort(),
      stats: summarizeReportAttempts(attemptsByStudent.get(student.id) ?? []),
    }))
    .sort((left, right) =>
      left.operatorName.localeCompare(right.operatorName, "ru"),
    );
};
