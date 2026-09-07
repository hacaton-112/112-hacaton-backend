import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import { API_BASE_URL } from "../config/api";
import { getAccessToken } from "../stores/auth.store";

interface ApiErrorPayload {
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
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

  constructor(baseURL: string) {
    this.instance = axios.create({
      baseURL,
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
    const token = getAccessToken();
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }
    return config;
  }

  private handleError(error: AxiosError) {
    if (!error.response) {
      return Promise.reject(
        new ApiError({ message: "Нет соединения с сервером" }),
      );
    }

    const { status, data } = error.response;
    return Promise.reject(
      new ApiError({
        message: this.extractMessage(data) ?? error.message,
        status,
        code: this.extractCode(data),
        details: data,
      }),
    );
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

export const api = new Api(API_BASE_URL);
