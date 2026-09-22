import type { INestApplicationContext } from "@nestjs/common";
import { WsAdapter } from "@nestjs/platform-ws";

export const selectWebSocketProtocol = (
  protocols: Set<string>,
): string | false => {
  const values = [...protocols];
  const bearer = values.indexOf("bearer");
  return bearer >= 0 && Boolean(values[bearer + 1]) ? "bearer" : false;
};

/** Возвращает браузеру только служебный протокол, не отражая JWT в ответе. */
export class AuthenticatedWsAdapter extends WsAdapter {
  constructor(app: INestApplicationContext | object) {
    super(app);
  }

  override create(
    port: number,
    options: Record<string, unknown> & {
      namespace?: string;
      server?: unknown;
      path?: string;
    } = {},
  ): unknown {
    return super.create(port, {
      ...options,
      handleProtocols: selectWebSocketProtocol,
    });
  }
}
