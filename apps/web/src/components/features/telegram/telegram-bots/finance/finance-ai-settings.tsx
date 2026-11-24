"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { Button, Card, Input, ToggleRow } from "@/components/ui/primitives";
import { financeAiConfigApi } from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";

export function FinanceAiSettings({
  botId,
  editable = true,
  inline = false,
}: {
  botId?: string;
  editable?: boolean;
  inline?: boolean;
}) {
  const client = useQueryClient();
  const queryKey = botId
    ? botBillingKeys.financeAi(botId)
    : botBillingKeys.workspaceFinanceAi();
  const config = useQuery({
    queryKey,
    queryFn: () => financeAiConfigApi.get(botId),
  });
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const custom =
    config.data?.source === (botId ? "BOT_OVERRIDE" : "WORKSPACE_DEFAULT");
  const update = useMutation({
    mutationFn: (reset: boolean) =>
      reset
        ? financeAiConfigApi.reset(botId)
        : financeAiConfigApi.save(key, botId),
    onSuccess: (data) => {
      setKey("");
      setEditing(false);
      client.setQueryData(queryKey, data);
    },
  });
  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <Bot size={18} /> OpenAI
      </h2>
      <p className="text-sm text-neutral-400">
        {config.isPending
          ? "Loading configuration…"
          : config.isError
            ? "Could not load OpenAI configuration."
            : config.data?.source === "ENV"
              ? "Use API key from ENV"
              : custom
                ? `Custom API key · ${config.data?.status.toLowerCase()}`
                : config.data?.source === "WORKSPACE_DEFAULT"
                  ? "Inherited from Global settings"
                  : "No API key configured"}
      </p>
      {editable && !config.isPending && !config.isError && (
        <>
          {!inline && (
            <ToggleRow
              label="Custom OpenAI settings"
              checked={custom || editing}
              disabled={update.isPending}
              onChange={(enabled) => {
                if (enabled) setEditing(true);
                else if (custom) update.mutate(true);
                else setEditing(false);
              }}
            />
          )}
          {(inline || custom || editing) && (
            <div className="flex flex-wrap gap-2">
              <Input
                type="password"
                autoComplete="off"
                aria-label="OpenAI API key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
              <Button
                disabled={!key.trim() || update.isPending}
                onClick={() => update.mutate(false)}
              >
                Save and validate
              </Button>
            </div>
          )}
          {(update.isError || config.data?.lastValidationError) && (
            <p role="alert" className="text-sm text-rose-300">
              {config.data?.lastValidationError ||
                "Could not update the OpenAI configuration."}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
