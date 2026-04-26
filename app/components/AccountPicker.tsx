"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  setSelectedAccountId,
  useAccounts,
  useSelectedAccountId,
} from "../lib/transactions";

export function AccountPicker() {
  const accounts = useAccounts();
  const selectedId = useSelectedAccountId();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const el = detailsRef.current;
      if (!el || !el.open) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        el.open = false;
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selected = selectedId
    ? accounts.find((a) => a.id === selectedId) ?? null
    : null;
  const label = selected ? selected.name : "All accounts";

  function pick(id: string | null) {
    setSelectedAccountId(id);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary
        className="list-none cursor-pointer text-sm font-medium px-3 py-1.5 rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25 transition-colors flex items-center gap-2"
        aria-label="Select account"
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            selected ? "bg-mc-mint" : "bg-mc-lavender"
          }`}
        />
        <span className="max-w-[12rem] truncate">{label}</span>
        <span className="text-mc-gray text-xs">▾</span>
      </summary>
      <div className="absolute right-0 mt-2 w-64 z-50 rounded-xl border border-mc-gray/15 bg-white shadow-lg overflow-hidden">
        <button
          type="button"
          onClick={() => pick(null)}
          className={`w-full text-left text-sm px-4 py-2 transition-colors ${
            selectedId === null
              ? "bg-mc-lavender/10 text-mc-dark font-medium"
              : "text-mc-dark/80 hover:bg-mc-dark/[0.04]"
          }`}
        >
          All accounts
        </button>
        <div className="border-t border-mc-gray/10" />
        {accounts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => pick(a.id)}
            className={`w-full text-left text-sm px-4 py-2 transition-colors flex items-center gap-2 ${
              selectedId === a.id
                ? "bg-mc-lavender/10 text-mc-dark font-medium"
                : "text-mc-dark/80 hover:bg-mc-dark/[0.04]"
            }`}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: a.color ?? "#B8B3E9" }}
            />
            <span className="truncate">{a.name}</span>
          </button>
        ))}
        <div className="border-t border-mc-gray/10" />
        <Link
          href="/accounts"
          onClick={() => {
            if (detailsRef.current) detailsRef.current.open = false;
          }}
          className="block text-sm px-4 py-2 text-mc-gray hover:text-mc-dark hover:bg-mc-dark/[0.04] transition-colors"
        >
          Manage accounts…
        </Link>
      </div>
    </details>
  );
}
