export interface GeographicPoint {
  longitude: number;
  latitude: number;
}

/** Build a real geographic circle so its radius remains stable at every zoom. */
export function createCircleZone(point: GeographicPoint, radiusMeters: number) {
  const earthRadiusMeters = 6_371_000;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const latitude = (point.latitude * Math.PI) / 180;
  const longitude = (point.longitude * Math.PI) / 180;
  const coordinates: [number, number][] = [];

  for (let step = 0; step <= 64; step += 1) {
    const bearing = (step / 64) * Math.PI * 2;
    const pointLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) -
          Math.sin(latitude) * Math.sin(pointLatitude),
      );

    coordinates.push([
      (pointLongitude * 180) / Math.PI,
      (pointLatitude * 180) / Math.PI,
    ]);
  }

  return {
    type: "Feature" as const,
    properties: { radiusMeters },
    geometry: {
      type: "Polygon" as const,
      coordinates: [coordinates],
    },
  };
}
