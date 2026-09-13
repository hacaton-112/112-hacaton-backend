import { Inject, Injectable } from "@nestjs/common";

import {
  AppNotFoundException,
  AppServiceUnavailableException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import {
  REVERSE_GEOCODER,
  type ReverseGeocodedAddress,
  type ReverseGeocodePoint,
  ReverseGeocodeNotFoundError,
  type ReverseGeocoderPort,
} from "../ports/reverse-geocoder.port";

@Injectable()
export class ReverseGeocodingService {
  constructor(
    @Inject(REVERSE_GEOCODER)
    private readonly reverseGeocoder: ReverseGeocoderPort,
  ) {}

  async reverse(point: ReverseGeocodePoint): Promise<ReverseGeocodedAddress> {
    try {
      return await this.reverseGeocoder.reverse(point);
    } catch (error) {
      if (error instanceof ReverseGeocodeNotFoundError) {
        throw new AppNotFoundException(
          ErrorCodes.GEOCODING_ADDRESS_NOT_FOUND,
          "No address was found for the selected coordinates",
        );
      }

      throw new AppServiceUnavailableException(
        ErrorCodes.GEOCODING_UNAVAILABLE,
        "Reverse geocoding is temporarily unavailable",
      );
    }
  }
}
