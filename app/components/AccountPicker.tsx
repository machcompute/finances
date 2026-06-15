"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  setSelectedAccountId,
  useAccounts,
  useSelectedAccountId,
} from "../lib/transactions";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function AccountPicker() {
  const accounts = useAccounts();
  const selectedId = useSelectedAccountId();

  const selected = selectedId
    ? accounts.find((a) => a.id === selectedId) ?? null
    : null;
  const label = selected ? selected.name : "All accounts";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Select account"
            className="rounded-full bg-mc-lavender/15 text-mc-dark/80 border border-mc-lavender/20 hover:bg-mc-lavender/25"
          >
            <span
              className={`inline-block size-2 rounded-full ${
                selected ? "bg-mc-mint" : "bg-mc-lavender"
              }`}
            />
            <span className="max-w-[12rem] truncate">{label}</span>
            <ChevronDown className="text-mc-gray" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => setSelectedAccountId(null)}
          className={selectedId === null ? "bg-mc-lavender/10 font-medium" : ""}
        >
          All accounts
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {accounts.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onClick={() => setSelectedAccountId(a.id)}
            className={
              selectedId === a.id ? "bg-mc-lavender/10 font-medium" : ""
            }
          >
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: a.color ?? "#B8B3E9" }}
            />
            <span className="truncate">{a.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/accounts" />} className="text-mc-gray">
          Manage accounts…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
