export interface MapTileStorage {
  getTile(
    z: number,
    x: number,
    y: number,
    ext?: string,
  ): Promise<Uint8Array | null>;
  putTile(
    z: number,
    x: number,
    y: number,
    data: Uint8Array,
    contentType?: string,
    ext?: string,
  ): Promise<void>;
  ensureBucket?(): Promise<void>;
}

export const MAP_TILE_STORAGE = Symbol("MAP_TILE_STORAGE");
