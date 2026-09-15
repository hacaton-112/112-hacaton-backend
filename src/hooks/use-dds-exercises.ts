import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DdsResponseStatus } from "../contracts/dds-exercise";
import { ddsExerciseService } from "../services/dds-exercise.service";

const queryKey = ["dds-exercises"] as const;

export function useDdsExercises() {
  const queryClient = useQueryClient();
  const exercises = useQuery({
    queryKey,
    queryFn: ddsExerciseService.list,
    refetchInterval: (query) =>
      query.state.data?.some(
        (exercise) =>
          exercise.status !== "completed" && exercise.status !== "refused",
      )
        ? 2_000
        : false,
  });
  const start = useMutation({
    mutationFn: ddsExerciseService.start,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const transition = useMutation({
    mutationFn: (input: {
      exerciseId: string;
      status: Exclude<DdsResponseStatus, "pending">;
      comment?: string;
    }) =>
      ddsExerciseService.transition(
        input.exerciseId,
        input.status,
        input.comment,
      ),
    scope: { id: "dds-status-transition" },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  return { exercises, start, transition };
}
