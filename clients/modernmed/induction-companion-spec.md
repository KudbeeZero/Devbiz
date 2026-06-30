# ModernMed — "First 72 Hours" Induction Companion
### Architecture & compliance spec (design only — nothing in this document is built or wired to real patients)

> **Status:** concept spec for client review. No PHI, no live messaging, and no patient
> data exist anywhere in this work. This document describes *how* such a system could be
> built responsibly if the practice chooses to pursue it. Building any live component is an
> explicit owner-approval gate (and the messaging/AI pieces require signed BAAs).

---

## 1. Why this exists

Starting Suboxone (buprenorphine) is the highest-stakes window in medication-assisted
recovery. The patient must wait for moderate withdrawal before the first dose, then ride out
a rough 24–72 hours where small course-corrections and a fast human response make the
difference between a patient who stabilizes and one who drops off. **Most clinics go quiet in
exactly this window.** ModernMed's differentiator is that it doesn't.

The Induction Companion productizes that promise: a structured, low-friction check-in cadence
across the first 72 hours, AI-assisted triage so the *right* patient gets a human call *fast*,
and a clinician board that shows who needs attention next — **without any patient-identifying
information ever leaving the practice's control.**

**Primary goals**
- Time-to-first-human-contact during an active induction: target **< 60 minutes**.
- Reduce early drop-off with guided, scheduled symptom check-ins (COWS-style).
- Save clinician time: only escalations require a call; everything else is automated/reassured.
- **Zero PHI in any Kudbee-operated system.**

This is decision support and engagement only. It **never** prescribes, doses, or replaces
clinical judgment. A licensed clinician owns every clinical action.

---

## 2. The core idea: two zones, strict separation

The system is split into two zones with a hard boundary. The only thing that crosses the
boundary is **de-identified data keyed by an opaque code**.

```
  ZONE A — CLINICAL (the practice controls this)            ZONE B — OPERATIONS (Kudbee builds this)
  ┌─────────────────────────────────────────┐              ┌──────────────────────────────────────┐
  │ Local agent on a practice machine OR a    │   opaque     │ Dashboard (Induction Ops tab)         │
  │ BAA-covered private service               │   code +     │ AI triage + summarization             │
  │                                           │ de-identified │ Escalation routing logic              │
  │ • Identity map:  PT-4F9A  ⇄  real patient │   scores      │ Aggregate metrics                     │
  │ • Phone numbers / contact details         │ ───────────▶ │                                       │
  │ • Clinical notes / EHR (never sent up)    │              │ NO names. NO phone numbers.           │
  │ • Sends/receives the actual SMS           │ ◀─────────── │ NO contact info. NO clinical records. │
  │                                           │  triage flags │ Only: code, timestamps, scores, state │
  └─────────────────────────────────────────┘              └──────────────────────────────────────┘
```

- **Zone A** holds everything identifying: the map from `PT-4F9A` → a real person, phone
  numbers, and any clinical notes. It runs either as a small **local agent installed on a
  practice machine** (nothing identifying leaves the building) or inside a **BAA-covered
  private environment** the practice owns.
- **Zone B** — the dashboard, AI, and routing that Kudbee operates — only ever sees the opaque
  code plus de-identified data (timestamps, symptom scores, induction stage, status). It can
  triage and prioritize without ever knowing *who* anyone is.

**The honest caveat:** if real SMS is sent to patients, *someone* holds a phone number, and a
phone number tied to addiction treatment is PHI. We don't pretend otherwise. The design keeps
that PHI **exclusively in Zone A** (local or BAA-covered) and keeps it **entirely out of every
Kudbee-operated system**. "No PHI" is a precise claim about Zone B, not a magic trick.

---

## 3. Data model (what Zone B is allowed to see)

A check-in event as it appears in Zone B — note the total absence of identifiers:

```json
{
  "code": "PT-4F9A",            // opaque, random; meaningless outside Zone A
  "induction_started_at": "T0",  // relative/coarse timestamps, not wall-clock DOB-adjacent
  "stage": "first_24h",          // pre_first_dose | first_24h | h24_48 | h48_72 | graduated
  "checkin_at": "T0+6h10m",
  "cows_score": 9,               // a withdrawal severity number, not a diagnosis or note
  "cows_band": "mild",
  "status": "on_track",          // on_track | watch | escalated | stable | graduating
  "next_action": "auto_checkin_2h"
}
```

What is **never** in Zone B: name, DOB, address, phone, email, MRN, free-text clinical notes,
medication specifics tied to a person, or anything from which identity could be re-derived.
De-identification follows HIPAA Safe Harbor principles (strip the 18 identifiers); coarse
relative timestamps avoid the date-identifier trap.

---

## 4. The first-72-hours flow

| When | What happens | Where |
|---|---|---|
| **T-0 (intake)** | Clinician enrolls patient, system issues opaque code, identity map stored | Zone A |
| **Pre-first-dose** | Patient gets a link (no app install): "when to take your first dose," what to watch for | Zone A sends; Zone B schedules |
| **q2–4h, first 24h** | Patient taps link → 5-question COWS-style check → submits score | Patient → Zone A → de-identified to Zone B |
| **On each check-in** | AI summarizes + bands the score, updates the triage board, flags red-flags | Zone B |
| **Escalation** | Red-flag or overdue check-in → on-call clinician paged to call (Zone A re-identifies) | Zone B flags → Zone A acts |
| **24–72h** | Cadence tapers as patient stabilizes | Zone B schedules |
| **Graduation** | System proposes ongoing weekly cadence; clinician confirms | Zone A |

The patient experience is deliberately frictionless: **a text link, a few taps, no app, no
login, no portal account.** Lower friction = higher completion in exactly the window where
completion matters most.

---

## 5. AI — assistive, human-in-the-loop, never autonomous

- **Summarize**: turn each raw check-in into a one-line clinician-readable status.
- **Triage/prioritize**: rank the board so the patient who needs a call is at the top.
- **Draft (not send)**: propose an on-protocol, supportive reply for a **clinician to approve**
  before anything goes back to the patient. No auto-send of clinical content.
- **Never**: prescribe, dose, diagnose, or take a clinical action without a human.

The AI runs only on de-identified Zone B data. If a higher-tier model is used, it sees codes
and scores — never identity. Default to the most capable current Claude model for
summarization/triage, behind a provider interface so it can be swapped or run in a
BAA-covered configuration.

**Owner gate:** enabling any AI/API key for this is a stop-and-confirm action requiring the
`OWNER-OK` token per the repo's PR-flow rules.

---

## 6. Messaging — HIPAA-eligible, BAA-backed

Real patient SMS must run through a **HIPAA-eligible provider under a signed BAA**. Viable
backbones (all sign BAAs):

- **Twilio** (HIPAA-eligible Programmable Messaging) — fastest path for SMS.
- **AWS** — End User Messaging / Pinpoint for SMS, Lambda + DynamoDB for Zone-A logic, KMS for
  encryption. AWS signs a BAA covering HIPAA-eligible services.
- **Google Cloud** — comparable; GCP signs a BAA.

The messaging integration lives in **Zone A** (it needs the phone number). Zone B never touches
the carrier or the number — it only says "patient `PT-4F9A` is due for a check-in," and Zone A
resolves that to a real send.

---

## 7. "Revolutionary" without the buzzword — and explicitly NOT blockchain

The owner asked about blockchain. **We recommend against it**, and here's the straight reasoning:

- Blockchain's defining feature is an **immutable, shared, append-only ledger**. That directly
  **conflicts with HIPAA's right-to-amend and right-to-erasure** — you cannot easily delete or
  correct a record, which is a legal requirement for health data.
- It adds nothing to privacy. You'd still keep PHI *off-chain* anyway, so the chain only ever
  holds the same de-identified data we already isolate in Zone B — at far higher complexity and
  cost.
- What people actually want from "blockchain" here is **tamper-evidence and auditability**.

We deliver that with a **hash-chained, append-only audit log**: every event (check-in,
escalation, clinician action) is written with a cryptographic hash of the previous entry, so
any tampering is detectable, and entries can be signed. Same trust guarantee, no distributed
ledger, no compliance landmine, and records remain correctable/erasable as the law requires.
That — local-first de-identification + AI triage in the critical window + a verifiable audit
trail — is the genuinely novel part, not a token or a chain.

---

## 8. Marketing-site compliance (applies to the landing page too)

Tracking a *medical* website carries its own HIPAA exposure (per the HHS guidance on online
trackers). The landing page and any analytics must:

- **Not** load Meta Pixel / standard Google Analytics in a way that ships identifiable visitor
  data + health-context to a third party without a BAA.
- Prefer **privacy-first, self-hostable analytics** (e.g., Piwik PRO / Plausible-style) and
  **call-tracking that anonymizes** the patient side.
- Keep the consult form's data flow inside BAA-covered infrastructure; never log PHI into a
  marketing analytics tool.
- The dashboard's **Growth & Marketing** tab shows *aggregate* counts only (visits, consults,
  calls, sources) — no individual visitor identities.

---

## 9. Phasing

1. **Phase 0 — concept (this work):** landing page + mock dashboard (both tabs) + this spec. No
   data, no messaging, no AI. ✅ delivered.
2. **Phase 1 — pilot scaffold:** Zone-A local agent + opaque-code issuance + manual check-in
   entry; dashboard reads de-identified data. Still no automated SMS.
3. **Phase 2 — messaging:** BAA-backed SMS check-ins (Twilio/AWS/GCP); scheduled cadence.
4. **Phase 3 — AI triage:** summarization + prioritization on de-identified data, human-in-loop
   drafts. Audit log live.
5. **Phase 4 — hardening:** security review, BAA execution, access controls, retention policy,
   incident plan.

Each phase past Phase 0 is an explicit owner decision; Phases 2–3 require `OWNER-OK` (enabling
messaging / AI keys / anything touching patient data).

---

## 10. Risks & open items

- **Regulatory:** confirm SAMHSA/42 CFR Part 2 obligations for SUD records — stricter than
  HIPAA for substance-use treatment; the two-zone design helps but Part 2 needs explicit review.
- **Clinical safety:** escalation thresholds and on-call coverage must be clinician-defined; the
  system must fail safe (overdue check-in = escalate, never silently drop).
- **Liability:** patient-facing messaging wording must be clinician-approved and avoid anything
  that reads as individualized medical advice from an automated source.
- **Verification needed:** whether the practice prefers a fully-local agent vs. a BAA-covered
  cloud; existing EHR/booking stack to integrate with; carrier/number strategy.

---

*Prepared by Kudbee as a concept spec. Not medical or legal advice. Any production build
requires the practice's clinical leadership, a HIPAA/Part 2 compliance review, executed BAAs,
and explicit owner authorization.*
