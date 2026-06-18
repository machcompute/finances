import { useMemo, useSyncExternalStore } from "react";
import { exportToOFX, fitidFromId, parseOFX, ParsedOFXAccount } from "./ofx";
import { buildCategoryIndex, suggestCategoryFromIndex } from "./csv";

export type TransactionKind = "income" | "expense";

export type Account = {
  id: string;
  name: string;
  color?: string;
  description?: string;
};

export type Transaction = {
  id: string;
  accountId: string;
  kind: TransactionKind;
  amount: number;
  category?: string;
  date: string;
  note?: string;
};

export const UNCATEGORIZED_LABEL = "Uncategorized";
export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_ACCOUNT_NAME = "Default";

export type Baseline = { amount: number; date: string };

const SERVER_TX_SNAPSHOT: Transaction[] = [];
const SERVER_ACCOUNT_SNAPSHOT: Account[] = [
  { id: DEFAULT_ACCOUNT_ID, name: DEFAULT_ACCOUNT_NAME },
];
const SERVER_BASELINES_SNAPSHOT: Map<string, Baseline> = new Map();
const SERVER_SELECTED_ACCOUNT_SNAPSHOT: string | null = null;

let txStore: Transaction[] = [];
let accountStore: Account[] = [
  { id: DEFAULT_ACCOUNT_ID, name: DEFAULT_ACCOUNT_NAME },
];
let baselineStore: Map<string, Baseline> = new Map();
let selectedAccountIdStore: string | null = null;
let cachedIndexFor: Transaction[] | null = null;
let cachedIndex: ReturnType<typeof buildCategoryIndex> | null = null;

const txListeners = new Set<() => void>();
const accountListeners = new Set<() => void>();
const baselineListeners = new Set<() => void>();
const selectedAccountListeners = new Set<() => void>();

function freshId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function transactionDedupKey(
  tx: Pick<Transaction, "accountId" | "kind" | "amount" | "date" | "note">,
): string {
  const note = (tx.note ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const signed = (tx.kind === "expense" ? -tx.amount : tx.amount).toFixed(2);
  return `${tx.accountId}|${tx.date}|${signed}|${note}`;
}

function subscribeTx(listener: () => void): () => void {
  txListeners.add(listener);
  return () => {
    txListeners.delete(listener);
  };
}

function commitTx(next: Transaction[]): void {
  txStore = next;
  cachedIndexFor = null;
  cachedIndex = null;
  txListeners.forEach((l) => l());
  persist();
}

function subscribeAccounts(listener: () => void): () => void {
  accountListeners.add(listener);
  return () => {
    accountListeners.delete(listener);
  };
}

function commitAccounts(next: Account[]): void {
  accountStore = next;
  accountListeners.forEach((l) => l());
  persist();
}

function subscribeBaselines(listener: () => void): () => void {
  baselineListeners.add(listener);
  return () => {
    baselineListeners.delete(listener);
  };
}

function commitBaselines(next: Map<string, Baseline>): void {
  baselineStore = next;
  baselineListeners.forEach((l) => l());
  persist();
}

function subscribeSelectedAccount(listener: () => void): () => void {
  selectedAccountListeners.add(listener);
  return () => {
    selectedAccountListeners.delete(listener);
  };
}

function commitSelectedAccount(next: string | null): void {
  selectedAccountIdStore = next;
  selectedAccountListeners.forEach((l) => l());
  persist();
}

const STORAGE_KEY = "finances:v1";
let hydrated = false;

type PersistedState = {
  txs: Transaction[];
  accounts: Account[];
  baselines: [string, Baseline][];
  selectedAccountId: string | null;
};

function persist(): void {
  if (typeof window === "undefined" || !hydrated) return;
  try {
    const state: PersistedState = {
      txs: txStore,
      accounts: accountStore,
      baselines: [...baselineStore.entries()],
      selectedAccountId: selectedAccountIdStore,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function hydratePersistedState(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const state = JSON.parse(raw) as Partial<PersistedState>;
    if (Array.isArray(state.accounts) && state.accounts.length > 0) {
      accountStore = state.accounts;
    }
    if (Array.isArray(state.txs)) {
      txStore = state.txs;
      cachedIndexFor = null;
      cachedIndex = null;
    }
    if (Array.isArray(state.baselines)) {
      baselineStore = new Map(state.baselines);
    }
    if (
      typeof state.selectedAccountId === "string" ||
      state.selectedAccountId === null
    ) {
      selectedAccountIdStore = state.selectedAccountId ?? null;
    }
  } catch {
    return;
  }
  txListeners.forEach((l) => l());
  accountListeners.forEach((l) => l());
  baselineListeners.forEach((l) => l());
  selectedAccountListeners.forEach((l) => l());
}

function getCategoryIndex(): ReturnType<typeof buildCategoryIndex> {
  if (cachedIndexFor === txStore && cachedIndex) return cachedIndex;
  cachedIndex = buildCategoryIndex(txStore);
  cachedIndexFor = txStore;
  return cachedIndex;
}

function deriveCategories(txs: Transaction[]): string[] {
  const set = new Set<string>();
  for (const tx of txs) {
    if (tx.category) set.add(tx.category);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function useAccounts(): Account[] {
  return useSyncExternalStore(
    subscribeAccounts,
    () => accountStore,
    () => SERVER_ACCOUNT_SNAPSHOT,
  );
}

export function useSelectedAccountId(): string | null {
  return useSyncExternalStore(
    subscribeSelectedAccount,
    () => selectedAccountIdStore,
    () => SERVER_SELECTED_ACCOUNT_SNAPSHOT,
  );
}

export function setSelectedAccountId(id: string | null): void {
  if (id !== null && !accountStore.some((a) => a.id === id)) return;
  if (selectedAccountIdStore === id) return;
  commitSelectedAccount(id);
}

export function addAccount(
  name: string,
  color?: string,
  description?: string,
): Account {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Account name is required.");
  const existing = accountStore.find(
    (a) => a.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return existing;
  const account: Account = {
    id: freshId(),
    name: trimmed,
    color,
    description: description?.trim() || undefined,
  };
  commitAccounts([...accountStore, account]);
  return account;
}

export function setAccountDescription(id: string, description: string): void {
  const trimmed = description.trim();
  let changed = false;
  const next = accountStore.map((a) => {
    if (a.id !== id) return a;
    const value = trimmed || undefined;
    if (a.description === value) return a;
    changed = true;
    return { ...a, description: value };
  });
  if (changed) commitAccounts(next);
}

export function getOrCreateAccountByName(name: string): Account {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Account name is required.");
  const existing = accountStore.find(
    (a) => a.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return existing;
  return addAccount(trimmed);
}

export function renameAccount(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  let changed = false;
  const next = accountStore.map((a) => {
    if (a.id !== id) return a;
    if (a.name === trimmed) return a;
    changed = true;
    return { ...a, name: trimmed };
  });
  if (changed) commitAccounts(next);
}

export function deleteAccount(id: string): void {
  if (accountStore.length <= 1) return;
  if (!accountStore.some((a) => a.id === id)) return;
  commitAccounts(accountStore.filter((a) => a.id !== id));
  const txsLeft = txStore.filter((t) => t.accountId !== id);
  if (txsLeft.length !== txStore.length) commitTx(txsLeft);
  if (baselineStore.has(id)) {
    const next = new Map(baselineStore);
    next.delete(id);
    commitBaselines(next);
  }
  if (selectedAccountIdStore === id) commitSelectedAccount(null);
}

export function pruneEmptySeededDefault(): boolean {
  if (accountStore.length <= 1) return false;
  const exists = accountStore.some((a) => a.id === DEFAULT_ACCOUNT_ID);
  if (!exists) return false;
  const hasTx = txStore.some((t) => t.accountId === DEFAULT_ACCOUNT_ID);
  if (hasTx) return false;
  if (baselineStore.has(DEFAULT_ACCOUNT_ID)) return false;
  deleteAccount(DEFAULT_ACCOUNT_ID);
  return true;
}

export function useBaselines(): Map<string, Baseline> {
  return useSyncExternalStore(
    subscribeBaselines,
    () => baselineStore,
    () => SERVER_BASELINES_SNAPSHOT,
  );
}

export function useBaseline(accountId: string): Baseline | null {
  const baselines = useBaselines();
  return baselines.get(accountId) ?? null;
}

export function setBaseline(
  accountId: string,
  amount: number,
  date: string,
): void {
  if (!isFinite(amount) || !date) return;
  if (!accountStore.some((a) => a.id === accountId)) return;
  const next = new Map(baselineStore);
  next.set(accountId, { amount, date });
  commitBaselines(next);
}

export function clearBaseline(accountId: string): void {
  if (!baselineStore.has(accountId)) return;
  const next = new Map(baselineStore);
  next.delete(accountId);
  commitBaselines(next);
}

export function aggregateBaseline(
  baselines: Map<string, Baseline>,
  accountIds: string[],
): Baseline | null {
  let amount = 0;
  let earliest: string | null = null;
  let any = false;
  for (const id of accountIds) {
    const b = baselines.get(id);
    if (!b) continue;
    any = true;
    amount += b.amount;
    if (earliest === null || b.date < earliest) earliest = b.date;
  }
  if (!any || earliest === null) return null;
  return { amount, date: earliest };
}

export function useTransactions(): Transaction[] {
  return useSyncExternalStore(
    subscribeTx,
    () => txStore,
    () => SERVER_TX_SNAPSHOT,
  );
}

export function useFilteredTransactions(): Transaction[] {
  const txs = useTransactions();
  const selected = useSelectedAccountId();
  return useMemo(() => {
    if (selected === null) return txs;
    return txs.filter((t) => t.accountId === selected);
  }, [txs, selected]);
}

export function useCategories(): string[] {
  const txs = useTransactions();
  return useMemo(() => deriveCategories(txs), [txs]);
}

export function addTransaction(tx: Omit<Transaction, "id">): void {
  if (!accountStore.some((a) => a.id === tx.accountId)) return;
  commitTx([{ ...tx, id: freshId() }, ...txStore]);
}

export function removeTransaction(id: string): void {
  commitTx(txStore.filter((t) => t.id !== id));
}

export function setTransactionCategory(
  id: string,
  category: string | undefined,
): void {
  let changed = false;
  const next = txStore.map((tx) => {
    if (tx.id !== id) return tx;
    const trimmed = category?.trim() || undefined;
    if (tx.category === trimmed) return tx;
    changed = true;
    return { ...tx, category: trimmed };
  });
  if (changed) commitTx(next);
}

export type BatchAddResult = {
  added: number;
  skipped: number;
  categoriesAdded: number;
};

export function addTransactionsBatch(
  txs: Omit<Transaction, "id">[],
  options: { dedupe?: boolean } = {},
): BatchAddResult {
  const dedupe = options.dedupe ?? true;
  if (txs.length === 0) {
    return { added: 0, skipped: 0, categoriesAdded: 0 };
  }

  const validAccountIds = new Set(accountStore.map((a) => a.id));
  const seen = new Set(deriveCategories(txStore).map((c) => c.toLowerCase()));
  const seenKeys = dedupe
    ? new Set(txStore.map(transactionDedupKey))
    : new Set<string>();
  let categoriesAdded = 0;
  let skipped = 0;

  const toAdd: Transaction[] = [];
  for (const draft of txs) {
    if (!validAccountIds.has(draft.accountId)) continue;
    if (dedupe && seenKeys.has(transactionDedupKey(draft))) {
      skipped++;
      continue;
    }
    if (draft.category) {
      const lc = draft.category.toLowerCase();
      if (!seen.has(lc)) {
        seen.add(lc);
        categoriesAdded++;
      }
    }
    toAdd.push({ ...draft, id: freshId() });
  }

  if (toAdd.length > 0) commitTx([...toAdd, ...txStore]);

  return { added: toAdd.length, skipped, categoriesAdded };
}

export function batchDedupFlags(txs: Omit<Transaction, "id">[]): boolean[] {
  const seenKeys = new Set(txStore.map(transactionDedupKey));
  return txs.map((draft) => seenKeys.has(transactionDedupKey(draft)));
}

export function downloadOFX(filename = "finances.ofx"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob(
    [exportToOFX(accountStore, txStore, baselineStore)],
    { type: "application/x-ofx" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type OFXImportResult =
  | {
      ok: true;
      added: number;
      skipped: number;
      categoriesAdded: number;
      baselinesApplied: number;
      accountsCreated: number;
    }
  | { ok: false; error: string };

export function importOFX(
  text: string,
  destinationAccountId: string,
): OFXImportResult {
  const parsed = parseOFX(text);
  if (!parsed.ok) return parsed;

  if (!accountStore.some((a) => a.id === destinationAccountId)) {
    return { ok: false, error: "Destination account no longer exists." };
  }

  const existingIds = new Set(txStore.map((t) => fitidFromId(t.id)));
  const seenCategories = new Set(
    deriveCategories(txStore).map((c) => c.toLowerCase()),
  );
  let categoriesAdded = 0;

  const accountsBefore = accountStore.length;
  const accountByLcName = new Map<string, Account>();
  for (const a of accountStore) {
    accountByLcName.set(a.name.toLowerCase(), a);
  }

  function resolveAccount(parsedAccount: ParsedOFXAccount): string {
    if (parsedAccount.kind === "legacy" || parsedAccount.kind === "destination") {
      return destinationAccountId;
    }
    const lc = parsedAccount.name.toLowerCase();
    const existing = accountByLcName.get(lc);
    if (existing) return existing.id;
    const created = addAccount(
      parsedAccount.name,
      undefined,
      parsedAccount.description,
    );
    accountByLcName.set(lc, created);
    return created.id;
  }

  const toAdd: Transaction[] = [];
  let skipped = 0;
  for (const p of parsed.transactions) {
    if (existingIds.has(p.fitid)) {
      skipped++;
      continue;
    }
    const kind: TransactionKind = p.amount >= 0 ? "income" : "expense";

    let memoCategory: string | undefined;
    let note: string | undefined;
    if (p.memo) {
      const m = p.memo.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (m) {
        memoCategory = m[1].trim() || undefined;
        note = m[2].trim() || undefined;
      } else {
        note = p.memo;
      }
    }
    const rawCategory = (
      memoCategory ??
      p.category ??
      p.name ??
      ""
    ).trim();
    const category =
      rawCategory && rawCategory !== UNCATEGORIZED_LABEL
        ? rawCategory
        : undefined;

    if (category) {
      const lc = category.toLowerCase();
      if (!seenCategories.has(lc)) {
        seenCategories.add(lc);
        categoriesAdded++;
      }
    }

    toAdd.push({
      id: p.fitid,
      accountId: resolveAccount(p.account),
      kind,
      amount: Math.abs(p.amount),
      category,
      date: p.date,
      note,
    });
  }

  if (toAdd.length > 0) commitTx([...toAdd, ...txStore]);

  let baselinesApplied = 0;
  if (parsed.baselines.length > 0) {
    const next = new Map(baselineStore);
    for (const b of parsed.baselines) {
      const accountId = resolveAccount(b.account);
      next.set(accountId, { amount: b.amount, date: b.date });
      baselinesApplied++;
    }
    commitBaselines(next);
  }

  const accountsCreated = accountStore.length - accountsBefore;
  if (accountsCreated > 0) pruneEmptySeededDefault();

  return {
    ok: true,
    added: toAdd.length,
    skipped,
    categoriesAdded,
    baselinesApplied,
    accountsCreated,
  };
}

export type Summary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  byCategory: {
    income: Record<string, number>;
    expense: Record<string, number>;
  };
};

export function summarize(txs: Transaction[]): Summary {
  const summary: Summary = {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    byCategory: { income: {}, expense: {} },
  };
  for (const tx of txs) {
    const cat = tx.category || UNCATEGORIZED_LABEL;
    if (tx.kind === "income") {
      summary.totalIncome += tx.amount;
      summary.byCategory.income[cat] =
        (summary.byCategory.income[cat] ?? 0) + tx.amount;
    } else {
      summary.totalExpense += tx.amount;
      summary.byCategory.expense[cat] =
        (summary.byCategory.expense[cat] ?? 0) + tx.amount;
    }
  }
  summary.balance = summary.totalIncome - summary.totalExpense;
  return summary;
}

export type ResyncResult = {
  scanned: number;
  reclassified: number;
  remaining: number;
};

export type ResyncProposal = {
  txId: string;
  description: string;
  kind: TransactionKind;
  suggestedCategory: string | null;
  similarity: number | null;
};

export function previewResync(threshold?: number): ResyncProposal[] {
  const index = getCategoryIndex();
  const proposals: ResyncProposal[] = [];
  for (const tx of txStore) {
    if (tx.category) continue;
    const description = (tx.note ?? "").trim();
    if (!description) {
      proposals.push({
        txId: tx.id,
        description: "",
        kind: tx.kind,
        suggestedCategory: null,
        similarity: null,
      });
      continue;
    }
    const s = suggestCategoryFromIndex({
      description,
      index,
      threshold,
    });
    proposals.push({
      txId: tx.id,
      description,
      kind: tx.kind,
      suggestedCategory: s?.category ?? null,
      similarity: s?.similarity ?? null,
    });
  }
  return proposals;
}

export function applyResyncProposals(
  proposals: ResyncProposal[],
): ResyncResult {
  const byId = new Map<string, ResyncProposal>();
  for (const p of proposals) byId.set(p.txId, p);

  let scanned = 0;
  let reclassified = 0;
  let remaining = 0;
  const next: Transaction[] = [];
  for (const tx of txStore) {
    if (tx.category) {
      next.push(tx);
      continue;
    }
    scanned++;
    const p = byId.get(tx.id);
    if (p && p.suggestedCategory) {
      next.push({ ...tx, category: p.suggestedCategory });
      reclassified++;
    } else {
      next.push(tx);
      remaining++;
    }
  }
  if (reclassified > 0) commitTx(next);
  return { scanned, reclassified, remaining };
}

export function resyncCategories(threshold?: number): ResyncResult {
  const index = getCategoryIndex();
  let scanned = 0;
  let reclassified = 0;
  let remaining = 0;
  const next: Transaction[] = [];
  for (const tx of txStore) {
    if (tx.category) {
      next.push(tx);
      continue;
    }
    scanned++;
    const description = (tx.note ?? "").trim();
    if (!description) {
      next.push(tx);
      remaining++;
      continue;
    }
    const s = suggestCategoryFromIndex({
      description,
      index,
      threshold,
    });
    if (!s) {
      next.push(tx);
      remaining++;
      continue;
    }
    next.push({ ...tx, category: s.category });
    reclassified++;
  }

  if (reclassified > 0) commitTx(next);

  return { scanned, reclassified, remaining };
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
