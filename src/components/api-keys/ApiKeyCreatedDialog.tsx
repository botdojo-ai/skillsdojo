"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check, AlertTriangle } from "lucide-react";

interface ApiKeyCreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: { name: string; key: string } | null;
}

export function ApiKeyCreatedDialog({
  open,
  onOpenChange,
  apiKey,
}: ApiKeyCreatedDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!apiKey) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>API Key Created</DialogTitle>
          <DialogDescription>
            Your new API key has been created. Copy it now - you won&apos;t be able
            to see it again!
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm">
              Make sure to copy your API key now. For security reasons, it
              won&apos;t be displayed again.
            </p>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium mb-2">{apiKey.name}</p>
            <div className="flex gap-2">
              <Input
                value={apiKey.key}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
