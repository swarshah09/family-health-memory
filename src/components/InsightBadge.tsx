interface InsightBadgeProps {
  severity: "info" | "warning" | "alert";
  text: string;
}

export default function InsightBadge({ severity, text }: InsightBadgeProps) {
  const colors = {
    info: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
    alert: "bg-destructive/10 text-destructive",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[severity]}`}>
      {text}
    </span>
  );
}
