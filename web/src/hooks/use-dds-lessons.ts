import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type { CreateDdsLesson } from "../contracts/dds-lesson";
import { ddsLessonService } from "../services/dds-lesson.service";

export function useInstructorDdsLessons() {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: QUERY_KEYS.ddsLessons() }),
      client.invalidateQueries({ queryKey: QUERY_KEYS.ddsLiveAttempts() }),
    ]);
  const lessons = useQuery({
    queryKey: QUERY_KEYS.ddsLessons(),
    queryFn: ddsLessonService.list,
    refetchInterval: 3_000,
  });
  const create = useMutation({
    mutationFn: (input: Omit<CreateDdsLesson, "eventId">) =>
      ddsLessonService.create({ ...input, eventId: crypto.randomUUID() }),
    onSuccess: refresh,
  });
  const finish = useMutation({
    mutationFn: (lessonId: string) =>
      ddsLessonService.finish(lessonId, crypto.randomUUID()),
    onSuccess: refresh,
  });
  return { lessons, create, finish };
}

export function useActiveDdsLessons() {
  const client = useQueryClient();
  const lessons = useQuery({
    queryKey: QUERY_KEYS.activeDdsLessons(),
    queryFn: ddsLessonService.myActive,
    refetchInterval: 5_000,
  });
  const next = useMutation({
    mutationFn: (lessonId: string) =>
      ddsLessonService.next(lessonId, crypto.randomUUID()),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["dds-exercises"] });
    },
  });
  return { lessons, next };
}
