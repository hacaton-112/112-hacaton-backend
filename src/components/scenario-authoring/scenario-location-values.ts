import type { ScenarioSeed } from "../../contracts/scenario-authoring";

export type ScenarioCoordinates = ScenarioSeed["location"]["exactPoint"];

export const hasSelectedCoordinates = ([
  latitude,
  longitude,
]: ScenarioCoordinates): boolean => latitude !== 0 || longitude !== 0;

export const formatCoordinates = (coordinates: ScenarioCoordinates): string =>
  hasSelectedCoordinates(coordinates)
    ? `${coordinates[0].toFixed(6)}, ${coordinates[1].toFixed(6)}`
    : "не выбраны";
