import { ROLES_METADATA_KEY } from "@/modules/auth/roles.decorator";

import type { ReverseGeocodingService } from "@/modules/geocoding/application/reverse-geocoding.service";
import { ReverseGeocodeQuerySchema } from "@/modules/geocoding/dto/reverse-geocode.dto";
import { GeocodingController } from "@/modules/geocoding/geocoding.controller";

describe(GeocodingController.name, () => {
  it("is open to operators as well as authors of scenarios", () => {
    expect(
      Reflect.getMetadata(
        ROLES_METADATA_KEY,
        GeocodingController.prototype.reverse,
      ),
    ).toEqual(["operator", "instructor", "admin"]);
  });

  it("passes the point, the requester and their call to the service", async () => {
    const geocoding = { reverse: jest.fn().mockResolvedValue({}) };
    const controller = new GeocodingController(
      geocoding as unknown as ReverseGeocodingService,
    );

    await controller.reverse(
      {
        latitude: 55.75,
        longitude: 37.61,
        trainingSessionId: "0b6f1c1e-6f3a-4a4e-9a8b-2c5d7e9f1a2b",
      },
      { user: { sub: "operator-1", role: "operator" } } as never,
    );

    expect(geocoding.reverse).toHaveBeenCalledWith(
      { latitude: 55.75, longitude: 37.61 },
      {
        userId: "operator-1",
        role: "operator",
        trainingSessionId: "0b6f1c1e-6f3a-4a4e-9a8b-2c5d7e9f1a2b",
      },
    );
  });

  it("accepts a call id only in the form sessions are issued", () => {
    const query = { latitude: "55.75", longitude: "37.61" };

    expect(ReverseGeocodeQuerySchema.safeParse(query).success).toBe(true);
    expect(
      ReverseGeocodeQuerySchema.safeParse({
        ...query,
        trainingSessionId: "not-a-session",
      }).success,
    ).toBe(false);
  });
});
