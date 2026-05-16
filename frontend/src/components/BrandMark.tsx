import { cn } from "@/lib/utils";

export const BRAND_NAME = "FamPulse";
export const BRAND_TAGLINE = "AI-powered family health memory";

type BrandMarkProps = {
  className?: string;
  /** Hide tagline on small screens */
  compact?: boolean;
  /** For dark tinted panels (auth hero) */
  onDark?: boolean;
};

export default function BrandMark({ className, compact, onDark }: BrandMarkProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5 sm:gap-3", className)}>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold shadow-sm sm:h-10 sm:w-10",
          onDark
            ? "border border-white/25 bg-white/10 text-white backdrop-blur-sm"
            : "bg-primary text-primary-foreground"
        )}
        aria-hidden
      >
        F
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "font-serif-display truncate text-lg font-semibold leading-tight tracking-tight sm:text-xl",
            onDark ? "text-white" : "text-foreground"
          )}
        >
          {BRAND_NAME}
        </span>
        <span
          className={cn(
            "mt-0.5 block truncate text-xs",
            onDark ? "text-white/75" : "text-muted-foreground",
            compact && "hidden sm:block"
          )}
        >
          {BRAND_TAGLINE}
        </span>
      </span>
    </span>
  );
}
