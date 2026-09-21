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
  AUTH_USER_NOT_FOUND: "Пользователь не найден или учётная запись недоступна",
  AUTH_ROLE_FORBIDDEN: "Недостаточно прав для этого действия",
  AUTH_LAST_ADMIN_REQUIRED:
    "Нельзя отключить или сменить роль последнего активного администратора",
  SCENARIO_CODE_EXISTS: "Сценарий с таким кодом уже существует",
  SCENARIO_PERSONA_CODE_EXISTS: "Персона с таким кодом уже существует",
  SCENARIO_ASSISTANT_UNAVAILABLE: "AI-помощник временно недоступен",
  SCENARIO_ASSISTANT_INVALID_DRAFT:
    "AI-помощник не смог сформировать корректный черновик",
  SCENARIO_NOT_FOUND: "Сценарий не найден",
  SCENARIO_VERSION_NOT_FOUND: "Версия сценария не найдена или не опубликована",
  SCENARIO_VERSION_STALE:
    "Пока вы редактировали, опубликована более новая версия сценария",
  SCENARIO_CODE_IMMUTABLE: "Код сценария нельзя менять при правке",
  GEOCODING_ADDRESS_NOT_FOUND: "Для выбранной точки адрес не найден",
  GEOCODING_UNAVAILABLE: "Сервис определения адреса временно недоступен",
  GEOCODING_CALL_NOT_ACTIVE:
    "Звонок завершён — место происшествия больше не меняется",
  CALL_NOT_FOUND: "Звонок не найден",
  GROUP_NOT_FOUND: "Учебная группа не найдена",
  AUTH_EMAIL_ALREADY_EXISTS: "Пользователь с таким email уже есть",
  GROUP_CODE_ALREADY_EXISTS: "Группа с таким кодом уже существует",
  GROUP_MEMBER_EXISTS: "Оператор уже добавлен в эту группу",
  GROUP_MEMBER_NOT_FOUND: "Ученика уже нет в этой группе",
  GROUP_ARCHIVED: "Архивную группу нельзя изменять",
  GROUP_HAS_ASSIGNMENTS:
    "У группы есть назначения — её можно только архивировать",
  GROUP_HAS_RUNNING_ASSIGNMENTS: "Сначала завершите идущие занятия группы",
  ASSIGNMENT_NOT_FOUND: "Назначение не найдено",
  ASSIGNMENT_NOT_AVAILABLE: "Это назначение сейчас недоступно",
  ASSIGNMENT_INVALID_DUE_DATE: "Срок назначения должен быть в будущем",
  ASSIGNMENT_STATE_INVALID:
    "Действие недоступно в текущем состоянии назначения",
  ASSIGNMENT_MAX_ATTEMPTS_REACHED: "Лимит попыток исчерпан",
  ASSIGNMENT_ATTEMPT_ACTIVE: "У вас уже есть активная попытка",
  ASSIGNMENT_HAS_ACTIVE_ATTEMPTS:
    "Сначала завершите активные попытки операторов",
  TRAINING_SESSION_NOT_ACTIVE: "Сессия уже завершена",
  REPORT_INVALID_PERIOD: "Начало периода отчёта позже его окончания",
  REPORT_TOO_LARGE: "Слишком много попыток — сократите период отчёта",
  CLASSIFIER_IMPORT_INVALID:
    "Файл не соответствует формату классификатора происшествий",
  CLASSIFIER_FILE_REQUIRED: "Выберите XLSX-файл классификатора",
  CLASSIFIER_VERSION_NOT_FOUND: "Версия классификатора не найдена",
  CLASSIFIER_ACTIVE_VERSION_NOT_FOUND:
    "Активная версия классификатора ещё не выбрана",
  CLASSIFIER_ENTRY_NOT_FOUND:
    "Выбранный тип отсутствует в активной версии классификатора",
  CLASSIFIER_QUALIFIER_INVALID:
    "Дополнительный признак не относится к выбранному типу",
  DDS_EXERCISE_NOT_FOUND: "Учебная карточка ДДС не найдена",
  DDS_SCENARIO_NOT_READY:
    "Для сценария не определена служба, которая должна получить карточку",
  DDS_STATUS_COMMENT_REQUIRED: "Для выбранного статуса нужен комментарий",
  DDS_STATUS_TRANSITION_INVALID:
    "Этот статус нельзя установить на текущем этапе реагирования",
  DDS_STATUS_TRANSITION_CONFLICT:
    "Статус карточки уже изменился. Данные обновлены",
  DDS_CREW_NOT_NOTIFIED: "Сначала передайте карточку наряду по телефону",
  TELEPHONY_DISABLED: "Учебная телефония сейчас отключена",
  TELEPHONY_UNAVAILABLE: "Asterisk не смог начать звонок",
  TELEPHONY_WORKSTATION_REQUIRED:
    "Администратор ещё не закрепил за вами телефон рабочего места",
  TELEPHONY_BROWSER_PHONE_UNAVAILABLE:
    "Рабочее место не настроено для браузерного телефона",
  TELEPHONY_CREW_UNAVAILABLE: "Этот номер недоступен для текущей карточки",
  TELEPHONY_CALL_CONFLICT: "Команда звонка уже использована для другого номера",
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

  /** Файл и серверное имя attachment для отчётов и других экспортов. */
  getDownload(url: string, config?: AxiosRequestConfig) {
    return this.instance
      .get<Blob>(url, { ...config, responseType: "blob" })
      .then((response) => ({
        blob: response.data,
        contentDisposition:
          typeof response.headers["content-disposition"] === "string"
            ? response.headers["content-disposition"]
            : null,
      }));
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
