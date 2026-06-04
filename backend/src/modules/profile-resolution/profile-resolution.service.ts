import { SELF_TOKEN } from "../ai-extraction/extraction.prompts.js";
import { ProfileResolutionResultModel } from "./models/profile-resolution-result.model.js";
import {
  buildSelfCandidate,
  findSenderLinkedProfile,
  matchByExactName,
  pickSingleCandidate,
  scanNameReferencesInText,
  scanRelationshipReferences,
  suggestsSelfObservation,
  type ProfileCandidate
} from "./profile-matching.utils.js";
import {
  MIN_ASSIGNMENT_CONFIDENCE,
  ProfileResolutionResultSchema,
  type ProfileResolutionInput,
  type ProfileResolutionPersisted,
  type ProfileResolutionResult,
  type ResolutionType
} from "./profile-resolution.types.js";

function logResolution(msg: string, fields: Record<string, unknown>): void {
  console.info(`[profile-resolution] ${msg}`, { scope: "profile-resolution", ...fields });
}

function combineConfidence(extractionConfidence: number, base: number): number {
  const e = Math.min(1, Math.max(0, extractionConfidence));
  return Math.min(1, Math.max(0, base * (0.55 + e * 0.45)));
}

function toResolutionType(kind: ProfileCandidate["matchKind"]): ResolutionType {
  switch (kind) {
    case "self":
      return "SELF";
    case "relationship":
      return "FAMILY_REFERENCE";
    case "name":
    case "name_in_text":
      return "NAME_REFERENCE";
    default:
      return "UNRESOLVED";
  }
}

function candidateToResult(
  candidate: ProfileCandidate,
  extractionConfidence: number
): ProfileResolutionResult {
  const confidence = combineConfidence(extractionConfidence, candidate.baseConfidence);
  if (confidence < MIN_ASSIGNMENT_CONFIDENCE) {
    return unresolved(["below_confidence_threshold", candidate.term]);
  }

  return ProfileResolutionResultSchema.parse({
    resolvedProfileId: candidate.profileId,
    resolutionType: toResolutionType(candidate.matchKind),
    confidence,
    matchedTerms: [candidate.term]
  });
}

function unresolved(terms: string[]): ProfileResolutionResult {
  return ProfileResolutionResultSchema.parse({
    resolvedProfileId: null,
    resolutionType: "UNRESOLVED",
    confidence: 0,
    matchedTerms: terms.slice(0, 16)
  });
}

/**
 * Resolves which family health profile owns an observation (conservative).
 */
export class ProfileResolutionService {
  resolve(input: ProfileResolutionInput): ProfileResolutionResult {
    const { extraction, rawText, senderUserId, familyMembers, extractionConfidence } = input;
    const text = rawText.trim();
    const senderProfile = findSenderLinkedProfile(familyMembers, senderUserId);

    // 1. AI-extracted explicit name (highest trust when unique)
    if (extraction.mentionedPerson && extraction.mentionedPerson !== SELF_TOKEN) {
      const byName = matchByExactName(extraction.mentionedPerson, familyMembers);
      if (byName) {
        return candidateToResult(byName, extractionConfidence);
      }
      return unresolved(["ai_mentioned_unknown_person", extraction.mentionedPerson]);
    }

    // 2. AI explicit self
    if (extraction.mentionedPerson === SELF_TOKEN) {
      if (senderProfile) {
        return candidateToResult(buildSelfCandidate(senderProfile, SELF_TOKEN), extractionConfidence);
      }
      return unresolved(["no_sender_linked_profile"]);
    }

    // 3. Observation type strongly implies self + language supports it
    if (
      extraction.observationType === "SELF_OBSERVATION" &&
      senderProfile &&
      (suggestsSelfObservation(text) || !text.length)
    ) {
      return candidateToResult(buildSelfCandidate(senderProfile, "self_observation"), extractionConfidence);
    }

    // 4. Relationship terms in raw text (dad, mom, …)
    const relCandidates = scanRelationshipReferences(text, familyMembers);
    const relPick = pickSingleCandidate(relCandidates);
    if (relPick) {
      return candidateToResult(relPick, extractionConfidence);
    }
    if (relCandidates.length > 1) {
      return unresolved(relCandidates.map((c) => c.term));
    }

    // 5. Full name appears in text
    const nameCandidates = scanNameReferencesInText(text, familyMembers);
    const namePick = pickSingleCandidate(nameCandidates);
    if (namePick) {
      return candidateToResult(namePick, extractionConfidence);
    }
    if (nameCandidates.length > 1) {
      return unresolved(nameCandidates.map((c) => c.term));
    }

    // 6. Caregiver note with self language only
    if (senderProfile && suggestsSelfObservation(text)) {
      return candidateToResult(buildSelfCandidate(senderProfile, "self_language"), extractionConfidence);
    }

    // 7. Medication/general with no person cue — do not guess
    if (
      extraction.observationType === "MEDICATION_UPDATE" ||
      extraction.observationType === "GENERAL_UPDATE"
    ) {
      return unresolved(["ambiguous_general_update"]);
    }

    return unresolved(["no_resolution_signal"]);
  }

  async resolveAndStore(input: ProfileResolutionInput): Promise<ProfileResolutionPersisted> {
    const existing = await ProfileResolutionResultModel.findOne({
      messageId: input.messageId
    }).lean();
    if (existing) {
      return {
        resolutionId: existing._id.toString(),
        messageId: existing.messageId,
        resolvedProfileId: existing.resolvedProfileId ?? null,
        resolutionType: existing.resolutionType as ResolutionType,
        confidence: existing.confidence,
        matchedTerms: (existing.matchedTerms as string[]) || [],
        createdAt: existing.createdAt?.toISOString() || new Date().toISOString()
      };
    }

    const result = this.resolve(input);

    const doc = await ProfileResolutionResultModel.create({
      messageId: input.messageId,
      resolvedProfileId: result.resolvedProfileId,
      confidence: result.confidence,
      matchedTerms: result.matchedTerms,
      resolutionType: result.resolutionType
    });

    logResolution(result.resolvedProfileId ? "resolved" : "unresolved", {
      messageId: input.messageId,
      type: result.resolutionType,
      profileId: result.resolvedProfileId ?? undefined,
      confidence: result.confidence,
      terms: result.matchedTerms
    });

    return {
      resolutionId: doc._id.toString(),
      messageId: input.messageId,
      resolvedProfileId: result.resolvedProfileId,
      resolutionType: result.resolutionType,
      confidence: result.confidence,
      matchedTerms: result.matchedTerms,
      createdAt: doc.createdAt.toISOString()
    };
  }

  async getByMessageId(messageId: string): Promise<ProfileResolutionPersisted | null> {
    const row = await ProfileResolutionResultModel.findOne({ messageId }).lean();
    if (!row) return null;
    return {
      resolutionId: row._id.toString(),
      messageId: row.messageId,
      resolvedProfileId: row.resolvedProfileId ?? null,
      resolutionType: row.resolutionType as ResolutionType,
      confidence: row.confidence,
      matchedTerms: (row.matchedTerms as string[]) || [],
      createdAt: row.createdAt?.toISOString() || new Date().toISOString()
    };
  }

  async listUnresolved(familyId: string, limit = 50): Promise<ProfileResolutionPersisted[]> {
    void familyId;
    void limit;
    // Family-scoped listing will join via whatsapp_messages in a later review UI phase.
    const rows = await ProfileResolutionResultModel.find({ resolutionType: "UNRESOLVED" })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return rows.map((row) => ({
      resolutionId: row._id.toString(),
      messageId: row.messageId,
      resolvedProfileId: null,
      resolutionType: "UNRESOLVED",
      confidence: row.confidence,
      matchedTerms: (row.matchedTerms as string[]) || [],
      createdAt: row.createdAt?.toISOString() || new Date().toISOString()
    }));
  }
}

export const profileResolutionService = new ProfileResolutionService();
