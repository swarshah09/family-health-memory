export type MemorySearchCitation = {
  logId: string;
  memberId: string;
  memberName: string;
  occurredAt: string;
  excerpt: string;
  rationale?: string;
};

export type MemorySearchResult = {
  answer: string;
  citations: MemorySearchCitation[];
  followUpSuggestions: string[];
  confidence: "high" | "medium" | "low";
  logsConsidered: number;
  modelDisabled?: boolean;
};

export type MemoryChatTurn = { role: "user" | "assistant"; content: string };
