"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import {
  TransactionKind,
  addTransaction,
  downloadOFX,
  formatAmount,
  importOFX,
  removeTransaction,
  useCategories,
  useTransactions,
} from "./lib/transactions";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TransactionsPage() {
  const txs = useTransactions();
  const categories = useCategories();

  const [kind, setKind] = useState<TransactionKind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState("");

  const availableCategories = categories[kind];
  const effectiveCategory =
    category && availableCategories.includes(category)
      ? category
      : (availableCategories[0] ?? "");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [importMessage, setImportMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function runImport(file: File) {
    try {
      const text = await file.text();
      const result = importOFX(text);
      if (result.ok) {
        const parts = [
          `Imported ${result.added} new transaction${result.added === 1 ? "" : "s"}`,
        ];
        if (result.skipped > 0) {
          parts.push(
            `${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped`,
          );
        }
        if (result.categoriesAdded > 0) {
          parts.push(
            `${result.categoriesAdded} new categor${result.categoriesAdded === 1 ? "y" : "ies"} added`,
          );
        }
        setImportMessage({ kind: "ok", text: `${parts.join(", ")}.` });
      } else {
        setImportMessage({ kind: "error", text: result.error });
      }
    } catch {
      setImportMessage({ kind: "error", text: "Could not read file." });
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await runImport(file);
  }

  function hasFiles(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await runImport(file);
  }

  const sorted = useMemo(
    () =>
      [...txs].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      ),
    [txs],
  );

  function selectKind(next: TransactionKind) {
    setKind(next);
    setCategory(categories[next][0] ?? "");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!isFinite(parsed) || parsed <= 0 || !effectiveCategory) return;
    addTransaction({
      kind,
      amount: parsed,
      category: effectiveCategory,
      date,
      note: note.trim() || undefined,
    });
    setAmount("");
    setNote("");
  }

  const inputClass =
    "w-full rounded-md border border-mc-gray/15 bg-white px-3 py-2 text-sm text-mc-dark placeholder:text-mc-gray/60 focus:outline-none focus:border-mc-lavender/60 transition-colors";

  return (
    <div
      className="min-h-screen bg-white flex flex-col relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center p-6">
          <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-mc-lavender bg-mc-lavender/15 backdrop-blur-sm" />
          <div className="relative px-6 py-4 rounded-full bg-white border border-mc-gray/15 shadow-lg">
            <span className="text-sm font-medium text-mc-dark">
              Drop OFX to import
            </span>
          </div>
        </div>
      )}
      <Nav />

      <section className="max-w-7xl w-full mx-auto px-6 pt-20 pb-16 lg:pt-32 lg:pb-28">
        <div className="flex flex-col lg:flex-row items-start gap-12 lg:gap-16">
          <div className="flex-1 max-w-xl lg:pt-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-mc-dark">
              Track Your <span className="text-mc-lavender">Money</span>
            </h1>
            <p className="mt-6 text-lg text-mc-gray leading-relaxed max-w-lg">
              Log income and expenses. Download your data as OFX to keep it.
            </p>
          </div>
          <div className="flex-1 w-full max-w-xl lg:max-w-none">
            <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
              <h2 className="text-lg font-semibold text-mc-dark">
                Add transaction
              </h2>

            <form
              id="add-transaction-form"
              onSubmit={handleSubmit}
              className="mt-6 space-y-5"
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selectKind("income")}
                  className={`flex-1 text-sm font-medium px-4 py-2 rounded-full transition-colors ${
                    kind === "income"
                      ? "bg-mc-mint/30 text-mc-dark border border-mc-mint/40"
                      : "bg-transparent text-mc-gray border border-mc-gray/15 hover:text-mc-dark"
                  }`}
                >
                  Income
                </button>
                <button
                  type="button"
                  onClick={() => selectKind("expense")}
                  className={`flex-1 text-sm font-medium px-4 py-2 rounded-full transition-colors ${
                    kind === "expense"
                      ? "bg-mc-lavender/15 text-mc-dark border border-mc-lavender/40"
                      : "bg-transparent text-mc-gray border border-mc-gray/15 hover:text-mc-dark"
                  }`}
                >
                  Expense
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Amount
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={`mt-2 ${inputClass} font-mono`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Category
                  </span>
                  <select
                    value={effectiveCategory}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={availableCategories.length === 0}
                    className={`mt-2 ${inputClass}`}
                  >
                    {availableCategories.length === 0 ? (
                      <option value="">No categories — add one first</option>
                    ) : (
                      availableCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Date
                  </span>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={`mt-2 ${inputClass} font-mono`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Note{" "}
                    <span className="text-mc-gray/50 normal-case font-normal">
                      (optional)
                    </span>
                  </span>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. lunch with team"
                    className={`mt-2 ${inputClass}`}
                  />
                </label>
              </div>

            </form>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="submit"
                form="add-transaction-form"
                disabled={!effectiveCategory}
                className="inline-flex items-center px-6 py-3 rounded-full bg-mc-dark text-white font-medium text-sm hover:bg-mc-dark/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add transaction
              </button>
              <Link
                href="/summary"
                className="inline-flex items-center px-6 py-3 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 font-medium text-sm hover:bg-mc-lavender/25 transition-colors"
              >
                View Summary &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 flex-1">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
                Transactions
              </h2>
              <p className="mt-3 text-mc-gray text-lg max-w-2xl">
                Every entry, newest first.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadOFX()}
                disabled={sorted.length === 0}
                className="text-sm font-medium px-4 py-2 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Download OFX
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                title="Or drop a file anywhere on the page"
                className="text-sm font-medium px-4 py-2 rounded-full bg-mc-mint/20 text-mc-dark/80 border border-mc-mint/30 hover:bg-mc-mint/30 transition-colors"
              >
                Upload OFX
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/x-ofx,.ofx,.qfx"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {importMessage && (
            <p
              className={`mt-6 text-sm ${
                importMessage.kind === "ok"
                  ? "text-mc-dark/70"
                  : "text-mc-dark/80"
              }`}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
                  importMessage.kind === "ok" ? "bg-mc-mint" : "bg-mc-lavender"
                }`}
              />
              {importMessage.text}
            </p>
          )}

          <div className="mt-12">
            {sorted.length === 0 ? (
              <p className="text-mc-gray">
                No transactions yet. Add one above, or upload an existing
                JSON file.
              </p>
            ) : (
              <ul className="divide-y divide-mc-gray/10">
                {sorted.map((tx) => (
                  <li
                    key={tx.id}
                    className="py-6 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-base font-semibold text-mc-dark leading-snug">
                          {tx.category}
                        </h3>
                        <span
                          className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                            tx.kind === "income"
                              ? "bg-mc-mint/20 text-mc-dark/70"
                              : "bg-mc-lavender/15 text-mc-dark/70"
                          }`}
                        >
                          {tx.kind}
                        </span>
                      </div>
                      {tx.note && (
                        <p className="mt-1 text-sm text-mc-gray truncate">
                          {tx.note}
                        </p>
                      )}
                      <p className="mt-1 text-sm font-mono text-mc-gray/60">
                        {tx.date}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <span className="text-base font-mono font-semibold text-mc-dark">
                        {tx.kind === "income" ? "+" : "−"}
                        {formatAmount(tx.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeTransaction(tx.id)}
                        className="text-xs font-medium px-2.5 py-1 rounded-full text-mc-gray hover:bg-mc-dark/[0.04] hover:text-mc-dark transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
