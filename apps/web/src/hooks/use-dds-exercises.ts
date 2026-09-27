import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type { DdsResponseStatus } from "../contracts/dds-exercise";
import { ddsExerciseService } from "../services/dds-exercise.service";

const queryKey = ["dds-exercises"] as const;

export function useDdsExercises() {
  const queryClient = useQueryClient();
  const exercises = useQuery({
    queryKey,
    queryFn: ddsExerciseService.list,
    // Смена должна увидеть первую входящую карточку даже при пустой очереди.
    refetchInterval: 3_000,
    // Свёрнутое рабочее место опрашивать незачем: диспетчер его не видит,
    // а запросы продолжали идти часами и нагружали учебный сервер.
    refetchIntervalInBackground: false,
  });
  const transition = useMutation({
    mutationFn: (input: {
      exerciseId: string;
      status: Exclude<DdsResponseStatus, "pending" | "lesson_finished">;
      comment?: string;
    }) =>
      ddsExerciseService.transition(
        input.exerciseId,
        input.status,
        input.comment,
      ),
    scope: { id: "dds-status-transition" },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        // «Выполнено» и «Отказ» закрывают попытку на backend. Даже если
        // оператор сразу вернулся к назначениям, там не должна оставаться
        // устаревшая плашка «Выполняется».
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.myAssignments(),
        }),
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.myDdsResults(),
        }),
      ]);
    },
  });

  return { exercises, transition };
}
