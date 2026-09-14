import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { OPENSTREETMAP_ATTRIBUTION } from "../ports/reverse-geocoder.port";

export const ReverseGeocodeQuerySchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    /** Звонок, в котором оператор отмечает место происшествия. */
    trainingSessionId: z.uuid().optional(),
  })
  .strict();

export class ReverseGeocodeQueryDto extends createZodDto(
  ReverseGeocodeQuerySchema,
) {}

export const ReverseGeocodedAddressSchema = z
  .object({
    city: z.string().trim().min(1).max(200).optional(),
    street: z.string().trim().min(1).max(300).optional(),
    house: z.string().trim().min(1).max(100).optional(),
    displayName: z.string().trim().min(1).max(4_000),
    attribution: z.literal(OPENSTREETMAP_ATTRIBUTION),
  })
  .strict();

export class ReverseGeocodedAddressDto extends createZodDto(
  ReverseGeocodedAddressSchema,
) {}

export type ReverseGeocodedAddressResponse = z.infer<
  typeof ReverseGeocodedAddressSchema
>;
