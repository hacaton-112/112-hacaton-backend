import { Inject, Injectable, Logger } from "@nestjs/common";

import { MAP_CONFIG, type MapConfig } from "../map.config";
import {
  MAP_TILE_STORAGE,
  type MapTileStorage,
} from "../ports/map-tile-storage.port";

/**
 * 1x1 dark slate `#0b0f19` PNG tile.
 * Returned when a tile coordinate is not yet cached or outside bounds.
 */
export const FALLBACK_DARK_TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPg5pf8DwABjwEz//4fuAAAAABJRU5ErkJggg==",
  "base64",
);

export interface MapStyleSpecification {
  version: 8;
  name: string;
  sources: Record<string, unknown>;
  layers: Array<Record<string, unknown>>;
}

@Injectable()
export class MapTileService {
  private readonly logger = new Logger(MapTileService.name);

  constructor(
    @Inject(MAP_CONFIG) private readonly config: MapConfig,
    @Inject(MAP_TILE_STORAGE) private readonly storage: MapTileStorage,
  ) {}

  /**
   * Generates a MapLibre Style Specification (v8) pointing to the local backend raster tiles.
   */
  getStyle(baseUrl: string): MapStyleSpecification {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const tileUrl = `${normalizedBaseUrl}/api/v1/map/tiles/{z}/{x}/{y}.png`;

    return {
      version: 8,
      name: "System 112 Offline Dark",
      sources: {
        "system112-offline-tiles": {
          type: "raster",
          tiles: [tileUrl],
          tileSize: 256,
          attribution: "© Система-112 Офлайн-карта",
        },
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": "#090d16",
          },
        },
        {
          id: "offline-raster-layer",
          type: "raster",
          source: "system112-offline-tiles",
          minzoom: 0,
          maxzoom: 19,
          paint: {
            "raster-opacity": 1.0,
          },
        },
      ],
    };
  }

  /**
   * Returns tile bytes as Uint8Array (or fallback 1x1 PNG if not available).
   */
  async getTile(z: number, x: number, y: number): Promise<Uint8Array> {
    const maxCoord = Math.pow(2, z) - 1;
    if (z < 0 || z > 22 || x < 0 || x > maxCoord || y < 0 || y > maxCoord) {
      return FALLBACK_DARK_TILE_PNG;
    }

    // 1. Check MinIO / local storage
    try {
      const stored = await this.storage.getTile(z, x, y);
      if (stored && stored.length > 0) {
        return stored;
      }
    } catch (error) {
      this.logger.debug(
        `Failed to get tile ${z}/${x}/${y} from storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 2. If online cache-on-demand is enabled, fetch upstream and save
    if (this.config.cacheOnDemand && this.config.upstreamUrl) {
      const upstreamTile = await this.fetchAndCacheUpstream(z, x, y);
      if (upstreamTile) {
        return upstreamTile;
      }
    }

    // 3. Fallback tile
    return FALLBACK_DARK_TILE_PNG;
  }

  private async fetchAndCacheUpstream(
    z: number,
    x: number,
    y: number,
  ): Promise<Uint8Array | null> {
    const url = this.config.upstreamUrl
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "System112-Simulator/1.0 (Emergency Training)",
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        return null;
      }

      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.length > 0) {
        // Fire-and-forget or await caching in MinIO
        this.storage
          .putTile(z, x, y, buffer, "image/png")
          .catch((err) =>
            this.logger.warn(
              `Failed to cache tile ${z}/${x}/${y}: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        return buffer;
      }
    } catch (error) {
      this.logger.debug(
        `Failed to fetch upstream tile ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return null;
  }
}
