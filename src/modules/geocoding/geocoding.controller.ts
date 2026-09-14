import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { ReverseGeocodingService } from "./application/reverse-geocoding.service";
import {
  ReverseGeocodedAddressDto,
  type ReverseGeocodedAddressResponse,
  ReverseGeocodeQueryDto,
} from "./dto/reverse-geocode.dto";

@Controller(ApiRoutes.Geocoding)
@UseGuards(JwtAuthGuard, RolesGuard)
export class GeocodingController {
  constructor(private readonly geocoding: ReverseGeocodingService) {}

  @Get("reverse")
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  @ZodSerializerDto(ReverseGeocodedAddressDto)
  reverse(
    @Query() query: ReverseGeocodeQueryDto,
  ): Promise<ReverseGeocodedAddressResponse> {
    return this.geocoding.reverse(query);
  }
}
