"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Pagination } from "../components/Pagination";

const TX_PAGE_SIZE = 20;
const MA_WINDOWS = [7, 14, 30, 90] as const;
type MaWindow = (typeof MA_WINDOWS)[number];
import {
  Account,
  Baseline,
  Transaction,
  UNCATEGORIZED_LABEL,
  aggregateBaseline,
  formatAmount,
  summarize,
  useAccounts,
  useBaselines,
  useFilteredTransactions,
  useSelectedAccountId,
} from "../lib/transactions";

export default function SummaryPage() {
  const accounts = useAccounts();
  const selectedAccountId = useSelectedAccountId();
  const txs = useFilteredTransactions();
  const baselines = useBaselines();
  const baseline = useMemo(() => {
    if (selectedAccountId) return baselines.get(selectedAccountId) ?? null;
    return aggregateBaseline(
      baselines,
      accounts.map((a) => a.id),
    );
  }, [baselines, selectedAccountId, accounts]);
  const accountById = useMemo(() => {
    const m = new Map<string, Account>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [maWindow, setMaWindow] = useState<MaWindow>(30);
  const [selection, setSelection] = useState<[string, string] | null>(null);

  const filterActive = selection !== null;
  const filteredTxs = useMemo(
    () => applySelection(txs, selection),
    [txs, selection],
  );
  const summary = useMemo(() => summarize(filteredTxs), [filteredTxs]);
  const balanceSeries = useMemo(
    () => buildBalanceSeries(txs, baseline),
    [txs, baseline],
  );
  const displayedBalanceSeries = useMemo(
    () => sliceBalanceSeries(balanceSeries, selection),
    [balanceSeries, selection],
  );
  const categories = useMemo(() => getCategories(filteredTxs), [filteredTxs]);
  const activeCategory =
    selectedCategory && categories.includes(selectedCategory)
      ? selectedCategory
      : null;
  const dailyView = useMemo(
    () =>
      filteredTxs.length > 0
        ? buildCategoryDailyView(filteredTxs, activeCategory, maWindow)
        : null,
    [filteredTxs, activeCategory, maWindow],
  );
  const sectionTransactions = useMemo(() => {
    if (filteredTxs.length === 0) return [];
    if (activeCategory) return getCategoryTransactions(filteredTxs, activeCategory);
    return [...filteredTxs].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
  }, [filteredTxs, activeCategory]);

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

  function toggleCategory(cat: string) {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  }

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

      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
            Balance over time
          </h2>
          <p className="mt-3 text-mc-gray text-lg max-w-2xl">
            Cumulative balance — drag on the chart to focus an interval.
            Everything below follows the selection.
          </p>

          {empty ? (
            <p className="mt-12 text-mc-gray">No transactions yet.</p>
          ) : (
            <div className="mt-12 p-6 rounded-2xl border border-mc-gray/15 bg-white">
              <BalanceChart
                data={displayedBalanceSeries}
                hasSelection={filterActive}
                onSelect={(range) => setSelection(range)}
                onReset={() => setSelection(null)}
              />
            </div>
          )}
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-mc-dark/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          {empty ? (
            <p className="text-mc-gray">No transactions yet.</p>
          ) : filteredEmpty ? (
            <p className="text-mc-gray">No transactions in this selection.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                onSelect={toggleCategory}
              />
              <CategoryColumn
                title="Income"
                entries={incomeEntries}
                max={maxIncome}
                barClass="bg-mc-mint"
                selectedCategory={activeCategory}
                onSelect={toggleCategory}
              />
            </div>
          )}
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-mc-dark/[0.02] flex-1">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-mc-dark tracking-tight">
            Daily flow
          </h2>
          <p className="mt-3 text-mc-gray text-lg max-w-2xl">
            Daily net flow with {maWindow}-day exponential moving average
            and linear trend.
            {activeCategory
              ? ` Filtered to ${activeCategory}.`
              : " Click a category above to filter."}
          </p>

          {dailyView && dailyView.points.length > 0 ? (
            <div className="mt-12 p-6 rounded-2xl border border-mc-gray/15 bg-white">
              <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
                    {activeCategory ? "Filtered by category" : "Scope"}
                  </p>
                  <div className="mt-1 flex items-center gap-3 flex-wrap">
                    <p className="text-2xl font-bold text-mc-dark">
                      {activeCategory ?? "All categories"}
                    </p>
                    {activeCategory && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        className="text-xs font-medium px-3 py-1 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25 transition-colors"
                      >
                        Clear category
                      </button>
                    )}
                  </div>
                </div>
                <WindowSelector value={maWindow} onChange={setMaWindow} />
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                <StatChip
                  label={`Avg/day (${maWindow}d EMA)`}
                  value={formatSignedAmount(
                    dailyView.points[dailyView.points.length - 1].ma,
                  )}
                />
                <StatChip
                  label="Net (period)"
                  value={formatSignedAmount(dailyView.net)}
                />
                <StatChip
                  label="Trend"
                  value={`${dailyView.slopePerDay >= 0 ? "+" : "−"}${formatAmount(Math.abs(dailyView.slopePerDay))}/day`}
                />
              </div>
              <CategoryDailyChart data={dailyView.points} />
              <TransactionsList
                key={activeCategory ?? "all"}
                label={activeCategory ?? "All transactions"}
                transactions={sectionTransactions}
                showAccount={selectedAccountId === null}
                accountById={accountById}
              />
            </div>
          ) : empty ? (
            <p className="mt-12 text-mc-gray">No transactions yet.</p>
          ) : (
            <p className="mt-12 text-mc-gray">
              No transactions in this selection.
            </p>
          )}
        </div>
      </section>

      <Footer />
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

function TransactionsList({
  label,
  transactions,
  showAccount,
  accountById,
}: {
  label: string;
  transactions: Transaction[];
  showAccount: boolean;
  accountById: Map<string, Account>;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(transactions.length / TX_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = transactions.slice(
    (safePage - 1) * TX_PAGE_SIZE,
    safePage * TX_PAGE_SIZE,
  );

  return (
    <div className="mt-10 border-t border-mc-gray/10 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-mc-dark">Transactions</h3>
          <p className="mt-1 text-sm text-mc-gray">
            {transactions.length} transaction
            {transactions.length === 1 ? "" : "s"} · {label}.
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
          {pageItems.map((tx) => (
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
                {showAccount ? (
                  <p className="mt-1 text-xs text-mc-gray">
                    Account {accountById.get(tx.accountId)?.name ?? "—"}
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
      <Pagination
        page={safePage}
        pageCount={pageCount}
        total={transactions.length}
        pageSize={TX_PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}

type BalancePoint = { date: string; balance: number };

function applySelection(
  txs: Transaction[],
  selection: [string, string] | null,
): Transaction[] {
  if (!selection) return txs;
  const [a, b] = selection;
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return txs.filter((tx) => tx.date >= lo && tx.date <= hi);
}

function sliceBalanceSeries(
  series: BalancePoint[],
  selection: [string, string] | null,
): BalancePoint[] {
  if (!selection) return series;
  const [a, b] = selection;
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return series.filter((p) => p.date >= lo && p.date <= hi);
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

type DailyFlowPoint = {
  date: string;
  flow: number;
  ma: number;
  trend: number;
};

type CategoryDailyView = {
  points: DailyFlowPoint[];
  net: number;
  slopePerDay: number;
};

function buildDailyFlow(
  txs: Transaction[],
  category: string | null,
): { date: string; flow: number }[] {
  const byDate = new Map<string, number>();
  for (const tx of txs) {
    if (category !== null) {
      const txCategory = tx.category || UNCATEGORIZED_LABEL;
      if (txCategory !== category) continue;
    }
    const sign = tx.kind === "income" ? 1 : -1;
    byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + sign * tx.amount);
  }
  if (byDate.size === 0) return [];

  const dates = [...byDate.keys()].sort();
  const start = parseISO(dates[0]);
  const end = parseISO(dates[dates.length - 1]);
  const out: { date: string; flow: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const iso = formatISO(d);
    out.push({ date: iso, flow: byDate.get(iso) ?? 0 });
  }
  return out;
}

function applyEMA(
  daily: { date: string; flow: number }[],
  window: number,
): number[] {
  const w = Math.max(1, window);
  const alpha = 2 / (w + 1);
  const out = new Array<number>(daily.length);
  let prev = 0;
  for (let i = 0; i < daily.length; i++) {
    prev = alpha * daily[i].flow + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

function linearTrend(
  daily: { date: string; flow: number }[],
): { line: number[]; slope: number } {
  const n = daily.length;
  if (n === 0) return { line: [], slope: 0 };
  if (n === 1) return { line: [daily[0].flow], slope: 0 };
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += daily[i].flow;
    sxy += i * daily[i].flow;
    sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const line = new Array<number>(n);
  for (let i = 0; i < n; i++) line[i] = slope * i + intercept;
  return { line, slope };
}

function buildCategoryDailyView(
  txs: Transaction[],
  category: string | null,
  window: number,
): CategoryDailyView | null {
  const daily = buildDailyFlow(txs, category);
  if (daily.length === 0) return null;

  const ma = applyEMA(daily, window);
  const { line: trend, slope } = linearTrend(daily);
  let net = 0;
  const points: DailyFlowPoint[] = daily.map((d, i) => {
    net += d.flow;
    return {
      date: d.date,
      flow: roundTo2(d.flow),
      ma: roundTo2(ma[i]),
      trend: roundTo2(trend[i]),
    };
  });
  return { points, net: roundTo2(net), slopePerDay: roundTo2(slope) };
}

function roundTo2(v: number): number {
  return Math.round(v * 100) / 100;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function formatISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatSignedAmount(amount: number): string {
  return `${amount >= 0 ? "+" : "−"}${formatAmount(Math.abs(amount))}`;
}

function BalanceChart({
  data,
  hasSelection,
  onSelect,
  onReset,
}: {
  data: BalancePoint[];
  hasSelection: boolean;
  onSelect: (range: [string, string]) => void;
  onReset: () => void;
}) {
  const [refStart, setRefStart] = useState<string | null>(null);
  const [refEnd, setRefEnd] = useState<string | null>(null);

  function activeLabel(state: unknown): string | null {
    if (state && typeof state === "object" && "activeLabel" in state) {
      const v = (state as { activeLabel?: unknown }).activeLabel;
      if (typeof v === "string" && v) return v;
    }
    return null;
  }

  function handleMouseDown(state: unknown) {
    const label = activeLabel(state);
    if (!label) return;
    setRefStart(label);
    setRefEnd(label);
  }
  function handleMouseMove(state: unknown) {
    if (!refStart) return;
    const label = activeLabel(state);
    if (!label) return;
    setRefEnd(label);
  }
  function handleMouseUp() {
    if (refStart && refEnd && refStart !== refEnd) {
      onSelect([refStart, refEnd]);
    }
    setRefStart(null);
    setRefEnd(null);
  }

  const dragLo =
    refStart && refEnd ? (refStart < refEnd ? refStart : refEnd) : null;
  const dragHi =
    refStart && refEnd ? (refStart < refEnd ? refEnd : refStart) : null;

  return (
    <div className="w-full">
      <div className="h-72 w-full select-none">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B8B3E9" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#B8B3E9" stopOpacity={0.05} />
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
              stroke="#B8B3E9"
              strokeWidth={2}
              fill="url(#balanceFill)"
            />
            {dragLo && dragHi && dragLo !== dragHi && (
              <ReferenceArea
                x1={dragLo}
                x2={dragHi}
                strokeOpacity={0}
                fill="#B8B3E9"
                fillOpacity={0.2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {hasSelection && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium px-3 py-1 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25 transition-colors"
          >
            Reset selection
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryDailyChart({ data }: { data: DailyFlowPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id="categoryMaFill"
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
          <ReferenceLine y={0} stroke="#8A8D91" strokeOpacity={0.3} />
          <Tooltip content={<DailyFlowTooltip />} />
          <Area
            type="monotone"
            dataKey="ma"
            stroke="#98DFAF"
            strokeWidth={2}
            fill="url(#categoryMaFill)"
          />
          <Line
            type="linear"
            dataKey="trend"
            stroke="#B8B3E9"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function WindowSelector({
  value,
  onChange,
}: {
  value: MaWindow;
  onChange: (next: MaWindow) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-mc-gray/15 p-0.5">
      {MA_WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onChange(w)}
          className={`text-sm font-medium px-3 py-1 rounded-full transition-colors ${
            value === w
              ? "bg-mc-dark text-white"
              : "text-mc-gray hover:text-mc-dark"
          }`}
        >
          {w}d
        </button>
      ))}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 px-3 py-1.5 rounded-full bg-mc-dark/[0.04] border border-mc-gray/15">
      <span className="text-xs uppercase tracking-wider text-mc-gray">
        {label}
      </span>
      <span className="text-sm font-mono text-mc-dark">{value}</span>
    </span>
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

type DailyTooltipPayload = { dataKey?: string; value?: number | string };
type DailyTooltipProps = {
  active?: boolean;
  payload?: DailyTooltipPayload[];
  label?: string;
};

function DailyFlowTooltip({ active, payload, label }: DailyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const byKey = new Map<string, number>();
  for (const p of payload) {
    if (!p.dataKey) continue;
    const v = typeof p.value === "number" ? p.value : Number(p.value);
    if (isFinite(v)) byKey.set(p.dataKey, v);
  }
  const flow = byKey.get("flow");
  const ma = byKey.get("ma");
  const trend = byKey.get("trend");
  return (
    <div className="rounded-md border border-mc-gray/15 bg-white px-3 py-2 shadow-sm space-y-0.5">
      <p className="text-xs font-mono text-mc-gray">{label}</p>
      {flow !== undefined && (
        <p className="text-xs font-mono text-mc-gray">
          Flow{" "}
          <span className="text-mc-dark font-semibold">
            {flow >= 0 ? "+" : "−"}
            {formatAmount(Math.abs(flow))}
          </span>
        </p>
      )}
      {ma !== undefined && (
        <p className="text-xs font-mono text-mc-gray">
          EMA{" "}
          <span className="text-mc-dark font-semibold">
            {ma >= 0 ? "+" : "−"}
            {formatAmount(Math.abs(ma))}
          </span>
        </p>
      )}
      {trend !== undefined && (
        <p className="text-xs font-mono text-mc-gray">
          Trend{" "}
          <span className="text-mc-dark font-semibold">
            {trend >= 0 ? "+" : "−"}
            {formatAmount(Math.abs(trend))}
          </span>
        </p>
      )}
    </div>
  );
}
