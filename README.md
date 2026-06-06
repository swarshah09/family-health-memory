<p align="center">
  <img src="https://img.shields.io/badge/FamPulse-The%20Quiet%20Keeper-1a3c2a?style=for-the-badge&labelColor=0d1f15" alt="FamPulse" />
</p>

<h1 align="center">
  FamPulse — Family Health Memory
</h1>

<p align="center">
  <em>The quiet keeper of your family's wellbeing.</em>
</p>

<p align="center">
  <a href="#philosophy">Philosophy</a> ·
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#deployment">Deployment</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47a248?style=flat-square&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Gemini-AI-8e75b2?style=flat-square&logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/WhatsApp-Integration-25d366?style=flat-square&logo=whatsapp&logoColor=white" alt="WhatsApp" />
</p>

---

## The Problem

Health observations are scattered across WhatsApp chats, phone calls, sticky notes, and fading memory. When someone you love is aging, recovering, or living with a chronic condition, **no single person holds the full picture**. One sibling notices appetite changes. Another tracks medications. A third talks to the doctor.

Three people caring from three cities. Each holding a corner of the same blanket — and dropping pieces.

## Philosophy

FamPulse exists because care shouldn't require a medical degree, just a shared memory.

> **We believe health understanding begins with quiet observation, not clinical intervention.**

This is the core ideology behind every line of code:

| Principle | What It Means |
|---|---|
| **Observe, don't diagnose** | We never tell a family what's wrong. We help them *notice* what's changing. |
| **Calm over alarm** | Language is gentle. Patterns are surfaced as observations, not warnings. |
| **Memory over moments** | A single reading means nothing. A pattern over 30 days means everything. |
| **Families, not patients** | People are tracked as loved ones in a family, not patients in a system. |
| **Private by architecture** | No ads. No data selling. No social features. Invite-only family workspaces. |
| **AI as support staff** | AI summarizes and connects dots. It never prescribes, predicts, or replaces professionals. |

> *"FamPulse is not a medical product. It is a memory product — for families who want to care better together."*

---

## Features

### 🏠 Family Workspace
An invite-only, private space where family members collaborate on health observations. No social feed, no strangers — just the people who show up.

- **Role-based access**: Owner · Caregiver · Viewer
- **Multi-member tracking**: Track grandparents, parents, children — anyone in the circle of care
- **Owner-protected operations**: Role transfers, team management, sensitive actions require re-authentication

### 📝 Health Logging
Capture observations in whatever way feels natural in the moment.

- **Text logs** with tags, mood, and member attribution
- **Voice notes** — speak a quick observation, we keep the audio and the transcript
- **WhatsApp integration** — send a voice note or message to your family's WhatsApp number, and it becomes structured health memory automatically

### 🧠 Longitudinal Health Memory
Every observation lands on a unified **health timeline** — readable at a glance, searchable across months.

- **Chronological timeline events** normalized from text, voice, and WhatsApp inputs
- **Contextual episodes** — related observations grouped together automatically
- **Symptom context tracking** — first occurrence, recurrence patterns, severity over time
- **Conversational memory search** — find past observations in natural language

### 📊 Pattern Detection
The system quietly watches for recurring signals across your family's observations.

- **Recurring symptom detection** — same symptoms appearing repeatedly
- **Frequency analysis** — patterns increasing or decreasing over time
- **Symptom clustering** — related symptoms co-occurring
- **Persistent observation tracking** — things that haven't resolved
- **Confidence scoring** — patterns scored by reliability, never presented as diagnosis

### 📋 Weekly Health Digests
Calm, observational summaries delivered weekly — like a weather report for wellbeing.

- **Personal digests** per family member
- **Family-wide overview** across the entire household
- **Trend summaries** — what's increasing, decreasing, or new
- **Doctor-ready briefs** — bring grounded summaries to clinical visits

### 💬 Follow-up Intelligence
Gentle contextual prompts that help families continue meaningful health conversations.

- *"Has the dizziness improved recently?"*
- *"The last BP reading was 12 days ago — is everything stable?"*
- **Never aggressive** — prompts are skippable and calm

### 🩺 Care Guidance (Observational)
When patterns suggest something worth paying attention to, the system quietly suggests what *type* of professional might be relevant.

- **Specialist-type suggestions** — not referrals, just orientation
- **Urgency levels** — routine, moderate, elevated (never "emergency" — that's 911)
- **Full traceability** — every suggestion links back to the observations that triggered it

### 🔍 Explainability & Evidence
Every AI-generated insight can be traced back to supporting health observations.

- **Evidence chains** — which observations led to which patterns
- **Confidence transparency** — users see why the system noticed something
- **Full audit trail** — nothing is a black box

### 🔐 Security & Privacy
Privacy isn't a feature — it's the architecture.

- JWT access tokens with refresh rotation
- Helmet security headers + rate limiting
- Webhook signature validation (HMAC SHA-256)
- PHI-safe structured logging — **health content is never logged**
- Phone numbers are masked in all logs
- No ads, no data selling, no third-party analytics

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Vite)                  │
│  Landing · Dashboard · Timeline · Insights · Voice · Admin   │
│  Tailwind CSS · Radix UI · Framer Motion · TanStack Query    │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                    BACKEND (Express + TypeScript)             │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  WhatsApp    │  │   AI         │  │  Health Memory     │  │
│  │  Webhook     │→ │  Extraction  │→ │  Record Creation   │  │
│  └─────────────┘  └──────────────┘  └────────┬───────────┘  │
│                                               │              │
│  ┌────────────────────────────────────────────▼───────────┐  │
│  │              Health Timeline Engine                     │  │
│  │  Events · Episodes · Symptom Context · Chronology      │  │
│  └────────────────────────────────────────────┬───────────┘  │
│                                               │              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────▼───────────┐  │
│  │  Weekly       │  │  Follow-up   │  │  Pattern          │  │
│  │  Digests      │  │  Intelligence│  │  Detection        │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Care         │  │  Explain-    │  │  Observability    │  │
│  │  Guidance     │  │  ability     │  │  & Logging        │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│                                                              │
│  Infrastructure: BullMQ · Idempotency · Processing State     │
│  Security: Webhook Hardening · Graceful Shutdown · Health EP  │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │  MongoDB Atlas + Redis   │
              │  (Redis optional)        │
              └─────────────────────────┘
```

### Backend Modules (11)

| Module | Responsibility |
|---|---|
| `whatsapp` | Webhook ingestion, message storage, account linking |
| `ai-extraction` | Gemini-powered health entity extraction from text/voice |
| `profile-resolution` | Maps observations to family members using NLP |
| `health-memory` | Normalized health observation records |
| `timeline` | Chronological event timeline with episodes |
| `pattern-engine` | Recurrence detection, symptom clustering, frequency analysis |
| `weekly-digest-engine` | Personal and family weekly summaries |
| `followup-engine` | Contextual follow-up prompt generation |
| `care-guidance` | Specialist-type suggestions with urgency scoring |
| `explainability` | Evidence chains and traceability |
| `voice-processing` | Audio storage, Whisper transcription, conversational normalization |

### Infrastructure (7)

| Component | Purpose |
|---|---|
| `queue` | BullMQ with 8 named queues and tiered retry policies |
| `workers` | Message processing, transcription, and batch workers |
| `processing-state` | State machine for pipeline lifecycle tracking |
| `idempotency` | SHA-256 deduplication preventing duplicate processing |
| `observability` | PHI-safe structured logging + internal metrics |
| `security` | Webhook hardening, health checks, signature validation |
| `graceful-shutdown` | Ordered drain of HTTP → Workers → Queues → Redis → MongoDB |

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tooling |
| Tailwind CSS | Utility-first styling |
| Radix UI + shadcn | Accessible component primitives |
| Framer Motion | Animations and transitions |
| TanStack Query | Server state management |
| React Router v6 | Client-side routing |
| Recharts | Data visualization |
| Zod | Client-side validation |

### Backend
| Technology | Purpose |
|---|---|
| Node.js 20 + Express | HTTP server |
| TypeScript | Type safety |
| MongoDB + Mongoose | Primary database |
| BullMQ + Redis | Production queue system (optional) |
| Gemini API | AI extraction, summaries, insights |
| Zod | Request validation |
| JWT + bcrypt | Authentication |
| node-cron | Scheduled batch jobs |
| Multer | File uploads |
| Helmet | Security headers |

---

## Quick Start

### Prerequisites
- Node.js 20+
- MongoDB connection string ([MongoDB Atlas](https://atlas.mongodb.com) free tier works)
- Gemini API key (optional — rule-based fallback works without it)

### 1. Clone and install

```bash
git clone https://github.com/swarshah09/family-health-memory.git
cd family-health-memory

npm install --prefix frontend
npm install --prefix backend
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**Backend** (`backend/.env`):
```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
GEMINI_API_KEY=your-gemini-key     # optional
REDIS_URL=redis://localhost:6379   # optional — runs without Redis
```

**Frontend** (`frontend/.env`):
```env
VITE_API_BASE_URL=http://localhost:4000
```

### 3. Run locally

```bash
# Terminal 1 — Backend
cd backend && npm start

# Terminal 2 — Frontend
cd frontend && npm run dev
```

- **Frontend**: http://localhost:8080
- **Backend**: http://localhost:4000
- **Health check**: http://localhost:4000/health

---

## Deployment

### Backend → [Render](https://render.com)

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Health Check | `/health` |

**Required env vars**: `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGINS`

**Optional env vars**: `GEMINI_API_KEY`, `REDIS_URL`, `GEMINI_MODEL`, `ACCESS_TOKEN_TTL`

### Frontend → [Vercel](https://vercel.com)

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

**Required env var**: `VITE_API_BASE_URL=https://your-render-service.onrender.com`

> **Important**: Set `CORS_ORIGINS` on Render to include your Vercel domain.

---

## How It Thinks

The AI pipeline is intentionally constrained. Here's the flow from raw family conversation to structured insight:

```
Voice Note / Text / WhatsApp Message
       │
       ▼
  Transcription (Whisper)
       │
       ▼
  AI Extraction (Gemini)
  "mom has been dizzy for 3 days"
  → { symptom: "dizziness", duration: "3 days", member: "mom" }
       │
       ▼
  Profile Resolution
  "mom" → Mary Shah (family member)
       │
       ▼
  Health Memory Record
  Normalized observation with timestamps
       │
       ▼
  Timeline Placement
  Added to Mary's longitudinal timeline
       │
       ▼
  Pattern Detection
  "dizziness mentioned 4 times in 14 days"
       │
       ▼
  Weekly Digest
  "Mary has experienced recurring dizziness over the past two weeks"
       │
       ▼
  Follow-up Prompt
  "Has the dizziness improved recently?"
       │
       ▼
  Care Guidance (if pattern persists)
  "Consider discussing with a neurologist or ENT specialist"
```

**At no point does the system diagnose, prescribe, or predict.** It observes, connects, and gently suggests.

---

## What It's Not

| ❌ Not This | ✅ This Instead |
|---|---|
| A medical diagnosis tool | A family health memory system |
| An emergency alert system | A calm pattern observer |
| A replacement for doctors | A preparation tool for doctor visits |
| A social health platform | A private, invite-only family workspace |
| A wearable sync dashboard | A conversational observation keeper |
| A clinical EHR | A human-readable care timeline |

---

## Roles & Permissions

| Role | Can Do |
|---|---|
| **Owner** | Everything — team management, admin console, audit logs, threshold config |
| **Caregiver** | Log observations, manage members, run automation, view insights |
| **Viewer** | Read-only access to timeline, insights, and summaries |

---

## Project Structure

```
family-health-memory/
├── frontend/                    # React + Vite + TypeScript
│   ├── src/
│   │   ├── pages/              # 18 page components
│   │   ├── components/         # Shared UI components
│   │   ├── hooks/              # Custom React hooks
│   │   └── lib/                # Utilities
│   └── vercel.json             # SPA routing
│
├── backend/                     # Express + TypeScript API
│   ├── src/
│   │   ├── modules/            # 11 domain modules
│   │   │   ├── whatsapp/       # WhatsApp webhook + ingestion
│   │   │   ├── health-memory/  # Normalized health records
│   │   │   ├── timeline/       # Longitudinal event timeline
│   │   │   ├── pattern-engine/ # Recurrence + clustering
│   │   │   ├── weekly-digest-engine/
│   │   │   ├── followup-engine/
│   │   │   ├── care-guidance/
│   │   │   ├── explainability/
│   │   │   ├── voice-processing/
│   │   │   ├── ai-extraction/
│   │   │   └── profile-resolution/
│   │   ├── infrastructure/     # Production reliability
│   │   │   ├── queue/          # BullMQ (8 queues)
│   │   │   ├── workers/        # Job processors
│   │   │   ├── idempotency/    # Deduplication
│   │   │   ├── processing-state/
│   │   │   ├── observability/  # PHI-safe logging
│   │   │   └── security/       # Hardening + health checks
│   │   └── server.ts           # Application entry
│   └── render.yaml             # Render deployment config
│
└── README.md
```

---

## Safety & Data Principles

- All insights are generated from user-provided observations only
- AI outputs are constrained, validated, and sanitized before display
- Pattern insights are **assistive signals**, never medical conclusions
- Health content (symptoms, medications, raw text) is **never written to logs**
- Phone numbers are masked, secrets are redacted, API keys are stripped
- Users own their data — export is available at any time
- **Always consult qualified healthcare professionals for medical decisions**

---

## Contributing

This is an active project. If you'd like to contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

If you plan to use this in production, please add a `LICENSE` file with your chosen license terms.

---

<p align="center">
  <em>Built with care, for the families who care.</em>
</p>
