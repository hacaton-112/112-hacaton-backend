// Конфигурация читается при импорте модулей. Заглушки позволяют обычному
// локальному запуску корректно пропустить e2e, если контейнер не был запущен.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://system112:system112@127.0.0.1:54322/system112_training";
process.env.JWT_SECRET ??=
  "e2e-only-secret-that-is-longer-than-thirty-two-characters";
process.env.GRAMMAR_MODEL_REVIEW_ENABLED = "false";
process.env.SCENARIO_AUDIO_WORKER_ENABLED = "false";
process.env.VOICE_PIPELINE_DEMO_ENABLED = "false";
