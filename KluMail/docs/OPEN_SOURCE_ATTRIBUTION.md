# Open-source attribution

No application source was copied or vendored from the reference help desks. They were reviewed as architecture references only.

## Chatwoot

- Repository: https://github.com/chatwoot/chatwoot
- License inspected in the repository: MIT Expat for the non-enterprise tree. The `enterprise/` directory is separately licensed. GitHub's SPDX field is `NOASSERTION` because of that split.
- Stack: Ruby on Rails. Not imported.
- Maintenance at review: active.

## FreeScout

- Repository: https://github.com/freescout-help-desk/freescout
- License inspected: AGPL-3.0. Default branch `dist`. PHP and Laravel.
- No code copied. AGPL would attach to a proprietary hosted product if the code were incorporated.

## Zammad

- Repository: https://github.com/zammad/zammad
- License inspected: AGPL-3.0. Ruby.
- No code copied.

## Open HelpDesk

- Repository: https://github.com/Open-HelpDesk/open-helpdesk
- License inspected: AGPL-3.0 outside `ee/`.
- The project was new and small at review. No code copied.

## Direct dependencies

Runtime and test dependencies are the packages in `package.json` and `package-lock.json`, including Next.js, React, Zod, React Hook Form, `pg`, `sanitize-html`, `bcryptjs`, Tailwind CSS, Vitest, and Playwright. Their licenses are the licenses of those published packages (MIT, Apache-2.0, or similar permissive terms). No AGPL package is a dependency.

Ideas reused without code: a shared inbox, explicit inbound and outbound messages, internal notes, assignment history, and a provider adapter in front of Gmail and Microsoft Graph.
