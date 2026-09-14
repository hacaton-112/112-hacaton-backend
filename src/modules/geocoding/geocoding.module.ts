import { Module } from "@nestjs/common";

import { env } from "@/core/config/env.config";
import { AuthModule } from "@/modules/auth/auth.module";

import { ReverseGeocodingService } from "./application/reverse-geocoding.service";
import { GeocodingController } from "./geocoding.controller";
import { DrizzleTrainingCallAccess } from "./infrastructure/drizzle-training-call-access";
import { parseNominatimConfig } from "./infrastructure/nominatim.config";
import { NominatimReverseGeocoder } from "./infrastructure/nominatim-reverse-geocoder";
import { REVERSE_GEOCODER } from "./ports/reverse-geocoder.port";
import { TRAINING_CALL_ACCESS } from "./ports/training-call-access.port";

@Module({
  imports: [AuthModule],
  controllers: [GeocodingController],
  providers: [
    ReverseGeocodingService,
    DrizzleTrainingCallAccess,
    { provide: TRAINING_CALL_ACCESS, useExisting: DrizzleTrainingCallAccess },
    {
      provide: REVERSE_GEOCODER,
      useFactory: () =>
        new NominatimReverseGeocoder(
          parseNominatimConfig({
            NOMINATIM_BASE_URL: env.NOMINATIM_BASE_URL,
            NOMINATIM_USER_AGENT: env.NOMINATIM_USER_AGENT,
            NOMINATIM_REQUEST_TIMEOUT_MS: env.NOMINATIM_REQUEST_TIMEOUT_MS,
            NOMINATIM_CACHE_TTL_SECONDS: env.NOMINATIM_CACHE_TTL_SECONDS,
          }),
        ),
    },
  ],
})
export class GeocodingModule {}
