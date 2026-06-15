"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import {
  CategoryDatalist,
  CategoryInput,
} from "../components/CategoryInput";
import { Pagination } from "../components/Pagination";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Checkbox } from "../components/ui/checkbox";
import { ParsedCSV, parseCSV } from "../lib/csv";

const IMPORT_PAGE_SIZE = 20;
import {
  Baseline,
  Transaction,
  TransactionKind,
  UNCATEGORIZED_LABEL,
  addTransactionsBatch,
  batchDedupFlags,
  formatAmount,
  getOrCreateAccountByName,
  pruneEmptySeededDefault,
  setBaseline,
  useAccounts,
  useCategories,
  useSelectedAccountId,
} from "../lib/transactions";

const NEW_ACCOUNT_OPTION = "__new__";

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
  accountName: string;
  errors: string[];
};

export default function ImportPage() {
  const categories = useCategories();
  const accounts = useAccounts();
  const selectedAccountId = useSelectedAccountId();

  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [step, setStep] = useState<"upload" | "map" | "confirm">("upload");
  const [mapping, setMapping] = useState<Mapping>(() => emptyMapping());
  const [destinationOverride, setDestinationOverride] = useState<string | null>(
    null,
  );
  const [newAccountName, setNewAccountName] = useState("");

  const destinationAccountId = useMemo(() => {
    if (destinationOverride === NEW_ACCOUNT_OPTION) return NEW_ACCOUNT_OPTION;
    if (
      destinationOverride &&
      accounts.some((a) => a.id === destinationOverride)
    ) {
      return destinationOverride;
    }
    return selectedAccountId ?? accounts[0]?.id ?? "";
  }, [destinationOverride, selectedAccountId, accounts]);
  const setDestinationAccountId = setDestinationOverride;
  const [anchorKind, setAnchorKind] = useState<AnchorKind>("none");
  const [anchorAmount, setAnchorAmount] = useState("");
  const [anchorDate, setAnchorDate] = useState("");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [forced, setForced] = useState<Set<number>>(() => new Set());
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggleForced(rowIndex: number) {
    setForced((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  function resetAll() {
    setParsed(null);
    setFileName("");
    setStep("upload");
    setMapping(emptyMapping());
    setDestinationOverride(null);
    setNewAccountName("");
    setAnchorKind("none");
    setAnchorAmount("");
    setAnchorDate("");
    setOverrides({});
    setForced(new Set());
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
      setForced(new Set());
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

  const destinationName = useMemo(() => {
    if (destinationAccountId === NEW_ACCOUNT_OPTION) {
      return newAccountName.trim();
    }
    return accounts.find((a) => a.id === destinationAccountId)?.name ?? "";
  }, [destinationAccountId, newAccountName, accounts]);

  const derived: DerivedRow[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((row, index) =>
      deriveRow({
        row,
        index,
        headers: parsed.headers,
        mapping,
        defaultAccountName: destinationName,
        override: overrides[index],
      }),
    );
  }, [parsed, mapping, destinationName, overrides]);

  const stats = useMemo(() => computeStats(derived), [derived]);
  const validRows = useMemo(
    () => derived.filter((r) => r.errors.length === 0),
    [derived],
  );
  const dupFlags = useMemo(() => {
    if (!parsed) return [] as boolean[];
    const idByLcName = new Map(
      accounts.map((a) => [a.name.toLowerCase(), a.id] as const),
    );
    const drafts: Omit<Transaction, "id">[] = validRows.map((r) => {
      const lc = r.accountName.toLowerCase();
      return {
        accountId: idByLcName.get(lc) ?? `new:${lc}`,
        kind: r.kind!,
        amount: r.amount!,
        category: r.category,
        date: r.date!,
        note: r.description || undefined,
      };
    });
    return batchDedupFlags(drafts);
  }, [parsed, validRows, accounts]);
  const duplicateRows = useMemo(
    () => validRows.filter((_, i) => dupFlags[i]),
    [validRows, dupFlags],
  );
  const willSkip = duplicateRows.filter((r) => !forced.has(r.index)).length;
  const willAdd = validRows.length - willSkip;
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

    if (validRows.length === 0) {
      setErrorMessage("Nothing to import — every row has errors.");
      return;
    }
    if (!destinationName) {
      setErrorMessage("Pick a destination account first.");
      return;
    }

    const skipIndices = new Set(
      validRows
        .filter((r, i) => dupFlags[i] && !forced.has(r.index))
        .map((r) => r.index),
    );

    const existingAccountIds = new Set(accounts.map((a) => a.id));
    const accountIdByLcName = new Map<string, string>();
    let newAccountCount = 0;
    function resolveAccountId(name: string): string {
      const lc = name.toLowerCase();
      const cached = accountIdByLcName.get(lc);
      if (cached) return cached;
      const account = getOrCreateAccountByName(name);
      accountIdByLcName.set(lc, account.id);
      if (!existingAccountIds.has(account.id)) newAccountCount++;
      return account.id;
    }

    const drafts: Omit<Transaction, "id">[] = [];
    let primaryAccountId = "";
    for (const r of validRows) {
      if (skipIndices.has(r.index)) continue;
      const accountId = resolveAccountId(r.accountName);
      if (!primaryAccountId) primaryAccountId = accountId;
      drafts.push({
        accountId,
        kind: r.kind!,
        amount: r.amount!,
        category: r.category,
        date: r.date!,
        note: r.description || undefined,
      });
    }

    const result = addTransactionsBatch(drafts, { dedupe: false });
    if (newAccountCount > 0) pruneEmptySeededDefault();
    const parts = [
      `${result.added} added`,
      `${skipIndices.size} skipped as duplicate${skipIndices.size === 1 ? "" : "s"}`,
      `${result.categoriesAdded} new categor${result.categoriesAdded === 1 ? "y" : "ies"}`,
    ];
    if (newAccountCount > 0) {
      parts.push(
        `${newAccountCount} new account${newAccountCount === 1 ? "" : "s"} created`,
      );
    }
    if (baseline && primaryAccountId) {
      setBaseline(primaryAccountId, baseline.amount, baseline.date);
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
    setNewAccountName("");
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
              accounts={accounts}
              destinationAccountId={destinationAccountId}
              setDestinationAccountId={setDestinationAccountId}
              newAccountName={newAccountName}
              setNewAccountName={setNewAccountName}
              anchorKind={anchorKind}
              setAnchorKind={setAnchorKind}
              anchorAmount={anchorAmount}
              setAnchorAmount={setAnchorAmount}
              anchorDate={anchorDate}
              setAnchorDate={setAnchorDate}
              onCancel={resetAll}
              onContinue={() => {
                setStep("confirm");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              continueDisabled={
                !mappingReady(mapping) ||
                stats.valid === 0 ||
                !destinationName
              }
            />
          )}

          {step === "confirm" && parsed && (
            <ConfirmCard
              derived={derived}
              stats={stats}
              willAdd={willAdd}
              willSkip={willSkip}
              duplicateRows={duplicateRows}
              forced={forced}
              onToggleForced={toggleForced}
              onForceAll={() =>
                setForced(new Set(duplicateRows.map((r) => r.index)))
              }
              onSkipAll={() => setForced(new Set())}
              baseline={baseline}
              categories={categories}
              setOverride={(idx, cat) =>
                setOverrides((o) => ({ ...o, [idx]: cat }))
              }
              onBack={() => setStep("map")}
              onCommit={commitImport}
              destinationName={destinationName}
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
  defaultAccountName: string;
  override: string | undefined;
}): DerivedRow {
  const { row, index, headers, mapping, defaultAccountName, override } = args;
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

  let accountName = "";
  if (mapping.account !== NONE && mapping.account) {
    const a = cellByHeader(mapping.account).trim();
    if (a) accountName = a;
  }
  if (!accountName) accountName = defaultAccountName;
  if (!accountName) errors.push("missing account");

  return {
    index,
    date: date,
    description,
    amount,
    kind,
    category,
    accountName,
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
      <Button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mt-6 rounded-full px-6 py-3 h-auto text-sm bg-mc-dark text-white hover:bg-mc-dark/85"
      >
        Choose CSV file
      </Button>
      <Input
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
  accounts: { id: string; name: string }[];
  destinationAccountId: string;
  setDestinationAccountId: (v: string) => void;
  newAccountName: string;
  setNewAccountName: (v: string) => void;
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
    accounts,
    destinationAccountId,
    setDestinationAccountId,
    newAccountName,
    setNewAccountName,
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
    "w-full text-mc-dark placeholder:text-mc-gray/60 focus-visible:border-mc-lavender/60";
  const triggerClass =
    "w-full text-mc-dark focus-visible:border-mc-lavender/60";

  const set = (patch: Partial<Mapping>) => setMapping({ ...mapping, ...patch });

  const headerItems = (allowNone: boolean) => [
    { value: "", label: "— choose —" },
    ...(allowNone ? [{ value: NONE, label: "— none —" }] : []),
    ...parsed.headers.map((h) => ({ value: h, label: h })),
  ];

  const headerOptions = (allowNone: boolean) =>
    headerItems(allowNone).map((it) => (
      <SelectItem key={it.value} value={it.value}>
        {it.label}
      </SelectItem>
    ));

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
            <Select
              value={mapping.date}
              onValueChange={(v) => set({ date: v ?? "" })}
              items={headerItems(false)}
            >
              <SelectTrigger className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{headerOptions(false)}</SelectContent>
            </Select>
            <Select
              value={mapping.dateFormat}
              onValueChange={(v) =>
                set({ dateFormat: (v ?? "auto") as Mapping["dateFormat"] })
              }
              items={[
                { value: "auto", label: "Auto detect" },
                { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
                { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
                { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
              ]}
            >
              <SelectTrigger className={`mt-2 ${triggerClass} font-mono`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto detect</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Description">
            <Select
              value={mapping.description}
              onValueChange={(v) => set({ description: v ?? "" })}
              items={headerItems(false)}
            >
              <SelectTrigger className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{headerOptions(false)}</SelectContent>
            </Select>
          </Field>

          <Field label="Amount mode">
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => set({ amountMode: "single" })}
                className={`flex-1 rounded-full px-3 py-2 h-auto text-sm ${
                  mapping.amountMode === "single"
                    ? "bg-mc-mint/30 text-mc-dark border border-mc-mint/40 hover:bg-mc-mint/30"
                    : "bg-transparent text-mc-gray border border-mc-gray/15 hover:bg-transparent hover:text-mc-dark"
                }`}
              >
                Signed
              </Button>
              <Button
                type="button"
                onClick={() => set({ amountMode: "debit-credit" })}
                className={`flex-1 rounded-full px-3 py-2 h-auto text-sm ${
                  mapping.amountMode === "debit-credit"
                    ? "bg-mc-lavender/15 text-mc-dark border border-mc-lavender/40 hover:bg-mc-lavender/15"
                    : "bg-transparent text-mc-gray border border-mc-gray/15 hover:bg-transparent hover:text-mc-dark"
                }`}
              >
                Debit + Credit
              </Button>
            </div>
            <Select
              value={mapping.decimal}
              onValueChange={(v) =>
                set({ decimal: (v ?? ".") as Mapping["decimal"] })
              }
              items={[
                { value: ".", label: "Decimal: ." },
                { value: ",", label: "Decimal: ," },
              ]}
            >
              <SelectTrigger className={`mt-2 ${triggerClass} font-mono`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=".">Decimal: .</SelectItem>
                <SelectItem value=",">Decimal: ,</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {mapping.amountMode === "single" ? (
            <Field label="Amount column">
              <Select
                value={mapping.amount}
                onValueChange={(v) => set({ amount: v ?? "" })}
                items={headerItems(false)}
              >
                <SelectTrigger className={triggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{headerOptions(false)}</SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Debit / Credit columns">
              <Select
                value={mapping.debit}
                onValueChange={(v) => set({ debit: v ?? "" })}
                items={headerItems(true)}
              >
                <SelectTrigger className={triggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{headerOptions(true)}</SelectContent>
              </Select>
              <Select
                value={mapping.credit}
                onValueChange={(v) => set({ credit: v ?? "" })}
                items={headerItems(true)}
              >
                <SelectTrigger className={`mt-2 ${triggerClass}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{headerOptions(true)}</SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Category column (optional)">
            <Select
              value={mapping.category}
              onValueChange={(v) => set({ category: v ?? "" })}
              items={headerItems(true)}
            >
              <SelectTrigger className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{headerOptions(true)}</SelectContent>
            </Select>
          </Field>

          <Field label="Account column (optional)">
            <Select
              value={mapping.account}
              onValueChange={(v) => set({ account: v ?? "" })}
              items={headerItems(true)}
            >
              <SelectTrigger className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{headerOptions(true)}</SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
        <h2 className="text-lg font-semibold text-mc-dark">
          Account &amp; balance anchor
        </h2>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Destination account">
            <Select
              value={destinationAccountId}
              onValueChange={(v) => setDestinationAccountId(v ?? "")}
              items={[
                ...(accounts.length === 0
                  ? [{ value: "", label: "No accounts" }]
                  : []),
                ...accounts.map((a) => ({ value: a.id, label: a.name })),
                { value: NEW_ACCOUNT_OPTION, label: "+ Create new…" },
              ]}
            >
              <SelectTrigger className={triggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 && (
                  <SelectItem value="">No accounts</SelectItem>
                )}
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_ACCOUNT_OPTION}>
                  + Create new…
                </SelectItem>
              </SelectContent>
            </Select>
            {destinationAccountId === NEW_ACCOUNT_OPTION && (
              <Input
                type="text"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="New account name"
                className={`mt-2 ${inputClass}`}
              />
            )}
            <p className="mt-2 text-xs text-mc-gray">
              Rows fall back to this account when the account column is empty.
              Account-column values that don&apos;t match an existing account
              are auto-created on import.
            </p>
          </Field>
          <Field label="Anchor">
            <div className="flex gap-2">
              {(["none", "initial", "final"] as AnchorKind[]).map((k) => (
                <Button
                  key={k}
                  type="button"
                  onClick={() => setAnchorKind(k)}
                  className={`flex-1 rounded-full px-3 py-2 h-auto text-sm capitalize ${
                    anchorKind === k
                      ? "bg-mc-lavender/15 text-mc-dark border border-mc-lavender/40 hover:bg-mc-lavender/15"
                      : "bg-transparent text-mc-gray border border-mc-gray/15 hover:bg-transparent hover:text-mc-dark"
                  }`}
                >
                  {k}
                </Button>
              ))}
            </div>
          </Field>
          {anchorKind !== "none" && (
            <>
              <Field label="Anchor amount">
                <Input
                  type="number"
                  step="0.01"
                  value={anchorAmount}
                  onChange={(e) => setAnchorAmount(e.target.value)}
                  placeholder="0.00"
                  className={`${inputClass} font-mono`}
                />
              </Field>
              <Field label="As-of date (optional)">
                <Input
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
        <Button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className="rounded-full px-6 py-3 h-auto text-sm bg-mc-dark text-white hover:bg-mc-dark/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue &rarr;
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          className="rounded-full px-6 py-3 h-auto text-sm bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ConfirmCard(props: {
  derived: DerivedRow[];
  stats: Stats;
  willAdd: number;
  willSkip: number;
  duplicateRows: DerivedRow[];
  forced: Set<number>;
  onToggleForced: (rowIndex: number) => void;
  onForceAll: () => void;
  onSkipAll: () => void;
  baseline: Baseline | null;
  categories: string[];
  setOverride: (idx: number, cat: string) => void;
  onBack: () => void;
  onCommit: () => void;
  destinationName: string;
}) {
  const {
    derived,
    stats,
    willAdd,
    willSkip,
    duplicateRows,
    forced,
    onToggleForced,
    onForceAll,
    onSkipAll,
    baseline,
    categories,
    setOverride,
    onBack,
    onCommit,
    destinationName,
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
      <CategoryDatalist id="all-cats" options={categories} />

      <div className="p-6 rounded-2xl border border-mc-gray/15 bg-white">
        <h2 className="text-lg font-semibold text-mc-dark">Review &amp; commit</h2>
        <p className="mt-2 text-sm text-mc-gray">
          {willAdd} to import · {willSkip} duplicate
          {willSkip === 1 ? "" : "s"} · {stats.invalid} error
          {stats.invalid === 1 ? "" : "s"} · {stats.categorized} categorized ·{" "}
          {stats.uncategorized} uncategorized
          {destinationName && (
            <>
              {" "}
              · default account{" "}
              <span className="font-mono text-mc-dark/70">
                {destinationName}
              </span>
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

      {duplicateRows.length > 0 && (
        <div className="p-6 rounded-2xl border border-mc-lavender/40 bg-mc-lavender/[0.07]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-mc-dark">
                Possible duplicates
              </h2>
              <p className="mt-1 text-sm text-mc-gray">
                {willSkip} of {duplicateRows.length} will be skipped — checked
                rows already exist and will be merged. Uncheck a row to import it
                anyway.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSkipAll}
                className="h-auto rounded-full px-3 py-1.5 bg-mc-lavender/15 text-mc-dark/80 hover:bg-mc-lavender/25"
              >
                Skip all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onForceAll}
                className="h-auto rounded-full px-3 py-1.5 bg-mc-lavender/15 text-mc-dark/80 hover:bg-mc-lavender/25"
              >
                Import all
              </Button>
            </div>
          </div>
          <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-mc-gray/15 bg-white">
            <Table className="min-w-full text-sm">
              <TableHeader className="sticky top-0 bg-white">
                <TableRow className="text-xs uppercase tracking-wider text-mc-gray border-b border-mc-gray/10">
                  <TableHead className="py-2 px-3 w-12">Skip</TableHead>
                  <TableHead className="text-left py-2 px-3">Date</TableHead>
                  <TableHead className="text-left py-2 px-3">
                    Description
                  </TableHead>
                  <TableHead className="text-right py-2 px-3">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-mc-gray/10">
                {duplicateRows.map((r) => {
                  const skip = !forced.has(r.index);
                  return (
                    <TableRow key={r.index} className={skip ? "" : "opacity-50"}>
                      <TableCell className="py-2 px-3">
                        <Checkbox
                          checked={skip}
                          onCheckedChange={() => onToggleForced(r.index)}
                          aria-label={`Skip ${r.description || "row"}`}
                        />
                      </TableCell>
                      <TableCell className="py-2 px-3 font-mono text-mc-gray">
                        {r.date}
                      </TableCell>
                      <TableCell className="py-2 px-3 text-mc-dark max-w-md">
                        <div className="truncate">{r.description || "—"}</div>
                      </TableCell>
                      <TableCell className="py-2 px-3 text-right font-mono text-mc-dark">
                        {r.amount != null ? formatAmount(r.amount) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

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
        <Button
          type="button"
          onClick={onCommit}
          disabled={willAdd === 0}
          className="rounded-full px-6 py-3 h-auto text-sm bg-mc-dark text-white hover:bg-mc-dark/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Import {willAdd} row{willAdd === 1 ? "" : "s"}
        </Button>
        <Button
          type="button"
          onClick={onBack}
          className="rounded-full px-6 py-3 h-auto text-sm bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25"
        >
          &larr; Back
        </Button>
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
  onCategoryChange,
}: {
  rows: DerivedRow[];
  editable: boolean;
  onCategoryChange?: (idx: number, cat: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-mc-gray">No rows.</p>;
  }
  return (
    <div className="mt-4">
      <Table className="min-w-full text-sm">
        <TableHeader>
          <TableRow className="text-xs uppercase tracking-wider text-mc-gray">
            <TableHead className="text-left py-2 pr-4">Date</TableHead>
            <TableHead className="text-left py-2 pr-4">Description</TableHead>
            <TableHead className="text-left py-2 pr-4">Kind</TableHead>
            <TableHead className="text-right py-2 pr-4">Amount</TableHead>
            <TableHead className="text-left py-2 pr-4">Category</TableHead>
            <TableHead className="text-left py-2">Account</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-mc-gray/10">
          {rows.map((r) => {
            const bad = r.errors.length > 0;
            return (
              <TableRow key={r.index} className={bad ? "opacity-50" : ""}>
                <TableCell className="py-2 pr-4 font-mono text-mc-gray">
                  {r.date ?? "—"}
                </TableCell>
                <TableCell className="py-2 pr-4 text-mc-dark max-w-xs truncate">
                  {r.description || (
                    <span className="text-mc-gray italic">—</span>
                  )}
                </TableCell>
                <TableCell className="py-2 pr-4">
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
                </TableCell>
                <TableCell className="py-2 pr-4 text-right font-mono text-mc-dark">
                  {r.amount !== null && r.kind ? (
                    <>
                      {r.kind === "income" ? "+" : "−"}
                      {formatAmount(r.amount)}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="py-2 pr-4">
                  {editable && r.kind && onCategoryChange ? (
                    <CategoryInput
                      value={r.category ?? ""}
                      onChange={(v) => onCategoryChange(r.index, v)}
                      listId="all-cats"
                      placeholder={UNCATEGORIZED_LABEL}
                      className="rounded-md border border-mc-gray/15 bg-white px-2 py-1 text-sm text-mc-dark focus:outline-none focus:border-mc-lavender/60 transition-colors"
                    />
                  ) : r.category ? (
                    <span className="text-mc-dark/80">{r.category}</span>
                  ) : (
                    <span className="italic text-mc-gray">
                      {UNCATEGORIZED_LABEL}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-2 text-mc-gray font-mono text-xs">
                  {r.accountName || "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {rows.some((r) => r.errors.length > 0) && (
        <p className="mt-3 text-xs text-mc-gray">
          Greyed-out rows have parse errors and will be skipped.
        </p>
      )}
    </div>
  );
}
