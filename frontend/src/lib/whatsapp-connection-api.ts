import { authStorage } from "@/lib/auth-storage";
import { AppRequestError, parseResponseErrorDetail } from "@/lib/toast-errors";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export type WhatsAppConnectionStatus = {
  connectionId?: string;
  connected: boolean;
  pendingVerification: boolean;
  whatsappPhoneNumber?: string;
  phonePending?: string;
  verifiedAt?: string;
};

async function whatsappFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authStorage.getAccessToken();
  if (!token) {
    throw new AppRequestError("Sign in required", "Your session has ended. Sign in again to continue.");
  }

  const res = await fetch(`${API_BASE_URL}/api/whatsapp${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });

  if (!res.ok) {
    const detail = await parseResponseErrorDetail(res);
    throw new AppRequestError(
      detail || "Something went wrong",
      detail || "Please try again in a moment."
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function fetchWhatsAppConnectionStatus(): Promise<WhatsAppConnectionStatus> {
  return whatsappFetch<WhatsAppConnectionStatus>("/connection/status");
}

export function initiateWhatsAppConnect(phoneNumber: string): Promise<{
  status: WhatsAppConnectionStatus;
  message: string;
  devCode?: string;
}> {
  return whatsappFetch("/connect/initiate", {
    method: "POST",
    body: JSON.stringify({ phoneNumber })
  });
}

export function verifyWhatsAppConnect(code: string): Promise<{
  status: WhatsAppConnectionStatus;
  message: string;
}> {
  return whatsappFetch("/connect/verify", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function disconnectWhatsApp(): Promise<void> {
  return whatsappFetch<void>("/connect", { method: "DELETE" });
}
