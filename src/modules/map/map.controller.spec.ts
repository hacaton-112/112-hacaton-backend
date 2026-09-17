import { MapController } from "./map.controller";
import type { MapTileService } from "./application/map-tile.service";
import { FALLBACK_DARK_TILE_PNG } from "./application/map-tile.service";

describe("MapController", () => {
  let controller: MapController;
  let mapTileService: jest.Mocked<MapTileService>;

  beforeEach(() => {
    mapTileService = {
      getStyle: jest.fn().mockImplementation((baseUrl: string) => ({
        version: 8,
        name: "System 112 Offline Dark",
        sources: {
          "system112-offline-tiles": {
            type: "raster",
            tiles: [`${baseUrl}/api/v1/map/tiles/{z}/{x}/{y}.png`],
            tileSize: 256,
          },
        },
        layers: [],
      })),
      getTile: jest.fn().mockResolvedValue(FALLBACK_DARK_TILE_PNG),
    } as unknown as jest.Mocked<MapTileService>;

    controller = new MapController(mapTileService);
  });

  it("returns style JSON pointing to the request host tiles endpoint", () => {
    const req = {
      headers: {},
      protocol: "http",
      get: jest.fn().mockReturnValue("127.0.0.1:3000"),
    };

    const style = controller.getStyle(req as never);

    expect(mapTileService.getStyle).toHaveBeenCalledWith("http://127.0.0.1:3000");
    expect(style.version).toBe(8);
  });

  it("returns a StreamableFile for requested tile coordinates", async () => {
    const file = await controller.getTile(5, 10, 15);

    expect(mapTileService.getTile).toHaveBeenCalledWith(5, 10, 15, "png");
    expect(file).toBeDefined();
  });
});
