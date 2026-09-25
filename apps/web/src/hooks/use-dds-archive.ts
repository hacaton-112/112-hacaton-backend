import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type { DdsArchiveFilter } from "../contracts/dds-archive";
import { ddsArchiveService } from "../services/dds-archive.service";

/**
 * Страница архива.
 *
 * `keepPreviousData` оставляет таблицу заполненной, пока грузится следующая
 * страница: иначе перелистывание мигало бы пустотой на каждом шаге.
 */
export const useDdsArchive = (filter: DdsArchiveFilter) =>
  useQuery({
    queryKey: QUERY_KEYS.ddsArchive(filter),
    queryFn: () => ddsArchiveService.search(filter),
    placeholderData: keepPreviousData,
  });
