# Architecture: AI Contract Redliner MVP

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│                    Next.js App (Vercel)                             │
│   Upload UI → Analysis View → Clause Flagging → Risk Dashboard     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VERCEL SERVERLESS FUNCTIONS                      │
│   /api/upload   /api/analyze   /api/results   /api/user            │
└───────────┬──────────────────────────────┬──────────────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────┐     ┌─────────────────────────────────────┐
│   SUPABASE STORAGE    │     │         SUPABASE POSTGRES           │
│   (contract files)    │     │  profiles / contracts / analyses /  │
│   PDF/DOCX, auto-exp  │     │  clauses / audit_logs               │
└───────────┬───────────┘     └─────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AI PIPELINE (Vercel Function)                   │
│  1. Text Extraction (pdf-parse / mammoth)                          │
│  2. Chunking + Pre-processing                                       │
│  3. LLM → Clause Detection + Risk Scoring                          │
│  4. Response Parsing → Structured JSON                             │
│  5. Persist results → Supabase                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle:** Entirely within Vercel + Supabase. No new infra for MVP.

---

## 2. Backend API Design

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/upload` | Required | Upload contract file, create DB record |
| `POST` | `/api/analyze` | Required | Trigger AI analysis pipeline |
| `GET` | `/api/results/:contractId` | Required | Fetch analysis results |
| `GET` | `/api/contracts` | Required | List user's contracts |
| `DELETE` | `/api/contracts/:contractId` | Required | Delete contract + file |
| `GET` | `/api/user/me` | Required | Get user profile |
| `PATCH` | `/api/user/me` | Required | Update user settings |

Auth: Supabase JWT via `Authorization: Bearer <token>` on every endpoint.

### Key Schemas

**POST /api/upload** → multipart/form-data, file (PDF/DOCX, max 10MB) → returns `{ contractId, status: "uploaded" }`

**POST /api/analyze** → `{ contractId }` → returns `{ status: "processing", estimatedSeconds: 30 }`

**GET /api/results/:contractId** →
```json
{
  "contractId": "uuid",
  "status": "complete",
  "overallRisk": "red",
  "riskScore": 73,
  "summary": "This contract has 3 high-risk clauses...",
  "clauses": [
    {
      "clauseId": "uuid",
      "type": "ip_ownership",
      "risk": "red",
      "originalText": "All work product created by Contractor...",
      "explanation": "You lose all IP rights permanently...",
      "suggestion": "Add: 'excluding pre-existing IP...'"
    }
  ]
}
```

### File Handling
- PDF → `pdf-parse` (pure JS, Vercel-compatible)
- DOCX → `mammoth` (no LibreOffice dependency)
- Fallback: user-friendly error if extraction fails

---

## 3. AI Pipeline

### LLM: Claude / GPT-4o
- Cost per analysis ≈ $0.04–0.15 (3K-8K tokens in, ~1.5K out)
- 100 analyses/day = ~$5-15/day. Acceptable for MVP.
- GPT-4o-mini for free tier quick scan, full model for paid tier.

### Prompt Architecture
Single structured prompt with JSON mode. No multi-step chaining for MVP.

**System prompt** instructs the model to:
- Detect 6 clause types: ip_ownership, non_compete, unlimited_revisions, liability, payment_terms, termination
- Assign risk levels: RED (severely unfavorable), YELLOW (needs attention), GREEN (reasonable)
- Quote exact text, explain in plain English, suggest rewrites
- Return structured JSON with overallRisk, riskScore (0-100), summary, and clauses array

**Chunking:** If contract > 12K tokens, split by section headers, analyze in parallel, merge + deduplicate.

### Risk Scoring Algorithm
```typescript
function calculateRiskScore(clauses) {
  const weights = { red: 25, yellow: 10, green: 0 };
  let score = Math.min(clauses.reduce((sum, c) => sum + weights[c.risk], 0), 100);
  
  // Critical clause floors
  if (clauses.some(c => c.type === 'ip_ownership' && c.risk === 'red')) score = Math.max(score, 70);
  if (clauses.some(c => c.type === 'non_compete' && c.risk === 'red')) score = Math.max(score, 60);
  
  const level = score >= 60 ? 'red' : score >= 30 ? 'yellow' : 'green';
  return { score, level };
}
```

### Clause Detection Matrix

| Clause Type | Red Triggers | Yellow Triggers |
|-------------|-------------|-----------------|
| IP Ownership | "sole property of client", all IP transfers, includes pre-existing | Jointly owned, client owns upon payment |
| Non-Compete | Duration >1yr, broad scope | Duration <1yr, narrow scope |
| Unlimited Revisions | No cap, no time limit | Vague revision language |
| Liability | Unlimited liability, broad indemnification | One-sided indemnification |
| Payment Terms | No kill fee, net 60+, no late fees | Net 30-45, kill fee <25% |
| Termination | Terminate for convenience, no payment on term | <14 days notice, partial payment |

---

## 4. Data Model (Supabase)

### Tables
```sql
-- profiles (extends auth.users)
id UUID PK → auth.users(id), email, full_name, plan (free/pro), analyses_this_month, timestamps

-- contracts
id UUID PK, user_id FK, filename, storage_path, file_size_bytes, file_type (pdf/docx),
extracted_text, file_hash (SHA256 for caching), status (uploaded/processing/complete/failed),
auto_delete_at (NOW + 90 days), timestamps

-- analyses
id UUID PK, contract_id FK, user_id FK, overall_risk, risk_score (0-100), summary,
raw_llm_response JSONB, model_used, tokens_used, processing_time_ms, timestamps

-- clauses
id UUID PK, analysis_id FK, contract_id FK, type, risk, original_text, explanation,
suggestion, position_start, position_end, timestamps
```

### RLS Policies
All tables: users can only SELECT/INSERT/UPDATE/DELETE their own rows (`auth.uid() = user_id`).

---

## 5. Infrastructure
- **Frontend:** Vercel (Next.js) — ✅ Done
- **Backend:** Vercel Serverless Functions (same project or separate)
- **Storage:** Supabase Storage, private bucket "contracts", signed URLs with 1h expiry
- **Database:** Supabase Postgres with RLS
- **No new infra needed for MVP**

### Limits to watch
- Vercel function timeout: 60s (should be enough for single contract analysis)
- If analysis exceeds 60s: queue with Supabase Edge Functions or move to background job

---

## 6. Legal Disclaimers (CRITICAL)

### UX Integration Points
1. **Upload page:** Banner — "Contract Redliner provides AI-assisted analysis, not legal advice. Always consult a qualified attorney for legal decisions."
2. **Results page:** Top of every analysis — "⚠️ This is not legal advice" with link to full disclaimer
3. **Each clause suggestion:** Prefix — "AI suggestion (not legal advice):"
4. **Footer:** Every page — link to Terms of Service + Privacy Policy
5. **Signup flow:** Checkbox — "I understand this tool provides analysis, not legal advice"

### Terms of Service must include:
- Tool is for informational purposes only
- Not a substitute for professional legal counsel
- No attorney-client relationship created
- No guarantee of accuracy or completeness
- User assumes all risk from acting on analysis

---

## 7. Security

### Contract Data
- Encrypted at rest (Supabase default: AES-256)
- Auto-delete files after 90 days
- Users can delete their contracts at any time
- No training on user data — explicit in Privacy Policy

### API Security
- Rate limiting: 10 analyses/min per user
- File size limit: 10MB
- Only PDF/DOCX mime types accepted
- Input sanitization on all endpoints

---

## 8. MVP Scope Boundaries

### ✅ IN
- PDF and DOCX upload
- AI clause flagging (6 clause types)
- Red/Yellow/Green risk scoring
- Plain English explanations
- Rewrite suggestions
- User accounts (Supabase Auth)
- Free tier (1/month) + paid tiers

### ❌ OUT (Post-MVP)
- Voice input/output
- Third-party integrations (DocuSign, Google Drive)
- Collaborative editing
- Version tracking / diff between contracts
- Custom clause libraries
- Mobile app
- Multi-language support
