import { logger } from "../../config/logger";

/**
 * SMS gateway abstraction (build brief Section 10). The real provider
 * (MSG91 / Twilio / ...) is decided closer to production; swapping it in
 * means adding one class here and changing getSmsProvider() — nothing else.
 */
export interface SmsProvider {
  sendSms(phone: string, message: string): Promise<void>;
}

/** Dev stub: "sends" the SMS by logging it. */
export class ConsoleSmsProvider implements SmsProvider {
  async sendSms(phone: string, message: string): Promise<void> {
    logger.info({ phone, message }, "[ConsoleSmsProvider] SMS (dev stub — not actually sent)");
  }
}

let provider: SmsProvider | undefined;

export function getSmsProvider(): SmsProvider {
  if (!provider) {
    provider = new ConsoleSmsProvider();
  }
  return provider;
}
