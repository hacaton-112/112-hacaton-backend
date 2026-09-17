import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request, Response } from "express";

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
   * Возвращает спецификацию стиля MapLibre GL со ссылкой на локальные векторные тайлы, спрайты и шрифты.
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
   * Отдаёт векторный тайл .mvt из MinIO (или нейтральный пустой тайл при отсутствии).
   */
  @Get("tiles/:z/:x/:y.mvt")
  @SkipThrottle()
  @Header("Content-Type", "application/x-protobuf")
  @Header("Content-Encoding", "gzip")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("Access-Control-Allow-Origin", "*")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  async getVectorTile(
    @Param("z", ParseIntPipe) z: number,
    @Param("x", ParseIntPipe) x: number,
    @Param("y", ParseIntPipe) y: number,
  ): Promise<StreamableFile> {
    const tileBytes = await this.mapTileService.getTile(z, x, y, "mvt");
    return new StreamableFile(Buffer.from(tileBytes));
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
    const tileBytes = await this.mapTileService.getTile(z, x, y, "png");
    return new StreamableFile(Buffer.from(tileBytes));
  }

  /**
   * Отдаёт спрайты для иконок карты (sprite.json / sprite.png).
   */
  @Get("sprites/:file")
  @SkipThrottle()
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("Access-Control-Allow-Origin", "*")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  getSprite(
    @Param("file") file: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const sprite = this.mapTileService.getSprite(file);
    if (!sprite) {
      throw new NotFoundException(`Sprite ${file} not found`);
    }
    res.setHeader("Content-Type", sprite.contentType);
    return new StreamableFile(sprite.data);
  }

  /**
   * Отдаёт векторные шрифты PBF для отрисовки надписей на карте.
   */
  @Get("fonts/:fontstack/:range")
  @SkipThrottle()
  @Header("Content-Type", "application/x-protobuf")
  @Header("Content-Encoding", "gzip")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("Access-Control-Allow-Origin", "*")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  async getFont(
    @Param("fontstack") fontstack: string,
    @Param("range") range: string,
  ): Promise<StreamableFile> {
    const font = await this.mapTileService.getFont(fontstack, range);
    if (!font) {
      throw new NotFoundException(`Font ${fontstack}/${range} not found`);
    }
    return new StreamableFile(font.data);
  }
}
