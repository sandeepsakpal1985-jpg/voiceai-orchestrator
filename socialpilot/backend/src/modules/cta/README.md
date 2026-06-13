# CTA Module — `/api/cta`

Call-to-action configuration for automated DM suggestions. The AI includes CTAs in conversations based on context and lead score.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cta` | List all CTAs for the current user |
| POST | `/api/cta` | Create a new CTA |
| PUT | `/api/cta/:id` | Update a CTA |
| DELETE | `/api/cta/:id` | Delete a CTA |

## Architecture

- Supported types: `website`, `whatsapp`, `calendly`, `demo_booking`, `payment_link`
- Each CTA has a label (display text), URL, and optional `isDefault` flag
- CTAs are configured during onboarding step 3 and can be managed from settings
