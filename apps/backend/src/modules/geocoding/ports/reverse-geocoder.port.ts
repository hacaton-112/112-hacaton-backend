export interface ReverseGeocodePoint {
  latitude: number;
  longitude: number;
}

export const OPENSTREETMAP_ATTRIBUTION = "© OpenStreetMap contributors";

export interface ReverseGeocodedAddress {
  city?: string;
  street?: string;
  house?: string;
  displayName: string;
  attribution: typeof OPENSTREETMAP_ATTRIBUTION;
}

export interface ReverseGeocoderPort {
  reverse(point: ReverseGeocodePoint): Promise<ReverseGeocodedAddress>;
}

export const REVERSE_GEOCODER = Symbol("REVERSE_GEOCODER");

export class ReverseGeocodeNotFoundError extends Error {
  constructor() {
    super("No address was found for the selected coordinates");
    this.name = "ReverseGeocodeNotFoundError";
  }
}

export class ReverseGeocoderUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("The reverse geocoding provider is unavailable", { cause });
    this.name = "ReverseGeocoderUnavailableError";
  }
}
