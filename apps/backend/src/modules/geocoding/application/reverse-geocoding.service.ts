import { Inject, Injectable } from "@nestjs/common";

import {
  AppForbiddenException,
  AppNotFoundException,
  AppServiceUnavailableException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { UserRole } from "@/drizzle/schema";

import {
  REVERSE_GEOCODER,
  type ReverseGeocodedAddress,
  type ReverseGeocodePoint,
  ReverseGeocodeNotFoundError,
  type ReverseGeocoderPort,
} from "../ports/reverse-geocoder.port";
import {
  TRAINING_CALL_ACCESS,
  type TrainingCallAccess,
} from "../ports/training-call-access.port";

/** Кто спрашивает адрес и в рамках какого звонка. */
export interface ReverseGeocodeRequester {
  readonly userId: string;
  readonly role: UserRole;
  readonly trainingSessionId?: string;
}

@Injectable()
export class ReverseGeocodingService {
  constructor(
    @Inject(REVERSE_GEOCODER)
    private readonly reverseGeocoder: ReverseGeocoderPort,
    @Inject(TRAINING_CALL_ACCESS)
    private readonly calls: TrainingCallAccess,
  ) {}

  async reverse(
    point: ReverseGeocodePoint,
    requester: ReverseGeocodeRequester,
  ): Promise<ReverseGeocodedAddress> {
    if (requester.role === "operator") {
      await this.requireOwnActiveCall(requester);
    }

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

  /**
   * Оператор отмечает место происшествия только в своём идущем звонке.
   *
   * Преподаватель геокодирует точку сценария в конструкторе и звонка при этом
   * не ведёт, поэтому правило касается одной роли.
   */
  private async requireOwnActiveCall(
    requester: ReverseGeocodeRequester,
  ): Promise<void> {
    if (requester.trainingSessionId === undefined) {
      throw new AppForbiddenException(
        ErrorCodes.AUTH_ROLE_FORBIDDEN,
        "An operator can resolve an address only within their own training call",
      );
    }

    const call = await this.calls.findCall(requester.trainingSessionId);

    // Чужой звонок неотличим от несуществующего: знать чужие идентификаторы
    // сессий оператору незачем.
    if (call === null || call.operatorId !== requester.userId) {
      throw new AppNotFoundException(
        ErrorCodes.CALL_NOT_FOUND,
        "There is no call for this training session",
      );
    }

    if (call.isOver) {
      throw new AppForbiddenException(
        ErrorCodes.GEOCODING_CALL_NOT_ACTIVE,
        "The call is over, and its incident point can no longer change",
      );
    }
  }
}
