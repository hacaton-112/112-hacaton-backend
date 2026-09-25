import type { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

const tagForPath = (path: string): string => {
  const route = path.replace(/^\/api\/v\d+/, "");
  if (route.startsWith("/auth")) return "Авторизация";
  if (route.startsWith("/scenarios")) return "Сценарии";
  if (route.startsWith("/dds-lessons")) return "Занятия ДДС";
  if (route.includes("report") || route.startsWith("/dds/my")) return "Отчёты";
  if (
    route.startsWith("/users") ||
    route.startsWith("/admin") ||
    route.startsWith("/groups")
  )
    return "Администрирование";
  return "Учебный контур";
};

/**
 * Схемы тел и ответов берутся из DTO `createZodDto`; здесь добавляется только
 * паспорт API и группировка маршрутов, которой нет в прикладных контрактах.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Учебное ПО для подготовки оператора ДДС")
    .setDescription(
      "API рабочих мест преподавателя, оператора 112 и диспетчера ДДС",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, config),
    { version: "3.1" },
  );

  for (const [path, item] of Object.entries(document.paths)) {
    if (!item) continue;
    for (const operation of Object.values(item)) {
      if (
        operation !== null &&
        typeof operation === "object" &&
        "responses" in operation
      ) {
        operation.tags ??= [tagForPath(path)];
        operation.security ??=
          path.endsWith("/auth/login") ||
          path.endsWith("/auth/refresh") ||
          path.endsWith("/auth/logout") ||
          path.endsWith("/health")
            ? []
            : [{ bearer: [] }];
      }
    }
  }
  return document;
}

export const openApiHtml = (document: OpenAPIObject): string => {
  const escaped = JSON.stringify(document, null, 2)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Описание API</title><style>body{font:15px system-ui;margin:0;background:#f6f7f9;color:#172033}main{max-width:1100px;margin:auto;padding:32px}pre{overflow:auto;background:white;border:1px solid #d9dde5;border-radius:8px;padding:20px;line-height:1.45}a{color:#2457c5}</style></head><body><main><h1>Описание API учебного комплекса</h1><p>Машиночитаемая версия: <a href="openapi.json">openapi.json</a>. Ниже показан тот же документ OpenAPI.</p><pre>${escaped}</pre></main></body></html>`;
};
