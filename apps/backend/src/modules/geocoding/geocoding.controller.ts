import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
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

  /**
   * Адрес по точке на карте.
   *
   * Преподаватель спрашивает его в конструкторе сценария, оператор — только
   * в своём идущем звонке, передав его учебную сессию.
   */
  @Get("reverse")
  @Roles("operator", "instructor", "admin")
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  @ZodSerializerDto(ReverseGeocodedAddressDto)
  reverse(
    @Query() query: ReverseGeocodeQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReverseGeocodedAddressResponse> {
    return this.geocoding.reverse(
      { latitude: query.latitude, longitude: query.longitude },
      {
        userId: request.user.sub,
        role: request.user.role,
        trainingSessionId: query.trainingSessionId,
      },
    );
  }
}
