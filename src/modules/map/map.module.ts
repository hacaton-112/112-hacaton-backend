import { Module } from "@nestjs/common";

import { MapTileService } from "./application/map-tile.service";
import { S3MapTileStorage } from "./infrastructure/s3-map-tile.storage";
import { MAP_CONFIG, createMapConfig, type MapConfig } from "./map.config";
import { MapController } from "./map.controller";
import { MAP_TILE_STORAGE } from "./ports/map-tile-storage.port";

@Module({
  controllers: [MapController],
  providers: [
    {
      provide: MAP_CONFIG,
      useFactory: createMapConfig,
    },
    {
      provide: MAP_TILE_STORAGE,
      inject: [MAP_CONFIG],
      useFactory: (config: MapConfig) => new S3MapTileStorage(config),
    },
    MapTileService,
  ],
  exports: [MapTileService, MAP_TILE_STORAGE],
})
export class MapModule {}
