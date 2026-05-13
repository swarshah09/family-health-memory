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
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label="Color theme">
      {options.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant={theme === value ? "default" : "outline"}
          size="sm"
          className="gap-1.5 rounded-xl"
          onClick={() => setTheme(value)}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {label}
        </Button>
      ))}
    </div>
  );
}
