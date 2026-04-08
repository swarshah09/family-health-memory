import { motion } from "framer-motion";

interface InsightBadgeProps {
  severity: "info" | "warning" | "alert";
  text: string;
}

export default function InsightBadge({ severity, text }: InsightBadgeProps) {
  const styles = {
    info: "bg-primary/8 text-primary border-primary/15",
    warning: "bg-warning/8 text-warning border-warning/15",
    alert: "bg-destructive/8 text-destructive border-destructive/15",
  };

  return (
    <motion.span
      className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold border tracking-wide ${styles[severity]}`}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      {severity === "alert" && (
        <motion.span
          className="inline-block h-1.5 w-1.5 rounded-full bg-destructive mr-1"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      {text}
    </motion.span>
  );
}
