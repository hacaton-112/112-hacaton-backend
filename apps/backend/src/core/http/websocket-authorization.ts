import type { IncomingMessage } from "node:http";

/** Bearer-token из HTTP-заголовка или браузерных WebSocket subprotocols. */
export function websocketAuthorization(
  request?: IncomingMessage,
): string | undefined {
  if (request?.headers.authorization) return request.headers.authorization;
  const protocols = request?.headers["sec-websocket-protocol"]
    ?.split(",")
    .map((value) => value.trim());
  const bearer = protocols?.indexOf("bearer") ?? -1;
  const token = bearer >= 0 ? protocols?.[bearer + 1] : undefined;
  return token ? `Bearer ${token}` : undefined;
}
