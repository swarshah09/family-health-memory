/**
 * Specialist Mapper — maps symptom categories to appropriate specialist types.
 *
 * This is a rules-based lookup, NOT a diagnostic system.
 * The mapping suggests which type of specialist might be relevant
 * for further discussion — never implies a diagnosis.
 *
 * Future-proofed for: specialist directories, care navigation, appointment prep.
 */

type SpecialistMapping = {
  specialist: string;
  /** Keywords that trigger this mapping (lowercased). */
  keywords: string[];
};

/**
 * Specialist mapping rules ordered by specificity (most specific first).
 * Each entry maps symptom keywords to a specialist type.
 */
const SPECIALIST_MAPPINGS: SpecialistMapping[] = [
  // Cardiovascular
  {
    specialist: "Cardiologist",
    keywords: [
      "chest pain", "chest discomfort", "chest tightness",
      "heart", "palpitations", "blood pressure", "hypertension"
    ]
  },
  // Neurological
  {
    specialist: "Neurologist",
    keywords: [
      "headache", "migraine", "dizziness", "vertigo", "numbness",
      "tingling", "seizure", "tremor", "memory loss"
    ]
  },
  // Orthopedic
  {
    specialist: "Orthopedic Doctor",
    keywords: [
      "joint pain", "back pain", "knee pain", "shoulder pain", "hip pain",
      "fracture", "sprain", "arthritis", "bone", "muscle pain", "stiffness"
    ]
  },
  // Gastroenterological
  {
    specialist: "Gastroenterologist",
    keywords: [
      "stomach", "digestion", "nausea", "vomiting", "diarrhea",
      "constipation", "bloating", "acid reflux", "abdominal pain",
      "appetite loss", "indigestion"
    ]
  },
  // Pulmonary
  {
    specialist: "Pulmonologist",
    keywords: [
      "breathing", "shortness of breath", "cough", "wheezing",
      "asthma", "chest congestion", "respiratory"
    ]
  },
  // Sleep
  {
    specialist: "Sleep Specialist",
    keywords: [
      "sleep", "insomnia", "snoring", "fatigue", "tiredness",
      "restless", "drowsy", "sleep apnea", "oversleeping"
    ]
  },
  // Dermatological
  {
    specialist: "Dermatologist",
    keywords: [
      "skin", "rash", "itching", "eczema", "acne", "hives",
      "allergy skin", "swelling skin", "dry skin"
    ]
  },
  // ENT
  {
    specialist: "ENT Specialist",
    keywords: [
      "ear pain", "hearing", "sore throat", "throat pain",
      "sinus", "nasal", "nose bleed", "tonsil"
    ]
  },
  // Ophthalmological
  {
    specialist: "Ophthalmologist",
    keywords: [
      "eye", "vision", "blurry", "eye pain", "redness eye"
    ]
  },
  // Endocrine
  {
    specialist: "Endocrinologist",
    keywords: [
      "diabetes", "thyroid", "hormone", "blood sugar",
      "weight gain", "weight loss unexplained"
    ]
  },
  // Mental Health
  {
    specialist: "Mental Health Professional",
    keywords: [
      "anxiety", "depression", "stress", "mood", "panic",
      "emotional", "overwhelmed", "sadness", "irritability"
    ]
  },
  // Urological
  {
    specialist: "Urologist",
    keywords: [
      "urinary", "bladder", "kidney pain", "frequent urination"
    ]
  }
];

/** Fallback when no specific specialist matches. */
const DEFAULT_SPECIALIST = "General Physician";

/**
 * Maps a list of symptoms to the most appropriate specialist type.
 *
 * Strategy:
 * 1. Normalize all symptoms to lowercase
 * 2. For each specialist, count keyword matches
 * 3. Return the specialist with the most matches
 * 4. If no matches, return General Physician
 */
export function mapSymptomsToSpecialist(symptoms: string[]): string {
  if (symptoms.length === 0) return DEFAULT_SPECIALIST;

  const normalizedSymptoms = symptoms.map((s) => s.toLowerCase().trim());
  let bestSpecialist = DEFAULT_SPECIALIST;
  let bestScore = 0;

  for (const mapping of SPECIALIST_MAPPINGS) {
    let score = 0;
    for (const keyword of mapping.keywords) {
      for (const symptom of normalizedSymptoms) {
        if (symptom.includes(keyword) || keyword.includes(symptom)) {
          score++;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestSpecialist = mapping.specialist;
    }
  }

  return bestSpecialist;
}

/**
 * Returns all specialist types that have any keyword match with the symptoms.
 * Used for multi-specialist guidance when symptoms span categories.
 */
export function mapSymptomsToAllSpecialists(symptoms: string[]): string[] {
  if (symptoms.length === 0) return [DEFAULT_SPECIALIST];

  const normalizedSymptoms = symptoms.map((s) => s.toLowerCase().trim());
  const matches: { specialist: string; score: number }[] = [];

  for (const mapping of SPECIALIST_MAPPINGS) {
    let score = 0;
    for (const keyword of mapping.keywords) {
      for (const symptom of normalizedSymptoms) {
        if (symptom.includes(keyword) || keyword.includes(symptom)) {
          score++;
        }
      }
    }
    if (score > 0) {
      matches.push({ specialist: mapping.specialist, score });
    }
  }

  if (matches.length === 0) return [DEFAULT_SPECIALIST];

  return matches
    .sort((a, b) => b.score - a.score)
    .map((m) => m.specialist);
}
