import { describe, expect, it } from "vitest";
import { includeDeepLinkedManagedPost } from "./managed-post-page";

const post = (id: string) => ({ id }) as never;

describe("managed post paginated page", () => {
  it("keeps the bounded server page unchanged without a deep link", () => {
    const page = [post("page-1"), post("page-2")];
    expect(includeDeepLinkedManagedPost(page)).toBe(page);
  });

  it("keeps the loading-state page reference stable between renders", () => {
    expect(includeDeepLinkedManagedPost(undefined)).toBe(
      includeDeepLinkedManagedPost(undefined),
    );
  });

  it("adds a separately fetched deep link without duplicating a page row", () => {
    expect(includeDeepLinkedManagedPost([post("page-1")], post("linked"))).toEqual([
      post("page-1"), post("linked"),
    ]);
    const page = [post("linked")];
    expect(includeDeepLinkedManagedPost(page, post("linked"))).toBe(page);
  });
});
