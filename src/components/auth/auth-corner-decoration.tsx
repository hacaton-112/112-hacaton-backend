export function AuthCornerDecoration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 420 280"
      preserveAspectRatio="none"
      // Ширина не больше колонки на десктопе: на широком мобильном экране
      // дуги иначе растягивались бы в плоские полосы.
      // Сдвиг на 2px за край: высота в процентах даёт дробный пиксель, и
      // сглаженная последняя строка оставляла тонкий зазор у кромки окна.
      // Лишнее срезает overflow-hidden колонки.
      className="pointer-events-none absolute -right-0.5 -bottom-0.5 h-[42%] min-h-52 w-[min(100%,420px)] select-none"
    >
      <path d="M420 0V280H0C94 153 238 58 420 0Z" fill="var(--accent-a2)" />
      <path
        d="M420 76V280H92C176 184 286 116 420 76Z"
        fill="var(--accent-a3)"
      />
      <path
        d="M420 156V280H210C269 221 338 181 420 156Z"
        fill="var(--accent-a4)"
      />
    </svg>
  );
}
