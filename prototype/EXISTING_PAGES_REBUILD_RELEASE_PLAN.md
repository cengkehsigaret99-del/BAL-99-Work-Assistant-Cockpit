# BAL-99 — Replacement of existing GitHub Pages (same URL)

**Owner clarification:** The existing site `https://cengkehsigaret99-del.github.io/BAL-99-Work-Assistant-Cockpit/` is the site to be rebuilt. No new domain/repository is needed.

## Verified
- `main/index.html` is the existing BAL-99 landing page with links to old operational modules.
- `main/.github/workflows/deploy-pages.yml` deploys the **entire repository root** to GitHub Pages on every push to `main`.
- Replacing `main/index.html` will therefore replace the homepage at the existing URL, but other legacy HTML/CSV files will still be publicly accessible if left in the repository.
- Branch `plan/ppic-control-tower-rebuild-2026-11` contains the V05 single-file read-only demo; browser and print automated UAT passed.
- **No changes have been made to `main`**.

## Safe replacement plan
1. Preserve the old homepage source and linked module inventory for rollback.
2. Audit public repository content for private/sensitive files **before any additional publication**. The current workflow uploads the entire repository root; any sensitive files there may already be public.
3. Prepare a candidate replacement homepage in the feature branch only. Prefer deploying only an allowlisted `dist/` with `index.html`, public CSS/JS, and public assets; do not deploy CSV source archives or private files.
4. Validate new homepage, 13-report explorer, print, mobile, accessibility, and explicit DEMO labeling.
5. Verify GitHub Pages output contains **no operational source data**, no payroll, bank or customer files.
6. After explicit owner approval, merge to `main`, run Pages deployment, verify live URL and provide rollback commit.
7. Later connect private bank data via authenticated backend; **never embed it into public Pages**.

## Release status
NO-GO until public-data audit, deployment allowlist, and explicit approval. This file documents the target, not a deployed site.
