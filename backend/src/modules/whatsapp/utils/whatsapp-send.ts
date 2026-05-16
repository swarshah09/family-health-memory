import { getWhatsAppEnvConfig, isWhatsAppConfigured } from "./whatsapp-env.js";

/**
 * Sends a one-time verification code via WhatsApp Cloud API (linking only — not health ingestion).
 */
export async function sendWhatsAppVerificationCode(
  toE164: string,
  code: string
): Promise<{ sent: boolean; devFallback?: boolean }> {
  const { accessToken, phoneNumberId } = getWhatsAppEnvConfig();

  if (!isWhatsAppConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[whatsapp-link] Dev code for ${toE164}: ${code}`);
      return { sent: true, devFallback: true };
    }
    return { sent: false };
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
    console.error("[whatsapp-link] send failed", res.status, errText);
    return { sent: false };
  }

  return { sent: true };
}
