"use client";
import { useAiText } from "./ai-copy";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AiCategoryConfiguration,
  AiCategoryConfigurationPatch,
  AiConfiguration,
  AiWorkspaceConfiguration,
  AiWorkspaceConfigurationPatch,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import { aiApi } from "@/lib/features/operations/ai-api";
import { aiKeys, aiQueryPolicy } from "@/lib/features/operations/ai-query-keys";
import { aiCategory, aiMoney } from "./ai-format";
const amounts = ["dailyBudget", "monthlyBudget", "maxRequestCost"] as const;
const labels = {
  dailyBudget: "Daily budget (USD)",
  monthlyBudget: "Monthly budget (USD)",
  maxRequestCost: "Maximum request cost (USD)",
};
export function readAiForm(
  form: HTMLFormElement,
): AiWorkspaceConfigurationPatch & AiCategoryConfigurationPatch {
  const data = new FormData(form);
  const result: AiWorkspaceConfigurationPatch & AiCategoryConfigurationPatch = {
    enabled: data.has("enabled"),
    automaticEnabled: data.has("automaticEnabled"),
  };
  for (const key of amounts) {
    const value = String(data.get(key) ?? "").trim();
    if (value && !/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/.test(value))
      throw new Error(
        "Enter a non-negative USD amount with at most 12 decimal places.",
      );
    result[key] = value || null;
  }
  if (data.has("modelId")) result.modelId = String(data.get("modelId"));
  for (const key of [
    "warningPercent",
    "maxInputTokens",
    "maxOutputTokens",
    "timeoutMs",
    "concurrencyLimit",
  ] as const)
    if (data.has(key)) result[key] = Number(data.get(key));
  return result;
}
export function AiConfigurationPanel({ workspaceId }: { workspaceId: string }) {
  const t = useAiText();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: aiKeys.configuration(workspaceId),
    queryFn: aiApi.configuration,
    ...aiQueryPolicy,
  });
  const save = useMutation({
    mutationFn: (value: {
      category?: AiCategoryConfiguration["category"];
      body: AiWorkspaceConfigurationPatch & AiCategoryConfigurationPatch;
    }) =>
      value.category
        ? aiApi.updateCategory(value.category, value.body)
        : aiApi.updateWorkspace(value.body),
    onSuccess: (data) => {
      client.setQueryData(aiKeys.configuration(workspaceId), data);
      void client.invalidateQueries({
        queryKey: aiKeys.usageRoot(workspaceId),
      });
    },
  });
  if (query.isLoading)
    return <p role="status">{t("Loading configuration…")}</p>;
  if (query.isError || !query.data)
    return (
      <p role="alert">
        Configuration could not be loaded.{" "}
        <Button variant="secondary" onClick={() => void query.refetch()}>
          {t("Retry")}
        </Button>
      </p>
    );
  const config = query.data;
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-lg font-semibold">{t("Execution controls")}</h3>
        <p className="mt-2 text-sm text-neutral-400">
          Provider credentials:{" "}
          {config.providerConfigured ? "configured" : "not configured"} ·
          Deployment: {config.deploymentEnabled ? "enabled" : "disabled"}. No
          business AI features are started by these controls. Empty workspace
          limits block execution.
        </p>
      </Card>
      {save.isError ? (
        <p role="alert" className="text-rose-300">
          {t("Configuration could not be saved. Check limits and permissions.")}
        </p>
      ) : save.isSuccess ? (
        <p role="status" className="text-emerald-300">
          {t("Configuration saved.")}
        </p>
      ) : null}
      <ConfigForm
        key={`workspace-${JSON.stringify(config.settings)}`}
        value={config.settings}
        config={config}
        saving={save.isPending}
        onSave={(body) => save.mutate({ body })}
      />
      {config.categories.map((category) => (
        <ConfigForm
          key={`${category.category}-${category.configurationVersion}`}
          value={category}
          config={config}
          saving={save.isPending}
          onSave={(body) => save.mutate({ category: category.category, body })}
        />
      ))}
      <Card>
        <h3 className="text-lg font-semibold">
          {t("Verified model prices · USD / 1M tokens")}
        </h3>
        {config.models.map((v) => (
          <div
            key={v.modelId}
            className="mt-3 border-t border-neutral-800 pt-3 text-sm"
          >
            <p className="break-all font-medium">{v.modelId}</p>
            <p className="mt-1 text-neutral-400">
              Input {aiMoney(v.inputPerMillion)} · Cached{" "}
              {aiMoney(v.cachedInputPerMillion)} · Cache write{" "}
              {v.cacheWritePerMillion === null
                ? "Unpriced"
                : aiMoney(v.cacheWritePerMillion)}{" "}
              · Output {aiMoney(v.outputPerMillion)}
            </p>
            <a
              href={v.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-blue-300"
            >
              Official pricing · verified {v.verifiedAt} · {v.version}
            </a>
          </div>
        ))}
      </Card>
    </div>
  );
}
function ConfigForm({
  value,
  config,
  saving,
  onSave,
}: {
  value: AiWorkspaceConfiguration | AiCategoryConfiguration;
  config: AiConfiguration;
  saving: boolean;
  onSave: (
    body: AiWorkspaceConfigurationPatch & AiCategoryConfigurationPatch,
  ) => void;
}) {
  const t = useAiText();
  const category = "category" in value ? value : null;
  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          try {
            const body = readAiForm(form);
            const error = form.querySelector("[data-validation]");
            if (error) error.textContent = "";
            onSave(body);
          } catch (error) {
            const node = form.querySelector("[data-validation]");
            if (node)
              node.textContent =
                error instanceof Error
                  ? error.message
                  : "Invalid configuration";
          }
        }}
      >
        <h3 className="text-lg font-semibold capitalize">
          {category ? aiCategory(category.category) : "Workspace limits"}
        </h3>
        <fieldset
          disabled={!config.canConfigure || saving}
          className="space-y-4 disabled:opacity-70"
        >
          <div className="flex flex-wrap gap-5">
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={value.enabled}
              />
              {t("Enabled")}
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                name="automaticEnabled"
                type="checkbox"
                defaultChecked={value.automaticEnabled}
              />
              {t("Automatic execution allowed")}
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {amounts.map((key) => (
              <FormField key={key} label={t(labels[key])}>
                <Input
                  aria-label={`${category?.category ?? "Workspace"} ${labels[key]}`}
                  name={key}
                  defaultValue={value[key] ?? ""}
                  inputMode="decimal"
                  placeholder={t("Not configured")}
                />
              </FormField>
            ))}
            {category ? (
              <>
                <FormField label={t("Model")}>
                  <Select
                    name="modelId"
                    aria-label={`${category.category} model`}
                    defaultValue={category.modelId}
                  >
                    {config.models.map((v) => (
                      <option key={v.modelId} value={v.modelId}>
                        {v.modelId}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {(
                  [
                    ["maxInputTokens", "Maximum input tokens", 32_768],
                    ["maxOutputTokens", "Maximum output tokens", 8_000],
                    ["timeoutMs", "Timeout (ms)", 60_000],
                    ["concurrencyLimit", "Concurrency limit", 8],
                  ] as const
                ).map(([key, label, max]) => (
                  <FormField key={key} label={t(label)}>
                    <Input
                      aria-label={`${category.category} ${label}`}
                      name={key}
                      type="number"
                      min={
                        key === "maxInputTokens"
                          ? 64
                          : key === "maxOutputTokens"
                            ? 16
                            : key === "timeoutMs"
                              ? 1000
                              : 1
                      }
                      max={max}
                      required
                      defaultValue={category[key]}
                    />
                  </FormField>
                ))}
              </>
            ) : (
              <FormField label={t("Budget warning (%)")}>
                <Input
                  aria-label={t("Budget warning (%)")}
                  name="warningPercent"
                  type="number"
                  min={1}
                  max={100}
                  required
                  defaultValue={
                    "warningPercent" in value ? value.warningPercent : 80
                  }
                />
              </FormField>
            )}
          </div>
          {category?.category === "TELEGRAM_POSTING_IMAGE" && (
            <p className="text-xs text-neutral-400">
              Для изображений заданный лимит на запрос заменяет общий лимит на
              запрос. Дневной и месячный бюджеты рабочего пространства действуют.
            </p>
          )}
          {category ? (
            <p className="break-all text-xs text-neutral-400">
              Schema {category.schemaId} · Prompt {category.promptVersion} ·
              Configuration v{category.configurationVersion}
            </p>
          ) : null}
          <p data-validation role="alert" className="text-sm text-rose-300" />
          {config.canConfigure ? (
            <Button type="submit">
              {t(saving ? "Saving…" : "Save controls")}
            </Button>
          ) : (
            <p className="text-sm text-neutral-400">
              {t("Read-only. AI management permission is required.")}
            </p>
          )}
        </fieldset>
      </form>
    </Card>
  );
}
