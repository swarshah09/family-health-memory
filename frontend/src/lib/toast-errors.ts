import { toast } from "sonner";

/** Short title plus optional supporting line for Sonner. */
export function toastError(title: string, description?: string): void {
  if (description) toast.error(title, { description });
  else toast.error(title);
}

export async function parseResponseErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    const m = data?.message ?? data?.error;
    if (typeof m === "string" && m.trim()) return m.trim();
  } catch {
    /* non-JSON body */
  }
  return undefined;
}

export function httpStatusGuidance(status: number): string | undefined {
  switch (status) {
    case 400:
      return "Please verify the information you entered and try again.";
    case 401:
      return "Your session may have expired. Sign in again, then retry this action.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested item was not found. It may have been removed or the link may be outdated.";
    case 409:
      return "This action conflicts with the current data. Refresh the page and try again.";
    case 413:
      return "The file or payload is too large. Try a smaller upload.";
    case 429:
      return "Too many requests were sent. Please wait a moment and try again.";
    case 502:
    case 503:
    case 504:
      return "The service is temporarily unavailable. Please try again shortly.";
    default:
      if (status >= 500) {
        return "Something went wrong on the server. Please try again in a few moments.";
      }
      return undefined;
  }
}

export function networkFailureDescription(): string {
  return "We could not reach the server. Check your internet connection and confirm the API service is running.";
}

export function isLikelyNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (err.name === "TypeError" && (msg.includes("fetch") || msg.includes("failed to fetch") || msg.includes("load failed"))) {
    return true;
  }
  if (msg.includes("networkerror") || msg.includes("network request failed")) return true;
  return false;
}

/** After a non-OK `fetch` response: show API message or status-based guidance. */
export async function toastFromFailedResponse(
  response: Response,
  title: string,
  extraFallback?: string
): Promise<void> {
  const apiMsg = await parseResponseErrorDetail(response);
  const desc = apiMsg || extraFallback || httpStatusGuidance(response.status) || "Please try again.";
  toastError(title, desc);
}

/** In `catch` blocks: distinguish offline/fetch failures from API `Error` messages. */
export function toastFromCaughtError(err: unknown, title: string, fallbackDescription: string): void {
  if (isLikelyNetworkError(err)) {
    toastError("Connection problem", networkFailureDescription());
    return;
  }
  const detail =
    err instanceof Error && err.message.trim() ? err.message.trim() : fallbackDescription;
  toastError(title, detail);
}

export async function authHttpFailure(
  response: Response,
  mode: "login" | "signup"
): Promise<{ title: string; description: string }> {
  let apiMessage: string | undefined;
  try {
    const j = (await response.json()) as { message?: string };
    if (typeof j?.message === "string" && j.message.trim()) apiMessage = j.message.trim();
  } catch {
    /* ignore */
  }

  if (mode === "login") {
    if (response.status === 401) {
      return {
        title: "Sign-in unsuccessful",
        description:
          apiMessage === "Invalid credentials"
            ? "The email or password you entered does not match our records. Check for typos, or create an account if you are new."
            : apiMessage || "We could not verify your credentials. Try again, or reset your approach if you recently changed your password."
      };
    }
    if (response.status === 400) {
      return {
        title: "Sign-in could not be completed",
        description:
          apiMessage === "Invalid auth payload"
            ? "Use a valid email address and a password with at least six characters."
            : apiMessage || "The sign-in details are not valid. Review your email and password format."
      };
    }
    if (response.status >= 500) {
      return {
        title: "Sign-in temporarily unavailable",
        description: apiMessage || httpStatusGuidance(response.status) || "Please try again shortly."
      };
    }
    return {
      title: "Sign-in unsuccessful",
      description: apiMessage || httpStatusGuidance(response.status) || "We could not complete sign-in. Please try again."
    };
  }

  if (response.status === 409) {
    return {
      title: "This email is already registered",
      description:
        apiMessage === "Email already exists"
          ? "An account with this email already exists. Sign in instead, or use a different email address."
          : apiMessage || "Try signing in with this email, or choose a different address."
    };
  }
  if (response.status === 400) {
    return {
      title: "Account could not be created",
      description:
        apiMessage === "Invalid auth payload"
          ? "Enter your name, a valid email address, and a password with at least six characters."
          : apiMessage || "The registration details are not valid. Review the form and try again."
    };
  }
  if (response.status >= 500) {
    return {
      title: "Registration temporarily unavailable",
      description: apiMessage || httpStatusGuidance(response.status) || "Please try again shortly."
    };
  }
  return {
    title: "Account could not be created",
    description: apiMessage || httpStatusGuidance(response.status) || "We could not complete registration. Please try again."
  };
}

export class AppRequestError extends Error {
  readonly toastTitle: string;
  readonly toastDescription: string;

  constructor(toastTitle: string, toastDescription: string) {
    super(toastTitle);
    this.name = "AppRequestError";
    this.toastTitle = toastTitle;
    this.toastDescription = toastDescription;
  }
}
