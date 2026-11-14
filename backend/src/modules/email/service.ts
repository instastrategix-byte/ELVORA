import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@backend/core/env";
import { logger } from "@backend/core/logger";

export type EmailMessage = { to: string; subject: string; text: string; html?: string };
export type EmailResult = { status: "sent"; id: string } | { status: "skipped"; reason: string } | { status: "failed" };

interface EmailProvider {
  send(message: EmailMessage): Promise<EmailResult>;
}

class ResendProvider implements EmailProvider {
  constructor(private readonly client: Resend, private readonly from: string) {}
  async send(message: EmailMessage): Promise<EmailResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    if (error || !data) {
      logger.error("email.send_failed", { provider: "resend", error: error?.name });
      return { status: "failed" };
    }
    return { status: "sent", id: data.id };
  }
}

/** Development provider: records that an email WOULD be sent. It never reports "sent". */
class LogProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<EmailResult> {
    logger.info("email.skipped", { provider: "log", subjectLength: message.subject.length });
    return { status: "skipped", reason: "EMAIL_PROVIDER=log" };
  }
}

let provider: EmailProvider | undefined;

function getProvider(): EmailProvider {
  if (provider) return provider;
  const env = serverEnv();
  provider = env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY ? new ResendProvider(new Resend(env.RESEND_API_KEY), env.EMAIL_FROM) : new LogProvider();
  return provider;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  try {
    return await getProvider().send(message);
  } catch (error) {
    logger.error("email.error", { error });
    return { status: "failed" };
  }
}
