"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import { CategoryDatalist, CategoryInput } from "./components/CategoryInput";
import { Pagination } from "./components/Pagination";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./components/ui/select";

const PAGE_SIZE = 20;
import {
  TransactionKind,
  addTransaction,
  downloadOFX,
  formatAmount,
  importOFX,
  removeTransaction,
  useAccounts,
  useCategories,
  useFilteredTransactions,
  useSelectedAccountId,
} from "./lib/transactions";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TransactionsPage() {
  const accounts = useAccounts();
  const selectedAccountId = useSelectedAccountId();
  const txs = useFilteredTransactions();
  const categories = useCategories();

  const [destinationOverride, setDestinationOverride] = useState<string | null>(
    null,
  );
  const destinationAccountId = useMemo(() => {
    if (
      destinationOverride &&
      accounts.some((a) => a.id === destinationOverride)
    ) {
      return destinationOverride;
    }
    return selectedAccountId ?? accounts[0]?.id ?? "";
  }, [destinationOverride, selectedAccountId, accounts]);
  const setDestinationAccountId = setDestinationOverride;

  const accountById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, a.name);
    return m;
  }, [accounts]);

  const [kind, setKind] = useState<TransactionKind>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayISO);
  const [note, setNote] = useState("");

  const effectiveCategory = category.trim();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [importMessage, setImportMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  function handleImportClick() {
    if (!destinationAccountId) {
      setImportMessage({
        kind: "error",
        text: "Pick a destination account first.",
      });
      return;
    }
    fileInputRef.current?.click();
  }

  async function runImport(file: File) {
    if (!destinationAccountId) {
      setImportMessage({
        kind: "error",
        text: "Pick a destination account first.",
      });
      return;
    }
    try {
      const text = await file.text();
      const result = importOFX(text, destinationAccountId);
      if (result.ok) {
        const parts = [
          `Loaded ${result.added} transaction${result.added === 1 ? "" : "s"}`,
        ];
        if (result.categoriesAdded > 0) {
          parts.push(
            `${result.categoriesAdded} categor${result.categoriesAdded === 1 ? "y" : "ies"} loaded`,
          );
        }
        if (result.accountsCreated > 0) {
          parts.push(
            `${result.accountsCreated} account${result.accountsCreated === 1 ? "" : "s"} loaded`,
          );
        }
        if (result.baselinesApplied > 0) {
          parts.push(
            `${result.baselinesApplied} baseline${result.baselinesApplied === 1 ? "" : "s"} restored`,
          );
        }
        setImportMessage({
          kind: "ok",
          text: `${parts.join(", ")}. Existing data was replaced.`,
        });
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

  const [page, setPage] = useState(1);
  const sorted = useMemo(
    () =>
      [...txs].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      ),
    [txs],
  );
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = sorted.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  function selectKind(next: TransactionKind) {
    setKind(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!isFinite(parsed) || parsed <= 0) return;
    if (!destinationAccountId) return;
    addTransaction({
      accountId: destinationAccountId,
      kind,
      amount: parsed,
      category: effectiveCategory || undefined,
      date,
      note: note.trim() || undefined,
    });
    setAmount("");
    setNote("");
    setCategory("");
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
              Log income and expenses across as many accounts as you like.
              Download your data as OFX to keep it.
            </p>
          </div>
          <div className="flex-1 w-full max-w-xl lg:max-w-none">
            <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
              <h2 className="text-lg font-semibold text-mc-dark">
                Add transaction
              </h2>

            <CategoryDatalist id="all-cats" options={categories} />
            <form
              id="add-transaction-form"
              onSubmit={handleSubmit}
              className="mt-6 space-y-5"
            >
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => selectKind("income")}
                  className={`flex-1 text-sm font-medium px-4 py-2 h-auto rounded-full transition-colors ${
                    kind === "income"
                      ? "bg-mc-mint/30 text-mc-dark border border-mc-mint/40 hover:bg-mc-mint/30"
                      : "bg-transparent text-mc-gray border border-mc-gray/15 hover:text-mc-dark hover:bg-transparent"
                  }`}
                >
                  Income
                </Button>
                <Button
                  type="button"
                  onClick={() => selectKind("expense")}
                  className={`flex-1 text-sm font-medium px-4 py-2 h-auto rounded-full transition-colors ${
                    kind === "expense"
                      ? "bg-mc-lavender/15 text-mc-dark border border-mc-lavender/40 hover:bg-mc-lavender/15"
                      : "bg-transparent text-mc-gray border border-mc-gray/15 hover:text-mc-dark hover:bg-transparent"
                  }`}
                >
                  Expense
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Account
                  </span>
                  <Select
                    value={destinationAccountId}
                    onValueChange={(v) => setDestinationAccountId(v)}
                    items={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  >
                    <SelectTrigger className="w-full mt-2">
                      <SelectValue placeholder="No accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Amount
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-2 w-full text-mc-dark placeholder:text-mc-gray/60 focus:border-mc-lavender/60 font-mono"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Category{" "}
                    <span className="text-mc-gray/50 normal-case font-normal">
                      (optional)
                    </span>
                  </span>
                  <div className="mt-2">
                    <CategoryInput
                      value={category}
                      onChange={setCategory}
                      listId="all-cats"
                      placeholder="Type or pick…"
                      className={inputClass}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Date
                  </span>
                  <Input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-2 w-full text-mc-dark placeholder:text-mc-gray/60 focus:border-mc-lavender/60 font-mono"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Note{" "}
                    <span className="text-mc-gray/50 normal-case font-normal">
                      (optional)
                    </span>
                  </span>
                  <Input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. lunch with team"
                    className="mt-2 w-full text-mc-dark placeholder:text-mc-gray/60 focus:border-mc-lavender/60"
                  />
                </label>
              </div>

            </form>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="submit"
                form="add-transaction-form"
                disabled={!destinationAccountId}
                className="rounded-full px-6 py-3 h-auto text-sm"
              >
                Add transaction
              </Button>
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

      <section className="py-20 lg:py-28 bg-mc-dark/[0.02] flex-1">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
                Transactions
              </h2>
              <p className="mt-3 text-mc-gray text-lg max-w-2xl">
                {selectedAccountId
                  ? `${accountById.get(selectedAccountId) ?? "—"} · newest first.`
                  : "Every entry across all accounts, newest first."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => downloadOFX()}
                className="text-sm font-medium px-4 py-2 h-auto rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25 transition-colors"
              >
                Download OFX
              </Button>
              <Button
                type="button"
                onClick={handleImportClick}
                title={`Imports route to ${
                  destinationAccountId
                    ? accountById.get(destinationAccountId) ?? "—"
                    : "—"
                }. Or drop a file anywhere on the page.`}
                className="text-sm font-medium px-4 py-2 h-auto rounded-full bg-mc-mint/20 text-mc-dark/80 border border-mc-mint/30 hover:bg-mc-mint/30 transition-colors"
              >
                Upload OFX
              </Button>
              <Link
                href="/import"
                className="text-sm font-medium px-4 py-2 rounded-full bg-mc-lime/30 text-mc-dark/80 border border-mc-lime/40 hover:bg-mc-lime/50 transition-colors"
              >
                Import CSV &rarr;
              </Link>
              <Input
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
                OFX file.
              </p>
            ) : (
              <ul className="divide-y divide-mc-gray/10">
                {pageItems.map((tx) => (
                  <li
                    key={tx.id}
                    className="py-6 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3
                          className={`text-base font-semibold leading-snug ${
                            tx.category
                              ? "text-mc-dark"
                              : "italic text-mc-gray"
                          }`}
                        >
                          {tx.category ?? "Uncategorized"}
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
                        {selectedAccountId === null && (
                          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-mc-dark/[0.05] text-mc-dark/70">
                            {accountById.get(tx.accountId) ?? "—"}
                          </span>
                        )}
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
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeTransaction(tx.id)}
                        className="text-xs font-medium px-2.5 py-1 h-auto rounded-full text-mc-gray hover:bg-mc-dark/[0.04] hover:text-mc-dark transition-colors"
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              page={safePage}
              pageCount={pageCount}
              total={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
