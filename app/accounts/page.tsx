"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Account,
  addAccount,
  clearBaseline,
  deleteAccount,
  formatAmount,
  renameAccount,
  setBaseline,
  setSelectedAccountId,
  useAccounts,
  useBaselines,
  useSelectedAccountId,
  useTransactions,
} from "../lib/transactions";

export default function AccountsPage() {
  const accounts = useAccounts();
  const baselines = useBaselines();
  const txs = useTransactions();
  const selectedAccountId = useSelectedAccountId();

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; balance: number }>();
    for (const a of accounts) {
      const baseline = baselines.get(a.id)?.amount ?? 0;
      m.set(a.id, { count: 0, balance: baseline });
    }
    for (const tx of txs) {
      const s = m.get(tx.accountId);
      if (!s) continue;
      s.count++;
      s.balance += tx.kind === "income" ? tx.amount : -tx.amount;
    }
    return m;
  }, [accounts, baselines, txs]);

  const [newName, setNewName] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    addAccount(name);
    setNewName("");
  }

  const inputClass =
    "w-full border-mc-gray/15 bg-white text-sm text-mc-dark placeholder:text-mc-gray/60 focus-visible:border-mc-lavender/60 focus-visible:ring-0";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />

      <section className="max-w-7xl w-full mx-auto px-6 pt-20 pb-12 lg:pt-32 lg:pb-20">
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-mc-dark">
            <span className="text-mc-lavender">Accounts</span>
          </h1>
          <p className="mt-6 text-lg text-mc-gray leading-relaxed max-w-lg">
            Each transaction belongs to one account. Set per-account opening
            balances so the summary chart starts from a known anchor.
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
        <div className="max-w-3xl mx-auto px-6 space-y-6">
          <form
            onSubmit={handleAdd}
            className="p-6 rounded-2xl border border-mc-gray/15 bg-white flex flex-wrap gap-3 items-end"
          >
            <label className="flex-1 min-w-[220px]">
              <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                New account
              </span>
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Savings"
                className={`mt-2 h-auto px-3 py-2 ${inputClass}`}
              />
            </label>
            <Button
              type="submit"
              disabled={!newName.trim()}
              className="rounded-full px-6 py-3 h-auto text-sm bg-mc-dark text-white hover:bg-mc-dark/85"
            >
              Add
            </Button>
          </form>

          <div className="space-y-4">
            {accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                count={stats.get(a.id)?.count ?? 0}
                balance={stats.get(a.id)?.balance ?? 0}
                baseline={baselines.get(a.id) ?? null}
                isSelected={selectedAccountId === a.id}
                isOnly={accounts.length === 1}
              />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function AccountCard({
  account,
  count,
  balance,
  baseline,
  isSelected,
  isOnly,
}: {
  account: Account;
  count: number;
  balance: number;
  baseline: { amount: number; date: string } | null;
  isSelected: boolean;
  isOnly: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(account.name);
  const [baselineAmount, setBaselineAmount] = useState(
    baseline ? baseline.amount.toString() : "",
  );
  const [baselineDate, setBaselineDate] = useState(
    baseline ? baseline.date : "",
  );

  function commitName() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== account.name) renameAccount(account.id, trimmed);
    else setDraftName(account.name);
    setEditingName(false);
  }

  function handleSaveBaseline() {
    const n = parseFloat(baselineAmount);
    if (!isFinite(n) || !baselineDate) return;
    setBaseline(account.id, n, baselineDate);
  }

  function handleClearBaseline() {
    clearBaseline(account.id);
    setBaselineAmount("");
    setBaselineDate("");
  }

  function handleDelete() {
    if (isOnly) return;
    const note =
      count > 0
        ? `Delete account "${account.name}" and its ${count} transaction${count === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete account "${account.name}"?`;
    if (typeof window !== "undefined" && !window.confirm(note)) return;
    deleteAccount(account.id);
  }

  const inputClass =
    "w-full h-auto px-3 py-2 border-mc-gray/15 bg-white text-sm text-mc-dark placeholder:text-mc-gray/60 focus-visible:border-mc-lavender/60 focus-visible:ring-0";
  const balanceClass = balance >= 0 ? "text-mc-dark" : "text-mc-lavender";

  return (
    <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          {editingName ? (
            <Input
              type="text"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") {
                  setDraftName(account.name);
                  setEditingName(false);
                }
              }}
              className={`text-xl font-semibold ${inputClass}`}
            />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraftName(account.name);
                  setEditingName(true);
                }}
                title="Click to rename"
                className="h-auto p-0 text-xl font-semibold text-mc-dark hover:bg-transparent hover:text-mc-lavender text-left"
              >
                {account.name}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setDraftName(account.name);
                  setEditingName(true);
                }}
                className="h-auto text-xs font-medium px-2 py-0.5 rounded-full bg-mc-lavender/15 text-mc-dark/70 border-mc-lavender/20 hover:bg-mc-lavender/25"
              >
                Rename
              </Button>
            </div>
          )}
          <p className="mt-1 text-sm text-mc-gray">
            {count} transaction{count === 1 ? "" : "s"}
            {isSelected && " · currently selected"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
            Balance
          </p>
          <p className={`text-2xl font-mono font-bold ${balanceClass}`}>
            {balance >= 0 ? "" : "−"}
            {formatAmount(Math.abs(balance))}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
            Baseline amount
          </span>
          <Input
            type="number"
            step="0.01"
            value={baselineAmount}
            onChange={(e) => setBaselineAmount(e.target.value)}
            placeholder="0.00"
            className={`mt-2 ${inputClass} font-mono`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
            As-of date
          </span>
          <Input
            type="date"
            value={baselineDate}
            onChange={(e) => setBaselineDate(e.target.value)}
            className={`mt-2 ${inputClass} font-mono`}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleSaveBaseline}
          disabled={!baselineAmount || !baselineDate}
          className="h-auto text-sm font-medium px-4 py-2 rounded-full bg-mc-mint/30 text-mc-dark/80 border-mc-mint/40 hover:bg-mc-mint/40"
        >
          Save baseline
        </Button>
        {baseline && (
          <Button
            type="button"
            onClick={handleClearBaseline}
            className="h-auto text-sm font-medium px-4 py-2 rounded-full bg-mc-lavender/15 text-mc-dark/80 border-mc-lavender/20 hover:bg-mc-lavender/25"
          >
            Clear baseline
          </Button>
        )}
        <Button
          type="button"
          onClick={() => setSelectedAccountId(account.id)}
          disabled={isSelected}
          className="h-auto text-sm font-medium px-4 py-2 rounded-full bg-mc-lavender/10 text-mc-dark/80 border-mc-lavender/20 hover:bg-mc-lavender/20"
        >
          Select
        </Button>
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          onClick={handleDelete}
          disabled={isOnly}
          title={isOnly ? "At least one account must remain" : undefined}
          className="h-auto text-sm font-medium px-4 py-2 rounded-full text-mc-gray hover:bg-mc-dark/[0.04] hover:text-mc-dark"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
