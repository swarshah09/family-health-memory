import { FamilyMemberModel, UserModel } from "../../models.js";
import { MIN_MEMORY_CONFIDENCE, type HealthMemoryCreateInput } from "./health-memory.types.js";

export type ValidationResult = {
  valid: boolean;
  reason?: string;
};

/**
 * Confirms that `resolvedProfileId` belongs to the expected `familyId`.
 */
export async function validateProfileOwnership(
  resolvedProfileId: string,
  familyId: string
): Promise<ValidationResult> {
  const member = await FamilyMemberModel.findOne({
    _id: resolvedProfileId,
    familyId
  })
    .select("_id")
    .lean();

  if (!member) {
    return {
      valid: false,
      reason: `Profile ${resolvedProfileId} does not belong to family ${familyId}`
    };
  }
  return { valid: true };
}

/**
 * When sourceType is CAREGIVER, confirms the sender is a member of the same family.
 */
export async function validateFamilyPermissions(
  createdByUserId: string,
  familyId: string
): Promise<ValidationResult> {
  const user = await UserModel.findById(createdByUserId).select("familyId").lean();
  if (!user) {
    return { valid: false, reason: `User ${createdByUserId} not found` };
  }
  if (String(user.familyId) !== familyId) {
    return {
      valid: false,
      reason: `User ${createdByUserId} is not a member of family ${familyId}`
    };
  }
  return { valid: true };
}

/**
 * Rejects if the combined confidence (extraction × resolution) falls below the threshold.
 */
export function validateConfidenceThreshold(
  extractionConfidence: number,
  resolutionConfidence: number
): ValidationResult {
  const combined = Math.min(extractionConfidence, resolutionConfidence);
  if (combined < MIN_MEMORY_CONFIDENCE) {
    return {
      valid: false,
      reason: `Combined confidence ${combined.toFixed(3)} below threshold ${MIN_MEMORY_CONFIDENCE}`
    };
  }
  return { valid: true };
}

/**
 * Orchestrates all validation checks. Short-circuits on first failure.
 */
export async function runAllValidations(
  input: HealthMemoryCreateInput,
  resolvedProfileId: string
): Promise<ValidationResult> {
  // 1. Profile ownership
  const ownership = await validateProfileOwnership(resolvedProfileId, input.familyId);
  if (!ownership.valid) return ownership;

  // 2. Family permissions
  const permissions = await validateFamilyPermissions(input.senderUserId, input.familyId);
  if (!permissions.valid) return permissions;

  // 3. Confidence threshold
  const confidence = validateConfidenceThreshold(
    input.extraction.confidence,
    input.resolution.confidence
  );
  if (!confidence.valid) return confidence;

  return { valid: true };
}
