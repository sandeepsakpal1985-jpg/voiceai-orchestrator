# Sprint B — Google Workspace email setup

## What you get

| Direction | Behaviour |
|---|---|
| **Out** | Agent sends from CRM → SMTP as `sales@yourdomain.com` |
| **From name** | `Agent Name via KluCare Sales` |
| **Reply-To** | Shared business mailbox |
| **In** | Hospital replies appear in that **Gmail / Workspace inbox** |

No in-CRM shared inbox in this sprint.

## Purchase & mailbox (B1 — you)

1. Buy **Google Workspace** for Scalaux or KluCare domain.
2. Create user or shared mailbox, e.g. `sales@klucare.com` *(done)*.
3. Enable **2-Step Verification** on that Google account.
4. Create an **App password** (Google Account → Security → App passwords → Mail).  
   Use the 16-character app password — not the normal login password.
5. Keep the app password private (paste only into CRM Email settings).

## Configure CRM (B2)

1. Sign in as admin → **Email settings**: https://crm.klucare.com/mail-settings.php  
2. Click **Fill Gmail / Workspace defaults**.
3. Enter:
   - SMTP username = `sales@klucare.com`  
   - Sender email = `sales@klucare.com`  
   - Reply-To = `sales@klucare.com`  
   - Password = Google **app password**  
4. **Save email settings**.
5. **Send test** to your personal email.
6. Reply to the test → confirm it arrives in the `sales@klucare.com` Gmail inbox.

## Agent usage

On a hospital with status that allows email (e.g. Interested):

1. Open **Send email**
2. **To** prefills from source email — edit freely or add more with `;`  
   Example: `dr@hospital.com; admin@hospital.com`
3. Review subject/body → **Send email**

History is under **Email history** on the record.

## Security

- `crm/mail-config.php` is gitignored — never commit it.  
- Do not put the app password in chat, screenshots, or public zips.  
- Rotate the app password if it leaks.

## Troubleshooting

| Symptom | Check |
|---|---|
| “SMTP is not configured” | Save Email settings first |
| Authentication failed | App password (not normal login password); 2SV on |
| Timeout | Hosting must allow outbound TCP 587 |
| Reply went elsewhere | Reply-To and From must be the shared mailbox |
