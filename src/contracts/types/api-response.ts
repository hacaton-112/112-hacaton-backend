export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  errors: Array<{ path: string[]; message: string }>;
  timestamp: string;
}

export interface ApiSuccessMessage {
  message: string;
}
