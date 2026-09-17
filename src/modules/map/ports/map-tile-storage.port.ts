export interface MapTileStorage {
  getTile(z: number, x: number, y: number): Promise<Uint8Array | null>;
  putTile(
    z: number,
    x: number,
    y: number,
    data: Uint8Array,
    contentType?: string,
  ): Promise<void>;
  ensureBucket?(): Promise<void>;
}

export const MAP_TILE_STORAGE = Symbol("MAP_TILE_STORAGE");
