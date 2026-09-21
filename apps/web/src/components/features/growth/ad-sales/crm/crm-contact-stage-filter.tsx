"use client";

import { useSyncExternalStore } from "react";
import type { CrmContactStage } from "@telegram-system/shared";
import {
  crmContactStagePresentation,
  crmContactStages,
} from "./crm-contact-stage";
import { CustomSelect } from "@/components/ui/primitives";

const CRM_CONTACT_STAGE_STORAGE_PREFIX = "telegram-crm:contact-stage";
const CRM_CONTACT_STAGE_CHANGED_EVENT = "telegram-crm:contact-stage-changed";

type StageStorage = Pick<Storage, "getItem" | "setItem">;

export function CrmContactStageFilters({
  value,
  onChange,
}: {
  value: CrmContactStage | "ALL";
  onChange: (value: CrmContactStage | "ALL") => void;
}) {
  const options: Array<CrmContactStage | "ALL"> = ["ALL", ...crmContactStages];
  const selectedPresentation =
    value === "ALL" ? null : crmContactStagePresentation(value);
  return (
    <div
      className={`w-full sm:max-w-56 ${selectedPresentation?.selectClassName ?? ""}`}
    >
      <CustomSelect
        value={value}
        onChange={(next) => onChange(next as CrmContactStage | "ALL")}
        ariaLabel="Filter contacts by status"
        searchable={false}
        options={options.map((option) => {
          const presentation =
            option === "ALL" ? null : crmContactStagePresentation(option);
          return {
            value: option,
            label: presentation?.label ?? "All contacts",
            tone: presentation?.tone,
          };
        })}
      />
    </div>
  );
}

export function crmContactStageFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">,
): CrmContactStage | "ALL" {
  const stage = searchParams.get("stage");
  return crmContactStages.includes(stage as CrmContactStage)
    ? (stage as CrmContactStage)
    : "ALL";
}

export function crmContactStageSearchParams(
  searchParams: Pick<URLSearchParams, "toString">,
  stage: CrmContactStage | "ALL",
) {
  const next = new URLSearchParams(searchParams.toString());
  if (stage === "ALL") next.delete("stage");
  else next.set("stage", stage);
  return next;
}

export function readCrmContactStagePreference(
  storage: StageStorage,
): CrmContactStage | "ALL" {
  try {
    const stage = storage.getItem(crmContactStageStorageKey(storage));
    return stage === "ALL" ||
      crmContactStages.includes(stage as CrmContactStage)
      ? (stage as CrmContactStage | "ALL")
      : "ALL";
  } catch {
    return "ALL";
  }
}

export function writeCrmContactStagePreference(
  storage: StageStorage,
  stage: CrmContactStage | "ALL",
) {
  try {
    storage.setItem(crmContactStageStorageKey(storage), stage);
    if (typeof window !== "undefined" && storage === window.localStorage)
      window.dispatchEvent(new Event(CRM_CONTACT_STAGE_CHANGED_EVENT));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function useCrmContactStagePreference() {
  return useSyncExternalStore(
    subscribeToCrmContactStagePreference,
    () => readCrmContactStagePreference(window.localStorage),
    () => null,
  );
}

function subscribeToCrmContactStagePreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CRM_CONTACT_STAGE_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CRM_CONTACT_STAGE_CHANGED_EVENT, onChange);
  };
}

function crmContactStageStorageKey(storage: Pick<Storage, "getItem">) {
  const workspaceId = storage.getItem("selected-workspace-id") || "default";
  return `${CRM_CONTACT_STAGE_STORAGE_PREFIX}:${workspaceId}`;
}
