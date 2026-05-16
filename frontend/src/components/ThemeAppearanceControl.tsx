import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const options = [
  { value: "light" as const, label: "Light", Icon: Sun },
  { value: "dark" as const, label: "Dark", Icon: Moon },
  { value: "system" as const, label: "System", Icon: Monitor }
];

type Props = {
  className?: string;
};

export function ThemeAppearanceControl({ className }: Props) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      className={cn("inline-flex flex-nowrap items-center gap-1.5 sm:gap-2", className)}
      role="group"
      aria-label="Color theme"
    >
      {options.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant={theme === value ? "default" : "outline"}
          size="sm"
          className="h-8 shrink-0 gap-1 rounded-xl px-2.5 text-xs sm:h-9 sm:gap-1.5 sm:px-3 sm:text-sm"
          onClick={() => setTheme(value)}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">{label}</span>
        </Button>
      ))}
    </div>
  );
}
