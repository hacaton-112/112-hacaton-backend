/** Минимальное описание fontkit: по нему тест проверяет, какие символы покрывает шрифт отчётов. */
declare module "fontkit" {
  export interface Glyph {
    id: number;
  }
  export interface Font {
    glyphForCodePoint(codePoint: number): Glyph;
  }
  export function openSync(path: string): Font;
}
