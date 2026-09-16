import { API_CONFIG } from "../config/api";
import {
  GroupStudentListSchema,
  InstructorCallListSchema,
  LiveTrainingSessionListSchema,
  OperatorOptionListSchema,
  StudentListSchema,
  StudentProfileSchema,
  TrainingAssignmentListSchema,
  TrainingAssignmentSchema,
  TrainingGroupListSchema,
  TrainingGroupSchema,
  type AddTrainingGroupMember,
  type CreateTrainingAssignment,
  type CreateTrainingGroup,
  type UpdateTrainingAssignment,
  type UpdateTrainingGroup,
} from "../contracts/training";
import { api } from "../lib/api";

const byGroup = (groupId?: string) =>
  groupId ? { params: { groupId } } : undefined;

export const trainingService = {
  async listGroups() {
    return TrainingGroupListSchema.parse(
      await api.get<unknown>(API_CONFIG.getTrainingGroupsUrl()),
    ).groups;
  },
  async listOperators() {
    return OperatorOptionListSchema.parse(
      await api.get<unknown>(API_CONFIG.getTrainingOperatorsUrl()),
    ).operators;
  },
  async createGroup(input: CreateTrainingGroup) {
    return TrainingGroupSchema.parse(
      await api.post<unknown>(API_CONFIG.getTrainingGroupsUrl(), input),
    );
  },
  async updateGroup(groupId: string, input: UpdateTrainingGroup) {
    return TrainingGroupSchema.parse(
      await api.patch<unknown>(API_CONFIG.getTrainingGroupUrl(groupId), input),
    );
  },
  async deleteGroup(groupId: string) {
    await api.delete<unknown>(API_CONFIG.getTrainingGroupUrl(groupId));
  },
  async addMember(groupId: string, input: AddTrainingGroupMember) {
    await api.post<unknown>(
      API_CONFIG.getTrainingGroupMembersUrl(groupId),
      input,
    );
  },
  async updateMember(
    groupId: string,
    userId: string,
    input: { serviceTag: string },
  ) {
    await api.patch<unknown>(
      API_CONFIG.getTrainingGroupMemberUrl(groupId, userId),
      input,
    );
  },
  async removeMember(groupId: string, userId: string) {
    await api.delete<unknown>(
      API_CONFIG.getTrainingGroupMemberUrl(groupId, userId),
    );
  },
  async listAssignments() {
    return TrainingAssignmentListSchema.parse(
      await api.get<unknown>(API_CONFIG.getTrainingAssignmentsUrl()),
    ).assignments;
  },
  async listMyAssignments() {
    return TrainingAssignmentListSchema.parse(
      await api.get<unknown>(API_CONFIG.getMyTrainingAssignmentsUrl()),
    ).assignments;
  },
  async createAssignment(input: CreateTrainingAssignment) {
    return TrainingAssignmentSchema.parse(
      await api.post<unknown>(API_CONFIG.getTrainingAssignmentsUrl(), input),
    );
  },
  async updateAssignment(
    assignmentId: string,
    input: UpdateTrainingAssignment,
  ) {
    return TrainingAssignmentSchema.parse(
      await api.patch<unknown>(
        API_CONFIG.getTrainingAssignmentUrl(assignmentId),
        input,
      ),
    );
  },
  async deleteAssignment(assignmentId: string) {
    await api.delete<unknown>(
      API_CONFIG.getTrainingAssignmentUrl(assignmentId),
    );
  },
  async launchAssignment(assignmentId: string) {
    return TrainingAssignmentSchema.parse(
      await api.post<unknown>(API_CONFIG.getLaunchAssignmentUrl(assignmentId)),
    );
  },
  async completeAssignment(assignmentId: string) {
    return TrainingAssignmentSchema.parse(
      await api.post<unknown>(
        API_CONFIG.getCompleteAssignmentUrl(assignmentId),
      ),
    );
  },
  async archiveAssignment(assignmentId: string) {
    return TrainingAssignmentSchema.parse(
      await api.post<unknown>(API_CONFIG.getArchiveAssignmentUrl(assignmentId)),
    );
  },
  async listLiveSessions(groupId?: string) {
    return LiveTrainingSessionListSchema.parse(
      await api.get<unknown>(
        API_CONFIG.getLiveTrainingSessionsUrl(),
        byGroup(groupId),
      ),
    ).sessions;
  },
  async listInstructorCalls() {
    return InstructorCallListSchema.parse(
      await api.get<unknown>(API_CONFIG.getInstructorCallsUrl()),
    ).calls;
  },
  async endSession(trainingSessionId: string, reason: string) {
    await api.post<unknown>(
      API_CONFIG.getEndTrainingSessionUrl(trainingSessionId),
      { reason },
    );
  },
  async getGroup(groupId: string) {
    return TrainingGroupSchema.parse(
      await api.get<unknown>(API_CONFIG.getTrainingGroupUrl(groupId)),
    );
  },
  /** Ученики группы со сводкой их попыток. */
  async listGroupStudents(groupId: string) {
    return GroupStudentListSchema.parse(
      await api.get<unknown>(API_CONFIG.getGroupStudentsUrl(groupId)),
    ).students;
  },
  /** Все ученики; исключённый из группы тоже остаётся в списке. */
  async listStudents() {
    return StudentListSchema.parse(
      await api.get<unknown>(API_CONFIG.getStudentsUrl()),
    ).students;
  },
  async getStudentProfile(userId: string) {
    return StudentProfileSchema.parse(
      await api.get<unknown>(API_CONFIG.getStudentProfileUrl(userId)),
    );
  },
};
