"use client";

import { useSyncExternalStore } from "react";
import {
  addCategory,
  getCategories,
  setTransactionCategory,
  setTransactionNote,
} from "./transactions";
import { getChatSettings } from "./chatSettings";

export type ProposedChange =
  | {
      kind: "category" | "note";
      txIds: string[];
      value: string;
      summary: string;
    }
  | {
      kind: "create_category";
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

function applyChanges(changes: ProposedChange[]): void {
  for (const change of changes) {
    if (change.kind === "create_category") {
      addCategory(change.value);
      continue;
    }
    if (change.kind === "category") {
      const normalized = change.value.trim().replace(/\s+/g, " ");
      const category = getCategories().find(
        (c) => c.toLowerCase() === normalized.toLowerCase(),
      );
      if (!category) continue;
      for (const txId of change.txIds) {
        setTransactionCategory(txId, category);
      }
      continue;
    }
    for (const txId of change.txIds) {
      setTransactionNote(txId, change.value);
    }
  }
}

export function requestChanges(changes: ProposedChange[]): Promise<boolean> {
  if (!getChatSettings().requireApproval) {
    applyChanges(changes);
    return Promise.resolve(true);
  }
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
  if (approved) applyChanges(req.changes);
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
