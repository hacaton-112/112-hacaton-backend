import {
  addressFromTileFeatures,
  distanceMeters,
  tileForPoint,
  tilePointToGeo,
  tileWithNeighbours,
} from "./tile-address";

const MOSCOW = { latitude: 55.7558, longitude: 37.6173 };

describe("адрес по тайлам карты", () => {
  it("находит квадрат карты и возвращается из него к тем же координатам", () => {
    const tile = tileForPoint(MOSCOW, 14);

    expect(tile).toEqual({ z: 14, x: 9904, y: 5121 });
    // Обратный перевод по центру квадрата попадает внутрь того же квадрата.
    expect(tileForPoint(tilePointToGeo(tile, 2048, 2048, 4096), 14)).toEqual(
      tile,
    );
  });

  it("берёт соседние квадраты и не выходит за край карты", () => {
    expect(tileWithNeighbours({ z: 14, x: 9904, y: 5121 })).toHaveLength(9);
    // В углу карты соседей меньше: за её пределами квадратов нет.
    expect(tileWithNeighbours({ z: 1, x: 0, y: 0 })).toHaveLength(4);
  });

  it("считает расстояние между точками", () => {
    const north = { latitude: 55.7648, longitude: 37.6173 };

    expect(distanceMeters(MOSCOW, north)).toBeGreaterThan(900);
    expect(distanceMeters(MOSCOW, north)).toBeLessThan(1_100);
    expect(distanceMeters(MOSCOW, MOSCOW)).toBe(0);
  });

  it("складывает адрес из ближайшего дома, улицы и города", () => {
    const address = addressFromTileFeatures(MOSCOW, {
      houses: [
        { name: "12", point: { latitude: 55.7558, longitude: 37.6174 } },
        { name: "40", point: { latitude: 55.7578, longitude: 37.6174 } },
      ],
      streets: [{ name: "Тверская улица", point: MOSCOW }],
      places: [{ name: "Москва", point: { latitude: 55.75, longitude: 37.62 } }],
    });

    expect(address).toMatchObject({
      city: "Москва",
      street: "Тверская улица",
      house: "12",
      displayName: "Москва, Тверская улица, д. 12",
    });
  });

  it("не приписывает дом, который стоит слишком далеко", () => {
    const address = addressFromTileFeatures(MOSCOW, {
      houses: [{ name: "7", point: { latitude: 55.77, longitude: 37.63 } }],
      streets: [{ name: "Тверская улица", point: MOSCOW }],
      places: [],
    });

    expect(address).toMatchObject({
      house: undefined,
      displayName: "Тверская улица",
    });
  });

  it("возвращает пусто, когда рядом ничего нет", () => {
    expect(
      addressFromTileFeatures(MOSCOW, {
        houses: [],
        streets: [],
        places: [],
      }),
    ).toBeNull();
  });
});
