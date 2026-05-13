import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem storageKey="fhm-ui-theme" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
