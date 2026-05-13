import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CopyHintProps = {
  /** Accessible name for the help control */
  label: string;
  children: string;
  className?: string;
};

export function CopyHint({ label, children, className }: CopyHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "-m-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground",
            className
          )}
          aria-label={label}
        >
          <CircleHelp className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[min(18rem,calc(100vw-2rem))] text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
