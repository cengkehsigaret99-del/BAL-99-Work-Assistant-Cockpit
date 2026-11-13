# BAL PPIC — Chat Upload → Excel Version → Private Data Bank → Web Update

## Owner-approved workflow
The owner uploads source files to the ChatGPT conversation. The assistant should:
1. Inventory sources and cutoffs, retain original files and document lineage.
2. Validate structure, units, duplicate document IDs, SKU/HJE, inventory equations, and cross-division gaps; distinguish actual/estimate/reference.
3. Produce a versioned Excel workbook with source register, reconciliation, exceptions, and readable reports; never overwrite LOCKED historical periods.
4. Store workbook and source manifest in the approved private Drive/control tower, update central register (filename, link, version, cutoff, status) if connector permissions allow.
5. Publish approved **non-sensitive, aggregated** web data only after authorization/privacy checks; full sensitive bank data requires authenticated private API/backend.
6. Verify GitHub build/deploy and public website; report direct Excel and website links plus unresolved gaps.

## Current implementation state
- Chat-triggered ingestion is a workflow **requirement**, not an already running automatic bridge.
- GitHub Pages is public and read-only. It cannot directly read private ChatGPT uploads or private Drive files.
- Website currently has no authenticated data API, no private database, and no ingestion pipeline.
- Until those are built, assistant can generate Excel and perform explicitly authorized GitHub updates per upload, but must not claim live synchronization.
- Do not commit payroll, customer, piutang, cash/bank, private invoices or raw operational documents into the public repository.
- Do not integrate Web SKT.
- November is WORKING/OPEN RECON. LOCKED periods must not be silently revised.

## Delivery contract for each upload
- File Excel downloadable with version/cutoff/status.
- Reconciliation summary and gaps.
- Drive link + register update if successfully performed.
- Web URL and deployment run only if successfully updated and verified.
- Explicit notice when any stage is blocked or pending.
