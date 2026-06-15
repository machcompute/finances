"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";

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
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-mc-gray font-mono">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full bg-mc-lavender/15 text-mc-dark/80 hover:bg-mc-lavender/25"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ArrowLeft />
          Prev
        </Button>
        <span className="text-sm font-mono text-mc-gray">
          Page {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full bg-mc-lavender/15 text-mc-dark/80 hover:bg-mc-lavender/25"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          disabled={page === pageCount}
        >
          Next
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
