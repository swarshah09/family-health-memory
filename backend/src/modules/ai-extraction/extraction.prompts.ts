import type { FamilyMemberContext } from "./extraction.types.js";

const SELF_TOKEN = "__self__";

export function buildExtractionSystemInstruction(): string {
  return `You extract structured health observations from short family caregiver messages.
You are not a chatbot. Do not greet, advise, diagnose, prescribe, or recommend treatment.
Output strict JSON only, matching the required schema.
Use calm, observational language in string values.
If uncertain, use lower confidence, empty arrays where appropriate, observationType UNKNOWN, and mentionedPerson null.
Never claim medical certainty.`;
}

export function buildExtractionUserPrompt(params: {
  messageText: string;
  senderDisplayName: string;
  senderUserId: string;
  familyMembers: FamilyMemberContext[];
}): string {
  const roster = params.familyMembers.map((m) => ({
    profileId: m.id,
    name: m.name,
    relationship: m.relationship,
    isSenderProfile: m.linkedUserId === params.senderUserId
  }));

  return `Sender: ${params.senderDisplayName} (userId: ${params.senderUserId})

Family health profiles (use exact "name" when the message clearly refers to someone):
${JSON.stringify(roster, null, 2)}

Person resolution rules:
- First-person without naming someone else → mentionedPerson "${SELF_TOKEN}" (maps to sender's own profile when they have one).
- "Dad", "Mom", or a listed name → that person's exact "name" from the roster.
- Unclear who it is about → mentionedPerson null.

Observation type rules:
- SELF_OBSERVATION: sender describes their own state.
- CAREGIVER_OBSERVATION: sender describes someone else's state.
- MEDICATION_UPDATE: meds taken, missed, dose, refill.
- GENERAL_UPDATE: routine wellness note without clear symptom.
- UNKNOWN: cannot classify.

Extract only what is explicitly stated or plainly implied. Do not invent symptoms or medications.

Message:
"""${params.messageText.replace(/"/g, '\\"')}"""`;
}

export { SELF_TOKEN };
