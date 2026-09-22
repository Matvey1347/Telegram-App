"use client";

import { useState } from "react";
import type { TelegramMessageTemplatePriceRounding } from "@telegram-system/shared";
import { CustomSelect, FormField, Input } from "@/components/ui/primitives";
import type { TelegramChannelMessageTemplatePriceMode } from "./telegram-channel-message-template-format";
import { TelegramTextEditor } from "./telegram-text-editor";

const roundingOptions: Array<{
  value: TelegramMessageTemplatePriceRounding;
  label: string;
}> = [
  { value: "NONE", label: "Exact prices" },
  { value: "NEAREST_5", label: "Round to nearest 5" },
  { value: "NEAREST_10", label: "Round to nearest 10" },
];

const priceModeOptions: Array<{
  value: TelegramChannelMessageTemplatePriceMode;
  label: string;
}> = [
  { value: "PUBLIC", label: "Sales / public CPM" },
  { value: "INTERNAL_CPM", label: "Internal CPM" },
];

export function TelegramChannelMessageTemplatePriceOptions({
  productNames,
  excludedProductNames,
  priceRounding,
  priceMode,
  productNameOverrides,
  bundleOfferEnabled,
  bundleDiscountPercent,
  bundleBasePriceOverrides,
  bundleOfferTemplate,
  onExcludedProductNamesChange,
  onPriceRoundingChange,
  onPriceModeChange,
  onProductNameOverridesChange,
  onBundleOfferEnabledChange,
  onBundleDiscountPercentChange,
  onBundleBasePriceOverridesChange,
  onBundleOfferTemplateChange,
}: {
  productNames: string[];
  excludedProductNames: string[];
  priceRounding: TelegramMessageTemplatePriceRounding;
  priceMode: TelegramChannelMessageTemplatePriceMode;
  productNameOverrides: Record<string, string>;
  bundleOfferEnabled: boolean;
  bundleDiscountPercent: number;
  bundleBasePriceOverrides: Record<string, string>;
  bundleOfferTemplate: string;
  onExcludedProductNamesChange: (value: string[]) => void;
  onPriceRoundingChange: (value: TelegramMessageTemplatePriceRounding) => void;
  onPriceModeChange: (value: TelegramChannelMessageTemplatePriceMode) => void;
  onProductNameOverridesChange: (value: Record<string, string>) => void;
  onBundleOfferEnabledChange: (value: boolean) => void;
  onBundleDiscountPercentChange: (value: number) => void;
  onBundleBasePriceOverridesChange: (value: Record<string, string>) => void;
  onBundleOfferTemplateChange: (value: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"formats" | "offer">("formats");
  const updateRecord = (
    current: Record<string, string>,
    name: string,
    value: string,
  ) => {
    const next = { ...current };
    if (value) next[name] = value;
    else delete next[name];
    return next;
  };

  return (
    <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
      <div
        className="flex gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1"
        role="tablist"
        aria-label="Price settings"
      >
        {[
          ["formats", "Formats"],
          ["offer", "Offer settings"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id as "formats" | "offer")}
            className={`rounded-md px-3 py-2 text-sm transition ${
              activeTab === id
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "formats" ? (
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium text-white">
            Formats to include
          </legend>
          <p className="mt-0.5 text-xs text-neutral-400">
            Uncheck a format to hide it in every channel.
          </p>
          <div className="mt-3 space-y-2">
            {productNames.map((name) => {
              const checked = !excludedProductNames.includes(name);
              return (
                <div
                  key={name}
                  className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-2 sm:grid-cols-[auto_minmax(130px,1fr)_minmax(120px,.7fr)]"
                >
                  <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-neutral-200">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-blue-500"
                      checked={checked}
                      onChange={(event) =>
                        onExcludedProductNamesChange(
                          event.target.checked
                            ? excludedProductNames.filter(
                                (item) => item !== name,
                              )
                            : [...excludedProductNames, name],
                        )
                      }
                    />
                    {name}
                  </label>
                  <Input
                    aria-label={`Display name for ${name}`}
                    value={productNameOverrides[name] || ""}
                    placeholder={`Display as “${name}”`}
                    onChange={(event) =>
                      onProductNameOverridesChange(
                        updateRecord(
                          productNameOverrides,
                          name,
                          event.target.value,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`Package total for ${name}`}
                    inputMode="decimal"
                    value={bundleBasePriceOverrides[name] || ""}
                    placeholder="Auto total"
                    disabled={!bundleOfferEnabled}
                    onChange={(event) =>
                      onBundleBasePriceOverridesChange(
                        updateRecord(
                          bundleBasePriceOverrides,
                          name,
                          event.target.value
                            .replace(/[^\d.,]/g, "")
                            .replace(",", "."),
                        ),
                      )
                    }
                  />
                </div>
              );
            })}
            {!productNames.length ? (
              <span className="text-xs text-neutral-500">
                Select channels to load their formats.
              </span>
            ) : null}
          </div>
        </fieldset>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <FormField label="Price calculation">
              <CustomSelect
                value={priceMode}
                searchable={false}
                options={priceModeOptions}
                onChange={(value) =>
                  onPriceModeChange(
                    value as TelegramChannelMessageTemplatePriceMode,
                  )
                }
              />
              <p className="mt-1.5 text-xs text-neutral-400">
                Internal CPM uses the calculated internal placement price.
                Missing internal prices are shown as an em dash.
              </p>
            </FormField>
            <FormField label="Price rounding">
              <CustomSelect
                value={priceRounding}
                searchable={false}
                options={roundingOptions}
                onChange={(value) =>
                  onPriceRoundingChange(
                    value as TelegramMessageTemplatePriceRounding,
                  )
                }
              />
              <p className="mt-1.5 text-xs text-neutral-400">
                Applies only to the generated message; saved channel prices stay
                unchanged.
              </p>
            </FormField>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <input
                type="checkbox"
                aria-label="Add package offer"
                className="mt-0.5 h-4 w-4 accent-blue-500"
                checked={bundleOfferEnabled}
                onChange={(event) =>
                  onBundleOfferEnabledChange(event.target.checked)
                }
              />
              <span>
                <span className="block text-sm font-medium text-white">
                  Add package offer
                </span>
                <span className="block text-xs text-neutral-400">
                  Show totals and a discount for placement in every channel.
                </span>
              </span>
            </label>
            <FormField label="Package discount, %">
              <Input
                type="number"
                min={0}
                max={100}
                disabled={!bundleOfferEnabled}
                value={bundleDiscountPercent}
                onChange={(event) =>
                  onBundleDiscountPercentChange(
                    Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                  )
                }
              />
            </FormField>
          </div>
          <FormField label="Package offer text">
            <TelegramTextEditor
              value={bundleOfferTemplate}
              disabled={!bundleOfferEnabled}
              rows={7}
              enableCustomEmoji
              onChange={onBundleOfferTemplateChange}
            />
            <p className="mt-1.5 text-xs text-neutral-400">
              Use {"{{bundle_rows}}"} for all formats, or {"{{format}}"},{" "}
              {"{{price}}"}, {"{{currency}}"} and {"{{original_price}}"} for one
              format. {"{{channel_count}}"} and {"{{discount_percent}}"} are
              also available.
            </p>
          </FormField>
          <p className="text-xs text-neutral-500 lg:col-span-2">
            Package totals are summed automatically. Enter a value beside a
            format only when you want to set its original total manually.
          </p>
        </div>
      )}
    </div>
  );
}
