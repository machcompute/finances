"use client";

import Link from "next/link";
import { useMemo } from "react";
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
  Transaction,
  formatAmount,
  summarize,
  useTransactions,
} from "../lib/transactions";

export default function SummaryPage() {
  const txs = useTransactions();
  const summary = useMemo(() => summarize(txs), [txs]);
  const balanceSeries = useMemo(() => buildBalanceSeries(txs), [txs]);

  const expenseEntries = Object.entries(summary.byCategory.expense).sort(
    (a, b) => b[1] - a[1],
  );
  const incomeEntries = Object.entries(summary.byCategory.income).sort(
    (a, b) => b[1] - a[1],
  );
  const maxExpense = expenseEntries.reduce((m, [, v]) => Math.max(m, v), 0);
  const maxIncome = incomeEntries.reduce((m, [, v]) => Math.max(m, v), 0);

  const balanceDot = summary.balance >= 0 ? "bg-mc-mint" : "bg-mc-lavender";
  const empty = txs.length === 0;

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
          {empty ? (
            <p className="text-mc-gray">No transactions yet.</p>
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
                label="Balance"
                amount={summary.balance}
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
            Cumulative balance as transactions accumulate.
          </p>

          {balanceSeries.length === 0 ? (
            <p className="mt-12 text-mc-gray">No transactions yet.</p>
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
          ) : (
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-12">
              <CategoryColumn
                title="Expenses"
                entries={expenseEntries}
                max={maxExpense}
                barClass="bg-mc-lavender"
              />
              <CategoryColumn
                title="Income"
                entries={incomeEntries}
                max={maxIncome}
                barClass="bg-mc-mint"
              />
            </div>
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
}: {
  title: string;
  entries: [string, number][];
  max: number;
  barClass: string;
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
            return (
              <div key={cat}>
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

type BalancePoint = { date: string; balance: number };

function buildBalanceSeries(txs: Transaction[]): BalancePoint[] {
  if (txs.length === 0) return [];
  const byDate = new Map<string, number>();
  for (const tx of txs) {
    const sign = tx.kind === "income" ? 1 : -1;
    byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + sign * tx.amount);
  }
  const dates = [...byDate.keys()].sort();
  let running = 0;
  return dates.map((date) => {
    running += byDate.get(date) ?? 0;
    return { date, balance: Math.round(running * 100) / 100 };
  });
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
