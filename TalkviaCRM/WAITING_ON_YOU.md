# Waiting on you — all three sprints

Software for reporting, email, and deployment is prepared.  
**I cannot finish go-live without the items below.**

---

## 1) Email (Sprint B) — almost done

| Need | Status |
|---|---|
| Mailbox `sales@klucare.com` | Created |
| Google **App password** (16 chars) for that mailbox | **Still needed** |
| Paste into CRM **Email settings** + Send test | You do this once |

**Do this now:**

1. Google Account for `sales@klucare.com` → Security → 2-Step Verification → App passwords → Mail  
2. Admin login → https://crm.klucare.com/mail-settings.php  
3. Fill Gmail defaults, username/from/reply-to = `sales@klucare.com`, paste app password → Save → Send test  

Guide: `EMAIL_SETUP.md`  
Do **not** paste the app password in chat.

---

## 2) Reporting (Sprint A) — no blocker

Calling reports are live. Optional later: tell me if you want extra KPIs (talk time, SLA, campaign filter).

---

## 3) Deploy `crm.klucare.com` (Sprint C) — blocked on hosting/DNS

| Need | Example | Why |
|---|---|---|
| DNS control for `klucare.com` | Cloudflare / GoDaddy / Hostinger DNS | Create `crm` subdomain |
| Hosting panel access or credentials | Hostinger / cPanel / VPS | Upload PHP app |
| Document root for subdomain | `public_html/crm` | Where zip extracts |
| MySQL database created | db name + user + password + host | `setup.php` |
| Real admin email/password you will use | not the local demo accounts | Production login |
| Preferred PHP version on host | 8.1 / 8.2 / 8.3 | Compatibility |

**Already prepared for you:**

- Release builder: `deploy\build-release.ps1` → zip without secrets  
- Steps: `DEPLOY.md`  
- HTTPS rewrite for `crm.klucare.com` in `.htaccess`

---

## Reply template (copy/paste)

```text
Email:
- Domain: 
- Shared mailbox: 
- App password: (send privately / paste only in CRM Email settings, not in chat if possible)
- From display name: 

Deploy:
- DNS where klucare.com is managed: 
- Hosting provider: 
- Subdomain created? (yes/no) crm.klucare.com → 
- MySQL host / database / user: (password privately)
- Admin name + email for production: 
```

After you send those (passwords can stay out of chat and go only into the host/CRM forms), I can walk the remaining configure + smoke steps with you.
