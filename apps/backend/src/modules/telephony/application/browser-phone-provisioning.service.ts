import { createHmac } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import {
  AppConflictException,
  AppServiceUnavailableException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import type { BrowserPhoneConfig } from "../dto/telephony.dto";
import { DrizzleTelephonyDirectory } from "../infrastructure/drizzle-telephony.directory";
import {
  TELEPHONY_CONFIG,
  type TelephonyConfig,
} from "../infrastructure/telephony.config";

/**
 * A browser receives only the credential of its assigned workstation.
 * The PBX renders the same HMAC-derived password, while the master secret
 * remains in backend/Asterisk environment variables.
 */
export const deriveBrowserPhonePassword = (
  passwordMaster: string,
  extension: string,
): string =>
  createHmac("sha256", passwordMaster).update(extension).digest("hex");

@Injectable()
export class BrowserPhoneProvisioningService {
  constructor(
    @Inject(TELEPHONY_CONFIG) private readonly config: TelephonyConfig,
    private readonly directory: DrizzleTelephonyDirectory,
  ) {}

  async get(operatorId: string): Promise<BrowserPhoneConfig> {
    if (!this.config.enabled || !this.config.browserPhone.enabled) {
      throw new AppServiceUnavailableException(
        ErrorCodes.TELEPHONY_BROWSER_PHONE_UNAVAILABLE,
        "Browser phone is not enabled",
      );
    }

    const extension = await this.directory.findWorkstationExtension(operatorId);
    if (!extension) {
      throw new AppConflictException(
        ErrorCodes.TELEPHONY_WORKSTATION_REQUIRED,
        "Bind a SIP workstation to the operator before opening the phone",
      );
    }
    if (!this.config.browserPhone.extensions.includes(extension)) {
      throw new AppConflictException(
        ErrorCodes.TELEPHONY_BROWSER_PHONE_UNAVAILABLE,
        "The assigned workstation is not enabled for browser WebRTC",
      );
    }

    return {
      extension,
      aor: `sip:${extension}@${this.config.browserPhone.sipDomain}`,
      websocketUrl: this.config.browserPhone.websocketUrl,
      authorizationUsername: extension,
      authorizationPassword: deriveBrowserPhonePassword(
        this.config.browserPhone.passwordMaster,
        extension,
      ),
      displayName: `DDS ${extension}`,
    };
  }
}
