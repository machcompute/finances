"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  UNCATEGORIZED_LABEL,
  addCategory,
  deleteCategory,
  formatAmount,
  renameCategory,
  useCategories,
  useTransactions,
} from "../lib/transactions";

type CategoryStats = {
  count: number;
  income: number;
  expense: number;
};

export default function CategoriesPage() {
  const categories = useCategories();
  const txs = useTransactions();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const stats = useMemo(() => buildStats(txs), [txs]);
  const uncategorized = stats.get(UNCATEGORIZED_LABEL) ?? {
    count: 0,
    income: 0,
    expense: 0,
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = addCategory(name);
    if (!result.ok) {
      setMessage({ kind: "error", text: result.error });
      return;
    }
    setName("");
    setMessage({
      kind: "ok",
      text: result.created
        ? `Created ${result.category}.`
        : `${result.category} already exists.`,
    });
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />

      <section className="max-w-7xl w-full mx-auto px-6 pt-20 pb-12 lg:pt-32 lg:pb-20">
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-mc-dark">
            <span className="text-mc-lavender">Categories</span>
          </h1>
          <p className="mt-6 text-lg text-mc-gray leading-relaxed max-w-lg">
            Create the categories used to organize transaction history. Edit
            transactions by choosing from this list.
          </p>
          <div className="mt-8">
            <Link
              href="/edit"
              className="inline-flex items-center px-6 py-3 rounded-full bg-mc-dark text-white font-medium text-sm hover:bg-mc-dark/85 transition-colors"
            >
              Edit transactions
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-mc-dark/[0.02] flex-1">
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          <form
            onSubmit={handleSubmit}
            className="p-6 rounded-2xl border border-mc-gray/15 bg-white"
          >
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <label className="flex-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                  New category
                </span>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Groceries"
                  className="mt-2 h-auto px-3 py-2 border-mc-gray/15 bg-white text-sm text-mc-dark placeholder:text-mc-gray/60 focus-visible:border-mc-lavender/60 focus-visible:ring-0"
                />
              </label>
              <Button
                type="submit"
                disabled={!name.trim()}
                className="rounded-full px-5 py-2.5 h-auto text-sm bg-mc-dark text-white hover:bg-mc-dark/85"
              >
                <PlusIcon className="size-4" />
                Create
              </Button>
            </div>
            {message && (
              <p className="mt-4 text-sm text-mc-dark/80">
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
                    message.kind === "ok" ? "bg-mc-mint" : "bg-mc-lavender"
                  }`}
                />
                {message.text}
              </p>
            )}
          </form>

          <div className="overflow-x-auto rounded-2xl border border-mc-gray/15 bg-white">
            <Table className="min-w-full text-sm">
              <TableHeader>
                <TableRow className="text-xs uppercase tracking-wider text-mc-gray border-b border-mc-gray/10">
                  <TableHead className="text-left py-3 px-4">
                    Category
                  </TableHead>
                  <TableHead className="text-right py-3 px-4">
                    Transactions
                  </TableHead>
                  <TableHead className="text-right py-3 px-4">
                    Income
                  </TableHead>
                  <TableHead className="text-right py-3 px-4">
                    Expenses
                  </TableHead>
                  <TableHead className="text-right py-3 px-4">Net</TableHead>
                  <TableHead className="text-right py-3 px-4">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-mc-gray/10">
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 px-4 text-center text-mc-gray"
                    >
                      No categories yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((category) => {
                    const item = stats.get(category) ?? {
                      count: 0,
                      income: 0,
                      expense: 0,
                    };
                    return (
                      <CategoryRow
                        key={category}
                        category={category}
                        stats={item}
                        onMessage={setMessage}
                      />
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {uncategorized.count > 0 && (
            <div className="p-6 rounded-2xl border border-mc-lavender/30 bg-mc-lavender/[0.07] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-white text-mc-dark/70 border-mc-lavender/20">
                    {UNCATEGORIZED_LABEL}
                  </Badge>
                  <span className="text-sm text-mc-gray">
                    {uncategorized.count} transaction
                    {uncategorized.count === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-mc-dark/70">
                  Uncategorized rows are not categories. Assign them from the
                  edit page when you are ready.
                </p>
              </div>
              <Link
                href="/edit"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 font-medium text-sm hover:bg-mc-lavender/25 transition-colors"
              >
                Review
              </Link>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function CategoryRow({
  category,
  stats,
  onMessage,
}: {
  category: string;
  stats: CategoryStats;
  onMessage: (message: { kind: "ok" | "error"; text: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState(category);
  const net = stats.income - stats.expense;

  function startEditing() {
    setDraft(category);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(category);
    setEditing(false);
  }

  function saveEditing() {
    const result = renameCategory(category, draft);
    if (!result.ok) {
      onMessage({ kind: "error", text: result.error });
      return;
    }
    setEditing(false);
    setDraft(result.category);
    onMessage({
      kind: "ok",
      text: result.renamed
        ? `Renamed ${category} to ${result.category}.`
        : `${result.category} was unchanged.`,
    });
  }

  function handleDelete() {
    const result = deleteCategory(category);
    if (!result.ok) {
      onMessage({ kind: "error", text: result.error });
      return;
    }
    setDeleteOpen(false);
    onMessage({
      kind: "ok",
      text:
        result.affected > 0
          ? `Deleted ${result.category}; ${result.affected} transaction${result.affected === 1 ? "" : "s"} now uncategorized.`
          : `Deleted ${result.category}.`,
    });
  }

  return (
    <TableRow>
      <TableCell className="py-3 px-4 text-mc-dark font-medium">
        {editing ? (
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEditing();
              if (e.key === "Escape") cancelEditing();
            }}
            autoFocus
            className="h-auto w-56 px-3 py-2 border-mc-gray/15 bg-white text-sm text-mc-dark focus-visible:border-mc-lavender/60 focus-visible:ring-0"
          />
        ) : (
          category
        )}
      </TableCell>
      <TableCell className="py-3 px-4 text-right font-mono text-mc-gray">
        {stats.count}
      </TableCell>
      <TableCell className="py-3 px-4 text-right font-mono text-mc-dark">
        {formatAmount(stats.income)}
      </TableCell>
      <TableCell className="py-3 px-4 text-right font-mono text-mc-dark">
        {formatAmount(stats.expense)}
      </TableCell>
      <TableCell
        className={`py-3 px-4 text-right font-mono font-semibold ${
          net < 0 ? "text-mc-lavender" : "text-mc-dark"
        }`}
      >
        {net < 0 ? "-" : "+"}
        {formatAmount(Math.abs(net))}
      </TableCell>
      <TableCell className="py-3 px-4">
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <Button
                type="button"
                onClick={saveEditing}
                disabled={!draft.trim()}
                className="h-auto rounded-full px-3 py-1.5 text-xs bg-mc-dark text-white hover:bg-mc-dark/85"
              >
                Save
              </Button>
              <Button
                type="button"
                onClick={cancelEditing}
                variant="ghost"
                className="h-auto rounded-full px-3 py-1.5 text-xs text-mc-gray hover:bg-mc-dark/[0.04] hover:text-mc-dark"
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                onClick={startEditing}
                variant="ghost"
                className="h-auto rounded-full px-3 py-1.5 text-xs text-mc-gray hover:bg-mc-dark/[0.04] hover:text-mc-dark"
              >
                Edit
              </Button>
              <Button
                type="button"
                onClick={() => setDeleteOpen(true)}
                variant="ghost"
                className="h-auto rounded-full px-3 py-1.5 text-xs text-mc-gray hover:bg-mc-lavender/15 hover:text-mc-dark"
              >
                Delete
              </Button>
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Delete category?</DialogTitle>
                    <DialogDescription>
                      {stats.count > 0
                        ? `This will remove "${category}" and clear it from ${stats.count} transaction${stats.count === 1 ? "" : "s"}. Those transactions will become uncategorized.`
                        : `This will remove "${category}" from your category list.`}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setDeleteOpen(false)}
                      className="h-auto rounded-full px-5 py-2 text-sm text-mc-gray hover:bg-mc-dark/[0.04] hover:text-mc-dark"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleDelete}
                      className="h-auto rounded-full px-5 py-2 text-sm bg-mc-dark text-white hover:bg-mc-dark/85"
                    >
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function buildStats(txs: ReturnType<typeof useTransactions>) {
  const stats = new Map<string, CategoryStats>();
  for (const tx of txs) {
    const category = tx.category || UNCATEGORIZED_LABEL;
    const current = stats.get(category) ?? {
      count: 0,
      income: 0,
      expense: 0,
    };
    current.count++;
    if (tx.kind === "income") current.income += tx.amount;
    else current.expense += tx.amount;
    stats.set(category, current);
  }
  return stats;
}
