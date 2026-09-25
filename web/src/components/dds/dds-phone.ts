import type { DdsCrewHandoff } from "../../contracts/dds-exercise";

export const normalizeDialedNumber = (value: string): string =>
  value.replace(/\D/gu, "").slice(0, 6);

export const isOfferedCrewNumber = (
  handoff: DdsCrewHandoff,
  value: string,
): boolean => handoff.crews.some(({ phoneNumber }) => phoneNumber === value);
