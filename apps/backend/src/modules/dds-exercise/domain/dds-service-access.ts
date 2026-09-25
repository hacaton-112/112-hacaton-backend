import { DISPATCH_SERVICES, type DispatchService } from "@/drizzle/schema";

const KNOWN_SERVICES = new Set<string>(DISPATCH_SERVICES);

/**
 * Group service tags predate the DDS module and may contain the short numeric
 * labels used in the training roster. Convert only unambiguous aliases; all
 * other group tags keep their existing assignment semantics.
 */
export function normalizeDdsServiceTag(
  serviceTag: string,
): DispatchService | null {
  const normalized = serviceTag.trim().toLowerCase();
  if (KNOWN_SERVICES.has(normalized)) return normalized as DispatchService;

  const numberedDds = /^(?:dds[-_ ]?)?0?([1-4])$/.exec(normalized);
  return numberedDds ? (`dds_0${numberedDds[1]}` as DispatchService) : null;
}
