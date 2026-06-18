"use client";

import { useState } from "react";
import OpenAI from "openai";
import { TriangleAlert, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { setChatSettings, useChatSettings } from "@/app/lib/chatSettings";

function mixedContentInfo(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null;
  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return null;
  const port = url.port || "80";
  return {
    host,
    port,
    localhostUrl: `http://localhost:${port}${url.pathname}`,
    socatCmd: `socat TCP-LISTEN:${port},reuseaddr,fork TCP:${host}:${port}`,
    netshCmd: `netsh interface portproxy add v4tov4 listenport=${port} listenaddress=127.0.0.1 connectport=${port} connectaddress=${host}`,
  };
}

export function ChatSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useChatSettings();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const mixed = mixedContentInfo(settings.baseUrl);

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const client = new OpenAI({
        baseURL: settings.baseUrl,
        apiKey: settings.apiKey || "none",
        dangerouslyAllowBrowser: true,
      });
      const list = await client.models.list();
      setModels(list.data.map((m) => m.id).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      setError(`Could not list models: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  const modelItems = models.map((m) => ({ value: m, label: m }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chat settings</DialogTitle>
          <DialogDescription>
            Point the assistant at any OpenAI-compatible server.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chat-base-url">Server base URL</Label>
            <Input
              id="chat-base-url"
              value={settings.baseUrl}
              onChange={(e) => setChatSettings({ baseUrl: e.target.value })}
              placeholder="http://localhost:11434/v1"
              className="font-mono"
            />
            {mixed && (
              <div className="mt-1 rounded-md border border-amber-300/60 bg-amber-50 p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-mc-dark leading-relaxed">
                    An HTTPS page can&apos;t reach a plain-HTTP non-local address — browsers{" "}
                    <span className="font-medium">block it</span> (mixed content). Relay it through localhost:
                    run this on the machine with your browser, then use the localhost URL.
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-mc-dark rounded px-2 py-1.5">
                  <code className="flex-1 min-w-0 text-[11px] font-mono text-mc-lime overflow-x-auto whitespace-nowrap">
                    {mixed.socatCmd}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(mixed.socatCmd, "socat")}
                    className="shrink-0 text-mc-gray/70 hover:text-white transition-colors"
                    title="Copy command"
                  >
                    {copiedKey === "socat" ? <Check className="w-3.5 h-3.5 text-mc-mint" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="text-[11px] text-mc-gray leading-relaxed space-y-1">
                  <p>
                    Install socat — <span className="font-medium text-mc-dark">macOS</span>{" "}
                    <code className="font-mono">brew install socat</code> ·{" "}
                    <span className="font-medium text-mc-dark">Linux</span>{" "}
                    <code className="font-mono">apt/dnf/pacman install socat</code>
                  </p>
                  <p>
                    <span className="font-medium text-mc-dark">Windows</span> — run it under WSL (prefix{" "}
                    <code className="font-mono">wsl</code>), or use netsh as Administrator:
                  </p>
                  <div className="flex items-center gap-2 bg-mc-dark rounded px-2 py-1.5">
                    <code className="flex-1 min-w-0 font-mono text-mc-lime overflow-x-auto whitespace-nowrap">
                      {mixed.netshCmd}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(mixed.netshCmd, "netsh")}
                      className="shrink-0 text-mc-gray/70 hover:text-white transition-colors"
                      title="Copy command"
                    >
                      {copiedKey === "netsh" ? <Check className="w-3.5 h-3.5 text-mc-mint" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setChatSettings({ baseUrl: mixed.localhostUrl })}
                  className="text-xs font-medium text-mc-dark bg-amber-200/60 hover:bg-amber-200 rounded px-2 py-1 transition-colors"
                >
                  Use {mixed.localhostUrl}
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chat-api-key">API key</Label>
            <Input
              id="chat-api-key"
              type="password"
              value={settings.apiKey}
              onChange={(e) => setChatSettings({ apiKey: e.target.value })}
              placeholder="Optional (leave blank for local servers)"
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chat-model">Model</Label>
            <div className="flex min-w-0 items-center gap-2">
              <Select
                value={settings.model}
                onValueChange={(v) => setChatSettings({ model: v ?? "" })}
                items={modelItems}
              >
                <SelectTrigger id="chat-model" className="w-full">
                  <SelectValue placeholder={settings.model || "Refresh, then pick a model"} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={refresh}
                disabled={loading}
                className="h-auto shrink-0 rounded-full px-4 py-2 text-sm"
              >
                {loading ? "Loading…" : "Refresh"}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-mc-gray/15 bg-mc-dark/[0.02] p-3">
            <Checkbox
              checked={settings.requireApproval}
              onCheckedChange={(checked) =>
                setChatSettings({ requireApproval: checked === true })
              }
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-mc-dark">
                Ask before applying assistant changes
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-mc-gray">
                Turn this off to let assistant tools update categories and
                transaction annotations immediately.
              </span>
            </span>
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
