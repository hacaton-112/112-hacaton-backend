import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { TextAiAdapterModule } from "@/modules/ai-gateway/infrastructure/text-ai-adapter.module";

import { GrammarService } from "./application/grammar.service";
import { StructuredOutputGrammarReview } from "./infrastructure/structured-output-grammar.review";
import { parseGrammarConfig } from "./infrastructure/grammar.config";
import { GRAMMAR_REVIEW_PORT } from "./ports/grammar-review.port";

/**
 * Проверка грамотности текста.
 *
 * Правила работают всегда и без сети. Углублённая проверка моделью включается
 * переменной `GRAMMAR_MODEL_REVIEW_ENABLED`: в изолированном контуре внешнего
 * провайдера может не быть, и учебный комплекс обязан работать без него.
 */
@Module({
  imports: [ConfigModule, TextAiAdapterModule],
  providers: [
    StructuredOutputGrammarReview,
    {
      provide: GRAMMAR_REVIEW_PORT,
      inject: [ConfigService, StructuredOutputGrammarReview],
      useFactory: (
        configService: ConfigService,
        review: StructuredOutputGrammarReview,
      ) =>
        parseGrammarConfig({
          GRAMMAR_MODEL_REVIEW_ENABLED: configService.get(
            "GRAMMAR_MODEL_REVIEW_ENABLED",
          ),
        }).modelReviewEnabled
          ? review
          : null,
    },
    GrammarService,
  ],
  exports: [GrammarService],
})
export class GrammarModule {}
