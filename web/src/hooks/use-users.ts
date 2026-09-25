import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS, QUERY_KEY_PREFIXES } from "../config/query-keys";
import type {
  CreateUser,
  UpdateUser,
  UserListFilters,
} from "../contracts/users";
import { usersService } from "../services/users.service";

export const useAdminUsers = (filters: UserListFilters = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.users(filters),
    queryFn: () => usersService.list(filters),
  });

/** Изменения учётных записей перечитывают и связанные учебные списки. */
export function useUserMutations() {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all(
      [
        QUERY_KEY_PREFIXES.users,
        QUERY_KEYS.students(),
        QUERY_KEYS.trainingOperators(),
        QUERY_KEYS.trainingGroups(),
      ].map((queryKey) => client.invalidateQueries({ queryKey })),
    );

  return {
    create: useMutation({
      mutationFn: (input: CreateUser) => usersService.create(input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ userId, input }: { userId: string; input: UpdateUser }) =>
        usersService.update(userId, input),
      onSuccess: refresh,
    }),
  };
}

export type UserMutations = ReturnType<typeof useUserMutations>;
