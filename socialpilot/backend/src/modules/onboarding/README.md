# Onboarding Module — `/api/onboarding`

Multi-step onboarding flow for new users. Tracks progress through 7 steps and saves configuration on completion.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/onboarding` | Get current onboarding status |
| PUT | `/api/onboarding/step` | Advance to the next onboarding step |
| POST | `/api/onboarding/complete` | Complete onboarding (saves personality, CTA, flags as done) |

## Architecture

- 7 steps: `create_account` → `connect_instagram` → `connect_facebook` → `upload_faqs` → `add_cta` → `choose_personality` → `turn_on_automation`
- On frontend, the dashboard layout checks `onboardingDone` from `GET /api/auth/me` and redirects to `/onboarding` if not complete
- `POST /complete` saves the AI personality preference and CTA config, then marks `onboardingDone: true`
- Steps 0-1 (Instagram/Facebook connect) use Meta OAuth popup flow
