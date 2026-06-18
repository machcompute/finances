"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { resolveChanges, useConfirmRequest } from "@/app/lib/chatConfirm";

export function ChatConfirmModal() {
  const request = useConfirmRequest();
  const open = request !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resolveChanges(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply these changes?</DialogTitle>
          <DialogDescription>
            The assistant wants to update your transactions. Review before applying.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {request?.changes.map((c, i) => (
            <li
              key={i}
              className="rounded-lg border border-mc-gray/15 bg-mc-lavender/[0.06] px-3 py-2 text-sm text-mc-dark"
            >
              {c.summary}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => resolveChanges(false)}
            className="h-auto rounded-full px-5 py-2 text-sm text-mc-gray hover:bg-mc-dark/[0.04] hover:text-mc-dark"
          >
            Reject
          </Button>
          <Button
            type="button"
            onClick={() => resolveChanges(true)}
            className="h-auto rounded-full px-5 py-2 text-sm bg-mc-dark text-white hover:bg-mc-dark/85"
          >
            Apply changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
