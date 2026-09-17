import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";
import { ClassifierModule } from "@/modules/classifier";

import { IncidentCardService } from "./application/incident-card.service";
import { DrizzleIncidentCardStore } from "./infrastructure/drizzle-incident-card.store";
import { IncidentCardController } from "./incident-card.controller";
import { INCIDENT_CARD_STORE } from "./ports/incident-card.store.port";

@Module({
  imports: [AuthModule, ClassifierModule],
  controllers: [IncidentCardController],
  providers: [
    IncidentCardService,
    DrizzleIncidentCardStore,
    { provide: INCIDENT_CARD_STORE, useExisting: DrizzleIncidentCardStore },
  ],
  exports: [IncidentCardService],
})
export class IncidentCardModule {}
