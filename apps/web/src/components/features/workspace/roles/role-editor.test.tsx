import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeatureDefinition } from "@telegram-system/shared";
import { RoleEditor } from "./role-editor";

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange("icon-content")}>Choose role icon</button>
  ),
}));

const posts: FeatureDefinition = {
  id: "posts",
  labelKey: "features.posts.label",
  descriptionKey: "features.posts.description",
  surfaces: { navigation: [], search: [], dashboard: [] },
  i18nNamespaces: ["common"],
  permissions: [
    { id: "posts.view", featureId: "posts", capability: "view", labelKey: "", descriptionKey: "", sensitivity: "standard" },
    { id: "posts.create", featureId: "posts", capability: "create", labelKey: "", descriptionKey: "", sensitivity: "standard" },
    { id: "posts.publish", featureId: "posts", capability: "publish", labelKey: "", descriptionKey: "", sensitivity: "sensitive" },
  ],
};

const crm: FeatureDefinition = {
  id: "adSales.crm",
  labelKey: "features.adSales.crm.label",
  descriptionKey: "features.adSales.crm.description",
  surfaces: { navigation: [], search: [], dashboard: [] },
  i18nNamespaces: ["common", "navigation", "ad-sales/common"],
  permissions: [
    { id: "adSales.crm.view", featureId: "adSales.crm", capability: "view", labelKey: "", descriptionKey: "", sensitivity: "standard" },
    { id: "adSales.crm.viewOwn", featureId: "adSales.crm", capability: "viewOwn", labelKey: "", descriptionKey: "", sensitivity: "standard" },
    { id: "adSales.crm.viewAny", featureId: "adSales.crm", capability: "viewAny", labelKey: "", descriptionKey: "", sensitivity: "sensitive" },
    { id: "adSales.crm.create", featureId: "adSales.crm", capability: "create", labelKey: "", descriptionKey: "", sensitivity: "standard" },
    { id: "adSales.crm.editOwn", featureId: "adSales.crm", capability: "editOwn", labelKey: "", descriptionKey: "", sensitivity: "standard" },
    { id: "adSales.crm.editAny", featureId: "adSales.crm", capability: "editAny", labelKey: "", descriptionKey: "", sensitivity: "standard" },
  ],
};

describe("RoleEditor", () => {
  it("saves a picked icon and can grant every posts permission", () => {
    const onSave = vi.fn();
    render(<RoleEditor open role={null} features={[posts]} saving={false} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Content manager" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose role icon" }));
    fireEvent.click(screen.getByRole("button", { name: "Full access" }));
    fireEvent.click(screen.getByRole("button", { name: /advanced sensitive actions/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /publish/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Content manager",
      iconId: "icon-content",
      permissionKeys: expect.arrayContaining(["posts.view", "posts.create", "posts.publish"]),
    }));
  });

  it("grants the CRM ownership scope from View without granting all contacts", () => {
    const onSave = vi.fn();
    render(<RoleEditor open role={null} features={[crm]} saving={false} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "CRM viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      permissionKeys: expect.arrayContaining(["adSales.crm.view", "adSales.crm.viewOwn"]),
    }));
    expect(onSave.mock.calls[0]?.[0].permissionKeys).not.toContain("adSales.crm.viewAny");
  });

  it("grants the CRM all-contacts scope from Full access", () => {
    const onSave = vi.fn();
    render(<RoleEditor open role={null} features={[crm]} saving={false} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "CRM manager" } });
    fireEvent.click(screen.getByRole("button", { name: "Full access" }));
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      permissionKeys: expect.arrayContaining([
        "adSales.crm.view",
        "adSales.crm.viewOwn",
        "adSales.crm.viewAny",
        "adSales.crm.create",
        "adSales.crm.editOwn",
        "adSales.crm.editAny",
      ]),
    }));
  });
});
