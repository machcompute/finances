import { useSyncExternalStore } from "react";
import { exportToOFX, fitidFromId, parseOFX } from "./ofx";

export type TransactionKind = "income" | "expense";

export type Transaction = {
  id: string;
  kind: TransactionKind;
  amount: number;
  category: string;
  date: string;
  note?: string;
};

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

const SERVER_TX_SNAPSHOT: Transaction[] = [];
const SERVER_CAT_SNAPSHOT: CategoryMap = DEFAULT_CATEGORIES;

let txStore: Transaction[] = [];
let catStore: CategoryMap = {
  income: [...DEFAULT_CATEGORIES.income],
  expense: [...DEFAULT_CATEGORIES.expense],
};

const txListeners = new Set<() => void>();
const catListeners = new Set<() => void>();

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
  const blob = new Blob([exportToOFX(txStore)], {
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
    const category = rawCategory || "Other";

    const lc = category.toLowerCase();
    if (!lcIndex[kind].has(lc)) {
      lcIndex[kind].add(lc);
      nextCats[kind].push(category);
      categoriesAdded++;
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

  return {
    ok: true,
    added: toAdd.length,
    skipped,
    categoriesAdded,
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
    if (tx.kind === "income") {
      summary.totalIncome += tx.amount;
      summary.byCategory.income[tx.category] =
        (summary.byCategory.income[tx.category] ?? 0) + tx.amount;
    } else {
      summary.totalExpense += tx.amount;
      summary.byCategory.expense[tx.category] =
        (summary.byCategory.expense[tx.category] ?? 0) + tx.amount;
    }
  }
  summary.balance = summary.totalIncome - summary.totalExpense;
  return summary;
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
