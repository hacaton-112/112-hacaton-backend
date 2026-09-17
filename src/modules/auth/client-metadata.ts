import type { FastifyRequest } from "fastify";

import type { ClientMetadata } from "./auth-session.service";

/** Bounds a trivial storage-inflation vector through an oversized header. */
const MAX_USER_AGENT_LENGTH = 256;

/** Longest possible textual IPv6 address, including an IPv4 suffix. */
const MAX_IP_ADDRESS_LENGTH = 45;

const normalise = (
  value: string | undefined,
  maxLength: number,
): string | null => {
  const trimmed = value?.trim() ?? "";

  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength);
};

/**
 * Session metadata for incident review only — it is never used to authorise a
 * request, because a desktop client legitimately roams between networks.
 *
 * `trustProxy` deliberately remains disabled, so behind a reverse proxy this
 * records the proxy's address rather than trusting a caller-controlled header.
 */
export const readClientMetadata = (
  request: Pick<FastifyRequest, "headers" | "ip">,
): ClientMetadata => ({
  userAgent: normalise(request.headers["user-agent"], MAX_USER_AGENT_LENGTH),
  ipAddress: normalise(request.ip, MAX_IP_ADDRESS_LENGTH),
});
