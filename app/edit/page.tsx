"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { CategoryInput } from "../components/CategoryInput";
import { Pagination } from "../components/Pagination";
import { DEFAULT_SIMILARITY_THRESHOLD } from "../lib/csv";
import {
  UNCATEGORIZED_LABEL,
  formatAmount,
  previewResync,
  resyncCategories,
  setTransactionCategory,
  useCategories,
  useTransactions,
} from "../lib/transactions";

const PAGE_SIZE = 20;

type Filter = "uncategorized" | "all";

export default function EditPage() {
  const txs = useTransactions();
  const categories = useCategories();
  const [filter, setFilter] = useState<Filter>("uncategorized");
  const [resyncMessage, setResyncMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [threshold, setThreshold] = useState(DEFAULT_SIMILARITY_THRESHOLD);
  const [editingId, setEditingId] = useState<string | null>(null);

  const uncategorizedCount = useMemo(
    () => txs.reduce((n, t) => (t.category ? n : n + 1), 0),
    [txs],
  );

  const visible = useMemo(() => {
    const sorted = [...txs].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
    if (filter === "uncategorized") {
      return sorted.filter((t) => !t.category || t.id === editingId);
    }
    return sorted;
  }, [txs, filter, editingId]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = visible.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const proposals = useMemo(() => {
    void txs;
    return uncategorizedCount > 0 ? previewResync(threshold) : [];
  }, [txs, threshold, uncategorizedCount]);
  const proposalMatches = proposals.filter(
    (p) => p.suggestedCategory !== null,
  ).length;

  function handleResync() {
    const r = resyncCategories(threshold);
    setResyncMessage(
      `Re-synced ${r.reclassified} of ${r.scanned} · ${r.remaining} still uncategorized`,
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />

      <section className="max-w-7xl w-full mx-auto px-6 pt-20 pb-12 lg:pt-32 lg:pb-20">
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-mc-dark">
            Edit <span className="text-mc-lavender">categories</span>
          </h1>
          <p className="mt-6 text-lg text-mc-gray leading-relaxed max-w-lg">
            Reassign categories one row at a time, or let Levenshtein matching
            do it in bulk.
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
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
                Transactions
              </h2>
              <p className="mt-3 text-mc-gray text-lg max-w-2xl">
                {uncategorizedCount} uncategorized · {txs.length} total
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-full border border-mc-gray/15 p-0.5">
                {(["uncategorized", "all"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`text-sm font-medium px-4 py-1.5 rounded-full capitalize transition-colors ${
                      filter === f
                        ? "bg-mc-dark text-white"
                        : "text-mc-gray hover:text-mc-dark"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleResync}
                disabled={uncategorizedCount === 0}
                title="Run Levenshtein matching against existing categorized transactions"
                className="text-sm font-medium px-4 py-2 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Re-sync uncategorized
              </button>
            </div>
          </div>

          {resyncMessage && (
            <p className="mt-6 text-sm text-mc-dark/70">
              <span className="inline-block w-2 h-2 rounded-full bg-mc-mint mr-2 align-middle" />
              {resyncMessage}
            </p>
          )}

          {uncategorizedCount > 0 && (
            <ResyncPreview
              proposals={proposals}
              proposalMatches={proposalMatches}
              threshold={threshold}
              setThreshold={setThreshold}
            />
          )}

          <div className="mt-12">
            {visible.length === 0 ? (
              <p className="text-mc-gray">
                {filter === "uncategorized"
                  ? "Nothing uncategorized — everything has a category."
                  : "No transactions yet."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-mc-gray/15 bg-white">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-mc-gray border-b border-mc-gray/10">
                      <th className="text-left py-3 px-4">Date</th>
                      <th className="text-left py-3 px-4">Description</th>
                      <th className="text-left py-3 px-4">Kind</th>
                      <th className="text-right py-3 px-4">Amount</th>
                      <th className="text-left py-3 px-4">Category</th>
                      <th className="text-left py-3 px-4">Account</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mc-gray/10">
                    {pageItems.map((tx) => {
                      const options = categories[tx.kind];
                      return (
                        <tr key={tx.id}>
                          <td className="py-3 px-4 font-mono text-mc-gray">
                            {tx.date}
                          </td>
                          <td className="py-3 px-4 text-mc-dark max-w-md">
                            <div className="truncate">
                              {tx.note ?? (
                                <span className="text-mc-gray italic">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                tx.kind === "income"
                                  ? "bg-mc-mint/20 text-mc-dark/70"
                                  : "bg-mc-lavender/15 text-mc-dark/70"
                              }`}
                            >
                              {tx.kind}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-mc-dark">
                            {tx.kind === "income" ? "+" : "−"}
                            {formatAmount(tx.amount)}
                          </td>
                          <td className="py-3 px-4">
                            <CategoryInput
                              value={tx.category ?? ""}
                              onChange={(v) =>
                                setTransactionCategory(
                                  tx.id,
                                  v || undefined,
                                )
                              }
                              onFocus={() => setEditingId(tx.id)}
                              onBlur={() =>
                                setEditingId((cur) =>
                                  cur === tx.id ? null : cur,
                                )
                              }
                              options={options}
                              listId={`edit-cats-${tx.kind}`}
                              placeholder={UNCATEGORIZED_LABEL}
                              className={`rounded-md border bg-white px-2 py-1 text-sm focus:outline-none focus:border-mc-lavender/60 transition-colors ${
                                tx.category
                                  ? "border-mc-gray/15 text-mc-dark"
                                  : "border-mc-lavender/40 text-mc-gray italic"
                              }`}
                            />
                          </td>
                          <td className="py-3 px-4 text-mc-gray font-mono text-xs">
                            {tx.account ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={safePage}
              pageCount={pageCount}
              total={visible.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>

          <p className="mt-6 text-xs text-mc-gray">
            Type a new category name to create it on the fly. Existing
            categories from other transactions of the same kind appear as
            suggestions.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function ResyncPreview({
  proposals,
  proposalMatches,
  threshold,
  setThreshold,
}: {
  proposals: ReturnType<typeof previewResync>;
  proposalMatches: number;
  threshold: number;
  setThreshold: (n: number) => void;
}) {
  const matched = proposals.filter((p) => p.suggestedCategory !== null);
  const unmatched = proposals.length - matched.length;
  return (
    <div className="mt-6 p-6 rounded-2xl border border-mc-lavender/40 bg-mc-lavender/[0.07]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-mc-dark">
            Re-sync preview
          </h3>
          <p className="mt-1 text-sm text-mc-gray">
            {proposalMatches} of {proposals.length} would be matched ·{" "}
            {unmatched} below threshold
          </p>
        </div>
        <label className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
            Threshold
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-40 accent-mc-lavender"
          />
          <span className="text-sm font-mono text-mc-dark w-10 text-right">
            {threshold.toFixed(2)}
          </span>
        </label>
      </div>

      {matched.length === 0 ? (
        <p className="mt-4 text-sm text-mc-gray">
          No matches at this threshold. Lower it to see suggestions.
        </p>
      ) : (
        <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-mc-gray/15 bg-white">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-xs uppercase tracking-wider text-mc-gray border-b border-mc-gray/10">
                <th className="text-left py-2 px-3">Description</th>
                <th className="text-left py-2 px-3">Kind</th>
                <th className="text-left py-2 px-3">Will become</th>
                <th className="text-right py-2 px-3">Similarity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mc-gray/10">
              {matched.map((p) => (
                <tr key={p.txId}>
                  <td className="py-2 px-3 text-mc-dark max-w-md">
                    <div className="truncate">{p.description || "—"}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.kind === "income"
                          ? "bg-mc-mint/20 text-mc-dark/70"
                          : "bg-mc-lavender/15 text-mc-dark/70"
                      }`}
                    >
                      {p.kind}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-mc-dark/80">
                    {p.suggestedCategory}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-mc-gray">
                    {p.similarity !== null
                      ? p.similarity.toFixed(2)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
