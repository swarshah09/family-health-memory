/**
 * Health Memory module — transforms resolved WhatsApp observations into
 * structured, traceable health memory records.
 *
 * Pipeline position: ingestion → extraction → resolution → **health-memory**
 *
 * Isolated from insights, trends, reminders, care guidance, and AI recommendations.
 */

export {
  healthMemoryService,
  HealthMemoryService
} from "./health-memory.service.js";

export {
  HealthMemoryRecordSchema,
  MemorySourceTypeSchema,
  MemoryRecordStatusSchema,
  MIN_MEMORY_CONFIDENCE,
  type HealthMemoryRecord,
  type HealthMemoryCreateInput,
  type HealthMemoryCreateResult,
  type HealthMemoryCreateStatus,
  type MemorySourceType,
  type MemoryRecordStatus
} from "./health-memory.types.js";

export { mapToHealthMemory, deriveSourceType } from "./health-memory.mapper.js";

export {
  runAllValidations,
  validateProfileOwnership,
  validateFamilyPermissions,
  validateConfidenceThreshold
} from "./health-memory.validation.js";

export { HealthMemoryRecordModel } from "./models/health-memory-record.model.js";
