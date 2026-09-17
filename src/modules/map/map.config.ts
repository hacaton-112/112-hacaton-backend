import { env } from "@/core/config/env.config";

export interface MapConfig {
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  upstreamUrl: string;
  cacheOnDemand: boolean;
}

export const MAP_CONFIG = Symbol("MAP_CONFIG");

export const createMapConfig = (): MapConfig => ({
  s3Endpoint: env.MAP_TILES_S3_ENDPOINT,
  s3Region: env.MAP_TILES_S3_REGION,
  s3Bucket: env.MAP_TILES_S3_BUCKET,
  s3AccessKeyId:
    env.MAP_TILES_S3_ACCESS_KEY_ID ??
    process.env.MINIO_ROOT_USER ??
    "system112",
  s3SecretAccessKey:
    env.MAP_TILES_S3_SECRET_ACCESS_KEY ??
    process.env.MINIO_ROOT_PASSWORD ??
    "system112secret",
  upstreamUrl: env.MAP_TILES_UPSTREAM_URL,
  cacheOnDemand: env.MAP_CACHE_ON_DEMAND,
});
