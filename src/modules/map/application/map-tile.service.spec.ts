import {
  MapTileService,
  FALLBACK_DARK_TILE_PNG,
} from "./map-tile.service";
import type { MapConfig } from "../map.config";
import type { MapTileStorage } from "../ports/map-tile-storage.port";

describe("MapTileService", () => {
  let service: MapTileService;
  let mockStorage: jest.Mocked<MapTileStorage>;
  let mockConfig: MapConfig;

  beforeEach(() => {
    mockConfig = {
      s3Endpoint: "http://127.0.0.1:9000",
      s3Region: "us-east-1",
      s3Bucket: "map-tiles",
      upstreamUrl: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      cacheOnDemand: false,
    };

    mockStorage = {
      getTile: jest.fn().mockResolvedValue(null),
      putTile: jest.fn().mockResolvedValue(undefined),
    };

    service = new MapTileService(mockConfig, mockStorage);
  });

  it("builds a valid MapLibre style JSON with raster tile source", () => {
    const style = service.getStyle("http://localhost:3000/");

    expect(style.version).toBe(8);
    expect(style.name).toBe("System 112 Offline Dark");
    const source = style.sources["system112-offline-tiles"] as {
      type: string;
      tiles: string[];
    };
    expect(source.type).toBe("raster");
    expect(source.tiles[0]).toBe(
      "http://localhost:3000/api/v1/map/tiles/{z}/{x}/{y}.png",
    );
  });

  it("returns stored tile if found in storage", async () => {
    const fakeTile = new Uint8Array([1, 2, 3, 4]);
    mockStorage.getTile.mockResolvedValue(fakeTile);

    const tile = await service.getTile(5, 10, 15);

    expect(mockStorage.getTile).toHaveBeenCalledWith(5, 10, 15);
    expect(tile).toBe(fakeTile);
  });

  it("returns fallback tile when not found in storage and cacheOnDemand is false", async () => {
    mockStorage.getTile.mockResolvedValue(null);

    const tile = await service.getTile(5, 10, 15);

    expect(tile).toEqual(FALLBACK_DARK_TILE_PNG);
  });

  it("returns fallback tile for out-of-range coordinates without calling storage", async () => {
    const tile = await service.getTile(3, 99, 99);

    expect(mockStorage.getTile).not.toHaveBeenCalled();
    expect(tile).toEqual(FALLBACK_DARK_TILE_PNG);
  });
});
