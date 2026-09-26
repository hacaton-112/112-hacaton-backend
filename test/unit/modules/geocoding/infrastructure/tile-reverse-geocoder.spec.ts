import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ReverseGeocodeNotFoundError } from "@/modules/geocoding/ports/reverse-geocoder.port";
import { TileReverseGeocoder } from "@/modules/geocoding/infrastructure/tile-reverse-geocoder";

/** Настоящий квадрат карты с боевого сервера: центр Москвы, зум 14. */
const tile = readFileSync(
  join(process.cwd(), "test", "fixtures", "tiles", "moscow-14-9904-5121.pbf"),
);
const CENTRE = { latitude: 55.7558, longitude: 37.6173 };
const config = {
  baseUrl: "http://tileserver:8080/data/openmaptiles",
  requestTimeoutMs: 1_000,
  detailZoom: 14,
  placeZoom: 10,
};

const serveOnly = (path: string) =>
  jest.fn(async (url: string | URL | Request) =>
    String(url).endsWith(path)
      ? new Response(new Uint8Array(tile), { status: 200 })
      : new Response(null, { status: 404 }),
  ) as unknown as typeof fetch;

describe(TileReverseGeocoder.name, () => {
  it("читает адрес из собственного тайла, без обращения наружу", async () => {
    const fetchImplementation = serveOnly("/14/9904/5121.pbf");
    const geocoder = new TileReverseGeocoder(config, fetchImplementation);

    const address = await geocoder.reverse(CENTRE);

    expect(address.displayName.length).toBeGreaterThan(0);
    expect(address.street ?? address.city).toBeTruthy();
    expect(address.attribution).toBe("© OpenStreetMap contributors");
    // Все запросы уходят только на наш сервер тайлов.
    for (const [url] of (
      fetchImplementation as unknown as jest.Mock
    ).mock.calls)
      expect(String(url).startsWith(config.baseUrl)).toBe(true);
  });

  it("повторный запрос той же точки не ходит за тайлами снова", async () => {
    const fetchImplementation = serveOnly("/14/9904/5121.pbf");
    const geocoder = new TileReverseGeocoder(config, fetchImplementation);

    await geocoder.reverse(CENTRE);
    const requests = (fetchImplementation as unknown as jest.Mock).mock.calls
      .length;
    await geocoder.reverse(CENTRE);

    expect(
      (fetchImplementation as unknown as jest.Mock).mock.calls.length,
    ).toBe(requests);
  });

  it("сообщает об отсутствии адреса там, где карта пуста", async () => {
    const empty = jest.fn(
      async () => new Response(null, { status: 404 }),
    ) as unknown as typeof fetch;
    const geocoder = new TileReverseGeocoder(config, empty);

    await expect(geocoder.reverse(CENTRE)).rejects.toBeInstanceOf(
      ReverseGeocodeNotFoundError,
    );
  });
});
