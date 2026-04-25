import { useSyncExternalStore } from "react";

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

function isTransaction(value: unknown): value is Transaction {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.kind === "income" || v.kind === "expense") &&
    typeof v.amount === "number" &&
    isFinite(v.amount) &&
    typeof v.category === "string" &&
    typeof v.date === "string" &&
    (v.note === undefined || typeof v.note === "string")
  );
}

function isCategoryMap(value: unknown): value is CategoryMap {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.income) &&
    Array.isArray(v.expense) &&
    v.income.every((x) => typeof x === "string") &&
    v.expense.every((x) => typeof x === "string")
  );
}

type Snapshot = {
  version: 2;
  categories: CategoryMap;
  transactions: Transaction[];
};

export function exportToJSON(): string {
  const snapshot: Snapshot = {
    version: 2,
    categories: catStore,
    transactions: txStore,
  };
  return JSON.stringify(snapshot, null, 2);
}

export function downloadJSON(filename = "finances.json"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([exportToJSON()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ImportResult =
  | { ok: true; transactionCount: number; categoryCount: number }
  | { ok: false; error: string };

export function importFromJSON(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }

  let transactions: Transaction[];
  let categories: CategoryMap;

  if (Array.isArray(parsed)) {
    transactions = [];
    for (const item of parsed) {
      if (!isTransaction(item)) {
        return {
          ok: false,
          error: "One or more transactions are missing required fields.",
        };
      }
      transactions.push(item);
    }
    categories = {
      income: [...DEFAULT_CATEGORIES.income],
      expense: [...DEFAULT_CATEGORIES.expense],
    };
  } else if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.transactions)) {
      return { ok: false, error: "Missing 'transactions' array." };
    }
    transactions = [];
    for (const item of obj.transactions) {
      if (!isTransaction(item)) {
        return {
          ok: false,
          error: "One or more transactions are missing required fields.",
        };
      }
      transactions.push(item);
    }
    if (obj.categories === undefined) {
      categories = {
        income: [...DEFAULT_CATEGORIES.income],
        expense: [...DEFAULT_CATEGORIES.expense],
      };
    } else if (isCategoryMap(obj.categories)) {
      categories = {
        income: [...obj.categories.income],
        expense: [...obj.categories.expense],
      };
    } else {
      return {
        ok: false,
        error: "'categories' must be { income: string[], expense: string[] }.",
      };
    }
  } else {
    return { ok: false, error: "JSON root must be an object or an array." };
  }

  commitTx(transactions);
  commitCat(categories);
  return {
    ok: true,
    transactionCount: transactions.length,
    categoryCount: categories.income.length + categories.expense.length,
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
