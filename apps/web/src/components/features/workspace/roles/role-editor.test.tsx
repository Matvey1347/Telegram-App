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
  permissions: [
    { id: "posts.view", featureId: "posts", capability: "view", labelKey: "", descriptionKey: "", sensitivity: "standard" },
    { id: "posts.create", featureId: "posts", capability: "create", labelKey: "", descriptionKey: "", sensitivity: "standard" },
    { id: "posts.publish", featureId: "posts", capability: "publish", labelKey: "", descriptionKey: "", sensitivity: "sensitive" },
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
});
