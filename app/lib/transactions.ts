import { useSyncExternalStore } from "react";
import { exportToOFX, fitidFromId, parseOFX } from "./ofx";
import { suggestCategory } from "./csv";

export type TransactionKind = "income" | "expense";

export type Transaction = {
  id: string;
  kind: TransactionKind;
  amount: number;
  category?: string;
  date: string;
  note?: string;
  account?: string;
};

export const UNCATEGORIZED_LABEL = "Uncategorized";

export type CategoryMap = Record<TransactionKind, string[]>;

export const DEFAULT_CATEGORIES: CategoryMap = {
  income: ["Salary", "Freelance", "Gift", "Other"],
  expense: [
    "Food",
    "Transport",
    "Housing",
    "Entertainment",
    "Health",
    "Shopping",
    "Other",
  ],
};

export type Baseline = { amount: number; date: string };

const SERVER_TX_SNAPSHOT: Transaction[] = [];
const SERVER_CAT_SNAPSHOT: CategoryMap = DEFAULT_CATEGORIES;
const SERVER_BASELINE_SNAPSHOT: Baseline | null = null;

let txStore: Transaction[] = [];
let catStore: CategoryMap = {
  income: [...DEFAULT_CATEGORIES.income],
  expense: [...DEFAULT_CATEGORIES.expense],
};
let baselineStore: Baseline | null = null;

const txListeners = new Set<() => void>();
const catListeners = new Set<() => void>();
const baselineListeners = new Set<() => void>();

function subscribeTx(listener: () => void): () => void {
  txListeners.add(listener);
  return () => {
    txListeners.delete(listener);
  };
}

function subscribeCat(listener: () => void): () => void {
  catListeners.add(listener);
  return () => {
    catListeners.delete(listener);
  };
}

function commitTx(next: Transaction[]): void {
  txStore = next;
  txListeners.forEach((l) => l());
}

function commitCat(next: CategoryMap): void {
  catStore = next;
  catListeners.forEach((l) => l());
}

function subscribeBaseline(listener: () => void): () => void {
  baselineListeners.add(listener);
  return () => {
    baselineListeners.delete(listener);
  };
}

function commitBaseline(next: Baseline | null): void {
  baselineStore = next;
  baselineListeners.forEach((l) => l());
}

export function useBaseline(): Baseline | null {
  return useSyncExternalStore(
    subscribeBaseline,
    () => baselineStore,
    () => SERVER_BASELINE_SNAPSHOT,
  );
}

export function setBaseline(amount: number, date: string): void {
  if (!isFinite(amount) || !date) return;
  commitBaseline({ amount, date });
}

export function clearBaseline(): void {
  if (baselineStore !== null) commitBaseline(null);
}

export function useTransactions(): Transaction[] {
  return useSyncExternalStore(
    subscribeTx,
    () => txStore,
    () => SERVER_TX_SNAPSHOT,
  );
}

export function useCategories(): CategoryMap {
  return useSyncExternalStore(
    subscribeCat,
    () => catStore,
    () => SERVER_CAT_SNAPSHOT,
  );
}

export function addTransaction(tx: Omit<Transaction, "id">): void {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  commitTx([{ ...tx, id }, ...txStore]);
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

function freshId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type BatchAddResult = {
  added: number;
  categoriesAdded: number;
};

export function addTransactionsBatch(
  txs: Omit<Transaction, "id">[],
): BatchAddResult {
  if (txs.length === 0) {
    return { added: 0, categoriesAdded: 0 };
  }

  const lcIndex: Record<TransactionKind, Set<string>> = {
    income: new Set(catStore.income.map((c) => c.toLowerCase())),
    expense: new Set(catStore.expense.map((c) => c.toLowerCase())),
  };
  const nextCats: CategoryMap = {
    income: [...catStore.income],
    expense: [...catStore.expense],
  };
  let categoriesAdded = 0;

  const toAdd: Transaction[] = [];
  for (const draft of txs) {
    if (draft.category) {
      const lc = draft.category.toLowerCase();
      if (!lcIndex[draft.kind].has(lc)) {
        lcIndex[draft.kind].add(lc);
        nextCats[draft.kind].push(draft.category);
        categoriesAdded++;
      }
    }
    toAdd.push({ ...draft, id: freshId() });
  }

  if (categoriesAdded > 0) commitCat(nextCats);
  if (toAdd.length > 0) commitTx([...toAdd, ...txStore]);

  return { added: toAdd.length, categoriesAdded };
}

function normalizeCategory(name: string): string {
  return name.trim();
}

export function addCategory(kind: TransactionKind, name: string): boolean {
  const clean = normalizeCategory(name);
  if (!clean) return false;
  const existing = catStore[kind];
  if (existing.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    return false;
  }
  commitCat({ ...catStore, [kind]: [...existing, clean] });
  return true;
}

export type RenameResult = "ok" | "no-op" | "empty" | "duplicate";

export function renameCategory(
  kind: TransactionKind,
  oldName: string,
  newName: string,
): RenameResult {
  const clean = normalizeCategory(newName);
  if (!clean) return "empty";
  if (clean === oldName) return "no-op";
  const existing = catStore[kind];
  if (
    existing.some(
      (c) => c !== oldName && c.toLowerCase() === clean.toLowerCase(),
    )
  ) {
    return "duplicate";
  }
  commitCat({
    ...catStore,
    [kind]: existing.map((c) => (c === oldName ? clean : c)),
  });
  commitTx(
    txStore.map((tx) =>
      tx.kind === kind && tx.category === oldName
        ? { ...tx, category: clean }
        : tx,
    ),
  );
  return "ok";
}

export function removeCategory(
  kind: TransactionKind,
  name: string,
  migrateTo?: string,
): void {
  commitCat({
    ...catStore,
    [kind]: catStore[kind].filter((c) => c !== name),
  });
  if (migrateTo !== undefined) {
    commitTx(
      txStore.map((tx) =>
        tx.kind === kind && tx.category === name
          ? { ...tx, category: migrateTo }
          : tx,
      ),
    );
  }
}

export function countCategoryUsage(
  txs: Transaction[],
  kind: TransactionKind,
  name: string,
): number {
  let n = 0;
  for (const tx of txs) {
    if (tx.kind === kind && tx.category === name) n++;
  }
  return n;
}

export function downloadOFX(filename = "finances.ofx"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([exportToOFX(txStore, baselineStore)], {
    type: "application/x-ofx",
  });
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
      baselineApplied: boolean;
    }
  | { ok: false; error: string };

export function importOFX(text: string): OFXImportResult {
  const parsed = parseOFX(text);
  if (!parsed.ok) return parsed;

  const existingIds = new Set(txStore.map((t) => fitidFromId(t.id)));
  const lcIndex: Record<TransactionKind, Set<string>> = {
    income: new Set(catStore.income.map((c) => c.toLowerCase())),
    expense: new Set(catStore.expense.map((c) => c.toLowerCase())),
  };
  const nextCats: CategoryMap = {
    income: [...catStore.income],
    expense: [...catStore.expense],
  };
  let categoriesAdded = 0;

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
      if (!lcIndex[kind].has(lc)) {
        lcIndex[kind].add(lc);
        nextCats[kind].push(category);
        categoriesAdded++;
      }
    }
    toAdd.push({
      id: p.fitid,
      kind,
      amount: Math.abs(p.amount),
      category,
      date: p.date,
      note,
    });
  }

  if (categoriesAdded > 0) commitCat(nextCats);
  if (toAdd.length > 0) commitTx([...toAdd, ...txStore]);

  let baselineApplied = false;
  if (parsed.baseline) {
    commitBaseline({
      amount: parsed.baseline.amount,
      date: parsed.baseline.date,
    });
    baselineApplied = true;
  }

  return {
    ok: true,
    added: toAdd.length,
    skipped,
    categoriesAdded,
    baselineApplied,
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
  categoriesAdded: number;
};

export type ResyncProposal = {
  txId: string;
  description: string;
  kind: TransactionKind;
  suggestedCategory: string | null;
  similarity: number | null;
};

export function previewResync(threshold?: number): ResyncProposal[] {
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
    const s = suggestCategory({
      description,
      kind: tx.kind,
      txs: txStore,
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

export function resyncCategories(threshold?: number): ResyncResult {
  const lcIndex: Record<TransactionKind, Set<string>> = {
    income: new Set(catStore.income.map((c) => c.toLowerCase())),
    expense: new Set(catStore.expense.map((c) => c.toLowerCase())),
  };
  const nextCats: CategoryMap = {
    income: [...catStore.income],
    expense: [...catStore.expense],
  };
  let categoriesAdded = 0;

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
    const s = suggestCategory({
      description,
      kind: tx.kind,
      txs: txStore,
      threshold,
    });
    if (!s) {
      next.push(tx);
      remaining++;
      continue;
    }
    const lc = s.category.toLowerCase();
    if (!lcIndex[tx.kind].has(lc)) {
      lcIndex[tx.kind].add(lc);
      nextCats[tx.kind].push(s.category);
      categoriesAdded++;
    }
    next.push({ ...tx, category: s.category });
    reclassified++;
  }

  if (categoriesAdded > 0) commitCat(nextCats);
  if (reclassified > 0) commitTx(next);

  return { scanned, reclassified, remaining, categoriesAdded };
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
