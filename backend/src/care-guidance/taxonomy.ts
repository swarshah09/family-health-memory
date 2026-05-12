import type { SymptomTaxonomyEntry } from "./types.js";

/**
 * Keyword-style mapping from logged language to informational care routing hints.
 * Longer phrases should appear first within each row's `matchPhrases` where overlap matters.
 */
export const CARE_SYMPTOM_TAXONOMY: SymptomTaxonomyEntry[] = [
  {
    id: "chest-cardio",
    symptomLabel: "chest discomfort or tightness",
    matchPhrases: [
      "chest tightness",
      "chest pressure",
      "chest discomfort",
      "tight chest",
      "chest heaviness",
      "chest pain",
      "pain in chest"
    ],
    category: "Cardiovascular symptoms (observed in notes)",
    suggestedSpecialist: "Cardiologist",
    baselineUrgency: "moderate"
  },
  {
    id: "palpitations",
    symptomLabel: "heart racing or palpitations",
    matchPhrases: ["heart racing", "palpitations", "racing heart", "skipped beats", "fluttering heart"],
    category: "Heart rhythm observations",
    suggestedSpecialist: "Cardiologist",
    baselineUrgency: "moderate"
  },
  {
    id: "breathing",
    symptomLabel: "breathing difficulty",
    matchPhrases: [
      "shortness of breath",
      "trouble breathing",
      "difficulty breathing",
      "can't catch my breath",
      "cannot catch my breath",
      "wheezing",
      "labored breathing"
    ],
    category: "Respiratory symptoms",
    suggestedSpecialist: "Pulmonologist or primary care clinician",
    baselineUrgency: "moderate"
  },
  {
    id: "sleep",
    symptomLabel: "sleep disturbance",
    matchPhrases: [
      "sleep disturbance",
      "trouble sleeping",
      "can't sleep",
      "cannot sleep",
      "insomnia",
      "poor sleep",
      "wake frequently",
      "waking frequently"
    ],
    category: "Sleep and rest",
    suggestedSpecialist: "Sleep specialist",
    baselineUrgency: "low"
  },
  {
    id: "joint",
    symptomLabel: "joint pain or stiffness",
    matchPhrases: ["joint pain", "painful joints", "stiff joints", "joint stiffness", "arthritis", "swollen joints"],
    category: "Musculoskeletal",
    suggestedSpecialist: "Orthopedic doctor",
    baselineUrgency: "low"
  },
  {
    id: "back",
    symptomLabel: "back pain",
    matchPhrases: ["lower back pain", "upper back pain", "back pain", "backache", "sore back"],
    category: "Musculoskeletal",
    suggestedSpecialist: "Orthopedic doctor or physiatrist",
    baselineUrgency: "low"
  },
  {
    id: "headache",
    symptomLabel: "headache",
    matchPhrases: ["migraine", "severe headache", "bad headache", "headache", "head pain"],
    category: "Neurologic or pain-related notes",
    suggestedSpecialist: "Neurologist or primary care clinician",
    baselineUrgency: "low"
  },
  {
    id: "dizziness",
    symptomLabel: "dizziness or vertigo",
    matchPhrases: ["vertigo", "room spinning", "lightheaded", "dizzy spells", "dizziness", "feeling faint"],
    category: "Balance and neurologic symptoms",
    suggestedSpecialist: "Neurologist or ENT specialist",
    baselineUrgency: "moderate"
  },
  {
    id: "gi",
    symptomLabel: "stomach or abdominal discomfort",
    matchPhrases: ["abdominal pain", "stomach pain", "stomach ache", "nausea", "vomiting", "upset stomach"],
    category: "Digestive symptoms",
    suggestedSpecialist: "Gastroenterologist or primary care clinician",
    baselineUrgency: "low"
  },
  {
    id: "mental",
    symptomLabel: "anxiety or panic feelings",
    matchPhrases: ["panic attack", "panic", "overwhelming anxiety", "anxiety", "constant worry"],
    category: "Mental health observations",
    suggestedSpecialist: "Mental health professional",
    baselineUrgency: "low"
  },
  {
    id: "fever",
    symptomLabel: "fever or chills",
    matchPhrases: ["high fever", "fever", "chills", "shaking chills"],
    category: "Infection-related observations",
    suggestedSpecialist: "Primary care clinician",
    baselineUrgency: "moderate"
  },
  {
    id: "swelling",
    symptomLabel: "swelling",
    matchPhrases: ["leg swelling", "ankle swelling", "swollen legs", "swelling", "puffy legs", "edema"],
    category: "Fluid retention or inflammation",
    suggestedSpecialist: "Cardiologist or primary care clinician",
    baselineUrgency: "moderate"
  },
  {
    id: "skin",
    symptomLabel: "skin rash or irritation",
    matchPhrases: ["skin rash", "hives", "rash", "itchy skin", "welts"],
    category: "Dermatologic observations",
    suggestedSpecialist: "Dermatologist",
    baselineUrgency: "low"
  },
  {
    id: "urinary",
    symptomLabel: "urinary symptoms",
    matchPhrases: ["painful urination", "blood in urine", "frequent urination", "urinary urgency", "uti"],
    category: "Genitourinary observations",
    suggestedSpecialist: "Urologist or primary care clinician",
    baselineUrgency: "moderate"
  },
  {
    id: "vision",
    symptomLabel: "vision changes",
    matchPhrases: ["blurred vision", "double vision", "vision loss", "vision changes", "spots in vision"],
    category: "Eye symptoms",
    suggestedSpecialist: "Ophthalmologist",
    baselineUrgency: "moderate"
  },
  {
    id: "fatigue",
    symptomLabel: "fatigue or low energy",
    matchPhrases: ["extreme fatigue", "chronic fatigue", "always tired", "exhausted", "fatigue", "low energy"],
    category: "Energy and stamina",
    suggestedSpecialist: "Primary care clinician",
    baselineUrgency: "low"
  },
  {
    id: "cough",
    symptomLabel: "persistent cough",
    matchPhrases: ["persistent cough", "bad cough", "coughing blood", "bloody cough", "cough"],
    category: "Respiratory symptoms",
    suggestedSpecialist: "Pulmonologist or primary care clinician",
    baselineUrgency: "low"
  }
];
