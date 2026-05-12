/**
 * Some browser extensions use `chrome.runtime` messaging with `return true` for
 * async replies but tear down before responding. That surfaces as an unhandled
 * rejection ("message channel closed…"). It is not from this app; suppress so
 * the console stays usable while developing.
 */
function messageFromReason(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message ?? "");
  }
  return String(reason ?? "");
}

export function suppressKnownBrowserExtensionRejectionNoise(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("unhandledrejection", (event) => {
    const msg = messageFromReason(event.reason);
    if (
      msg.includes("message channel closed") ||
      msg.includes("A listener indicated an asynchronous response") ||
      msg.includes("Extension context invalidated")
    ) {
      event.preventDefault();
    }
  });
}
