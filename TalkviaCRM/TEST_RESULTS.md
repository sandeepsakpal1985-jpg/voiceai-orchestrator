# Talkvia CRM — smoke & regression results

**Date:** 3 Nov 2026 (IST)  
**Target:** `http://127.0.0.1:8080`  
**Suite:** `_tools/talkvia-smoke-regression.ps1` (copy under KluCRM workspace)  
**Result:** **40 passed, 0 failed**

## Admin

| Check | Result |
|---|---|
| Login → hospital pipeline | Pass |
| Sidebar: reports, agents, email, availability | Pass |
| Sample hospitals visible | Pass |
| Calling reports + org totals + agent table | Pass |
| CSV export | Pass |
| Manage agents shows seeded users | Pass |
| Queue monitor | Pass |
| Email settings page | Pass |
| Logout | Pass |
| Unauthenticated `/reports.php` → login | Pass |

## Agent

| Check | Result |
|---|---|
| Login → auto-claim hospital | Pass (#2 in this run) |
| Call workspace + Calling script | Pass |
| No admin nav (reports / manage agents) | Pass |
| Save details (draft) | Pass |
| Save call & stay (No Answer) | Pass — same hospital |
| Take break (Tea / coffee) + resume | Pass — same hospital reserved |
| Dispose & next (Interested) | Pass → next queue step |
| `/reports.php` blocked (403) | Pass |

## Reports after activity

Non-zero call / KPI figures appear for Demo Agent after the smoke calls.

## Not covered in this HTTP suite

- Live browser layout / CSS visuals  
- Real SMTP send (Workspace not configured yet — Sprint B)  
- CSV import file upload  
- Two agents claiming at the same time  
- Calling-script page content in a new tab  
- Production host `crm.klucare.com` (Sprint C)

## How to re-run

```powershell
# Ensure MariaDB :3307 and PHP :8080 are up (TalkviaCRM\start-local.ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\sande\ai-orchestrator\KluCRM\_tools\talkvia-smoke-regression.ps1
```
