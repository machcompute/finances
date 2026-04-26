# Finances

Personal finance tracker. Live at [finances.machcomputing.com](https://finances.machcomputing.com).

Part of the [Mach Computing](https://machcomputing.com) monorepo. Built with Next.js 16, React 19, Tailwind v4, and Recharts. No backend — state lives in memory and round-trips through OFX export/import.

## Routes

| Path          | What it does                                                                       |
| ------------- | ---------------------------------------------------------------------------------- |
| `/`           | Add transaction (income / expense), download/upload OFX, list & remove entries     |
| `/summary`    | Cumulative balance chart with drag-to-select interval, totals, by-category bars, daily-flow EMA + trend |
| `/edit`       | Bulk re-categorize uncategorized transactions with a Levenshtein-based suggester   |
| `/import`     | Multi-step CSV importer with column mapping and balance-anchor                     |

## Concepts

- **Transactions** are the unit of state: `{ id, kind, amount, category?, date, note?, account? }`. `category` is optional — uncategorized rows are first-class.
- **Categories** are derived live from the categorized transactions in the store. Type a new category name into any combobox to create it.
- **Baseline** is a separate `{ amount, date }` pair used as the starting point for the cumulative balance chart and the "Balance" card. Set via the CSV importer's anchor controls; round-trips through OFX export.

## Import / export

- **OFX** is the only persisted format. Export writes a standards-conformant OFX 2.x file with the baseline as a separate opening `<STMTTRNRS>` block. Import dedupes transactions by `FITID` and restores the baseline. Drag-and-drop on `/` works.
- **CSV** import has its own page (`/import`) for column mapping. Supports signed-amount or debit/credit columns, decimal `.`/`,`, multiple date formats, optional default account, and an initial-or-final balance anchor that becomes the chart baseline.

## Auto-categorization

CSV imports default to `category = null`. To bulk-categorize, the **`/edit`** page builds a per-category index of existing categorized transactions' descriptions and ranks each uncategorized row's description against them via **max similarity** (`1 − levenshtein / max(len)`). Above the threshold (default 0.8, slider on the page) the suggested category becomes the proposal; the user picks which proposals to accept via per-row checkboxes.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

No env vars required. Data is in-memory only — refresh wipes everything except what's been exported.

## Style

Follows the [Mach Computing style guide](../assets/style.md). Geist fonts, MC color tokens (`mc-dark`, `mc-mint`, `mc-lavender`, `mc-lime`, `mc-gray`), Tailwind v4 via `@theme` (not `@theme inline`).
