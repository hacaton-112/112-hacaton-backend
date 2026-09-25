import { ErrorCodes } from "@/contracts";

import { ReverseGeocodingService } from "@/modules/geocoding/application/reverse-geocoding.service";
import {
  ReverseGeocodeNotFoundError,
  type ReverseGeocoderPort,
  ReverseGeocoderUnavailableError,
} from "@/modules/geocoding/ports/reverse-geocoder.port";
import type {
  TrainingCallAccess,
  TrainingCallOwnership,
} from "@/modules/geocoding/ports/training-call-access.port";

const point = { latitude: 55.75, longitude: 37.61 };
const instructor = { userId: "instructor-1", role: "instructor" as const };
const operator = {
  userId: "operator-1",
  role: "operator" as const,
  trainingSessionId: "session-1",
};

const address = {
  city: "Москва",
  street: "Тверская улица",
  displayName: "Тверская улица, Москва, Россия",
  attribution: "© OpenStreetMap contributors" as const,
};

const createService = ({
  reverse = jest.fn().mockResolvedValue(address),
  call = { operatorId: "operator-1", isOver: false },
}: {
  reverse?: jest.Mock;
  call?: TrainingCallOwnership | null;
} = {}) => {
  const findCall = jest.fn().mockResolvedValue(call);

  return {
    service: new ReverseGeocodingService(
      { reverse } as ReverseGeocoderPort,
      { findCall } as TrainingCallAccess,
    ),
    reverse,
    findCall,
  };
};

describe(ReverseGeocodingService.name, () => {
  it("returns a normalized address", async () => {
    const { service } = createService();

    await expect(service.reverse(point, instructor)).resolves.toMatchObject({
      city: "Москва",
      street: "Тверская улица",
    });
  });

  it("exposes a stable not-found error", async () => {
    const { service } = createService({
      reverse: jest.fn().mockRejectedValue(new ReverseGeocodeNotFoundError()),
    });

    await expect(service.reverse(point, instructor)).rejects.toMatchObject({
      code: ErrorCodes.GEOCODING_ADDRESS_NOT_FOUND,
    });
  });

  it("hides provider failure details", async () => {
    const { service } = createService({
      reverse: jest
        .fn()
        .mockRejectedValue(new ReverseGeocoderUnavailableError("secret")),
    });

    await expect(service.reverse(point, instructor)).rejects.toMatchObject({
      code: ErrorCodes.GEOCODING_UNAVAILABLE,
    });
  });

  it("lets an instructor geocode without a call", async () => {
    const { service, findCall } = createService();

    await service.reverse(point, instructor);

    // Преподаватель отмечает точку сценария в конструкторе, звонка у него нет.
    expect(findCall).not.toHaveBeenCalled();
  });

  it("lets an operator geocode a point of their own active call", async () => {
    const { service, findCall, reverse } = createService();

    await expect(service.reverse(point, operator)).resolves.toMatchObject({
      city: "Москва",
    });
    expect(findCall).toHaveBeenCalledWith("session-1");
    expect(reverse).toHaveBeenCalledWith(point);
  });

  it("refuses an operator who names no call", async () => {
    const { service, reverse } = createService();

    await expect(
      service.reverse(point, { userId: "operator-1", role: "operator" }),
    ).rejects.toMatchObject({ code: ErrorCodes.AUTH_ROLE_FORBIDDEN });
    expect(reverse).not.toHaveBeenCalled();
  });

  it.each([
    ["a call that does not exist", null],
    ["someone else's call", { operatorId: "operator-2", isOver: false }],
  ])("treats %s as missing", async (_label, call) => {
    const { service, reverse } = createService({ call });

    await expect(service.reverse(point, operator)).rejects.toMatchObject({
      code: ErrorCodes.CALL_NOT_FOUND,
    });
    expect(reverse).not.toHaveBeenCalled();
  });

  it("refuses a point of a call that is already over", async () => {
    const { service, reverse } = createService({
      call: { operatorId: "operator-1", isOver: true },
    });

    await expect(service.reverse(point, operator)).rejects.toMatchObject({
      code: ErrorCodes.GEOCODING_CALL_NOT_ACTIVE,
    });
    expect(reverse).not.toHaveBeenCalled();
  });
});
