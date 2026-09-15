import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type {
  AddTrainingGroupMember,
  UpdateTrainingAssignment,
  UpdateTrainingGroup,
} from "../contracts/training";
import type { UserRole } from "../contracts/auth";
import type { CreateUser, UpdateUser } from "../contracts/users";
import { trainingService } from "../services/training.service";
import { usersService } from "../services/users.service";

const LIVE_SESSIONS_REFRESH_MS = 2_000;

export const useMyAssignments = (enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.myAssignments(),
    queryFn: trainingService.listMyAssignments,
    enabled,
  });

export const useTrainingGroups = () =>
  useQuery({
    queryKey: QUERY_KEYS.trainingGroups(),
    queryFn: trainingService.listGroups,
  });

export const useTrainingGroup = (groupId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.trainingGroup(groupId),
    queryFn: () => trainingService.getGroup(groupId),
  });

export const useGroupStudents = (groupId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.groupStudents(groupId),
    queryFn: () => trainingService.listGroupStudents(groupId),
  });

export const useStudents = () =>
  useQuery({
    queryKey: QUERY_KEYS.students(),
    queryFn: trainingService.listStudents,
  });

export const useStudentProfile = (userId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.studentProfile(userId),
    queryFn: () => trainingService.getStudentProfile(userId),
  });

export const useTrainingOperators = () =>
  useQuery({
    queryKey: QUERY_KEYS.trainingOperators(),
    queryFn: trainingService.listOperators,
  });

/** Учётные записи нужной роли; список доступен только администратору. */
export const useUsers = (role: UserRole, enabled: boolean) =>
  useQuery({
    queryKey: QUERY_KEYS.users(role),
    queryFn: () => usersService.list(role),
    enabled,
  });

export const useTrainingAssignments = () =>
  useQuery({
    queryKey: QUERY_KEYS.trainingAssignments(),
    queryFn: trainingService.listAssignments,
  });

export const useLiveTrainingSessions = (groupId?: string) =>
  useQuery({
    queryKey: QUERY_KEYS.liveTrainingSessions(groupId),
    queryFn: () => trainingService.listLiveSessions(groupId),
    refetchInterval: LIVE_SESSIONS_REFRESH_MS,
  });

export const useInstructorCalls = () =>
  useQuery({
    queryKey: QUERY_KEYS.instructorCalls(),
    queryFn: trainingService.listInstructorCalls,
  });

/** Все изменения учебного центра: после каждого списки перечитываются. */
export function useTrainingMutations() {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all(
      [
        // Префикс сбрасывает и список групп, и карточку, и учеников группы.
        QUERY_KEYS.trainingGroups(),
        QUERY_KEYS.trainingOperators(),
        QUERY_KEYS.trainingAssignments(),
        QUERY_KEYS.myAssignments(),
        QUERY_KEYS.scenarios(),
        ["live-training-sessions"],
        QUERY_KEYS.instructorCalls(),
        ["student-profile"],
        QUERY_KEYS.students(),
        ["users"],
      ].map((queryKey) => client.invalidateQueries({ queryKey })),
    );

  return {
    createGroup: useMutation({
      mutationFn: trainingService.createGroup,
      onSuccess: refresh,
    }),
    updateGroup: useMutation({
      mutationFn: ({
        groupId,
        ...input
      }: UpdateTrainingGroup & { groupId: string }) =>
        trainingService.updateGroup(groupId, input),
      onSuccess: refresh,
    }),
    deleteGroup: useMutation({
      mutationFn: trainingService.deleteGroup,
      onSuccess: refresh,
    }),
    addMember: useMutation({
      mutationFn: ({
        groupId,
        ...input
      }: AddTrainingGroupMember & { groupId: string }) =>
        trainingService.addMember(groupId, input),
      onSuccess: refresh,
    }),
    /**
     * Ученик целиком: учётная запись меняется у администратора, служба в
     * группе — у преподавателя. Запрос уходит, только если поле изменилось.
     */
    updateStudent: useMutation({
      mutationFn: async ({
        userId,
        account,
        membership,
      }: {
        userId: string;
        account: UpdateUser | null;
        membership: { groupId: string; serviceTag: string } | null;
      }) => {
        if (account) await usersService.update(userId, account);
        if (membership) {
          await trainingService.updateMember(membership.groupId, userId, {
            serviceTag: membership.serviceTag,
          });
        }
      },
      onSettled: refresh,
    }),
    removeMember: useMutation({
      mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
        trainingService.removeMember(groupId, userId),
      onSuccess: refresh,
    }),
    /**
     * Ученика создаёт администратор и сразу, если выбрана группа, включает в
     * неё: без группы новая учётная запись не видна ни одному преподавателю.
     */
    createStudent: useMutation({
      mutationFn: async ({
        membership,
        ...input
      }: Omit<CreateUser, "role"> & {
        membership: { groupId: string; serviceTag: string } | null;
      }) => {
        const user = await usersService.create({ ...input, role: "operator" });
        if (membership) {
          await trainingService.addMember(membership.groupId, {
            userId: user.id,
            serviceTag: membership.serviceTag,
          });
        }
        return user;
      },
      onSettled: refresh,
    }),
    createAssignment: useMutation({
      mutationFn: trainingService.createAssignment,
      onSuccess: refresh,
    }),
    updateAssignment: useMutation({
      mutationFn: ({
        assignmentId,
        ...input
      }: UpdateTrainingAssignment & { assignmentId: string }) =>
        trainingService.updateAssignment(assignmentId, input),
      onSuccess: refresh,
    }),
    deleteAssignment: useMutation({
      mutationFn: trainingService.deleteAssignment,
      onSuccess: refresh,
    }),
    launchAssignment: useMutation({
      mutationFn: trainingService.launchAssignment,
      onSuccess: refresh,
    }),
    completeAssignment: useMutation({
      mutationFn: trainingService.completeAssignment,
      onSuccess: refresh,
    }),
    archiveAssignment: useMutation({
      mutationFn: trainingService.archiveAssignment,
      onSuccess: refresh,
    }),
    endSession: useMutation({
      mutationFn: ({
        trainingSessionId,
        reason,
      }: {
        trainingSessionId: string;
        reason: string;
      }) => trainingService.endSession(trainingSessionId, reason),
      onSuccess: refresh,
    }),
  };
}

export type TrainingMutations = ReturnType<typeof useTrainingMutations>;
