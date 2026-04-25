import { Transaction } from "./transactions";

export type ParsedCSV = {
  headers: string[];
  rows: string[][];
};

export function parseCSV(text: string): ParsedCSV {
  const cleaned = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inQuotes) {
      if (c === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") {
      if (cleaned[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      field = "";
      row = [];
      continue;
    }
    if (c === "\n") {
      row.push(field);
      records.push(row);
      field = "";
      row = [];
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  const nonEmpty = records.filter(
    (r) => r.length > 0 && !(r.length === 1 && r[0].trim() === ""),
  );
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1);
  return { headers, rows };
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let s = a;
  let t = b;
  if (s.length < t.length) {
    const tmp = s;
    s = t;
    t = tmp;
  }

  const n = t.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    const sc = s.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = sc === t.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      let m = del < ins ? del : ins;
      if (sub < m) m = sub;
      curr[j] = m;
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n];
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

export type CategorySuggestion = {
  category: string;
  similarity: number;
};

export type CategoryIndex = Map<string, string[]>;

export function similarity(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  return 1 - levenshtein(a, b) / len;
}

function similarityAtLeast(a: string, b: string, floor: number): number {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  const ceil = 1 - Math.abs(a.length - b.length) / len;
  if (ceil < floor) return ceil;
  return 1 - levenshtein(a, b) / len;
}

export function buildCategoryIndex(txs: Transaction[]): CategoryIndex {
  const index: CategoryIndex = new Map();
  for (const tx of txs) {
    if (!tx.category) continue;
    const text = (tx.note ?? tx.category).trim().toLowerCase();
    const list = index.get(tx.category) ?? [];
    list.push(text);
    index.set(tx.category, list);
  }
  return index;
}

export function suggestCategoryFromIndex(args: {
  description: string;
  index: CategoryIndex;
  threshold?: number;
}): CategorySuggestion | null {
  const threshold = args.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const desc = args.description.trim().toLowerCase();
  if (!desc) return null;
  if (args.index.size === 0) return null;

  let best: CategorySuggestion | null = null;
  let runningFloor = threshold;
  for (const [category, texts] of args.index) {
    let max = 0;
    for (const t of texts) {
      const s = similarityAtLeast(desc, t, runningFloor);
      if (s > max) max = s;
    }
    if (best === null || max > best.similarity) {
      best = { category, similarity: max };
      if (max > runningFloor) runningFloor = max;
    }
  }
  if (!best || best.similarity < threshold) return null;
  return best;
}

export function suggestCategory(args: {
  description: string;
  txs: Transaction[];
  threshold?: number;
}): CategorySuggestion | null {
  return suggestCategoryFromIndex({
    description: args.description,
    index: buildCategoryIndex(args.txs),
    threshold: args.threshold,
  });
}
