"use client";

import { useState } from "react";
import { MessageCircle, Settings, X } from "lucide-react";
import ChatPanel from "@/app/components/chat/ChatPanel";
import { ChatSettingsDialog } from "@/app/components/chat/ChatSettingsDialog";
import { ChatConfirmModal } from "@/app/components/chat/ChatConfirmModal";

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open finance assistant"
        style={{ display: open ? "none" : "flex" }}
        className="fixed bottom-6 right-6 z-50 size-14 items-center justify-center rounded-full bg-mc-dark text-white shadow-lg transition-colors hover:bg-mc-dark/85"
      >
        <MessageCircle className="size-6" />
      </button>

      <div
        style={{ display: open ? "flex" : "none" }}
        className="fixed bottom-6 right-6 z-50 h-[600px] max-h-[calc(100vh-3rem)] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-mc-gray/15 bg-white shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-mc-gray/15 px-4">
          <span className="text-sm font-semibold text-mc-dark">
            Finance assistant
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Chat settings"
              className="p-1 text-mc-gray transition-colors hover:text-mc-dark"
            >
              <Settings className="size-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="p-1 text-mc-gray transition-colors hover:text-mc-dark"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <ChatPanel />
      </div>

      <ChatSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ChatConfirmModal />
    </>
  );
}
