import { gunzipSync } from "node:zlib";

import { VectorTile } from "@mapbox/vector-tile";
import Protobuf from "pbf";

import {
  addressFromTileFeatures,
  tileForPoint,
  tilePointToGeo,
  tileWithNeighbours,
  type GeoPoint,
  type TileFeature,
  type TileIndex,
} from "../domain/tile-address";
import {
  ReverseGeocodeNotFoundError,
  ReverseGeocoderUnavailableError,
  type ReverseGeocodedAddress,
  type ReverseGeocodePoint,
  type ReverseGeocoderPort,
} from "../ports/reverse-geocoder.port";

export interface TileGeocoderConfig {
  /** Адрес набора тайлов, например `http://tileserver:8080/data/openmaptiles`. */
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  /** Зум с домами и улицами: в нашем архиве детализация доведена до 14. */
  readonly detailZoom: number;
  /** Зум, на котором подписаны города и посёлки. */
  readonly placeZoom: number;
}

type FetchImplementation = typeof fetch;

const MAX_CACHED_TILES = 64;
const NAME_KEYS = ["name:ru", "name", "housenumber"] as const;

const nameOf = (
  properties: Record<string, unknown>,
): string | undefined => {
  for (const key of NAME_KEYS) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
};

/**
 * Обратное геокодирование по собственным тайлам.
 *
 * Карта уже лежит на сервере целиком, и адрес точки можно собрать из неё же:
 * слой домов даёт номер, слой дорог — улицу, слой населённых пунктов — город.
 * Так тренажёр перестаёт зависеть от внешнего сервиса и работает в закрытом
 * контуре.
 */
export class TileReverseGeocoder implements ReverseGeocoderPort {
  private readonly cache = new Map<string, VectorTile | null>();

  constructor(
    private readonly config: TileGeocoderConfig,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  async reverse(point: ReverseGeocodePoint): Promise<ReverseGeocodedAddress> {
    const detail = tileWithNeighbours(
      tileForPoint(point, this.config.detailZoom),
    );
    const houses: TileFeature[] = [];
    const streets: TileFeature[] = [];
    const places: TileFeature[] = [];

    for (const tile of detail) {
      const decoded = await this.tile(tile);
      if (!decoded) continue;
      houses.push(...this.features(decoded, tile, "housenumber"));
      streets.push(...this.features(decoded, tile, "transportation_name"));
      places.push(...this.features(decoded, tile, "place"));
    }

    // Город подписан на мелком зуме: на четырнадцатом в слое мест лежат уже
    // кварталы и микрорайоны, а не название города.
    const placeTile = tileForPoint(point, this.config.placeZoom);
    const decodedPlace = await this.tile(placeTile);
    if (decodedPlace)
      places.push(...this.features(decodedPlace, placeTile, "place"));

    const address = addressFromTileFeatures(point, {
      houses,
      streets,
      places,
    });
    if (!address) throw new ReverseGeocodeNotFoundError();
    return address;
  }

  private async tile(tile: TileIndex): Promise<VectorTile | null> {
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const decoded = await this.load(tile);
    // Кеш небольшой и без срока: архив тайлов меняется только при обновлении
    // карты, а вместе с ним перезапускается и backend.
    if (this.cache.size >= MAX_CACHED_TILES) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(key, decoded);
    return decoded;
  }

  private async load(tile: TileIndex): Promise<VectorTile | null> {
    const url = `${this.config.baseUrl}/${tile.z}/${tile.x}/${tile.y}.pbf`;
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      throw new ReverseGeocoderUnavailableError(error);
    }

    // За границей детализации сервер честно отвечает 404: там просто нет
    // данных, и это не сбой карты.
    if (response.status === 404 || response.status === 204) return null;
    if (!response.ok) throw new ReverseGeocoderUnavailableError(response.status);

    try {
      const raw = Buffer.from(await response.arrayBuffer());
      const body =
        raw[0] === 0x1f && raw[1] === 0x8b ? Buffer.from(gunzipSync(raw)) : raw;
      return new VectorTile(new Protobuf(body));
    } catch (error) {
      throw new ReverseGeocoderUnavailableError(error);
    }
  }

  /** Именованные объекты слоя с их координатами в градусах. */
  private features(
    tile: VectorTile,
    index: TileIndex,
    layerName: string,
  ): TileFeature[] {
    const layer = tile.layers[layerName];
    if (!layer) return [];

    const features: TileFeature[] = [];
    for (let position = 0; position < layer.length; position += 1) {
      const feature = layer.feature(position);
      const name = nameOf(feature.properties as Record<string, unknown>);
      if (!name) continue;

      const geometry = feature.loadGeometry().flat();
      if (geometry.length === 0) continue;
      // Линию улицы представляет её середина: ближайшая точка линии дала бы
      // тот же ответ, а считать её дороже.
      const middle = geometry[Math.floor(geometry.length / 2)]!;
      features.push({
        name,
        point: tilePointToGeo(index, middle.x, middle.y, layer.extent),
      });
    }
    return features;
  }
}

export type { GeoPoint };
