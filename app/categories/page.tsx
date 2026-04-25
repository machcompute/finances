"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import {
  Transaction,
  TransactionKind,
  addCategory,
  countCategoryUsage,
  removeCategory,
  renameCategory,
  useCategories,
  useTransactions,
} from "../lib/transactions";

export default function CategoriesPage() {
  const categories = useCategories();
  const txs = useTransactions();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />

      <section className="max-w-7xl w-full mx-auto px-6 pt-20 pb-12 lg:pt-32 lg:pb-20">
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-mc-dark">
            <span className="text-mc-lavender">Categories</span>
          </h1>
          <p className="mt-6 text-lg text-mc-gray leading-relaxed max-w-lg">
            Organize your transactions. Renaming updates every transaction
            that uses the category. Removing one in use will ask where to
            move them.
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center px-6 py-3 rounded-full bg-mc-dark text-white font-medium text-sm hover:bg-mc-dark/85 transition-colors"
            >
              &larr; Back to Transactions
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-mc-dark/[0.02] flex-1">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CategoryColumn
              kind="income"
              title="Income"
              dotClass="bg-mc-mint"
              chipClass="bg-mc-mint/20 border-mc-mint/30"
              items={categories.income}
              txs={txs}
            />
            <CategoryColumn
              kind="expense"
              title="Expense"
              dotClass="bg-mc-lavender"
              chipClass="bg-mc-lavender/15 border-mc-lavender/30"
              items={categories.expense}
              txs={txs}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function CategoryColumn({
  kind,
  title,
  dotClass,
  chipClass,
  items,
  txs,
}: {
  kind: TransactionKind;
  title: string;
  dotClass: string;
  chipClass: string;
  items: string[];
  txs: Transaction[];
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    const ok = addCategory(kind, value);
    if (!ok) {
      setError("Already exists.");
      return;
    }
    setDraft("");
    setError(null);
  }

  return (
    <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <h2 className="text-lg font-semibold text-mc-dark">{title}</h2>
      </div>

      <form onSubmit={handleAdd} className="mt-6 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          placeholder={`New ${title.toLowerCase()} category`}
          className="flex-1 rounded-md border border-mc-gray/15 bg-white px-3 py-2 text-sm text-mc-dark placeholder:text-mc-gray/60 focus:outline-none focus:border-mc-lavender/60 transition-colors"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="text-sm font-medium px-4 py-2 rounded-full bg-mc-dark text-white hover:bg-mc-dark/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-mc-gray">{error}</p>}

      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-mc-gray">No categories. Add one above.</p>
        ) : (
          items.map((c) => (
            <CategoryChip
              key={c}
              kind={kind}
              name={c}
              chipClass={chipClass}
              siblings={items.filter((x) => x !== c)}
              usage={countCategoryUsage(txs, kind, c)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CategoryChip({
  kind,
  name,
  chipClass,
  siblings,
  usage,
}: {
  kind: TransactionKind;
  name: string;
  chipClass: string;
  siblings: string[];
  usage: number;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "removing">("view");
  const [draft, setDraft] = useState(name);
  const [target, setTarget] = useState(siblings[0] ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const wrappedClass = `inline-flex items-center gap-2 text-sm font-medium pl-3 pr-1.5 py-1 rounded-full ${chipClass} border text-mc-dark/80`;

  const targetOptions = useMemo(
    () => [
      { value: "", label: "— leave dangling —" },
      ...siblings.map((s) => ({ value: s, label: s })),
    ],
    [siblings],
  );

  function startEdit() {
    setDraft(name);
    setMessage(null);
    setMode("edit");
  }

  function cancel() {
    setMode("view");
    setMessage(null);
  }

  function commitRename() {
    const result = renameCategory(kind, name, draft);
    if (result === "ok" || result === "no-op") {
      setMode("view");
      setMessage(null);
      return;
    }
    if (result === "empty") setMessage("Name can't be empty.");
    else if (result === "duplicate") setMessage("Already exists.");
  }

  function startRemove() {
    if (usage === 0) {
      removeCategory(kind, name);
      return;
    }
    setTarget(siblings[0] ?? "");
    setMode("removing");
  }

  function confirmRemove() {
    removeCategory(kind, name, target || undefined);
    setMode("view");
  }

  if (mode === "edit") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`inline-flex items-center gap-1 pl-1 pr-1 py-1 rounded-full ${chipClass} border`}
        >
          <input
            type="text"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancel();
            }}
            className="bg-transparent text-sm font-medium text-mc-dark/80 px-2 py-0.5 outline-none min-w-32"
          />
          <button
            type="button"
            onClick={commitRename}
            className="text-xs font-medium px-2.5 py-1 rounded-full bg-mc-dark text-white hover:bg-mc-dark/85 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={cancel}
            className="text-xs font-medium px-2.5 py-1 rounded-full text-mc-gray hover:text-mc-dark transition-colors"
          >
            Cancel
          </button>
        </div>
        {message && <span className="text-xs text-mc-gray">{message}</span>}
      </div>
    );
  }

  if (mode === "removing") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={wrappedClass}>{name}</span>
        <span className="text-sm text-mc-gray">
          {usage} use{usage === 1 ? "" : "s"} → move to
        </span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-md border border-mc-gray/15 bg-white px-2 py-1 text-sm text-mc-dark focus:outline-none focus:border-mc-lavender/60 transition-colors"
        >
          {targetOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={confirmRemove}
          className="text-xs font-medium px-2.5 py-1 rounded-full bg-mc-dark text-white hover:bg-mc-dark/85 transition-colors"
        >
          Remove
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-xs font-medium px-2.5 py-1 rounded-full text-mc-gray hover:text-mc-dark transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={wrappedClass}>
        <span>{name}</span>
        <span className="text-xs font-mono text-mc-dark/40">{usage}</span>
        <button
          type="button"
          onClick={startEdit}
          aria-label={`Rename ${name}`}
          className="w-5 h-5 inline-flex items-center justify-center rounded-full text-mc-dark/60 hover:bg-mc-dark/10 hover:text-mc-dark transition-colors"
          title="Rename"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={startRemove}
          aria-label={`Remove ${name}`}
          className="w-5 h-5 inline-flex items-center justify-center rounded-full text-mc-dark/60 hover:bg-mc-dark/10 hover:text-mc-dark transition-colors"
          title="Remove"
        >
          ×
        </button>
      </span>
    </div>
  );
}
