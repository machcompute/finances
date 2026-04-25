"use client";

type Props = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
};

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: Props) {
  if (pageCount <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pillClass =
    "text-sm font-medium px-3 py-1.5 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-mc-gray font-mono">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className={pillClass}
        >
          &larr; Prev
        </button>
        <span className="text-sm font-mono text-mc-gray">
          Page {page} / {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page === pageCount}
          className={pillClass}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
