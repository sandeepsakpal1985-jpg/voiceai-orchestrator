# KluCare CRM sprint — email, reporting, deploy

**Product target:** Talkvia CRM → `https://crm.klucare.com`  
**Alternate product:** KluCRM SaaS (unchanged)

## Status overview

| Sprint | Status | Blocked on you? |
|---|---|---|
| **A — Reporting** | Complete | No |
| **B — Email** | CRM ready (settings + test send + Reply-To) | **Yes — Workspace mailbox + app password** |
| **C — Deploy** | **Live on https://crm.klucare.com** | Email SMTP still needs your Workspace app password |

See **[WAITING_ON_YOU.md](./WAITING_ON_YOU.md)** for the exact reply template.

---

### Sprint A — Reporting ✅

Admin **Calling reports** (`reports.php`): date range, org KPIs, per-agent table, break mix, CSV. Regression 40/40.

### Sprint B — Email ⏸️ awaiting credentials

- Email settings UI + Gmail defaults + test send  
- Outbound From = shared mailbox; Reply-To = shared mailbox  
- Agent display: `Name via KluCare Sales`  
- Docs: `EMAIL_SETUP.md`

### Sprint C — Deploy ⏸️ awaiting hosting/DNS

- `deploy/build-release.ps1` → `deploy/dist/klucare-crm-*.zip`  
- `DEPLOY.md` Hostinger-style steps  
- `.htaccess` HTTPS redirect for `crm.klucare.com`, deny secrets  
- `robots.txt` disallow indexing  

**Latest zip:** `deploy/dist/klucare-crm-20261103-0649.zip`

---

## Go-live definition of done

- [x] Admin reports + CSV  
- [x] Breaks / calls feed KPIs  
- [ ] Send as business Gmail  
- [ ] Replies land in that Gmail  
- [ ] `https://crm.klucare.com` live  
