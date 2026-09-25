import {
  OPENSTREETMAP_ATTRIBUTION,
  type ReverseGeocodedAddress,
} from "../ports/reverse-geocoder.port";

/** Точка на карте в градусах. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Квадрат векторной карты в схеме «зум, столбец, строка». */
export interface TileIndex {
  z: number;
  x: number;
  y: number;
}

/** Именованный объект из тайла: дом, улица или населённый пункт. */
export interface TileFeature {
  readonly name: string;
  readonly point: GeoPoint;
}

export interface TileAddressSource {
  /** Дома: слой `housenumber` даёт номер дома точкой. */
  readonly houses: readonly TileFeature[];
  /** Улицы: слой `transportation_name` — линии с названием. */
  readonly streets: readonly TileFeature[];
  /** Населённые пункты: слой `place`. */
  readonly places: readonly TileFeature[];
}

/**
 * Дальше этого расстояния объект к точке не относят.
 *
 * Дом подписывает адрес, только если он рядом: иначе клик посреди поля получил
 * бы номер ближайшего села за километр. Улицу и город допускается брать
 * дальше — они и описывают местность крупнее.
 */
const LIMITS_METERS = { house: 80, street: 150, place: 40_000 } as const;

const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Расстояние по большой окружности: на городских масштабах его хватает. */
export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const latitude = toRadians(to.latitude - from.latitude);
  const longitude = toRadians(to.longitude - from.longitude);
  const start = toRadians(from.latitude);
  const end = toRadians(to.latitude);
  const chord =
    Math.sin(latitude / 2) ** 2 +
    Math.sin(longitude / 2) ** 2 * Math.cos(start) * Math.cos(end);
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(chord));
}

/** Квадрат карты, в который попадает точка на заданном зуме. */
export function tileForPoint(point: GeoPoint, zoom: number): TileIndex {
  const scale = 2 ** zoom;
  const latitude = toRadians(point.latitude);
  const x = Math.floor(((point.longitude + 180) / 360) * scale);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2) *
      scale,
  );
  const limit = scale - 1;
  return {
    z: zoom,
    x: Math.min(Math.max(x, 0), limit),
    y: Math.min(Math.max(y, 0), limit),
  };
}

/** Сам квадрат и восемь соседних: дом у края берут из соседнего квадрата. */
export function tileWithNeighbours(tile: TileIndex): TileIndex[] {
  const limit = 2 ** tile.z - 1;
  const tiles: TileIndex[] = [];
  for (const dy of [0, -1, 1]) {
    for (const dx of [0, -1, 1]) {
      const x = tile.x + dx;
      const y = tile.y + dy;
      if (x < 0 || y < 0 || x > limit || y > limit) continue;
      tiles.push({ z: tile.z, x, y });
    }
  }
  return tiles;
}

/** Координаты внутри тайла переводятся в градусы. */
export function tilePointToGeo(
  tile: TileIndex,
  x: number,
  y: number,
  extent: number,
): GeoPoint {
  const scale = 2 ** tile.z;
  const longitude = ((tile.x + x / extent) / scale) * 360 - 180;
  const n = Math.PI - 2 * Math.PI * ((tile.y + y / extent) / scale);
  const latitude =
    (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude, longitude };
}

const nearest = (
  target: GeoPoint,
  features: readonly TileFeature[],
  limitMeters: number,
): TileFeature | undefined => {
  let best: { feature: TileFeature; distance: number } | undefined;
  for (const feature of features) {
    const distance = distanceMeters(target, feature.point);
    if (distance > limitMeters) continue;
    if (!best || distance < best.distance) best = { feature, distance };
  }
  return best?.feature;
};

/**
 * Адрес точки по объектам карты.
 *
 * Берём ближайший дом, ближайшую улицу и населённый пункт, и складываем из них
 * подпись. Ничего не выдумываем: если рядом нет ни дома, ни улицы, адреса нет
 * — пусть оператор впишет его словами, это честнее выдуманной улицы.
 */
export function addressFromTileFeatures(
  target: GeoPoint,
  source: TileAddressSource,
): ReverseGeocodedAddress | null {
  const house = nearest(target, source.houses, LIMITS_METERS.house);
  const street = nearest(target, source.streets, LIMITS_METERS.street);
  const place = nearest(target, source.places, LIMITS_METERS.place);
  if (!street && !place) return null;

  const parts = [place?.name, street?.name, house && `д. ${house.name}`].filter(
    (part): part is string => Boolean(part),
  );
  if (parts.length === 0) return null;

  return {
    city: place?.name,
    street: street?.name,
    house: house?.name,
    displayName: parts.join(", "),
    attribution: OPENSTREETMAP_ATTRIBUTION,
  };
}
