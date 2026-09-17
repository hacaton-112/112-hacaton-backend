import * as fs from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { MAP_CONFIG, type MapConfig } from "../map.config";
import {
  MAP_TILE_STORAGE,
  type MapTileStorage,
} from "../ports/map-tile-storage.port";

/**
 * 1x1 dark slate `#0b0f19` PNG tile for raster fallback.
 */
export const FALLBACK_DARK_TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPg5pf8DwABjwEz//4fuAAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Empty MVT tile bytes.
 */
export const FALLBACK_EMPTY_MVT = new Uint8Array();

export type MapStyleSpecification = Record<string, unknown>;

@Injectable()
export class MapTileService {
  private readonly logger = new Logger(MapTileService.name);

  constructor(
    @Inject(MAP_CONFIG) private readonly config: MapConfig,
    @Inject(MAP_TILE_STORAGE) private readonly storage: MapTileStorage,
  ) {}

  /**
   * Generates a MapLibre Style Specification (v8) pointing to the local backend vector tiles, sprites and glyphs.
   */
  getStyle(baseUrl: string): MapStyleSpecification {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const stylePath = path.resolve(
      __dirname,
      "../assets/dark-matter-gl-style.json",
    );

    if (fs.existsSync(stylePath)) {
      try {
        const raw = fs.readFileSync(stylePath, "utf8");
        const style = JSON.parse(raw);

        style.name = "System 112 Offline Dark Matter";
        style.sources = {
          carto: {
            type: "vector",
            tiles: [`${normalizedBaseUrl}/api/v1/map/tiles/{z}/{x}/{y}.mvt`],
            minzoom: 0,
            maxzoom: 14,
            attribution: "© CARTO, © OpenStreetMap contributors",
          },
        };
        style.sprite = `${normalizedBaseUrl}/api/v1/map/sprites/sprite`;
        style.glyphs = `${normalizedBaseUrl}/api/v1/map/fonts/{fontstack}/{range}.pbf`;

        return style;
      } catch (error) {
        this.logger.error(
          `Failed to parse dark-matter-gl-style.json: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Fallback simple raster style if asset file is missing
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
            "raster-saturation": -1.0,
          },
        },
      ],
    };
  }

  /**
   * Returns vector (.mvt) or raster (.png) tile bytes.
   */
  async getTile(
    z: number,
    x: number,
    y: number,
    ext: "mvt" | "png" = "mvt",
  ): Promise<Uint8Array> {
    const maxCoord = Math.pow(2, z) - 1;
    if (z < 0 || z > 22 || x < 0 || x > maxCoord || y < 0 || y > maxCoord) {
      return ext === "mvt" ? FALLBACK_EMPTY_MVT : FALLBACK_DARK_TILE_PNG;
    }

    // 1. Check MinIO / local storage
    try {
      const stored = await this.storage.getTile(z, x, y, ext);
      if (stored && stored.length > 0) {
        return stored;
      }
    } catch (error) {
      this.logger.debug(
        `Failed to get tile ${z}/${x}/${y}.${ext} from storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 2. If online cache-on-demand is enabled, fetch upstream and save
    if (this.config.cacheOnDemand) {
      const upstreamTile = await this.fetchAndCacheUpstream(z, x, y, ext);
      if (upstreamTile) {
        return upstreamTile;
      }
    }

    // 3. Fallback tile
    return ext === "mvt" ? FALLBACK_EMPTY_MVT : FALLBACK_DARK_TILE_PNG;
  }

  /**
   * Serves static sprite asset.
   */
  getSprite(file: string): { data: Buffer; contentType: string } | null {
    const spritePath = path.resolve(__dirname, "../assets/sprites", file);
    if (!fs.existsSync(spritePath)) {
      return null;
    }
    const contentType = file.endsWith(".json")
      ? "application/json; charset=utf-8"
      : "image/png";
    return { data: fs.readFileSync(spritePath), contentType };
  }

  /**
   * Serves glyph range font PBF.
   */
  async getFont(
    fontstack: string,
    range: string,
  ): Promise<{ data: Buffer; contentType: string } | null> {
    const fontDir = path.resolve(__dirname, "../assets/fonts", fontstack);
    const fontFile = path.join(fontDir, range);
    if (fs.existsSync(fontFile)) {
      return {
        data: fs.readFileSync(fontFile),
        contentType: "application/x-protobuf",
      };
    }

    // Cache-on-demand from CARTO fonts if missing
    try {
      const url = `https://tiles.basemaps.cartocdn.com/fonts/${encodeURIComponent(fontstack)}/${range}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (!fs.existsSync(fontDir)) {
          fs.mkdirSync(fontDir, { recursive: true });
        }
        fs.writeFileSync(fontFile, buf);
        return { data: buf, contentType: "application/x-protobuf" };
      }
    } catch (err) {
      this.logger.debug(
        `Failed to fetch font upstream for ${fontstack}/${range}: ${String(err)}`,
      );
    }

    return null;
  }

  private async fetchAndCacheUpstream(
    z: number,
    x: number,
    y: number,
    ext: "mvt" | "png",
  ): Promise<Uint8Array | null> {
    const url =
      ext === "mvt"
        ? `https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/${z}/${x}/${y}.mvt`
        : this.config.upstreamUrl
            .replace("{z}", String(z))
            .replace("{x}", String(x))
            .replace("{y}", String(y));
    const contentType =
      ext === "mvt" ? "application/x-protobuf" : "image/png";

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
        this.storage
          .putTile(z, x, y, buffer, contentType, ext)
          .catch((err) =>
            this.logger.warn(
              `Failed to cache tile ${z}/${x}/${y}.${ext}: ${err instanceof Error ? err.message : String(err)}`,
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
