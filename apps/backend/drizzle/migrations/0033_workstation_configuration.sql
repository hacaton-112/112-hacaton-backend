ALTER TABLE "telephony_workstations" ADD COLUMN "name" text;
ALTER TABLE "telephony_workstations" ADD COLUMN "service" "dispatch_service";
ALTER TABLE "telephony_workstations" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
-- Служба берётся из тега участника группы: рабочие места заведены под учеников,
-- и поголовная запись 'dds_01' назначила бы полиции и скорой пожарную охрану.
UPDATE "telephony_workstations" w
SET "name" = COALESCE(w."name", 'Рабочее место ' || w."extension"),
    "service" = COALESCE(
      w."service",
      (
        SELECT CASE
                 WHEN lower(trim(m."service_tag")) IN ('dds_01', '01', '1') THEN 'dds_01'
                 WHEN lower(trim(m."service_tag")) IN ('dds_02', '02', '2') THEN 'dds_02'
                 WHEN lower(trim(m."service_tag")) IN ('dds_03', '03', '3') THEN 'dds_03'
                 WHEN lower(trim(m."service_tag")) IN ('dds_04', '04', '4') THEN 'dds_04'
               END::"dispatch_service"
        FROM "training_group_members" m
        WHERE m."user_id" = w."user_id"
          AND lower(trim(m."service_tag")) IN
              ('dds_01','01','1','dds_02','02','2','dds_03','03','3','dds_04','04','4')
        LIMIT 1
      ),
      'dds_01'
    )
WHERE w."name" IS NULL OR w."service" IS NULL;
ALTER TABLE "telephony_workstations" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "telephony_workstations" ALTER COLUMN "service" SET NOT NULL;
ALTER TABLE "telephony_workstations" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "telephony_workstations" DROP CONSTRAINT "telephony_workstations_user_id_users_id_fk";
ALTER TABLE "telephony_workstations" ADD CONSTRAINT "telephony_workstations_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
