"use client";

import { useSyncExternalStore } from "react";
import { setTransactionCategory, setTransactionNote } from "./transactions";

export type ProposedChange = {
  kind: "category" | "note";
  txIds: string[];
  value: string;
  summary: string;
};

type ConfirmRequest = {
  id: string;
  changes: ProposedChange[];
  resolve: (approved: boolean) => void;
};

let current: ConfirmRequest | null = null;
let counter = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestChanges(changes: ProposedChange[]): Promise<boolean> {
  return new Promise((resolve) => {
    counter += 1;
    current = { id: `c${counter}`, changes, resolve };
    emit();
  });
}

export function resolveChanges(approved: boolean): void {
  const req = current;
  if (!req) return;
  current = null;
  if (approved) {
    for (const change of req.changes) {
      for (const txId of change.txIds) {
        if (change.kind === "category") setTransactionCategory(txId, change.value);
        else setTransactionNote(txId, change.value);
      }
    }
  }
  emit();
  req.resolve(approved);
}

export function useConfirmRequest(): ConfirmRequest | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
