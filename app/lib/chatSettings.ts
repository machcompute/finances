"use client";

import { useSyncExternalStore } from "react";

export type ChatSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  requireApproval: boolean;
};

const STORAGE_KEY = "finances:chat-settings";
const DEFAULTS: ChatSettings = {
  baseUrl: "http://localhost:11434/v1",
  apiKey: "",
  model: "",
  requireApproval: true,
};

let settings: ChatSettings = DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

function ensureHydrated(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) settings = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ChatSettings>) };
  } catch {}
}

export function getChatSettings(): ChatSettings {
  ensureHydrated();
  return settings;
}

export function setChatSettings(patch: Partial<ChatSettings>): void {
  ensureHydrated();
  settings = { ...settings, ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useChatSettings(): ChatSettings {
  return useSyncExternalStore(
    subscribe,
    () => {
      ensureHydrated();
      return settings;
    },
    () => DEFAULTS,
  );
}
