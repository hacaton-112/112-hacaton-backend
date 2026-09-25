const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export interface AuditLogPeriod {
  since: Date | null;
  until: Date | null;
}

export const auditLogPeriod = (
  from?: string,
  to?: string,
): AuditLogPeriod => {
  const since = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const until = to
    ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + MILLISECONDS_PER_DAY)
    : null;

  if (since && until && since.getTime() >= until.getTime()) {
    throw new RangeError("Audit period ends before it starts");
  }

  return { since, until };
};

export const auditEntryHasError = (
  action: string,
  details: Record<string, unknown> | null,
): boolean =>
  action.endsWith(".failed") ||
  details?.error !== undefined ||
  details?.errorCode !== undefined;
