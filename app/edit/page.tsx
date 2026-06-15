"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import {
  CategoryDatalist,
  CategoryInput,
} from "../components/CategoryInput";
import { Pagination } from "../components/Pagination";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Slider } from "../components/ui/slider";
import { Checkbox } from "../components/ui/checkbox";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/ui/table";
import { DEFAULT_SIMILARITY_THRESHOLD } from "../lib/csv";
import {
  UNCATEGORIZED_LABEL,
  applyResyncProposals,
  formatAmount,
  previewResync,
  setTransactionCategory,
  useAccounts,
  useCategories,
  useFilteredTransactions,
  useSelectedAccountId,
} from "../lib/transactions";

const PAGE_SIZE = 20;

type Filter = "uncategorized" | "all";

export default function EditPage() {
  const txs = useFilteredTransactions();
  const accounts = useAccounts();
  const selectedAccountId = useSelectedAccountId();
  const categories = useCategories();
  const accountById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, a.name);
    return m;
  }, [accounts]);
  const showAccountColumn = selectedAccountId === null;
  const [filter, setFilter] = useState<Filter>("uncategorized");
  const [search, setSearch] = useState("");
  const [resyncMessage, setResyncMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [threshold, setThreshold] = useState(DEFAULT_SIMILARITY_THRESHOLD);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(
    () => new Set(),
  );

  const uncategorizedCount = useMemo(
    () => txs.reduce((n, t) => (t.category ? n : n + 1), 0),
    [txs],
  );

  const visible = useMemo(() => {
    const sorted = [...txs].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
    const byFilter =
      filter === "uncategorized"
        ? sorted.filter((t) => !t.category || t.id === editingId)
        : sorted;
    const query = search.trim().toLowerCase();
    if (!query) return byFilter;
    return byFilter.filter((t) =>
      [t.note, t.category, accountById.get(t.accountId), t.date].some((v) =>
        v?.toLowerCase().includes(query),
      ),
    );
  }, [txs, filter, editingId, search, accountById]);

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
    const accepted = proposals.filter(
      (p) => p.suggestedCategory && !excludedIds.has(p.txId),
    );
    const r = applyResyncProposals(accepted);
    setResyncMessage(
      `Re-synced ${r.reclassified} of ${r.scanned} · ${r.remaining} still uncategorized`,
    );
    setExcludedIds(new Set());
  }

  function toggleExclude(txId: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
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
            Change a transaction&apos;s category one at a time, or let us
            auto-sort the rest by matching them to similar ones you&apos;ve
            already labeled.
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
                  <Button
                    key={f}
                    type="button"
                    variant="ghost"
                    onClick={() => setFilter(f)}
                    className={`text-sm font-medium px-4 py-1.5 h-auto rounded-full capitalize transition-colors ${
                      filter === f
                        ? "bg-mc-dark text-white hover:bg-mc-dark"
                        : "text-mc-gray hover:text-mc-dark"
                    }`}
                  >
                    {f}
                  </Button>
                ))}
              </div>
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
              excludedIds={excludedIds}
              toggleExclude={toggleExclude}
              onApply={handleResync}
            />
          )}

          <div className="mt-12">
            <Input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search transactions…"
              className="mb-4 max-w-xs"
            />
            {visible.length === 0 ? (
              <p className="text-mc-gray">
                {search.trim()
                  ? "No transactions match your search."
                  : filter === "uncategorized"
                    ? "Nothing uncategorized — everything has a category."
                    : "No transactions yet."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-mc-gray/15 bg-white">
                <CategoryDatalist id="all-cats" options={categories} />
                <Table className="min-w-full text-sm">
                  <TableHeader>
                    <TableRow className="text-xs uppercase tracking-wider text-mc-gray border-b border-mc-gray/10">
                      <TableHead className="text-left py-3 px-4">Date</TableHead>
                      <TableHead className="text-left py-3 px-4">Description</TableHead>
                      <TableHead className="text-left py-3 px-4">Kind</TableHead>
                      <TableHead className="text-right py-3 px-4">Amount</TableHead>
                      <TableHead className="text-left py-3 px-4">Category</TableHead>
                      {showAccountColumn && (
                        <TableHead className="text-left py-3 px-4">Account</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-mc-gray/10">
                    {pageItems.map((tx) => {
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="py-3 px-4 font-mono text-mc-gray">
                            {tx.date}
                          </TableCell>
                          <TableCell className="py-3 px-4 text-mc-dark max-w-md">
                            <div className="truncate">
                              {tx.note ?? (
                                <span className="text-mc-gray italic">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-3 px-4">
                            <Badge
                              variant="secondary"
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                tx.kind === "income"
                                  ? "bg-mc-mint/20 text-mc-dark/70"
                                  : "bg-mc-lavender/15 text-mc-dark/70"
                              }`}
                            >
                              {tx.kind}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3 px-4 text-right font-mono text-mc-dark">
                            {tx.kind === "income" ? "+" : "−"}
                            {formatAmount(tx.amount)}
                          </TableCell>
                          <TableCell className="py-3 px-4">
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
                              listId="all-cats"
                              placeholder={UNCATEGORIZED_LABEL}
                              className={`rounded-md border bg-white px-2 py-1 text-sm focus:outline-none focus:border-mc-lavender/60 transition-colors ${
                                tx.category
                                  ? "border-mc-gray/15 text-mc-dark"
                                  : "border-mc-lavender/40 text-mc-gray italic"
                              }`}
                            />
                          </TableCell>
                          {showAccountColumn && (
                            <TableCell className="py-3 px-4 text-mc-gray font-mono text-xs">
                              {accountById.get(tx.accountId) ?? "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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

          {visible.length > 0 && (
            <p className="mt-6 text-xs text-mc-gray">
              Type a new category name to create it on the fly. Existing
              categories from other transactions of the same kind appear as
              suggestions.
            </p>
          )}
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
  excludedIds,
  toggleExclude,
  onApply,
}: {
  proposals: ReturnType<typeof previewResync>;
  proposalMatches: number;
  threshold: number;
  setThreshold: (n: number) => void;
  excludedIds: Set<string>;
  toggleExclude: (txId: string) => void;
  onApply: () => void;
}) {
  const matched = proposals.filter((p) => p.suggestedCategory !== null);
  const unmatched = proposals.length - matched.length;
  const accepted = matched.filter((p) => !excludedIds.has(p.txId)).length;
  return (
    <div className="mt-6 p-6 rounded-2xl border border-mc-lavender/40 bg-mc-lavender/[0.07]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-mc-dark">
            Suggestions
          </h3>
          <p className="mt-1 text-sm text-mc-gray">
            {accepted} accepted · {proposalMatches - accepted} skipped ·{" "}
            {unmatched} below threshold
          </p>
        </div>
        <label className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
            Threshold
          </span>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={threshold}
            onValueChange={(v) => setThreshold(v as number)}
            className="w-40"
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
          <Table className="min-w-full text-sm">
            <TableHeader className="sticky top-0 bg-white">
              <TableRow className="text-xs uppercase tracking-wider text-mc-gray border-b border-mc-gray/10">
                <TableHead className="py-2 px-3 w-8"></TableHead>
                <TableHead className="text-left py-2 px-3">Description</TableHead>
                <TableHead className="text-left py-2 px-3">Kind</TableHead>
                <TableHead className="text-left py-2 px-3">Will become</TableHead>
                <TableHead className="text-right py-2 px-3">Similarity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-mc-gray/10">
              {matched.map((p) => {
                const checked = !excludedIds.has(p.txId);
                return (
                <TableRow key={p.txId} className={checked ? "" : "opacity-50"}>
                  <TableCell className="py-2 px-3">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleExclude(p.txId)}
                      aria-label={`Apply suggestion for ${p.description || "row"}`}
                      className="accent-mc-lavender"
                    />
                  </TableCell>
                  <TableCell className="py-2 px-3 text-mc-dark max-w-md">
                    <div className="truncate">{p.description || "—"}</div>
                  </TableCell>
                  <TableCell className="py-2 px-3">
                    <Badge
                      variant="secondary"
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.kind === "income"
                          ? "bg-mc-mint/20 text-mc-dark/70"
                          : "bg-mc-lavender/15 text-mc-dark/70"
                      }`}
                    >
                      {p.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-3 text-mc-dark/80">
                    {p.suggestedCategory}
                  </TableCell>
                  <TableCell className="py-2 px-3 text-right font-mono text-mc-gray">
                    {p.similarity !== null
                      ? p.similarity.toFixed(2)
                      : "—"}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {matched.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onApply}
            disabled={accepted === 0}
            className="text-sm font-medium px-4 py-2 h-auto rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply selected ({accepted})
          </Button>
        </div>
      )}
    </div>
  );
}
