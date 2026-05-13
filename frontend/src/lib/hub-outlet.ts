import { useOutletContext } from "react-router-dom";

export type AppHubOutletContext = { hub: "health" | "family" | "insights" | "you" };

export function useAppHub(): AppHubOutletContext | undefined {
  return useOutletContext<AppHubOutletContext | undefined>();
}
