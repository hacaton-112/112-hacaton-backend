import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import {
  OPENSTREETMAP_ATTRIBUTION,
  type ReverseGeocodedAddress,
  type ReverseGeocodePoint,
  ReverseGeocodeNotFoundError,
  type ReverseGeocoderPort,
  ReverseGeocoderUnavailableError,
} from "../ports/reverse-geocoder.port";
import type { NominatimConfig } from "./nominatim.config";

const PUBLIC_NOMINATIM_HOST = "nominatim.openstreetmap.org";
const PUBLIC_REQUEST_INTERVAL_MS = 1_000;
const MAX_CACHE_ENTRIES = 1_000;

const NominatimResponseSchema = z
  .object({
    display_name: z.string().trim().min(1).max(4_000),
    address: z.record(z.string(), z.string()).default({}),
  })
  .passthrough();

interface CachedAddress {
  expiresAt: number;
  value: ReverseGeocodedAddress;
}

type FetchImplementation = typeof fetch;

const firstAddressPart = (
  address: Record<string, string>,
  keys: readonly string[],
): string | undefined => {
  for (const key of keys) {
    const value = address[key]?.trim();
    if (value) return value;
  }

  return undefined;
};

export class NominatimReverseGeocoder implements ReverseGeocoderPort {
  private readonly cache = new Map<string, CachedAddress>();
  private publicRequestQueue: Promise<void> = Promise.resolve();
  private nextPublicRequestAt = 0;

  constructor(
    private readonly config: NominatimConfig,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  async reverse(point: ReverseGeocodePoint): Promise<ReverseGeocodedAddress> {
    const cacheKey = `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(cacheKey);

    const value = await this.request(point);
    this.remember(cacheKey, value);
    return value;
  }

  private request(point: ReverseGeocodePoint): Promise<ReverseGeocodedAddress> {
    if (new URL(this.config.baseUrl).hostname !== PUBLIC_NOMINATIM_HOST) {
      return this.performRequest(point);
    }

    const queued = this.publicRequestQueue.then(async () => {
      const waitMs = Math.max(0, this.nextPublicRequestAt - Date.now());
      if (waitMs > 0) await delay(waitMs);

      try {
        return await this.performRequest(point);
      } finally {
        this.nextPublicRequestAt = Date.now() + PUBLIC_REQUEST_INTERVAL_MS;
      }
    });
    this.publicRequestQueue = queued.then(
      () => undefined,
      () => undefined,
    );

    return queued;
  }

  private async performRequest(
    point: ReverseGeocodePoint,
  ): Promise<ReverseGeocodedAddress> {
    const endpoint = new URL("reverse", `${this.config.baseUrl}/`);
    endpoint.searchParams.set("format", "jsonv2");
    endpoint.searchParams.set("lat", String(point.latitude));
    endpoint.searchParams.set("lon", String(point.longitude));
    endpoint.searchParams.set("zoom", "18");
    endpoint.searchParams.set("addressdetails", "1");
    endpoint.searchParams.set("layer", "address");
    endpoint.searchParams.set("accept-language", "ru");

    let response: Response;
    try {
      response = await this.fetchImplementation(endpoint, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "ru",
          "User-Agent": this.config.userAgent,
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      throw new ReverseGeocoderUnavailableError(error);
    }

    if (response.status === 404) throw new ReverseGeocodeNotFoundError();
    if (!response.ok) {
      throw new ReverseGeocoderUnavailableError(
        new Error(`Nominatim responded with HTTP ${response.status}`),
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ReverseGeocoderUnavailableError(error);
    }

    const parsed = NominatimResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ReverseGeocoderUnavailableError(parsed.error);
    }

    const { address } = parsed.data;
    const city = firstAddressPart(address, [
      "city",
      "town",
      "village",
      "municipality",
      "hamlet",
      "county",
    ]);
    const street = firstAddressPart(address, [
      "road",
      "pedestrian",
      "living_street",
      "footway",
      "path",
    ]);
    const house = firstAddressPart(address, ["house_number"]);

    if (!city && !street && !house) throw new ReverseGeocodeNotFoundError();

    return {
      ...(city ? { city } : {}),
      ...(street ? { street } : {}),
      ...(house ? { house } : {}),
      displayName: parsed.data.display_name,
      attribution: OPENSTREETMAP_ATTRIBUTION,
    };
  }

  private remember(key: string, value: ReverseGeocodedAddress): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.config.cacheTtlSeconds * 1_000,
    });
  }
}
