export interface StructuredOutputRequest {
  readonly schemaName: string;
  readonly schemaDescription: string;
  readonly schema: Record<string, unknown>;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly maxTokens: number;
  readonly signal: AbortSignal;
}

/** JSON-задачи вынесены в отдельный порт, чтобы прикладной код не зависел от Alice AI. */
export interface StructuredOutputPort {
  complete(request: StructuredOutputRequest): Promise<unknown>;
}

export const STRUCTURED_OUTPUT_PORT = Symbol("STRUCTURED_OUTPUT_PORT");
