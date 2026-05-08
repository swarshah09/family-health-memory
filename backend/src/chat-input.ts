import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractorService } from "./ai-pipeline/extractorService.js";
import { ChatContextModel, ChatInputModel, FamilyMemberModel, UserModel } from "./models.js";

type ExtractedPayload = {
  person: string | null;
  personId: string | null;
  symptoms: string[];
  severity: "low" | "medium" | "high";
  timestamp: string;
};

function normalize(v: string): string {
  return v.trim().toLowerCase();
}

function buildMemberAliases(members: Array<{ id: string; name: string; relationship: string }>) {
  const aliases = new Map<string, { id: string; label: string }>();
  for (const m of members) {
    aliases.set(normalize(m.name), { id: m.id, label: m.name });
    aliases.set(normalize(m.relationship), { id: m.id, label: m.name });
    const rel = normalize(m.relationship);
    if (rel.includes("father")) aliases.set("dad", { id: m.id, label: m.name });
    if (rel.includes("mother")) aliases.set("mom", { id: m.id, label: m.name });
  }
  return aliases;
}

function fallbackExtract(
  message: string,
  aliases: Map<string, { id: string; label: string }>,
  context: { lastPersonId?: string; lastPersonLabel?: string; lastSymptoms?: string[] }
): ExtractedPayload {
  const text = normalize(message);
  const symptomLexicon = [
    "chest pain",
    "chest tightness",
    "breathlessness",
    "confusion",
    "fainting",
    "dizziness",
    "fatigue",
    "headache",
    "sleep",
    "appetite",
    "back pain"
  ];

  let person: string | null = null;
  let personId: string | null = null;
  for (const [alias, member] of aliases.entries()) {
    if (text.includes(alias)) {
      person = member.label;
      personId = member.id;
      break;
    }
  }

  const ambiguous = /\b(he|she|him|her|they|again|it)\b/.test(text);
  if (!person && ambiguous && context.lastPersonId) {
    person = context.lastPersonLabel || null;
    personId = context.lastPersonId || null;
  }

  let symptoms = symptomLexicon.filter((s) => text.includes(s));
  if (!symptoms.length && /\b(again|same|it)\b/.test(text) && (context.lastSymptoms || []).length) {
    symptoms = context.lastSymptoms || [];
  }

  return {
    person,
    personId,
    symptoms,
    severity: "medium",
    timestamp: new Date().toISOString()
  };
}

export async function ingestChatStyleLog(input: {
  userId: string;
  message: string;
}): Promise<void> {
  const user = await UserModel.findById(input.userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  const familyId = String(user.familyId);
  const message = input.message.trim();
  if (!message) throw new Error("EMPTY_MESSAGE");

  const members = await FamilyMemberModel.find({ familyId }, { _id: 1, name: 1, relationship: 1 });
  const aliases = buildMemberAliases(
    members.map((m) => ({ id: m._id.toString(), name: m.name, relationship: m.relationship }))
  );
  const context = await ChatContextModel.findOne({ userId: input.userId, familyId });
  const knownPeople = [...new Set(members.flatMap((m) => [m.name, m.relationship]))];

  let extracted = fallbackExtract(message, aliases, {
    lastPersonId: context?.lastPersonId || undefined,
    lastPersonLabel: context?.lastPersonLabel || undefined,
    lastSymptoms: context?.lastSymptoms || undefined
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: process.env.GEMINI_MODEL || "gemini-2.0-flash"
      });
      const extractedFromModel = await extractorService({
        model,
        knownPeople,
        logs: [{ id: "chat-input", text: message, occurredAt: new Date().toISOString() }]
      });
      const ev = extractedFromModel.events[0];
      if (ev) {
        const personMatch = aliases.get(normalize(ev.person));
        extracted = {
          person: personMatch?.label || (ev.person === "unknown" ? null : ev.person),
          personId: personMatch?.id || null,
          symptoms: ev.symptoms || [],
          severity: ev.severity,
          timestamp: ev.timestamp
        };
      }
    } catch (error) {
      // Keep endpoint lightweight and resilient; fallback is already prepared.
      console.error("extractorService failed for chat input; using fallback", error);
    }
  }

  const ambiguous = /\b(he|she|him|her|they|again|it)\b/.test(normalize(message));
  if (!extracted.personId && ambiguous && context?.lastPersonId) {
    extracted.personId = context.lastPersonId || null;
    extracted.person = context.lastPersonLabel || extracted.person;
  }
  if ((!extracted.symptoms || extracted.symptoms.length === 0) && ambiguous && (context?.lastSymptoms || []).length) {
    extracted.symptoms = context?.lastSymptoms || [];
  }

  await ChatInputModel.create({
    familyId,
    userId: input.userId,
    rawText: message,
    extractedData: extracted,
    timestamp: new Date()
  });

  await ChatContextModel.updateOne(
    { userId: input.userId, familyId },
    {
      $set: {
        lastPersonId: extracted.personId || context?.lastPersonId || null,
        lastPersonLabel: extracted.person || context?.lastPersonLabel || null,
        lastSymptoms: extracted.symptoms || [],
        lastSeenAt: new Date()
      }
    },
    { upsert: true }
  );
}

