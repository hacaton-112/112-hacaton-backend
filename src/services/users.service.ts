import { API_CONFIG } from "../config/api";
import { z } from "zod";

import { AuthUserSchema, type UserRole } from "../contracts/auth";
import type { CreateUser, UpdateUser } from "../contracts/users";
import { api } from "../lib/api";

const UserListSchema = z.object({ users: z.array(AuthUserSchema) });

export const usersService = {
  async list(role?: UserRole) {
    return UserListSchema.parse(
      await api.get<unknown>(
        API_CONFIG.getUsersUrl(),
        role ? { params: { role } } : undefined,
      ),
    ).users;
  },
  async update(userId: string, input: UpdateUser) {
    return AuthUserSchema.parse(
      await api.patch<unknown>(API_CONFIG.getUserUrl(userId), input),
    );
  },
  async create(input: CreateUser) {
    return AuthUserSchema.parse(
      await api.post<unknown>(API_CONFIG.getUsersUrl(), input),
    );
  },
};
