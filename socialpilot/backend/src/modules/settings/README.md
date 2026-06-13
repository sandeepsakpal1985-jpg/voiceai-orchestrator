# Settings Module

**Prefix:** `/api/settings`

Manages the user's brand settings, AI personality preferences, and automation configuration.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get brand settings (auto-creates if missing) |
| PUT | `/` | Update brand settings |

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| businessName | string | `''` | Business display name |
| industry | string? | `null` | Industry vertical |
| website | string? | `null` | Business website URL |
| toneInstructions | string? | `null` | Custom tone guidelines |
| customInstructions | string? | `null` | Custom AI instructions |
| automationEnabled | boolean | `true` | Allow auto-respond |
| approvalMode | boolean | `false` | Require approval before posting |
| timezone | string | `'UTC'` | Business timezone |
| defaultPersonality | string | `'friendly'` | Default AI personality preset |
