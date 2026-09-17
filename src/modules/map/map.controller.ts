import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Req,
  StreamableFile,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";

import { ApiRoutes } from "@/contracts";

import {
  MapTileService,
  type MapStyleSpecification,
} from "./application/map-tile.service";

@SkipThrottle({ short: true, medium: true, long: true })
@Controller(ApiRoutes.Map)
export class MapController {
  constructor(private readonly mapTileService: MapTileService) {}

  /**
   * Возвращает спецификацию стиля MapLibre GL со ссылкой на локальные растровые тайлы.
   */
  @Get("style.json")
  @Header("Content-Type", "application/json")
  @Header("Cache-Control", "public, max-age=3600")
  @Header("Access-Control-Allow-Origin", "*")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  getStyle(@Req() req: Request): MapStyleSpecification {
    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : (forwardedProto ?? req.protocol ?? "http");
    const host = req.get("host") ?? "127.0.0.1:3000";
    return this.mapTileService.getStyle(`${protocol}://${host}`);
  }

  /**
   * Отдаёт растровый тайл из MinIO (или нейтральный тёмный тайл при отсутствии).
   */
  @Get("tiles/:z/:x/:y.png")
  @SkipThrottle()
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("Access-Control-Allow-Origin", "*")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  async getTile(
    @Param("z", ParseIntPipe) z: number,
    @Param("x", ParseIntPipe) x: number,
    @Param("y", ParseIntPipe) y: number,
  ): Promise<StreamableFile> {
    const tileBytes = await this.mapTileService.getTile(z, x, y);
    return new StreamableFile(Buffer.from(tileBytes));
  }
}
