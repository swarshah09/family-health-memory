import { getWhatsAppEnvConfig, isWhatsAppConfigured } from "./whatsapp-env.js";

export type WhatsAppSendVerificationResult = {
  sent: boolean;
  devFallback?: boolean;
  /** Meta error code when send failed (e.g. 131030 = not on test recipient list) */
  metaErrorCode?: number;
  metaErrorMessage?: string;
};

function parseMetaError(body: string): { code?: number; message?: string } {
  try {
    const json = JSON.parse(body) as {
      error?: { code?: number; message?: string };
    };
    return {
      code: json.error?.code,
      message: json.error?.message
    };
  } catch {
    return {};
  }
}

function allowDevCodeFallback(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.WHATSAPP_DEV_CODE_FALLBACK === "true"
  );
}

/**
 * Sends a one-time verification code via WhatsApp Cloud API (linking only — not health ingestion).
 */
export async function sendWhatsAppVerificationCode(
  toE164: string,
  code: string
): Promise<WhatsAppSendVerificationResult> {
  const { accessToken, phoneNumberId } = getWhatsAppEnvConfig();

  if (!isWhatsAppConfigured()) {
    if (allowDevCodeFallback()) {
      console.info(`[whatsapp-link] Dev code for ${toE164}: ${code}`);
      return { sent: true, devFallback: true };
    }
    return { sent: false, metaErrorMessage: "WhatsApp API is not configured" };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: toE164.replace(/^\+/, ""),
    type: "text",
    text: {
      body: `Your FamPulse verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this message.`
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const { code: metaErrorCode, message: metaErrorMessage } = parseMetaError(errText);
    console.error("[whatsapp-link] send failed", res.status, errText);

    if (allowDevCodeFallback()) {
      console.info(
        `[whatsapp-link] Dev fallback code for ${toE164}: ${code}` +
          (metaErrorCode ? ` (Meta ${metaErrorCode})` : "")
      );
      return { sent: true, devFallback: true, metaErrorCode, metaErrorMessage };
    }

    return { sent: false, metaErrorCode, metaErrorMessage };
  }

  return { sent: true };
}
