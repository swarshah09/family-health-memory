# Family Health Memory

Family Health Memory is a full-stack caregiver coordination platform that helps families capture daily health observations and detect meaningful patterns over time.

It combines:
- structured family records,
- role-based collaboration,
- text/voice logging,
- deterministic trend detection,
- and Gemini-powered narrative pattern summaries.

---

## Why This Exists

Health observations are often fragmented across chats, calls, and memory. This app centralizes those observations so families can:
- track what happened and when,
- coordinate better across caregivers,
- notice repeated themes earlier,
- and bring clearer context to clinical conversations.

> This product is a memory and coordination assistant. It does **not** provide medical diagnosis or emergency advice.

---

## Core Features

### Authentication & Security
- Email/password signup and login
- JWT access tokens + refresh token rotation
- Logout invalidation
- Role-based access control (`owner`, `caregiver`, `viewer`)
- Family-scoped authorization checks on all private APIs
- Helmet security headers + API rate limiting

### Family & Team Management
- Create/update/delete family members
- Invite family users by role
- Owner-only role changes
- Owner-sensitive role transfer protection with password re-verification
- Last-owner protection (prevents accidental owner lockout)

### Health Logging
- Add text logs with tags
- Upload/record voice logs
- Optional Gemini transcription for voice
- Member-specific history and timeline

### AI + Pattern Detection
- Hybrid insight engine:
  - **Rules-based** repeated keyword patterns (~30-day window)
  - **Gemini narrative insights** with structured JSON schema output
- Source provenance (`rules` vs `model`) in insights
- Confidence normalization and evidence-log validation
- Duplicate suppression between model and rule insights

### Automation Center
- Manual analysis run trigger
- Daily scheduled automation run
- Configurable thresholds:
  - minimum mentions
  - minimum confidence
  - notification toggle
- Notification inbox + mark-as-read

### Shared Message Ingestion
- Ingest caregiver-style incoming text messages
- AI-assisted member/tag extraction
- Auto-log when confidently matched
- Review queue for unmatched messages
- Resolve or dismiss pending messages

### Admin Console (Owner)
- Owner-only operations view
- Team/member management in one place
- Threshold management and manual automation runs
- Notification controls
- Search/filter/export (CSV) for key data
- Audit log viewer with:
  - action/email filters
  - date range filtering
  - pagination
  - CSV export

### Audit Logging
- Auth, role updates, member changes, log actions, insight generation, automation actions, and chat ingestion actions are written to audit history.

---

## How It Works (Architecture)

### High-Level Flow
1. User logs in and receives access + refresh tokens.
2. Frontend loads family members, logs, and insights.
3. New observations are added via text, voice, or shared message ingest.
4. Insight engine builds:
   - deterministic keyword trends
   - Gemini narrative summaries (when API key is configured)
5. Automation applies thresholds and creates notifications.
6. Owner/admin can review operations and audit trail.

### Monorepo Structure

```text
.
├── frontend/    # React + Vite + TypeScript UI
└── backend/     # Express + TypeScript API + MongoDB models
```

---

## Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- TanStack Query (available in app shell)
- Tailwind CSS + Radix UI + shadcn-style components
- Framer Motion
- Sonner toast notifications

### Backend
- Node.js + Express
- TypeScript
- MongoDB + Mongoose
- Zod request validation
- JWT auth (`jsonwebtoken`)
- Password hashing (`bcryptjs`)
- File uploads (`multer`)
- Scheduler (`node-cron`)
- Gemini (`@google/generative-ai`)

### Deployment Targets
- Frontend: Vercel
- Backend: Render
- Database: MongoDB Atlas (or compatible MongoDB)

---

## API Capability Summary

Major backend areas (family-scoped, authenticated where applicable):
- Auth: signup, login, refresh, logout
- Users: list users, invite user, update role
- Members: create/list/update/delete
- Logs: create/list/update + voice upload
- Insights: live insights + latest snapshot
- Automation: status, run, settings
- Notifications: list + mark read
- Chat ingestion: ingest, pending-review, resolve, dismiss
- Audit logs (owner): list with pagination/filters

Health check:
- `GET /health`

---

## Local Development

### Prerequisites
- Node.js 20+
- npm
- MongoDB connection string
- Gemini API key (optional but recommended for AI features)

### 1) Install dependencies

```bash
npm install --prefix frontend
npm install --prefix backend
```

### 2) Configure environment files

Backend:
```bash
cp backend/.env.example backend/.env
```

Frontend:
```bash
cp frontend/.env.example frontend/.env
```

Update minimum required values:
- `backend/.env`
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `GEMINI_API_KEY`
- `frontend/.env`
  - `VITE_API_BASE_URL=http://localhost:4000`

### 3) Run locally

From repo root:
```bash
npm run dev:backend
npm run dev:frontend
```

Frontend URL:
- `http://localhost:8080` (or Vite-assigned local port)

---

## Production Deployment

## Backend on Render

Use `backend/render.yaml` (recommended) or configure manually:
- Root Directory: `backend`
- Build Command: `npm install && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/health`

### Required Render env vars
- `MONGODB_URI`
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `CORS_ORIGINS` (comma-separated; include your Vercel production URL)

### Optional Render env vars
- `GEMINI_MODEL` (default `gemini-2.0-flash`, fallback `gemini-1.5-flash`)
- `ACCESS_TOKEN_TTL` (default `15m`)
- `REFRESH_TOKEN_TTL_DAYS` (default `30`)
- `JSON_BODY_LIMIT` (default `1mb`)
- `MAX_AUDIO_FILE_BYTES` (default `8388608`)

Verify deployment:
- `GET https://<your-render-service>/health`

## Frontend on Vercel

Project settings:
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

Required Vercel env var:
- `VITE_API_BASE_URL=https://<your-render-service>.onrender.com`

SPA routing support is included via:
- `frontend/vercel.json`

This ensures route refresh works for URLs like `/insights`, `/team`, `/automation`, `/admin`, etc.

## Final Wiring Checklist

- Render `CORS_ORIGINS` contains your Vercel domain(s)
- Vercel `VITE_API_BASE_URL` points to Render backend
- Both services redeployed after env updates

---

## Roles & Permissions

- **Owner**
  - full control (team roles, thresholds, admin console, audit)
- **Caregiver**
  - can manage logs/members and run automation
- **Viewer**
  - read-oriented access; restricted from management actions

---

## Data & Safety Notes

- Insights are generated from user-provided logs.
- Model outputs are constrained and sanitized before use.
- Pattern insights are assistive signals, not medical conclusions.
- Always consult qualified healthcare professionals for medical decisions.

---

## Scripts

Root:
- `npm run dev:frontend`
- `npm run dev:backend`
- `npm run build:frontend`
- `npm run build:backend`

Frontend:
- `npm run dev`
- `npm run build`
- `npm run test`

Backend:
- `npm run dev`
- `npm run build`
- `npm run start`

---

## License / Usage

If you plan to open-source publicly, add a license file (`LICENSE`) and update this section with your chosen license terms.
