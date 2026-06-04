import type { FamilyMemberContext } from "../ai-extraction/extraction.types.js";
import { SELF_TOKEN } from "../ai-extraction/extraction.prompts.js";

export type ProfileCandidate = {
  profileId: string;
  label: string;
  matchKind: "self" | "name" | "relationship" | "name_in_text";
  term: string;
  baseConfidence: number;
};

/** Relationship terms → patterns matched against profile.relationship (lowercase). */
const RELATIONSHIP_TERMS: Array<{ terms: string[]; patterns: string[] }> = [
  { terms: ["dad", "father", "papa", "pa", "pitaji", "papa ji"], patterns: ["father", "dad"] },
  { terms: ["mom", "mother", "mama", "ma", "mummy", "mum", "mata", "mata ji"], patterns: ["mother", "mom"] },
  { terms: ["wife"], patterns: ["wife", "spouse"] },
  { terms: ["husband"], patterns: ["husband", "spouse"] },
  { terms: ["son", "beta"], patterns: ["son"] },
  { terms: ["daughter", "beti"], patterns: ["daughter"] },
  { terms: ["grandfather", "grandpa", "dada", "nana"], patterns: ["grandfather", "grandpa"] },
  { terms: ["grandmother", "grandma", "dadi", "nani"], patterns: ["grandmother", "grandma"] },
  { terms: ["brother", "bhai"], patterns: ["brother"] },
  { terms: ["sister", "behen", "didi"], patterns: ["sister"] }
];

const SELF_PRONOUN_PATTERN =
  /\b(i|i'm|im|i’ve|i've|myself|me|my)\b/i;

const OTHER_PERSON_PATTERN =
  /\b(dad|father|mom|mother|wife|husband|son|daughter|grandpa|grandma|brother|sister)\b/i;

export function findSenderLinkedProfile(
  members: FamilyMemberContext[],
  senderUserId: string
): FamilyMemberContext | null {
  return members.find((m) => m.linkedUserId === senderUserId) ?? null;
}

export function matchByExactName(
  name: string,
  members: FamilyMemberContext[]
): ProfileCandidate | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized || normalized === SELF_TOKEN || normalized === "self") return null;

  const matches = members.filter((m) => m.name.trim().toLowerCase() === normalized);
  if (matches.length !== 1) return null;

  return {
    profileId: matches[0].id,
    label: matches[0].name,
    matchKind: "name",
    term: matches[0].name,
    baseConfidence: 0.92
  };
}

export function scanRelationshipReferences(
  text: string,
  members: FamilyMemberContext[]
): ProfileCandidate[] {
  const lower = text.toLowerCase();
  const found: ProfileCandidate[] = [];

  for (const group of RELATIONSHIP_TERMS) {
    const termHit = group.terms.find((t) => {
      const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, "i");
      return re.test(lower);
    });
    if (!termHit) continue;

    for (const member of members) {
      const rel = member.relationship.toLowerCase();
      if (group.patterns.some((p) => rel.includes(p))) {
        found.push({
          profileId: member.id,
          label: member.name,
          matchKind: "relationship",
          term: termHit,
          baseConfidence: 0.78
        });
      }
    }
  }

  return dedupeCandidates(found);
}

/** Match roster names appearing as whole words in message text (longest names first). */
export function scanNameReferencesInText(
  text: string,
  members: FamilyMemberContext[]
): ProfileCandidate[] {
  const lower = text.toLowerCase();
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const found: ProfileCandidate[] = [];

  for (const member of sorted) {
    const name = member.name.trim();
    if (name.length < 2) continue;
    const re = new RegExp(`\\b${escapeRegExp(name.toLowerCase())}\\b`, "i");
    if (re.test(lower)) {
      found.push({
        profileId: member.id,
        label: member.name,
        matchKind: "name_in_text",
        term: name,
        baseConfidence: 0.88
      });
    }
  }

  return dedupeCandidates(found);
}

export function suggestsSelfObservation(text: string): boolean {
  if (!SELF_PRONOUN_PATTERN.test(text)) return false;
  if (OTHER_PERSON_PATTERN.test(text)) return false;
  return true;
}

export function buildSelfCandidate(
  senderProfile: FamilyMemberContext,
  term = "self"
): ProfileCandidate {
  return {
    profileId: senderProfile.id,
    label: senderProfile.name,
    matchKind: "self",
    term,
    baseConfidence: 0.9
  };
}

export function dedupeCandidates(candidates: ProfileCandidate[]): ProfileCandidate[] {
  const byId = new Map<string, ProfileCandidate>();
  for (const c of candidates) {
    const existing = byId.get(c.profileId);
    if (!existing || c.baseConfidence > existing.baseConfidence) {
      byId.set(c.profileId, c);
    }
  }
  return [...byId.values()];
}

export function pickSingleCandidate(
  candidates: ProfileCandidate[]
): ProfileCandidate | null {
  const unique = dedupeCandidates(candidates);
  if (unique.length !== 1) return null;
  return unique[0];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
