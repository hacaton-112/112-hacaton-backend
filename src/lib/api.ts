import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { toast } from "@bolid-ui/themes";

import { API_CONFIG, API_PREFIX } from "../config/api";
import { env } from "../config/env";
import { AuthSessionSchema, type AuthSession } from "../contracts/auth";
import {
  getAccessToken,
  getRefreshToken,
  useAuthStore,
} from "../stores/auth.store";

interface ApiErrorPayload {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
}

const API_ERROR_MESSAGES: Record<string, string> = {
  AUTH_LOGIN_INVALID_CREDENTIALS: "Неверный email или пароль",
  AUTH_TOKEN_INVALID: "Сессия истекла, войдите заново",
  AUTH_REFRESH_TOKEN_INVALID: "Сессия истекла, войдите заново",
  AUTH_USER_NOT_FOUND: "Учётная запись отключена",
  AUTH_ROLE_FORBIDDEN: "Недостаточно прав для этого действия",
  SCENARIO_CODE_EXISTS: "Сценарий с таким кодом уже существует",
  SCENARIO_PERSONA_CODE_EXISTS: "Персона с таким кодом уже существует",
  SCENARIO_ASSISTANT_UNAVAILABLE: "AI-помощник временно недоступен",
  SCENARIO_ASSISTANT_INVALID_DRAFT:
    "AI-помощник не смог сформировать корректный черновик",
  GEOCODING_ADDRESS_NOT_FOUND: "Для выбранной точки адрес не найден",
  GEOCODING_UNAVAILABLE: "Сервис определения адреса временно недоступен",
  VALIDATION_FAILED: "Проверьте введённые данные",
};

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  authRetry?: boolean;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor({ message, status, code, details }: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class Api {
  private readonly instance: AxiosInstance;
  private refreshRequest?: Promise<AuthSession>;

  constructor() {
    this.instance = axios.create({
      baseURL: `${env.apiUrl}${API_PREFIX}`,
      timeout: 15_000,
      headers: { "Content-Type": "application/json" },
    });

    this.instance.interceptors.request.use((config) =>
      this.attachToken(config),
    );
    this.instance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleError(error),
    );
  }

  private attachToken(config: InternalAxiosRequestConfig) {
    if (config.url === API_PREFIX) {
      config.url = "/";
    } else if (config.url?.startsWith(`${API_PREFIX}/`)) {
      config.url = config.url.slice(API_PREFIX.length);
    }

    const token = getAccessToken();
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }
    return config;
  }

  private async handleError(error: AxiosError) {
    const code = this.extractCode(error.response?.data);
    const config = error.config as RetryableRequestConfig | undefined;
    const refreshToken = getRefreshToken();

    if (
      error.response?.status === 401 &&
      code === "AUTH_TOKEN_INVALID" &&
      config &&
      !config.authRetry &&
      refreshToken
    ) {
      config.authRetry = true;

      try {
        const session = await this.refreshSession(refreshToken);
        useAuthStore.getState().signIn(session);
        config.headers.set("Authorization", `Bearer ${session.accessToken}`);

        return this.instance.request(config);
      } catch (refreshError) {
        useAuthStore.getState().signOut();

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(this.toApiError(error));
  }

  private toApiError(error: AxiosError): ApiError {
    if (!error.response) {
      const networkError = new ApiError({
        message: "Нет соединения с сервером",
      });

      toast.error("Сервер недоступен", {
        id: "api-network-error",
        description: networkError.message,
        duration: 6_000,
      });

      return networkError;
    }

    const { status, data } = error.response;
    const code = this.extractCode(data);

    return new ApiError({
      message:
        (code && API_ERROR_MESSAGES[code]) ??
        (status === 429
          ? "Слишком много запросов. Попробуйте через минуту"
          : undefined) ??
        this.extractMessage(data) ??
        "Сервер не смог выполнить запрос",
      status,
      code,
      details: data,
    });
  }

  /** Rotates a refresh token with single-flight protection for concurrent 401s. */
  refreshSession(refreshToken: string): Promise<AuthSession> {
    this.refreshRequest ??= this.instance
      .post<unknown>(API_CONFIG.getRefreshUrl(), { refreshToken })
      .then((response) => AuthSessionSchema.parse(response.data))
      .finally(() => {
        this.refreshRequest = undefined;
      });

    return this.refreshRequest;
  }

  private extractMessage(data: unknown): string | undefined {
    if (data && typeof data === "object" && "message" in data) {
      return String((data as { message: unknown }).message);
    }
    return undefined;
  }

  private extractCode(data: unknown): string | undefined {
    if (data && typeof data === "object" && "code" in data) {
      return String((data as { code: unknown }).code);
    }
    return undefined;
  }

  get<T>(url: string, config?: AxiosRequestConfig) {
    return this.instance.get<T>(url, config).then((response) => response.data);
  }

  post<T>(url: string, body?: unknown, config?: AxiosRequestConfig) {
    return this.instance
      .post<T>(url, body, config)
      .then((response) => response.data);
  }

  /** Двоичный ответ: запись звонка приходит с тем же токеном, что и всё остальное. */
  getBlob(url: string, config?: AxiosRequestConfig) {
    return this.instance
      .get<Blob>(url, { ...config, responseType: "blob" })
      .then((response) => response.data);
  }

  put<T>(url: string, body?: unknown, config?: AxiosRequestConfig) {
    return this.instance
      .put<T>(url, body, config)
      .then((response) => response.data);
  }

  patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig) {
    return this.instance
      .patch<T>(url, body, config)
      .then((response) => response.data);
  }

  delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.instance
      .delete<T>(url, config)
      .then((response) => response.data);
  }
}

export const api = new Api();
