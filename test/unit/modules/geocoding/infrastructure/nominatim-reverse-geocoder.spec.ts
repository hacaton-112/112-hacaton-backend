import type { NominatimConfig } from "@/modules/geocoding/infrastructure/nominatim.config";
import { NominatimReverseGeocoder } from "@/modules/geocoding/infrastructure/nominatim-reverse-geocoder";
import {
  ReverseGeocodeNotFoundError,
  ReverseGeocoderUnavailableError,
} from "@/modules/geocoding/ports/reverse-geocoder.port";

const config: NominatimConfig = {
  baseUrl: "http://nominatim.test",
  userAgent: "system-112-test/1.0",
  requestTimeoutMs: 1_000,
  cacheTtlSeconds: 3_600,
};

const responseWith = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe(NominatimReverseGeocoder.name, () => {
  it("normalizes Russian city, road and house fields", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(
      responseWith({
        display_name: "10, Тверская улица, Москва, Россия",
        address: {
          city: "Москва",
          road: "Тверская улица",
          house_number: "10",
          country: "Россия",
        },
      }),
    );
    const geocoder = new NominatimReverseGeocoder(
      config,
      fetchImplementation as unknown as typeof fetch,
    );

    await expect(
      geocoder.reverse({ latitude: 55.764645, longitude: 37.605493 }),
    ).resolves.toEqual({
      city: "Москва",
      street: "Тверская улица",
      house: "10",
      displayName: "10, Тверская улица, Москва, Россия",
      attribution: "© OpenStreetMap contributors",
    });

    const requestUrl = new URL(String(fetchImplementation.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/reverse");
    expect(requestUrl.searchParams.get("accept-language")).toBe("ru");
    expect(fetchImplementation.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({
        "User-Agent": "system-112-test/1.0",
      }),
    });
  });

  it("supports locality and street fallbacks", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(
      responseWith({
        display_name: "Набережная, Учебный, Россия",
        address: {
          village: "Учебный",
          pedestrian: "Набережная",
        },
      }),
    );
    const geocoder = new NominatimReverseGeocoder(
      config,
      fetchImplementation as unknown as typeof fetch,
    );

    await expect(
      geocoder.reverse({ latitude: 55.1, longitude: 37.1 }),
    ).resolves.toMatchObject({ city: "Учебный", street: "Набережная" });
  });

  it("caches repeated coordinates", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(
      responseWith({
        display_name: "Москва, Россия",
        address: { city: "Москва" },
      }),
    );
    const geocoder = new NominatimReverseGeocoder(
      config,
      fetchImplementation as unknown as typeof fetch,
    );
    const point = { latitude: 55.75, longitude: 37.61 };

    await geocoder.reverse(point);
    await geocoder.reverse(point);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("reports a missing useful address", async () => {
    const fetchImplementation = jest.fn().mockResolvedValue(
      responseWith({
        display_name: "Россия",
        address: { country: "Россия" },
      }),
    );
    const geocoder = new NominatimReverseGeocoder(
      config,
      fetchImplementation as unknown as typeof fetch,
    );

    await expect(
      geocoder.reverse({ latitude: 0.1, longitude: 0.1 }),
    ).rejects.toBeInstanceOf(ReverseGeocodeNotFoundError);
  });

  it("rejects invalid provider JSON", async () => {
    const fetchImplementation = jest
      .fn()
      .mockResolvedValue(responseWith({ unexpected: true }));
    const geocoder = new NominatimReverseGeocoder(
      config,
      fetchImplementation as unknown as typeof fetch,
    );

    await expect(
      geocoder.reverse({ latitude: 55.75, longitude: 37.61 }),
    ).rejects.toBeInstanceOf(ReverseGeocoderUnavailableError);
  });

  it("maps network failures to a provider error", async () => {
    const fetchImplementation = jest
      .fn()
      .mockRejectedValue(new Error("network down"));
    const geocoder = new NominatimReverseGeocoder(
      config,
      fetchImplementation as unknown as typeof fetch,
    );

    await expect(
      geocoder.reverse({ latitude: 55.75, longitude: 37.61 }),
    ).rejects.toBeInstanceOf(ReverseGeocoderUnavailableError);
  });
});
