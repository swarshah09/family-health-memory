import { AIExtractionResultModel } from "./models/ai-extraction-result.model.js";
import { generateExtractionJson } from "./extraction.gemini.js";
import {
  buildExtractionSystemInstruction,
  buildExtractionUserPrompt
} from "./extraction.prompts.js";
import { buildFallbackExtraction, parseExtractionResponse } from "./extraction.parser.js";
import type {
  ExtractionServiceResult,
  ExtractionStatus,
  HealthObservationExtraction,
  WhatsAppExtractionInput
} from "./extraction.types.js";

const MAX_RETRIES = 2;

function logExtraction(level: "info" | "warn", msg: string, fields: Record<string, unknown>): void {
  const line = { scope: "ai-extraction", ...fields };
  if (level === "warn") console.warn(`[ai-extraction] ${msg}`, line);
  else console.info(`[ai-extraction] ${msg}`, line);
}

export class HealthObservationExtractionService {
  /**
   * Run structured extraction and persist to AI_EXTRACTION_RESULTS.
   * Isolated from insights, trends, and health log creation.
   */
  async extractAndStore(input: WhatsAppExtractionInput): Promise<ExtractionServiceResult> {
    const existing = await AIExtractionResultModel.findOne({ messageId: input.messageId }).lean();
    if (existing?.extractionStatus === "COMPLETED") {
      return {
        extractionId: existing._id.toString(),
        messageId: input.messageId,
        status: "COMPLETED",
        extractedData: existing.extractedData as HealthObservationExtraction,
        confidence: existing.confidence,
        usedFallback: false
      };
    }

    const pending = await AIExtractionResultModel.findOneAndUpdate(
      { messageId: input.messageId },
      {
        messageId: input.messageId,
        extractionStatus: "PENDING" as ExtractionStatus,
        extractedData: {},
        confidence: 0
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const rosterNames = input.familyMembers.map((m) => m.name);
    const messageText = input.rawText?.trim() || "";

    let extracted: HealthObservationExtraction;
    let usedFallback = false;

    if (!messageText && input.messageType !== "TEXT") {
      extracted = buildFallbackExtraction("", input.senderUserId, input.familyMembers);
      usedFallback = true;
    } else {
      const aiResult = await this.extractWithRetry(messageText, input, rosterNames);
      extracted = aiResult.data;
      usedFallback = aiResult.usedFallback;
    }

    const status: ExtractionStatus = "COMPLETED";
    await AIExtractionResultModel.updateOne(
      { _id: pending._id },
      {
        $set: {
          extractedData: extracted,
          confidence: extracted.confidence,
          extractionStatus: status
        }
      }
    );

    logExtraction("info", "stored", {
      messageId: input.messageId,
      type: extracted.observationType,
      person: extracted.mentionedPerson ?? "unknown",
      confidence: extracted.confidence,
      fallback: usedFallback,
      success: true
    });

    return {
      extractionId: pending._id.toString(),
      messageId: input.messageId,
      status,
      extractedData: extracted,
      confidence: extracted.confidence,
      usedFallback
    };
  }

  private async extractWithRetry(
    messageText: string,
    input: WhatsAppExtractionInput,
    rosterNames: string[]
  ): Promise<{ data: HealthObservationExtraction; usedFallback: boolean }> {
    const systemInstruction = buildExtractionSystemInstruction();
    const userPrompt = buildExtractionUserPrompt({
      messageText,
      senderDisplayName: input.senderDisplayName,
      senderUserId: input.senderUserId,
      familyMembers: input.familyMembers
    });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const raw = await generateExtractionJson(systemInstruction, userPrompt);
      if (!raw) break;

      const parsed = parseExtractionResponse(raw, rosterNames);
      if (parsed.ok) {
        return { data: parsed.data, usedFallback: false };
      }

      logExtraction("warn", "parse failed, retrying", {
        messageId: input.messageId,
        attempt: attempt + 1,
        error: parsed.error
      });
    }

    const fallback = buildFallbackExtraction(messageText, input.senderUserId, input.familyMembers);
    logExtraction("warn", "using fallback extraction", {
      messageId: input.messageId,
      type: fallback.observationType
    });
    return { data: fallback, usedFallback: true };
  }

  async markFailed(messageId: string): Promise<void> {
    const failedPayload = buildFallbackExtraction("", "", []);
    await AIExtractionResultModel.findOneAndUpdate(
      { messageId },
      {
        $set: {
          extractionStatus: "FAILED" as ExtractionStatus,
          confidence: 0,
          extractedData: { ...failedPayload, observationType: "UNKNOWN" as const, confidence: 0 }
        }
      },
      { upsert: true }
    );
    logExtraction("warn", "extraction failed", { messageId, success: false });
  }

  async getByMessageId(messageId: string): Promise<ExtractionServiceResult | null> {
    const row = await AIExtractionResultModel.findOne({ messageId }).lean();
    if (!row || row.extractionStatus !== "COMPLETED") return null;
    return {
      extractionId: row._id.toString(),
      messageId: row.messageId,
      status: row.extractionStatus as ExtractionStatus,
      extractedData: row.extractedData as HealthObservationExtraction,
      confidence: row.confidence,
      usedFallback: false
    };
  }
}

export const healthObservationExtractionService = new HealthObservationExtractionService();
