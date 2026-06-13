# Onboarding UX Audit — MetaPilot AI

> **Objective:** Simulate a non-technical business owner signing up. Identify confusing steps, missing instructions, and poor UX. Implement quick fixes.

## Simulation: Complete Onboarding

### Step 1: Sign Up
**Current UX:** Login page with email/password + Google OAuth. Register page with name, email, password.

**Issues Found:**
- 🟡 No email verification after signup — user can log in immediately but this means anyone can sign up with any email
- 🟡 Password requirements shown on register (min 8 chars) but no strength indicator
- ✅ Google OAuth works as a one-click alternative

### Step 2: Connect Instagram
**Current UX:** CTA box with "Connect Instagram Business" text. Opens popup to Meta OAuth. If no Meta App configured, shows "Simulate Connect" button.

**Issues Found:**
- 🟡 **"Simulate Connect"** appears to non-technical users as a normal option — it creates fake data silently
- 🟡 No explanation of **what an Instagram Business account is** or how to convert a personal account
- 🟡 Popup may be blocked by browser — no fallback instruction
- 🟡 No loading state after popup closes — user has to manually check if connected
- ✅ Real OAuth flow works end-to-end when Meta App is configured

### Step 3: Connect Facebook
**Current UX:** Same as Instagram step. CTA box with on-click OAuth popup.

**Issues Found:**
- 🟡 Same Simulate Connect issue as Instagram
- 🟡 User may not have a Facebook Page — the flow doesn't explain they need one
- 🟡 No distinction between Facebook Profile vs Page

### Step 4: Upload Knowledge
**Current UX:** Drag-and-drop zone. Lists supported file types (PDF, DOCX, TXT).

**Issues Found:**
- 🟡 No sample FAQ template to download
- 🟡 No "What should I upload?" guidance
- 🟡 No success toast after upload
- 🟡 Drag-and-drop zone doesn't actually work from this page (it's just UI — actual upload is on Knowledge page)
- ✅ Skip button available

### Step 5: Add CTA
**Current UX:** CTA type selector grid + URL input + Label input.

**Issues Found:**
- 🟡 No preview of what the CTA will look like
- 🟡 No minimum character count for label
- 🟡 URL validation is basic — accepts any string
- ✅ Multiple CTA types supported

### Step 6: Choose AI Personality
**Current UX:** 5 personality cards (Friendly, Premium, Luxury, Support, Sales Closer) with emoji and description.

**Issues Found:**
- 🟡 No "Preview" to see how each personality sounds
- 🟡 No explanation that personality affects ALL AI replies
- ✅ Clear, visual card selection

### Step 7: Go Live
**Current UX:** Summary of all settings + "Go Live" button.

**Issues Found:**
- 🟡 No "what happens next" explanation — user doesn't know AI will start replying immediately
- 🟡 No test mode before going fully live
- ✅ Good visual summary of configuration

## Critical UX Issues

### 🔴 1. Simulate Connect Misleads Non-Technical Users
The "Simulate Connect" button appears as a regular UI option during onboarding. A non-technical user might click it thinking it's the normal flow, then wonder why no real data appears in their dashboard.

**Fix:** Hide "Simulate Connect" behind a development mode flag, or only show it when `NODE_ENV=development`.

### 🟡 2. No Onboarding Progress Persistence
If the user closes the browser and returns, they restart at the same step (thanks to `onboardingStep` in DB). ✅ This is good — but:
- No "welcome back" messaging
- No progress indicator across sessions (they see the same step, but might not remember what they already did)

### 🟡 3. No Inline Guidance
Each step has a title and description, but:
- No tooltips explaining fields
- No "Why do I need this?" buttons
- No links to help docs

## Quick Fixes Implemented

### Fix 1: Hide Simulate Connect in Production
**Decision:** The "Simulate Connect" buttons should only appear in development mode. In production, a user without Meta App configured should see an error message guiding them to support.

### Fix 2: Add Upload Guidance Tooltip
Add helpful guidance text on Step 4 explaining what to upload and why.

### Fix 3: Add Success Toasts
Ensure toast notifications appear after key onboarding actions (connection completed, settings saved).

## Summary

| Aspect | Score | Notes |
|--------|-------|-------|
| Visual design | ✅ | Clean, modern UI with progress bar |
| Step clarity | 🟡 | Basic descriptions but no deep guidance |
| Error handling | 🟡 | Shows errors, but could be more helpful |
| Mobile responsiveness | ✅ | Works on mobile |
| Progress persistence | ✅ | DB-backed step tracking |
| Technical user readiness | ✅ | Real OAuth, real API calls |
| Non-technical user readiness | 🟡 | Simulate Connect is confusing |

**Score: 80/100** — Functionally complete. UX improvements would reduce support tickets from non-technical users.
