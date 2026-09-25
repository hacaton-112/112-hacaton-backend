CREATE TYPE "public"."caller_gender" AS ENUM('male', 'female');--> statement-breakpoint
-- Уже заведённые персонажи получают мужской голос: единственный из них —
-- мужчина 34 лет. Значение по умолчанию тут же снимается, чтобы автор
-- сценария называл пол явно, а не узнавал его от базы.
ALTER TABLE "caller_personas" ADD COLUMN "gender" "caller_gender" NOT NULL DEFAULT 'male';--> statement-breakpoint
ALTER TABLE "caller_personas" ALTER COLUMN "gender" DROP DEFAULT;
