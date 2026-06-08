# ZimSolve production notes

This pnpm monorepo contains the Express API server and React/Vite dashboard. Production bases are environment-driven:

- Main app: `APP_BASE_URL` (production default `https://ts.totalsportss.online`)
- Documents API: `DOCUMENTS_BASE_URL` (production default `https://doc.totalsportss.online`)

Security-sensitive provider keys, payment secrets, initial administrator secrets, and AI configuration must be configured only through backend environment variables. Do not place secrets in frontend code.

Current production posture:

- Authenticated weekly AI token allowance: 60,000.
- Guest weekly AI token allowance: 20,000.
- Paid packages are server-defined in the billing route.
- DiscHub is available alongside existing payment methods when configured.
- Document browsing/search/download is aligned to `/api/v1/documents` and `/api/v1/search`.
- Free AI proxy functionality is intentionally removed and must not be restored.
- Admin setup requires `ADMIN_INIT_TOKEN`; if unset, setup is disabled.
