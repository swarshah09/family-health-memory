/** User-facing labels — never expose raw severity enum strings in UI. */
export function gentleReminderImportance(severity: "info" | "warning" | "alert"): string {
  if (severity === "alert") return "Needs attention";
  if (severity === "warning") return "Worth a look";
  return "Heads-up";
}
