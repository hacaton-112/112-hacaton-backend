import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { OpenAPIObject } from "@nestjs/swagger";

@Injectable()
export class OpenApiDocumentStore {
  private document: OpenAPIObject | null = null;

  set(document: OpenAPIObject): void {
    this.document = document;
  }

  get(): OpenAPIObject {
    if (!this.document)
      throw new ServiceUnavailableException("Описание API ещё не собрано");
    return this.document;
  }
}
