import { ErrorCodes } from "@/contracts";

import { ReverseGeocodingService } from "./reverse-geocoding.service";
import {
  ReverseGeocodeNotFoundError,
  type ReverseGeocoderPort,
  ReverseGeocoderUnavailableError,
} from "../ports/reverse-geocoder.port";

const point = { latitude: 55.75, longitude: 37.61 };

describe(ReverseGeocodingService.name, () => {
  it("returns a normalized address", async () => {
    const reverse = jest.fn().mockResolvedValue({
      city: "Москва",
      street: "Тверская улица",
      displayName: "Тверская улица, Москва, Россия",
      attribution: "© OpenStreetMap contributors",
    });
    const service = new ReverseGeocodingService({
      reverse,
    } as ReverseGeocoderPort);

    await expect(service.reverse(point)).resolves.toMatchObject({
      city: "Москва",
      street: "Тверская улица",
    });
  });

  it("exposes a stable not-found error", async () => {
    const service = new ReverseGeocodingService({
      reverse: jest.fn().mockRejectedValue(new ReverseGeocodeNotFoundError()),
    });

    await expect(service.reverse(point)).rejects.toMatchObject({
      code: ErrorCodes.GEOCODING_ADDRESS_NOT_FOUND,
    });
  });

  it("hides provider failure details", async () => {
    const service = new ReverseGeocodingService({
      reverse: jest
        .fn()
        .mockRejectedValue(new ReverseGeocoderUnavailableError("secret")),
    });

    await expect(service.reverse(point)).rejects.toMatchObject({
      code: ErrorCodes.GEOCODING_UNAVAILABLE,
    });
  });
});
