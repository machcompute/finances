# Finances

Personal finance tracker for logging transactions, importing bank exports, reviewing spending, and cleaning up categories.

Live at [finances.machcomputing.com](https://finances.machcomputing.com). Part of the [Mach Computing](https://machcomputing.com) workspace.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS v4 with Mach Computing color tokens
- Recharts for analytics
- `@assistant-ui/react` plus an OpenAI-compatible client for the optional finance assistant
- No application backend; app data is stored in the browser

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Add transactions, upload/download OFX, list and remove transactions |
| `/summary` | Balance chart, date-range selection, category breakdowns, daily flow EMA and trend |
| `/edit` | Review transactions and bulk re-categorize uncategorized rows using similarity suggestions |
| `/categories` | Create categories and review category-level usage totals |
| `/import` | Multi-step CSV importer with column mapping, duplicate detection, category override, and balance anchor |
| `/accounts` | Create, rename, select, delete, and describe accounts; set per-account baselines |

## Data Model

Transactions are the main record:

```ts
type Transaction = {
  id: string;
  accountId: string;
  kind: "income" | "expense";
  amount: number;
  category?: string;
  date: string;
  note?: string;
};
```

Accounts are separate records with stable ids, display names, optional colors, and optional descriptions. Every transaction belongs to an account. The app starts with a seeded `Default` account and removes it after imports create real accounts when it is still empty.

Baselines are stored per account as `{ amount, date }`. They act as opening balances for the summary chart and account balance cards. When viewing all accounts, baselines are aggregated into a single starting point.

Categories are first-class app state and can be created on `/categories`. The category list also includes labels already present on transactions so older imported data keeps working. Uncategorized transactions are first-class and display as `Uncategorized`, but `Uncategorized` is not stored as a normal category.

## Persistence

Runtime state is client-side only and is hydrated from `localStorage` by `PersistenceLoader`.

- App data key: `finances:v1`
- Chat settings key: `finances:chat-settings`
- Export format: OFX

There is no server database, API route, or authentication layer. Clearing browser storage removes local app data unless it has been exported. Standalone categories with no transactions persist in browser storage, but OFX round trips categories through transaction data.

## Import And Export

OFX is the durable round-trip format. Export writes an OFX 2.x document with one statement per account and separate baseline statements. Import restores transactions, accounts, account descriptions, categories, and baselines where the OFX file contains them.

CSV import is handled on `/import`:

- Signed amount or debit/credit column modes
- Decimal `.` or `,`
- Date formats: auto, `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`
- Optional category and account columns
- Default destination account with automatic account creation from CSV values
- Initial or final balance anchors converted into account baselines
- Duplicate detection based on account, date, signed amount, and normalized note

CSV rows without categories stay uncategorized. Use `/edit` to classify them after import.

## Auto-Categorization

The edit page builds an in-memory category index from already categorized transactions. For each uncategorized transaction, it compares the transaction note against known descriptions per category using Levenshtein similarity:

```txt
similarity = 1 - distance / max(lengthA, lengthB)
```

The default threshold is `0.8`, adjustable on the page. Matching suggestions are previewed with per-row checkboxes before being applied. Individual category edits use a dropdown backed by the first-class category list.

## Finance Assistant

The floating assistant is optional and runs entirely in the browser. It talks to an OpenAI-compatible chat-completions endpoint configured in the chat settings dialog. The default base URL is:

```txt
http://localhost:11434/v1
```

Available frontend tools let the assistant list accounts, list categories, query transactions, summarize transactions, and propose category or note updates. Proposed edits open a confirmation modal and are only applied after user approval.

When the deployed HTTPS site points at a non-local HTTP model server, browsers block mixed content. The settings dialog includes localhost relay guidance for that case.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

No environment variables are required for the core app. The assistant needs a reachable OpenAI-compatible endpoint and a selected model in the UI.

## Project Notes

- The app is intentionally frontend-only.
- Business logic is concentrated in `app/lib/transactions.ts`, with OFX and CSV helpers in `app/lib/ofx.ts` and `app/lib/csv.ts`.
- Page-level import and chart calculations currently live in their route files.
- There is no test suite yet; `npm run lint` is the current automated baseline.
- Styling follows `../assets/style.md` and the local shadcn/Tailwind token setup in `app/globals.css`.
