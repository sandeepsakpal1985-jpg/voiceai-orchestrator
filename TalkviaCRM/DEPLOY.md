# Deploy Talkvia CRM to `crm.klucare.com`

This is the **hospital calling CRM** (Talkvia). KluCRM (Next.js) stays separate.

## What you must provide (blockers)

Fill these before go-live can finish:

1. **DNS** — ability to create `crm.klucare.com` (A or CNAME)
2. **Hosting** — PHP 8.0+ with `mysqli`, MySQL/MariaDB, HTTPS, Apache (or nginx equivalent)
3. **DB credentials** — host, database name, username, password
4. **Admin identity** — your real admin name + email + strong password (12+ chars)
5. **Google Workspace** — shared mailbox + app password (Sprint B)

Until those exist, use the release zip below and the checklist.

## Release artifact

Build on your machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\sande\ai-orchestrator\TalkviaCRM\deploy\build-release.ps1
```

Output: `TalkviaCRM\deploy\dist\klucare-crm-YYYYMMDD.zip`  
Contains only `crm/` (no `config.php`, no `mail-config.php`, no local seed secrets).

## Hostinger / cPanel style steps

1. Create subdomain **crm** → document root e.g. `public_html/crm` or `crm.klucare.com`
2. Create MySQL database + user; note credentials
3. Upload and extract the release zip so `index.php` sits in the web root of the subdomain
4. Open `https://crm.klucare.com/setup.php`
5. Enter DB details + create admin
6. Log in → **Update CRM** once if prompted (`update.php`)
7. **Manage agents** — create agents, set US / India / Both
8. **Email settings** — Google Workspace SMTP (see `EMAIL_SETUP.md`)
9. Import hospitals or add manually
10. Disable or protect `setup.php` after install (rename or deny in panel)

## DNS

| Type | Name | Value |
|---|---|---|
| A | `crm` | hosting server IP |
| or CNAME | `crm` | hoster’s target hostname |

Wait for propagation, then force HTTPS in the panel (Let’s Encrypt).

## Post-deploy smoke

- [ ] Admin login  
- [ ] Calling reports opens  
- [ ] Agent login → auto hospital  
- [ ] Save call & stay / dispose  
- [ ] Email test send + reply in Gmail  
- [ ] `https://crm.klucare.com` (no mixed HTTP)

## Rollback

Keep a DB dump + previous `crm` folder zip before each upload.
