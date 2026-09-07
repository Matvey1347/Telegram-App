import { describe, expect, it } from "vitest";
import {
  emptyFolderDraft,
  folderDraftInstants,
  resolveFolderDraftTitle,
} from "./mutual-promotion-form-types";

describe("folderDraftInstants", () => {
  it("returns an empty start instant for cleared start fields", () => {
    const draft = emptyFolderDraft("Europe/Warsaw");

    expect(
      folderDraftInstants(
        {
          ...draft,
          startsDate: "",
          startsTime: "",
        },
        "Europe/Warsaw",
      ),
    ).toEqual(expect.objectContaining({ startsAt: "" }));
  });
});

describe("resolveFolderDraftTitle", () => {
  it("renders every date-range token from the folder dates", () => {
    const draft = {
      ...emptyFolderDraft("Europe/Warsaw"),
      title: "September // [date-range] // [DATE-RANGE]",
      startsDate: "2026-09-08",
      endsDate: "2026-09-15",
    };

    expect(resolveFolderDraftTitle(draft)).toBe(
      "September // 2026-09-08 — 2026-09-15 // 2026-09-08 — 2026-09-15",
    );
  });
});
