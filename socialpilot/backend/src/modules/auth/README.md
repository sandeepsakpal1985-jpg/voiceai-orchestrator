# Auth Module — `/api/auth`

Handles user registration, login, JWT issuance, Google OAuth, and current user profile.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Register with email + password (min 8 chars) |
| POST | `/api/auth/login` | No | Login, returns JWT token |
| GET | `/api/auth/me` | JWT | Get current user profile + onboarding state |
| POST | `/api/auth/google` | No | Google OAuth ID token verification (creates/links user) |

## Architecture

- **Password hashing:** bcryptjs with 12 salt rounds
- **JWT:** Signed via `@fastify/jwt` plugin, 7-day expiry by default
- **Google OAuth:** Uses `google-auth-library` (dynamically imported) to verify ID tokens
- **Onboarding state:** `GET /me` returns `onboardingStep` and `onboardingDone` — frontend uses this to redirect to onboarding wizard
