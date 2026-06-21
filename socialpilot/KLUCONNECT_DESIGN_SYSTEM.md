# KluConnect Design System

> Version 1.0 | June 21, 2026

Modern SaaS identity inspired by Linear, Stripe, and Framer — clean, premium, trust-forward.

---

## Brand Identity

| Token | Value | Usage |
|-------|-------|-------|
| **Product Name** | KluConnect | All user-facing surfaces |
| **Tagline** | Turn Every Comment Into A Customer | Hero, sidebar, emails |
| **Alt Tagline** | Your AI Social Sales Employee | Secondary marketing copy |
| **Internal Codename** | MetaPilot | Code comments, internal logs only |

---

## Color Palette

### Primary — Electric Blue
- `primary-500`: `#3B82F6`
- `primary-600`: `#2563EB` ← main CTA
- `primary-700`: `#1D4ED8`

### Secondary — Vibrant Purple
- `secondary-500`: `#8B5CF6`
- `secondary-600`: `#7C3AED`

### Accent — Emerald Green
- `accent-500`: `#10B981`
- `accent-600`: `#059669`

### Neutrals (Modern Grayscale)
- Background: `#FFFFFF` / dark `#0F172A`
- Foreground: `#0F172A` / dark `#F8FAFC`
- Muted: `#F1F5F9` / dark `#1E293B`
- Border: `#E2E8F0` / dark `#334155`

---

## CSS Variables

Defined in `frontend/src/app/globals.css`:

```css
--primary: 221 83% 53%;      /* Electric Blue */
--secondary: 262 83% 58%;    /* Vibrant Purple */
--accent: 160 84% 39%;       /* Emerald Green */
```

Dark mode supported via `.dark` class on `<html>`.

---

## Tailwind Extensions

`frontend/tailwind.config.ts`:
- `primary`, `secondary`, `accent` color scales
- `shadow-brand`, `shadow-brand-lg` for premium elevation
- Utility classes: `.gradient-brand`, `.text-gradient-brand`

---

## Typography

- **Font**: Inter (Google Fonts via `layout.tsx`)
- **Headings**: Bold, tight tracking (`tracking-tight`)
- **Body**: `text-gray-600`, relaxed leading

---

## Components

| Component | Path | Usage |
|-----------|------|-------|
| Logo | `components/Logo.tsx` | Nav, auth, sidebar |
| TrustStrip | `components/TrustStrip.tsx` | Landing, login, footer |
| MetaConnectedAccountCard | `components/MetaConnectedAccountCard.tsx` | Onboarding, settings |

---

## Logo System

- **Full logo**: K mark + connection nodes + "KluConnect" wordmark
- **Mark only**: Gradient rounded square with stylized K + nodes
- **Favicon**: Compact mark for browser tabs

All SVGs hand-coded in `frontend/public/branding/`.

---

## UI Patterns

1. **Cards**: `rounded-xl border border-gray-100` + `hover:shadow-brand`
2. **CTAs**: Primary blue with `shadow-brand`, secondary outlined
3. **Gradients**: `from-primary-600 via-secondary-600 to-accent-600` for hero CTAs
4. **Badges**: Rounded-full, semantic colors (accent=healthy, amber=warning, red=error)
5. **Spacing**: Consistent `space-y-6` dashboard rhythm

---

## Do Not

- Claim Meta partnership in trust copy
- Use MetaPilot in user-visible strings
- Use WhatsApp green as primary (reserved for accent/success)
