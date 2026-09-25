import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import { classifierService } from "../services/classifier.service";

export function useClassifierVersions() {
  return useQuery({
    queryKey: QUERY_KEYS.classifierVersions(),
    queryFn: classifierService.listVersions,
  });
}

export function useActiveClassifierTree() {
  return useQuery({
    queryKey: QUERY_KEYS.activeClassifierTree(),
    queryFn: classifierService.loadActiveTree,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useClassifierRoute(
  entryId: string | null,
  qualifierCodes: readonly string[],
) {
  const sortedCodes = [...qualifierCodes].sort();

  return useQuery({
    queryKey: QUERY_KEYS.classifierRoute(entryId ?? undefined, sortedCodes),
    queryFn: ({ signal }) =>
      classifierService.route({
        entryId: entryId as string,
        qualifierCodes: sortedCodes,
        signal,
      }),
    enabled: entryId !== null,
    staleTime: 30_000,
  });
}

export function useClassifierManagement() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.classifierVersions(),
      }),
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.activeClassifierTree(),
      }),
    ]);

  return {
    importVersion: useMutation({
      mutationFn: classifierService.importVersion,
      onSuccess: invalidate,
    }),
    activateVersion: useMutation({
      mutationFn: classifierService.activateVersion,
      onSuccess: invalidate,
    }),
  };
}
