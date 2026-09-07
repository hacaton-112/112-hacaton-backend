export interface CityPreset {
  id: string;
  name: string;
  center: [longitude: number, latitude: number];
  zoom: number;
}

/**
 * Пока в системе один город. Когда появится справочник городов на бэкенде,
 * пресет заменится записью из него — форма объекта совпадает.
 */
export const MOSCOW: CityPreset = {
  id: "moscow",
  name: "Москва",
  center: [37.6173, 55.7558],
  zoom: 10.5,
};

export const CITY_PRESETS: readonly CityPreset[] = [MOSCOW];

/** Зум, на который карта приближается после определения адреса вызова. */
export const INCIDENT_ZOOM = 15.5;
