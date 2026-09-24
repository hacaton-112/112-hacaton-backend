/**
 * Минимальное описание `@mapbox/vector-tile`.
 *
 * Пакет первой версии типов не поставляет, а третья — только ESM, и её нельзя
 * загрузить в тестах. Здесь описано ровно то, чем пользуется обратное
 * геокодирование по тайлам.
 */
declare module "@mapbox/vector-tile" {
  import type Protobuf from "pbf";

  export interface VectorTilePoint {
    x: number;
    y: number;
  }

  export interface VectorTileFeature {
    properties: Record<string, string | number | boolean>;
    loadGeometry(): VectorTilePoint[][];
  }

  export interface VectorTileLayer {
    readonly length: number;
    readonly extent: number;
    feature(index: number): VectorTileFeature;
  }

  export class VectorTile {
    constructor(data: Protobuf);
    layers: Record<string, VectorTileLayer | undefined>;
  }
}
