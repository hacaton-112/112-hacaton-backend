# Самодостаточный образ карты для боевого сервера: архив тайлов, стили,
# sprites и glyphs внутри. Контекст собирает scripts/build-map-image.ts.
# /data в базовом образе объявлен томом, поэтому данные лежат в /map.
FROM maptiler/tileserver-gl:v5.6.0
COPY --chown=node:node . /map
CMD ["-c", "/map/config.json"]
