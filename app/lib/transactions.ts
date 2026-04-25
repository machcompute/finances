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

export const CATEGORIES: Record<TransactionKind, string[]> = {
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

const SERVER_SNAPSHOT: Transaction[] = [];

let store: Transaction[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Transaction[] {
  return store;
}

function getServerSnapshot(): Transaction[] {
  return SERVER_SNAPSHOT;
}

function commit(next: Transaction[]): void {
  store = next;
  listeners.forEach((l) => l());
}

export function useTransactions(): Transaction[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function addTransaction(tx: Omit<Transaction, "id">): void {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  commit([{ ...tx, id }, ...store]);
}

export function removeTransaction(id: string): void {
  commit(store.filter((t) => t.id !== id));
}

export function clearTransactions(): void {
  commit([]);
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

export function exportToJSON(): string {
  return JSON.stringify(store, null, 2);
}

export function downloadJSON(filename = "transactions.json"): void {
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
  | { ok: true; count: number }
  | { ok: false; error: string };

export function importFromJSON(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "JSON root must be an array of transactions." };
  }
  const valid: Transaction[] = [];
  for (const item of parsed) {
    if (!isTransaction(item)) {
      return {
        ok: false,
        error: "One or more entries are missing required fields.",
      };
    }
    valid.push(item);
  }
  commit(valid);
  return { ok: true, count: valid.length };
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
