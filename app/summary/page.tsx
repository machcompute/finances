"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import {
  Baseline,
  Transaction,
  UNCATEGORIZED_LABEL,
  formatAmount,
  summarize,
  useBaseline,
  useTransactions,
} from "../lib/transactions";

export default function SummaryPage() {
  const txs = useTransactions();
  const baseline = useBaseline();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const filterActive = startDate !== "" || endDate !== "";
  const validDateRange = !startDate || !endDate || startDate <= endDate;
  const filteredTxs = useMemo(
    () =>
      validDateRange ? filterTransactionsByDate(txs, startDate, endDate) : [],
    [txs, startDate, endDate, validDateRange],
  );
  const summary = useMemo(() => summarize(filteredTxs), [filteredTxs]);
  const balanceSeries = useMemo(
    () => buildBalanceSeries(filteredTxs, filterActive ? null : baseline),
    [filteredTxs, filterActive, baseline],
  );
  const categories = useMemo(() => getCategories(filteredTxs), [filteredTxs]);
  const activeCategory =
    selectedCategory && categories.includes(selectedCategory)
      ? selectedCategory
      : null;
  const categoryBalanceSeries = useMemo(
    () =>
      activeCategory
        ? buildCategoryBalanceSeries(filteredTxs, activeCategory)
        : [],
    [filteredTxs, activeCategory],
  );
  const selectedCategoryTransactions = useMemo(
    () =>
      activeCategory
        ? getCategoryTransactions(filteredTxs, activeCategory)
        : [],
    [filteredTxs, activeCategory],
  );

  const expenseEntries = Object.entries(summary.byCategory.expense).sort(
    (a, b) => b[1] - a[1],
  );
  const incomeEntries = Object.entries(summary.byCategory.income).sort(
    (a, b) => b[1] - a[1],
  );
  const maxExpense = expenseEntries.reduce((m, [, v]) => Math.max(m, v), 0);
  const maxIncome = incomeEntries.reduce((m, [, v]) => Math.max(m, v), 0);

  const currentBalance = filterActive
    ? summary.balance
    : (baseline?.amount ?? 0) + summary.balance;
  const balanceDot = currentBalance >= 0 ? "bg-mc-mint" : "bg-mc-lavender";
  const empty = txs.length === 0;
  const filteredEmpty = filteredTxs.length === 0;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Nav />

      <section className="max-w-7xl w-full mx-auto px-6 pt-20 pb-12 lg:pt-32 lg:pb-20">
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-mc-dark">
            <span className="text-mc-lavender">Summary</span>
          </h1>
          <p className="mt-6 text-lg text-mc-gray leading-relaxed max-w-lg">
            Where your money is going.
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

      <section className="py-20 lg:py-28 bg-mc-dark/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            valid={validDateRange}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onClear={() => {
              setStartDate("");
              setEndDate("");
            }}
          />

          {empty ? (
            <p className="mt-12 text-mc-gray">No transactions yet.</p>
          ) : !validDateRange ? null : filteredEmpty ? (
            <p className="mt-12 text-mc-gray">
              No transactions match this date range.
            </p>
          ) : (
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <SummaryCard
                label="Income"
                amount={summary.totalIncome}
                dotClass="bg-mc-mint"
              />
              <SummaryCard
                label="Expenses"
                amount={summary.totalExpense}
                dotClass="bg-mc-lavender"
              />
              <SummaryCard
                label={filterActive ? "Period balance" : "Balance"}
                amount={currentBalance}
                dotClass={balanceDot}
                signed
              />
            </div>
          )}
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
            Balance over time
          </h2>
          <p className="mt-3 text-mc-gray text-lg max-w-2xl">
            {filterActive
              ? "Cumulative balance for the selected date range."
              : "Cumulative balance as transactions accumulate."}
          </p>

          {balanceSeries.length === 0 ? (
            <p className="mt-12 text-mc-gray">
              {empty
                ? "No transactions yet."
                : "No transactions match this date range."}
            </p>
          ) : (
            <div className="mt-12 p-6 rounded-2xl border border-mc-gray/15 bg-white">
              <BalanceChart data={balanceSeries} />
            </div>
          )}
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-mc-dark/[0.02] flex-1">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
            By Category
          </h2>
          <p className="mt-3 text-mc-gray text-lg max-w-2xl">
            Breakdown of where your money flows.
          </p>

          {empty ? (
            <p className="mt-12 text-mc-gray">No transactions yet.</p>
          ) : filteredEmpty ? (
            <p className="mt-12 text-mc-gray">
              No transactions match this date range.
            </p>
          ) : (
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-12">
              <CategoryColumn
                title="Expenses"
                entries={expenseEntries}
                max={maxExpense}
                barClass="bg-mc-lavender"
                selectedCategory={activeCategory}
                onSelect={setSelectedCategory}
              />
              <CategoryColumn
                title="Income"
                entries={incomeEntries}
                max={maxIncome}
                barClass="bg-mc-mint"
                selectedCategory={activeCategory}
                onSelect={setSelectedCategory}
              />
            </div>
          )}
        </div>
      </section>

      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
            Category balance over time
          </h2>
          <p className="mt-3 text-mc-gray text-lg max-w-2xl">
            Select a category above to see its cumulative balance.
          </p>

          {activeCategory && categoryBalanceSeries.length > 0 ? (
            <div className="mt-12 p-6 rounded-2xl border border-mc-gray/15 bg-white">
              <div className="flex flex-wrap items-baseline justify-between gap-4 mb-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    Selected category
                  </p>
                  <p className="mt-1 text-2xl font-bold text-mc-dark">
                    {activeCategory}
                  </p>
                </div>
                <p className="text-sm font-mono text-mc-gray">
                  Balance{" "}
                  {formatSignedAmount(
                    categoryBalanceSeries[categoryBalanceSeries.length - 1]
                      .balance,
                  )}
                </p>
              </div>
              <CategoryBalanceChart data={categoryBalanceSeries} />
              <CategoryTransactionsList
                category={activeCategory}
                transactions={selectedCategoryTransactions}
              />
            </div>
          ) : categories.length > 0 ? (
            <p className="mt-12 text-mc-gray">
              Pick a category above to see its cumulative balance.
            </p>
          ) : (
            <p className="mt-12 text-mc-gray">No category data yet.</p>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function DateRangeFilter({
  startDate,
  endDate,
  valid,
  onStartDateChange,
  onEndDateChange,
  onClear,
}: {
  startDate: string;
  endDate: string;
  valid: boolean;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClear: () => void;
}) {
  const active = startDate !== "" || endDate !== "";

  return (
    <div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
            Date range
          </h2>
          <p className="mt-3 text-mc-gray text-lg max-w-2xl">
            Filter the summary by transaction date.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
              Start
            </span>
            <input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="mt-2 h-11 rounded-lg border border-mc-gray/20 bg-white px-3 text-sm font-mono text-mc-dark outline-none transition-colors focus:border-mc-lavender"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
              End
            </span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="mt-2 h-11 rounded-lg border border-mc-gray/20 bg-white px-3 text-sm font-mono text-mc-dark outline-none transition-colors focus:border-mc-lavender"
            />
          </label>
          <button
            type="button"
            onClick={onClear}
            disabled={!active}
            className="h-11 rounded-lg border border-mc-gray/20 px-4 text-sm font-medium text-mc-dark transition-colors hover:bg-mc-dark/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
      {!valid ? (
        <p className="mt-4 text-sm font-medium text-mc-lavender">
          Start date must be before end date.
        </p>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  amount,
  dotClass,
  signed = false,
}: {
  label: string;
  amount: number;
  dotClass: string;
  signed?: boolean;
}) {
  const display = signed
    ? `${amount >= 0 ? "+" : "−"}${formatAmount(Math.abs(amount))}`
    : formatAmount(amount);
  return (
    <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
          {label}
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold font-mono text-mc-dark">
        {display}
      </p>
    </div>
  );
}

function CategoryColumn({
  title,
  entries,
  max,
  barClass,
  selectedCategory,
  onSelect,
}: {
  title: string;
  entries: [string, number][];
  max: number;
  barClass: string;
  selectedCategory: string | null;
  onSelect: (category: string) => void;
}) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-mc-dark">{title}</h3>
      <div className="mt-6 space-y-5">
        {entries.length === 0 ? (
          <p className="text-sm text-mc-gray">Nothing yet.</p>
        ) : (
          entries.map(([cat, amt]) => {
            const pct = max > 0 ? Math.max(2, (amt / max) * 100) : 0;
            const selected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onSelect(cat)}
                className={`block w-full rounded-lg p-3 text-left transition-colors ${
                  selected
                    ? "bg-mc-dark/[0.04] ring-1 ring-mc-dark/10"
                    : "hover:bg-mc-dark/[0.03]"
                }`}
                aria-pressed={selected}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium text-mc-dark">
                    {cat}
                  </span>
                  <span className="text-sm font-mono text-mc-gray">
                    {formatAmount(amt)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-mc-dark/[0.05] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barClass}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function CategoryTransactionsList({
  category,
  transactions,
}: {
  category: string;
  transactions: Transaction[];
}) {
  return (
    <div className="mt-10 border-t border-mc-gray/10 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-mc-dark">Transactions</h3>
          <p className="mt-1 text-sm text-mc-gray">
            {transactions.length} transaction
            {transactions.length === 1 ? "" : "s"} in {category}.
          </p>
        </div>
        <p className="text-sm font-mono text-mc-gray">
          Net {formatSignedAmount(sumTransactions(transactions))}
        </p>
      </div>

      {transactions.length === 0 ? (
        <p className="mt-6 text-sm text-mc-gray">
          No transactions for this category.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-mc-gray/10">
          {transactions.map((tx) => (
            <li
              key={tx.id}
              className="py-5 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                      tx.kind === "income"
                        ? "bg-mc-mint/20 text-mc-dark/70"
                        : "bg-mc-lavender/15 text-mc-dark/70"
                    }`}
                  >
                    {tx.kind}
                  </span>
                  <span className="text-sm font-mono text-mc-gray/60">
                    {tx.date}
                  </span>
                </div>
                <p
                  className={`mt-2 text-sm ${
                    tx.note ? "text-mc-dark" : "italic text-mc-gray"
                  }`}
                >
                  {tx.note || "No note"}
                </p>
                {tx.account ? (
                  <p className="mt-1 text-xs text-mc-gray">
                    Account {tx.account}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-base font-mono font-semibold text-mc-dark">
                {tx.kind === "income" ? "+" : "−"}
                {formatAmount(tx.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type BalancePoint = { date: string; balance: number };

function filterTransactionsByDate(
  txs: Transaction[],
  startDate: string,
  endDate: string,
): Transaction[] {
  if (!startDate && !endDate) return txs;
  return txs.filter((tx) => {
    if (startDate && tx.date < startDate) return false;
    if (endDate && tx.date > endDate) return false;
    return true;
  });
}

function getCategories(txs: Transaction[]): string[] {
  const categories = new Set<string>();
  for (const tx of txs) {
    categories.add(tx.category || UNCATEGORIZED_LABEL);
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
}

function getCategoryTransactions(
  txs: Transaction[],
  category: string,
): Transaction[] {
  return txs
    .filter((tx) => (tx.category || UNCATEGORIZED_LABEL) === category)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function sumTransactions(txs: Transaction[]): number {
  return txs.reduce(
    (total, tx) => total + (tx.kind === "income" ? tx.amount : -tx.amount),
    0,
  );
}

function buildBalanceSeries(
  txs: Transaction[],
  baseline: Baseline | null,
): BalancePoint[] {
  if (txs.length === 0 && !baseline) return [];
  const byDate = new Map<string, number>();
  for (const tx of txs) {
    const sign = tx.kind === "income" ? 1 : -1;
    byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + sign * tx.amount);
  }
  const dates = [...byDate.keys()].sort();
  let running = baseline?.amount ?? 0;
  const points: BalancePoint[] = [];
  if (baseline) {
    points.push({
      date: baseline.date,
      balance: Math.round(running * 100) / 100,
    });
  }
  for (const date of dates) {
    if (baseline && date <= baseline.date) {
      running += byDate.get(date) ?? 0;
      points[points.length - 1] = {
        date: baseline.date,
        balance: Math.round(running * 100) / 100,
      };
      continue;
    }
    running += byDate.get(date) ?? 0;
    points.push({ date, balance: Math.round(running * 100) / 100 });
  }
  return points;
}

function buildCategoryBalanceSeries(
  txs: Transaction[],
  category: string,
): BalancePoint[] {
  const byDate = new Map<string, number>();
  for (const tx of txs) {
    const txCategory = tx.category || UNCATEGORIZED_LABEL;
    if (txCategory !== category) continue;
    const sign = tx.kind === "income" ? 1 : -1;
    byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + sign * tx.amount);
  }

  let running = 0;
  const points: BalancePoint[] = [];
  for (const date of [...byDate.keys()].sort()) {
    running += byDate.get(date) ?? 0;
    points.push({ date, balance: Math.round(running * 100) / 100 });
  }
  return points;
}

function formatSignedAmount(amount: number): string {
  return `${amount >= 0 ? "+" : "−"}${formatAmount(Math.abs(amount))}`;
}

function BalanceChart({ data }: { data: BalancePoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B8B3E9" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#B8B3E9" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#8A8D91" strokeOpacity={0.12} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#8A8D91", fontSize: 12, fontFamily: "var(--font-geist-mono)" }}
            tickLine={false}
            axisLine={{ stroke: "#8A8D91", strokeOpacity: 0.2 }}
            minTickGap={32}
          />
          <YAxis
            tick={{ fill: "#8A8D91", fontSize: 12, fontFamily: "var(--font-geist-mono)" }}
            tickLine={false}
            axisLine={{ stroke: "#8A8D91", strokeOpacity: 0.2 }}
            tickFormatter={(v: number) => formatAmount(v)}
            width={72}
          />
          <Tooltip content={<BalanceTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#B8B3E9"
            strokeWidth={2}
            fill="url(#balanceFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryBalanceChart({ data }: { data: BalancePoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id="categoryBalanceFill"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#98DFAF" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#98DFAF" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#8A8D91"
            strokeOpacity={0.12}
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{
              fill: "#8A8D91",
              fontSize: 12,
              fontFamily: "var(--font-geist-mono)",
            }}
            tickLine={false}
            axisLine={{ stroke: "#8A8D91", strokeOpacity: 0.2 }}
            minTickGap={32}
          />
          <YAxis
            tick={{
              fill: "#8A8D91",
              fontSize: 12,
              fontFamily: "var(--font-geist-mono)",
            }}
            tickLine={false}
            axisLine={{ stroke: "#8A8D91", strokeOpacity: 0.2 }}
            tickFormatter={(v: number) => formatAmount(v)}
            width={72}
          />
          <Tooltip content={<BalanceTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#98DFAF"
            strokeWidth={2}
            fill="url(#categoryBalanceFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type TooltipPayload = { value?: number | string };
type BalanceTooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
};

function BalanceTooltip({ active, payload, label }: BalanceTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const raw = payload[0].value;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!isFinite(value)) return null;
  return (
    <div className="rounded-md border border-mc-gray/15 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-mono text-mc-gray">{label}</p>
      <p className="mt-0.5 text-sm font-mono font-semibold text-mc-dark">
        {value >= 0 ? "" : "−"}
        {formatAmount(Math.abs(value))}
      </p>
    </div>
  );
}
