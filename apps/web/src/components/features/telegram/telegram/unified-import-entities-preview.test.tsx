import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportPreviewItem,
} from "@telegram-system/shared";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import {
  UnifiedImportGroupsPreview,
  UnifiedImportHypothesesPreview,
} from "./unified-import-entities-preview";

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({ buttonLabel }: { buttonLabel: string }) => (
    <button type="button">{buttonLabel}</button>
  ),
}));

const changedItem = (ref: string): TelegramUnifiedImportPreviewItem => ({
  ref,
  action: "UPDATE",
  label: "Changed",
  valid: true,
  warnings: [],
  errors: [],
  changes: [{ field: "title", before: "Before", after: "After" }],
});

describe("unified import entity previews", () => {
  it("does not render unchanged groups inside Update", () => {
    const manifest: TelegramUnifiedImportManifest = {
      version: 1,
      groups: [
        {
          ref: "changed-group",
          action: "UPDATE",
          id: "group-1",
          title: "Changed group",
        },
        {
          ref: "unchanged-group",
          action: "UPDATE",
          id: "group-2",
          title: "Unchanged group",
        },
      ],
    };

    render(
      <UnifiedImportGroupsPreview
        operation="UPDATE"
        manifest={manifest}
        disabled={false}
        previewItems={[changedItem("changed-group")]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Changed group")).toBeVisible();
    expect(
      screen.queryByDisplayValue("Unchanged group"),
    ).not.toBeInTheDocument();
  });

  it("does not render unchanged hypotheses inside Update", () => {
    const manifest: TelegramUnifiedImportManifest = {
      version: 1,
      hypotheses: [
        {
          ref: "changed-hypothesis",
          action: "UPDATE",
          id: "hypothesis-1",
          value: { name: "Changed hypothesis", status: "ACTIVE" },
        },
        {
          ref: "unchanged-hypothesis",
          action: "UPDATE",
          id: "hypothesis-2",
          value: { name: "Unchanged hypothesis", status: "ACTIVE" },
        },
      ],
    };

    render(
      <UnifiedImportHypothesesPreview
        operation="UPDATE"
        manifest={manifest}
        disabled={false}
        previewItems={[changedItem("changed-hypothesis")]}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Changed hypothesis")).toBeVisible();
    expect(
      screen.queryByDisplayValue("Unchanged hypothesis"),
    ).not.toBeInTheDocument();
  });
});
