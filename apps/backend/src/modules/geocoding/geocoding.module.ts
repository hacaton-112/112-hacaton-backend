import { Module } from "@nestjs/common";

import { env } from "@/core/config/env.config";
import { AuthModule } from "@/modules/auth/auth.module";

import { ReverseGeocodingService } from "./application/reverse-geocoding.service";
import { GeocodingController } from "./geocoding.controller";
import { DrizzleTrainingCallAccess } from "./infrastructure/drizzle-training-call-access";
import { parseNominatimConfig } from "./infrastructure/nominatim.config";
import { NominatimReverseGeocoder } from "./infrastructure/nominatim-reverse-geocoder";
import { TileReverseGeocoder } from "./infrastructure/tile-reverse-geocoder";
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
      // По умолчанию адрес собирается из собственных тайлов: контур закрытый, и
      // внешний Nominatim там недоступен. Он остаётся для разработки.
      useFactory: () =>
        env.REVERSE_GEOCODER_PROVIDER === "nominatim"
          ? new NominatimReverseGeocoder(
              parseNominatimConfig({
                NOMINATIM_BASE_URL: env.NOMINATIM_BASE_URL,
                NOMINATIM_USER_AGENT: env.NOMINATIM_USER_AGENT,
                NOMINATIM_REQUEST_TIMEOUT_MS: env.NOMINATIM_REQUEST_TIMEOUT_MS,
                NOMINATIM_CACHE_TTL_SECONDS: env.NOMINATIM_CACHE_TTL_SECONDS,
              }),
            )
          : new TileReverseGeocoder({
              baseUrl: env.MAP_TILES_BASE_URL,
              requestTimeoutMs: env.MAP_TILES_TIMEOUT_MS,
              detailZoom: 14,
              placeZoom: 10,
            }),
    },
  ],
})
export class GeocodingModule {}
