"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { Pagination } from "../components/Pagination";
import { ParsedCSV, parseCSV } from "../lib/csv";

const IMPORT_PAGE_SIZE = 20;
import {
  Baseline,
  Transaction,
  TransactionKind,
  UNCATEGORIZED_LABEL,
  addTransactionsBatch,
  formatAmount,
  setBaseline,
  useCategories,
} from "../lib/transactions";

type AmountMode = "single" | "debit-credit";
type AnchorKind = "none" | "initial" | "final";

type Mapping = {
  date: string;
  description: string;
  amountMode: AmountMode;
  amount: string;
  debit: string;
  credit: string;
  category: string;
  account: string;
  decimal: "." | ",";
  dateFormat: "auto" | "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";
};

const NONE = "__none__";

type DerivedRow = {
  index: number;
  date: string | null;
  description: string;
  amount: number | null;
  kind: TransactionKind | null;
  category: string | undefined;
  account: string | undefined;
  errors: string[];
};

export default function ImportPage() {
  const categories = useCategories();

  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [step, setStep] = useState<"upload" | "map" | "confirm">("upload");
  const [mapping, setMapping] = useState<Mapping>(() => emptyMapping());
  const [defaultAccount, setDefaultAccount] = useState("");
  const [anchorKind, setAnchorKind] = useState<AnchorKind>("none");
  const [anchorAmount, setAnchorAmount] = useState("");
  const [anchorDate, setAnchorDate] = useState("");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  function resetAll() {
    setParsed(null);
    setFileName("");
    setStep("upload");
    setMapping(emptyMapping());
    setDefaultAccount("");
    setAnchorKind("none");
    setAnchorAmount("");
    setAnchorDate("");
    setOverrides({});
    setImportStatus(null);
    setErrorMessage(null);
  }

  async function handleFile(file: File) {
    setErrorMessage(null);
    try {
      const text = await file.text();
      const p = parseCSV(text);
      if (p.headers.length === 0) {
        setErrorMessage("CSV is empty.");
        return;
      }
      setParsed(p);
      setFileName(file.name);
      setMapping(autoMap(p.headers));
      setStep("map");
      setOverrides({});
    } catch {
      setErrorMessage("Could not read file.");
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await handleFile(file);
  }

  function hasFiles(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes("Files");
  }
  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }
  async function onDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  }

  const derived: DerivedRow[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((row, index) =>
      deriveRow({
        row,
        index,
        headers: parsed.headers,
        mapping,
        defaultAccount,
        override: overrides[index],
      }),
    );
  }, [parsed, mapping, defaultAccount, overrides]);

  const stats = useMemo(() => computeStats(derived), [derived]);
  const baseline = useMemo(
    () =>
      computeBaseline({
        anchorKind,
        anchorAmount,
        anchorDate,
        derived,
      }),
    [anchorKind, anchorAmount, anchorDate, derived],
  );

  function commitImport() {
    if (!parsed) return;
    const drafts: Omit<Transaction, "id">[] = [];
    for (const r of derived) {
      if (r.errors.length > 0) continue;
      drafts.push({
        kind: r.kind!,
        amount: r.amount!,
        category: r.category,
        date: r.date!,
        note: r.description || undefined,
        account: r.account,
      });
    }

    if (drafts.length === 0) {
      setErrorMessage("Nothing to import — every row has errors.");
      return;
    }

    const result = addTransactionsBatch(drafts);
    const parts = [
      `${result.added} added`,
      `${result.categoriesAdded} new categor${result.categoriesAdded === 1 ? "y" : "ies"}`,
    ];
    if (defaultAccount) parts.push(`account "${defaultAccount}"`);
    if (baseline) {
      setBaseline(baseline.amount, baseline.date);
      parts.push(
        `baseline ${baseline.amount.toFixed(2)} as of ${baseline.date}`,
      );
    }
    setImportStatus(parts.join(" · "));
    setStep("upload");
    setParsed(null);
    setFileName("");
    setMapping(emptyMapping());
    setOverrides({});
  }

  return (
    <div
      className="min-h-screen bg-white flex flex-col relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center p-6">
          <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-mc-lavender bg-mc-lavender/15 backdrop-blur-sm" />
          <div className="relative px-6 py-4 rounded-full bg-white border border-mc-gray/15 shadow-lg">
            <span className="text-sm font-medium text-mc-dark">
              Drop CSV to import
            </span>
          </div>
        </div>
      )}

      <Nav />

      <section className="max-w-7xl w-full mx-auto px-6 pt-20 pb-12 lg:pt-32 lg:pb-20">
        <div className="max-w-xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-mc-dark">
            Import <span className="text-mc-lavender">CSV</span>
          </h1>
          <p className="mt-6 text-lg text-mc-gray leading-relaxed max-w-lg">
            Map columns, anchor your bank balance, let auto-categorization
            fill in the rest.
          </p>
          {importStatus && (
            <p className="mt-6 text-sm text-mc-dark/80">
              <span className="inline-block w-2 h-2 rounded-full bg-mc-mint mr-2 align-middle" />
              {importStatus}
            </p>
          )}
          {errorMessage && (
            <p className="mt-6 text-sm text-mc-dark/80">
              <span className="inline-block w-2 h-2 rounded-full bg-mc-lavender mr-2 align-middle" />
              {errorMessage}
            </p>
          )}
        </div>
      </section>

      <section className="py-20 lg:py-28 bg-mc-dark/[0.02] flex-1">
        <div className="max-w-7xl mx-auto px-6">
          {step === "upload" && (
            <UploadCard
              fileInputRef={fileInputRef}
              onFileChange={onFileChange}
            />
          )}

          {step === "map" && parsed && (
            <MapCard
              parsed={parsed}
              fileName={fileName}
              mapping={mapping}
              setMapping={setMapping}
              derived={derived}
              defaultAccount={defaultAccount}
              setDefaultAccount={setDefaultAccount}
              anchorKind={anchorKind}
              setAnchorKind={setAnchorKind}
              anchorAmount={anchorAmount}
              setAnchorAmount={setAnchorAmount}
              anchorDate={anchorDate}
              setAnchorDate={setAnchorDate}
              onCancel={resetAll}
              onContinue={() => setStep("confirm")}
              continueDisabled={!mappingReady(mapping) || stats.valid === 0}
            />
          )}

          {step === "confirm" && parsed && (
            <ConfirmCard
              derived={derived}
              stats={stats}
              baseline={baseline}
              categoriesByKind={categories}
              setOverride={(idx, cat) =>
                setOverrides((o) => ({ ...o, [idx]: cat }))
              }
              onBack={() => setStep("map")}
              onCommit={commitImport}
              defaultAccount={defaultAccount}
            />
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function emptyMapping(): Mapping {
  return {
    date: "",
    description: "",
    amountMode: "single",
    amount: "",
    debit: "",
    credit: "",
    category: NONE,
    account: NONE,
    decimal: ".",
    dateFormat: "auto",
  };
}

function autoMap(headers: string[]): Mapping {
  const m = emptyMapping();
  const find = (re: RegExp) => headers.find((h) => re.test(h)) ?? "";
  m.date = find(/date|data|fecha/i);
  m.description = find(/desc|memo|name|title|payee|narrative/i);
  m.amount = find(/amount|valor|montante|importe/i);
  m.debit = find(/debit|d[ée]bito|withdraw/i);
  m.credit = find(/credit|cr[ée]dito|deposit/i);
  if (m.debit && m.credit) m.amountMode = "debit-credit";
  const cat = find(/categ/i);
  if (cat) m.category = cat;
  const acct = find(/account|conta|acct/i);
  if (acct) m.account = acct;
  return m;
}

function mappingReady(m: Mapping): boolean {
  if (!m.date || !m.description) return false;
  if (m.amountMode === "single") return !!m.amount;
  return !!m.debit || !!m.credit;
}

function deriveRow(args: {
  row: string[];
  index: number;
  headers: string[];
  mapping: Mapping;
  defaultAccount: string;
  override: string | undefined;
}): DerivedRow {
  const { row, index, headers, mapping, defaultAccount, override } = args;
  const errors: string[] = [];
  const cellByHeader = (h: string): string => {
    if (!h) return "";
    const i = headers.indexOf(h);
    if (i === -1) return "";
    return row[i] ?? "";
  };

  const description = cellByHeader(mapping.description).trim();
  if (!description) errors.push("missing description");

  const date = parseDate(
    cellByHeader(mapping.date).trim(),
    mapping.dateFormat,
  );
  if (!date) errors.push("bad date");

  let amount: number | null = null;
  let kind: TransactionKind | null = null;
  if (mapping.amountMode === "single") {
    const raw = cellByHeader(mapping.amount).trim();
    const n = parseAmount(raw, mapping.decimal);
    if (n === null) {
      errors.push("bad amount");
    } else {
      kind = n >= 0 ? "income" : "expense";
      amount = Math.abs(n);
      if (amount === 0) errors.push("zero amount");
    }
  } else {
    const dRaw = cellByHeader(mapping.debit).trim();
    const cRaw = cellByHeader(mapping.credit).trim();
    const d = dRaw ? parseAmount(dRaw, mapping.decimal) : null;
    const c = cRaw ? parseAmount(cRaw, mapping.decimal) : null;
    if (d !== null && d !== 0) {
      kind = "expense";
      amount = Math.abs(d);
    } else if (c !== null && c !== 0) {
      kind = "income";
      amount = Math.abs(c);
    } else {
      errors.push("bad debit/credit");
    }
  }

  let category: string | undefined = undefined;
  if (override !== undefined) {
    category = override || undefined;
  } else if (mapping.category !== NONE && mapping.category) {
    const explicit = cellByHeader(mapping.category).trim();
    if (explicit) category = explicit;
  }

  let account: string | undefined = undefined;
  if (mapping.account !== NONE && mapping.account) {
    const a = cellByHeader(mapping.account).trim();
    if (a) account = a;
  }
  if (!account && defaultAccount) account = defaultAccount;

  return {
    index,
    date: date,
    description,
    amount,
    kind,
    category,
    account,
    errors,
  };
}

function parseAmount(raw: string, decimal: "." | ","): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,\-+]/g, "");
  if (decimal === ",") {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function parseDate(
  raw: string,
  fmt: Mapping["dateFormat"],
): string | null {
  if (!raw) return null;
  const tryFormats =
    fmt === "auto"
      ? (["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const)
      : [fmt];
  for (const f of tryFormats) {
    const out = applyDateFormat(raw, f);
    if (out) return out;
  }
  return null;
}

function applyDateFormat(raw: string, fmt: string): string | null {
  const trimmed = raw.trim();
  let m: RegExpMatchArray | null = null;
  if (fmt === "YYYY-MM-DD") {
    m = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!m) return null;
    return iso(m[1], m[2], m[3]);
  }
  if (fmt === "DD/MM/YYYY") {
    m = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (!m) return null;
    return iso(m[3], m[2], m[1]);
  }
  if (fmt === "MM/DD/YYYY") {
    m = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (!m) return null;
    return iso(m[3], m[1], m[2]);
  }
  return null;
}

function iso(y: string, mo: string, d: string): string | null {
  const ny = parseInt(y, 10);
  const nmo = parseInt(mo, 10);
  const nd = parseInt(d, 10);
  if (!ny || !nmo || !nd) return null;
  if (nmo < 1 || nmo > 12 || nd < 1 || nd > 31) return null;
  return `${ny.toString().padStart(4, "0")}-${nmo.toString().padStart(2, "0")}-${nd.toString().padStart(2, "0")}`;
}

type Stats = {
  total: number;
  valid: number;
  invalid: number;
  categorized: number;
  uncategorized: number;
};
function computeStats(rows: DerivedRow[]): Stats {
  let valid = 0;
  let categorized = 0;
  for (const r of rows) {
    if (r.errors.length === 0) {
      valid++;
      if (r.category) categorized++;
    }
  }
  return {
    total: rows.length,
    valid,
    invalid: rows.length - valid,
    categorized,
    uncategorized: valid - categorized,
  };
}

function computeBaseline(args: {
  anchorKind: AnchorKind;
  anchorAmount: string;
  anchorDate: string;
  derived: DerivedRow[];
}): Baseline | null {
  const { anchorKind, anchorAmount, anchorDate, derived } = args;
  if (anchorKind === "none") return null;
  const value = parseFloat(anchorAmount);
  if (!isFinite(value)) return null;

  const validRows = derived.filter((r) => r.errors.length === 0);
  const dates = validRows.map((r) => r.date!).sort();
  const minDate = dates[0];

  const openingDate =
    anchorKind === "initial"
      ? anchorDate || (minDate ? shiftDate(minDate, -1) : null)
      : minDate
        ? shiftDate(minDate, -1)
        : anchorDate || null;
  if (!openingDate) return null;

  if (anchorKind === "initial") {
    return { amount: value, date: openingDate };
  }

  const sumSigned = validRows.reduce(
    (s, r) => s + (r.kind === "income" ? r.amount! : -r.amount!),
    0,
  );
  return { amount: value - sumSigned, date: openingDate };
}

function shiftDate(iso: string | undefined, days: number): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function UploadCard({
  fileInputRef,
  onFileChange,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="max-w-2xl mx-auto p-8 rounded-2xl border border-mc-gray/15 bg-white text-center">
      <h2 className="text-lg font-semibold text-mc-dark">Upload a CSV</h2>
      <p className="mt-3 text-sm text-mc-gray">
        Drop a file anywhere on the page, or click below.
      </p>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mt-6 inline-flex items-center px-6 py-3 rounded-full bg-mc-dark text-white font-medium text-sm hover:bg-mc-dark/85 transition-colors"
      >
        Choose CSV file
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  );
}

function MapCard(props: {
  parsed: ParsedCSV;
  fileName: string;
  mapping: Mapping;
  setMapping: (m: Mapping) => void;
  derived: DerivedRow[];
  defaultAccount: string;
  setDefaultAccount: (v: string) => void;
  anchorKind: AnchorKind;
  setAnchorKind: (k: AnchorKind) => void;
  anchorAmount: string;
  setAnchorAmount: (v: string) => void;
  anchorDate: string;
  setAnchorDate: (v: string) => void;
  onCancel: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
}) {
  const {
    parsed,
    fileName,
    mapping,
    setMapping,
    derived,
    defaultAccount,
    setDefaultAccount,
    anchorKind,
    setAnchorKind,
    anchorAmount,
    setAnchorAmount,
    anchorDate,
    setAnchorDate,
    onCancel,
    onContinue,
    continueDisabled,
  } = props;

  const inputClass =
    "w-full rounded-md border border-mc-gray/15 bg-white px-3 py-2 text-sm text-mc-dark placeholder:text-mc-gray/60 focus:outline-none focus:border-mc-lavender/60 transition-colors";

  const set = (patch: Partial<Mapping>) => setMapping({ ...mapping, ...patch });

  const headerOptions = (allowNone: boolean) => (
    <>
      <option value="">— choose —</option>
      {allowNone && <option value={NONE}>— none —</option>}
      {parsed.headers.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </>
  );

  const [previewPage, setPreviewPage] = useState(1);
  const previewPageCount = Math.max(
    1,
    Math.ceil(derived.length / IMPORT_PAGE_SIZE),
  );
  const safePreviewPage = Math.min(previewPage, previewPageCount);
  const previewRows = derived.slice(
    (safePreviewPage - 1) * IMPORT_PAGE_SIZE,
    safePreviewPage * IMPORT_PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-mc-dark">Column mapping</h2>
          <span className="text-xs font-mono text-mc-gray/60">
            {fileName} · {parsed.rows.length} row
            {parsed.rows.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Date">
            <select
              value={mapping.date}
              onChange={(e) => set({ date: e.target.value })}
              className={inputClass}
            >
              {headerOptions(false)}
            </select>
            <select
              value={mapping.dateFormat}
              onChange={(e) =>
                set({ dateFormat: e.target.value as Mapping["dateFormat"] })
              }
              className={`mt-2 ${inputClass} font-mono`}
            >
              <option value="auto">Auto detect</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            </select>
          </Field>

          <Field label="Description">
            <select
              value={mapping.description}
              onChange={(e) => set({ description: e.target.value })}
              className={inputClass}
            >
              {headerOptions(false)}
            </select>
          </Field>

          <Field label="Amount mode">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set({ amountMode: "single" })}
                className={`flex-1 text-sm font-medium px-3 py-2 rounded-full transition-colors ${
                  mapping.amountMode === "single"
                    ? "bg-mc-mint/30 text-mc-dark border border-mc-mint/40"
                    : "bg-transparent text-mc-gray border border-mc-gray/15 hover:text-mc-dark"
                }`}
              >
                Signed
              </button>
              <button
                type="button"
                onClick={() => set({ amountMode: "debit-credit" })}
                className={`flex-1 text-sm font-medium px-3 py-2 rounded-full transition-colors ${
                  mapping.amountMode === "debit-credit"
                    ? "bg-mc-lavender/15 text-mc-dark border border-mc-lavender/40"
                    : "bg-transparent text-mc-gray border border-mc-gray/15 hover:text-mc-dark"
                }`}
              >
                Debit + Credit
              </button>
            </div>
            <select
              value={mapping.decimal}
              onChange={(e) =>
                set({ decimal: e.target.value as Mapping["decimal"] })
              }
              className={`mt-2 ${inputClass} font-mono`}
            >
              <option value=".">Decimal: .</option>
              <option value=",">Decimal: ,</option>
            </select>
          </Field>

          {mapping.amountMode === "single" ? (
            <Field label="Amount column">
              <select
                value={mapping.amount}
                onChange={(e) => set({ amount: e.target.value })}
                className={inputClass}
              >
                {headerOptions(false)}
              </select>
            </Field>
          ) : (
            <Field label="Debit / Credit columns">
              <select
                value={mapping.debit}
                onChange={(e) => set({ debit: e.target.value })}
                className={inputClass}
              >
                {headerOptions(true)}
              </select>
              <select
                value={mapping.credit}
                onChange={(e) => set({ credit: e.target.value })}
                className={`mt-2 ${inputClass}`}
              >
                {headerOptions(true)}
              </select>
            </Field>
          )}

          <Field label="Category column (optional)">
            <select
              value={mapping.category}
              onChange={(e) => set({ category: e.target.value })}
              className={inputClass}
            >
              {headerOptions(true)}
            </select>
          </Field>

          <Field label="Account column (optional)">
            <select
              value={mapping.account}
              onChange={(e) => set({ account: e.target.value })}
              className={inputClass}
            >
              {headerOptions(true)}
            </select>
          </Field>
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
        <h2 className="text-lg font-semibold text-mc-dark">
          Account &amp; balance anchor
        </h2>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Default account">
            <input
              type="text"
              value={defaultAccount}
              onChange={(e) => setDefaultAccount(e.target.value)}
              placeholder="e.g. Main Checking · 1234"
              className={inputClass}
            />
          </Field>
          <Field label="Anchor">
            <div className="flex gap-2">
              {(["none", "initial", "final"] as AnchorKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAnchorKind(k)}
                  className={`flex-1 text-sm font-medium px-3 py-2 rounded-full transition-colors capitalize ${
                    anchorKind === k
                      ? "bg-mc-lavender/15 text-mc-dark border border-mc-lavender/40"
                      : "bg-transparent text-mc-gray border border-mc-gray/15 hover:text-mc-dark"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </Field>
          {anchorKind !== "none" && (
            <>
              <Field label="Anchor amount">
                <input
                  type="number"
                  step="0.01"
                  value={anchorAmount}
                  onChange={(e) => setAnchorAmount(e.target.value)}
                  placeholder="0.00"
                  className={`${inputClass} font-mono`}
                />
              </Field>
              <Field label="As-of date (optional)">
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </Field>
            </>
          )}
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
        <h2 className="text-lg font-semibold text-mc-dark">Preview</h2>
        <p className="mt-2 text-sm text-mc-gray">
          {derived.length} row{derived.length === 1 ? "" : "s"} parsed.
        </p>
        <PreviewTable rows={previewRows} editable={false} />
        <Pagination
          page={safePreviewPage}
          pageCount={previewPageCount}
          total={derived.length}
          pageSize={IMPORT_PAGE_SIZE}
          onPageChange={setPreviewPage}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className="inline-flex items-center px-6 py-3 rounded-full bg-mc-dark text-white font-medium text-sm hover:bg-mc-dark/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue &rarr;
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center px-6 py-3 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 font-medium text-sm hover:bg-mc-lavender/25 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConfirmCard(props: {
  derived: DerivedRow[];
  stats: Stats;
  baseline: Baseline | null;
  categoriesByKind: { income: string[]; expense: string[] };
  setOverride: (idx: number, cat: string) => void;
  onBack: () => void;
  onCommit: () => void;
  defaultAccount: string;
}) {
  const {
    derived,
    stats,
    baseline,
    categoriesByKind,
    setOverride,
    onBack,
    onCommit,
    defaultAccount,
  } = props;

  const [confirmPage, setConfirmPage] = useState(1);
  const confirmPageCount = Math.max(
    1,
    Math.ceil(derived.length / IMPORT_PAGE_SIZE),
  );
  const safeConfirmPage = Math.min(confirmPage, confirmPageCount);
  const confirmRows = derived.slice(
    (safeConfirmPage - 1) * IMPORT_PAGE_SIZE,
    safeConfirmPage * IMPORT_PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
        <h2 className="text-lg font-semibold text-mc-dark">Review &amp; commit</h2>
        <p className="mt-2 text-sm text-mc-gray">
          {stats.valid} ready · {stats.invalid} skipped · {stats.categorized}{" "}
          categorized · {stats.uncategorized} uncategorized
          {defaultAccount && (
            <>
              {" "}
              · account{" "}
              <span className="font-mono text-mc-dark/70">{defaultAccount}</span>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-mc-gray">
          Uncategorized rows can be re-synced from the Transactions page after
          import.
        </p>
        <PreviewTable
          rows={confirmRows}
          editable
          categoriesByKind={categoriesByKind}
          onCategoryChange={setOverride}
        />
        <Pagination
          page={safeConfirmPage}
          pageCount={confirmPageCount}
          total={derived.length}
          pageSize={IMPORT_PAGE_SIZE}
          onPageChange={setConfirmPage}
        />
      </div>

      {baseline && (
        <div className="p-6 rounded-2xl border border-mc-lime/40 bg-mc-lime/15">
          <h2 className="text-lg font-semibold text-mc-dark">
            Balance baseline
          </h2>
          <p className="mt-2 text-sm text-mc-dark/80">
            Chart will start from{" "}
            <span className="font-mono">
              {baseline.amount >= 0 ? "+" : "−"}
              {formatAmount(Math.abs(baseline.amount))}
            </span>{" "}
            on <span className="font-mono">{baseline.date}</span>.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCommit}
          disabled={stats.valid === 0}
          className="inline-flex items-center px-6 py-3 rounded-full bg-mc-dark text-white font-medium text-sm hover:bg-mc-dark/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Import {stats.valid} row{stats.valid === 1 ? "" : "s"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center px-6 py-3 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 font-medium text-sm hover:bg-mc-lavender/25 transition-colors"
        >
          &larr; Back
        </button>
        <Link
          href="/"
          className="inline-flex items-center px-6 py-3 rounded-full text-mc-gray hover:text-mc-dark font-medium text-sm transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-mc-gray">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function PreviewTable({
  rows,
  editable,
  categoriesByKind,
  onCategoryChange,
}: {
  rows: DerivedRow[];
  editable: boolean;
  categoriesByKind?: { income: string[]; expense: string[] };
  onCategoryChange?: (idx: number, cat: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-mc-gray">No rows.</p>;
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-mc-gray">
            <th className="text-left py-2 pr-4">Date</th>
            <th className="text-left py-2 pr-4">Description</th>
            <th className="text-left py-2 pr-4">Kind</th>
            <th className="text-right py-2 pr-4">Amount</th>
            <th className="text-left py-2 pr-4">Category</th>
            <th className="text-left py-2">Account</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mc-gray/10">
          {rows.map((r) => {
            const bad = r.errors.length > 0;
            return (
              <tr key={r.index} className={bad ? "opacity-50" : ""}>
                <td className="py-2 pr-4 font-mono text-mc-gray">
                  {r.date ?? "—"}
                </td>
                <td className="py-2 pr-4 text-mc-dark max-w-xs truncate">
                  {r.description || (
                    <span className="text-mc-gray italic">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {r.kind ? (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.kind === "income"
                          ? "bg-mc-mint/20 text-mc-dark/70"
                          : "bg-mc-lavender/15 text-mc-dark/70"
                      }`}
                    >
                      {r.kind}
                    </span>
                  ) : (
                    <span className="text-mc-gray">—</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right font-mono text-mc-dark">
                  {r.amount !== null && r.kind ? (
                    <>
                      {r.kind === "income" ? "+" : "−"}
                      {formatAmount(r.amount)}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-4">
                  {editable && r.kind && onCategoryChange && categoriesByKind ? (
                    <select
                      value={r.category ?? ""}
                      onChange={(e) => onCategoryChange(r.index, e.target.value)}
                      className="rounded-md border border-mc-gray/15 bg-white px-2 py-1 text-sm text-mc-dark focus:outline-none focus:border-mc-lavender/60 transition-colors"
                    >
                      <option value="">{UNCATEGORIZED_LABEL}</option>
                      {r.category &&
                        !categoriesByKind[r.kind].includes(r.category) && (
                          <option value={r.category}>
                            {r.category} (new)
                          </option>
                        )}
                      {categoriesByKind[r.kind].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : r.category ? (
                    <span className="text-mc-dark/80">{r.category}</span>
                  ) : (
                    <span className="italic text-mc-gray">
                      {UNCATEGORIZED_LABEL}
                    </span>
                  )}
                </td>
                <td className="py-2 text-mc-gray font-mono text-xs">
                  {r.account ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => r.errors.length > 0) && (
        <p className="mt-3 text-xs text-mc-gray">
          Greyed-out rows have parse errors and will be skipped.
        </p>
      )}
    </div>
  );
}
