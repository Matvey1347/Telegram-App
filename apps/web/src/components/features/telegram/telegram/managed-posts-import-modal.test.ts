import { describe, expect, it } from "vitest";
import {
  editableRowsToJsonContent,
  editableRowToImportRow,
  normalizeImportRows,
  removeEditableImportRow,
  rowToEditable,
} from "@/components/features/telegram/telegram/managed-posts-import-modal";
import {
  applyGroupToEditableImportRows,
  importRowTab,
  rowIndicesForTab,
  selectionAfterEditableRowUpdate,
  summarizeImportProgress,
} from "@/components/features/telegram/telegram/managed-posts-import-model";
import {
  buildManagedPostInternalLinks,
  hasBlockingManagedPostInternalLinks,
} from "@/components/features/telegram/telegram/managed-post-internal-links-notice";
import type { TelegramManagedPost } from "@/lib/api";

describe("managed posts import parsing", () => {
  it("keeps one JSON object as one editable post with emoji and images", () => {
    const rows = normalizeImportRows(
      JSON.stringify({
        title: "Не все важливе відчувається великим",
        text: "**🌱 Не все важливе відчувається великим**\n\nДеякі зміни приходять тихо.\n\nПомічай це.",
        icon: "🌱",
        imageUrls: ["https://images.example.test/post.jpg?fit=crop"],
      }),
      "posts.json",
    );

    expect(rows).toHaveLength(1);

    const editable = rowToEditable(rows[0]);
    expect(editable.title).toBe("Не все важливе відчувається великим");
    expect(editable.text).toContain("Деякі зміни приходять тихо.");
    expect(editable.icon).toBe("🌱");
    expect(editable.urlsText).toBe(
      "https://images.example.test/post.jpg?fit=crop",
    );
  });

  it("imports the edited preview rows instead of the original pasted text", () => {
    const editable = rowToEditable({
      title: "Original",
      text: "Before",
      icon: "🔥",
      urls: ["[image](https://cdn.example.test/before.png)"],
    });

    const row = editableRowToImportRow({
      ...editable,
      title: "Edited",
      text: "After",
      icon: "🌗",
      urlsText: "https://cdn.example.test/after.png",
    });

    expect(row).toMatchObject({
      title: "Edited",
      text: "After",
      icon: "🌗",
      urls: ["https://cdn.example.test/after.png"],
    });
  });

  it("keeps image search hints only in the editable import preview", () => {
    const [row] = normalizeImportRows(
      JSON.stringify([
        {
          title: "Image hint post",
          text: "Body",
          imageSearch: ["mountain rest", "quiet lake"],
        },
      ]),
      "posts.json",
    );

    const editable = rowToEditable(row);
    expect(editable.imageSearchText).toBe("mountain rest\nquiet lake");

    const importRow = editableRowToImportRow(editable);
    expect(importRow).not.toHaveProperty("imageSearch");
  });

  it("keeps commas inside one image URL", () => {
    const [row] = normalizeImportRows(
      JSON.stringify({
        title: "Comma URL",
        urls: ["https://loremflickr.com/1280/800/open,door,road?lock=22003"],
      }),
      "posts.json",
    );

    expect(editableRowToImportRow(rowToEditable(row)).urls).toEqual([
      "https://loremflickr.com/1280/800/open,door,road?lock=22003",
    ]);
  });

  it("serializes edited preview rows back to GPT-friendly JSON", () => {
    const editable = rowToEditable({
      title: "Original",
      text: "Before",
      icon: "🌗",
      urls: ["https://cdn.example.test/before.png"],
      imageSearch: ["old search"],
    });

    const json = editableRowsToJsonContent([
      {
        ...editable,
        title: "Edited",
        text: "After",
        urlsText: "https://pinterest.example.test/image.jpg",
        imageSearchText: "new pinterest query\nquiet window",
      },
    ]);

    expect(JSON.parse(json)).toEqual([
      {
        title: "Edited",
        text: "After",
        icon: "🌗",
        urls: ["https://pinterest.example.test/image.jpg"],
        scheduledAt: null,
        imported: false,
        approved: false,
        imageSearch: ["new pinterest query", "quiet window"],
      },
    ]);
  });

  it("keeps approved rows in New and uses a badge instead of a separate tab", () => {
    const rows = normalizeImportRows(
      JSON.stringify([
        { title: "New" },
        { title: "Approved", approved: true },
        { title: "Imported", approved: true, imported: true },
      ]),
      "posts.json",
    ).map(rowToEditable);

    expect(rows.map(importRowTab)).toEqual(["new", "new", "imported"]);
    expect(rowIndicesForTab(rows, "new")).toEqual([0, 1]);
    expect(rowIndicesForTab(rows, "imported")).toEqual([2]);
  });

  it("keeps the edited post selected and follows its Imported tab", () => {
    const rows = [
      rowToEditable({ title: "First" }),
      rowToEditable({ title: "Second", imported: true }),
    ];
    const movedToImported = rows.map((row, index) =>
      index === 0 ? { ...row, imported: true } : row,
    );

    expect(
      selectionAfterEditableRowUpdate(movedToImported, "new", 0, {
        imported: true,
      }),
    ).toEqual({ tab: "imported", selectedRowIndex: 0 });

    const movedBackToNew = movedToImported.map((row, index) =>
      index === 0 ? { ...row, imported: false } : row,
    );
    expect(
      selectionAfterEditableRowUpdate(movedBackToNew, "imported", 0, {
        imported: false,
      }),
    ).toEqual({ tab: "new", selectedRowIndex: 0 });
  });

  it("counts schedule failures as failed rather than imported", () => {
    expect(
      summarizeImportProgress([
        { status: "created" },
        { status: "scheduled" },
        { status: "scheduleFailed" },
        { status: "skipped" },
      ]),
    ).toEqual({ successful: 2, failed: 2 });
  });

  it("removes a post from the editable import rows before serializing JSON", () => {
    const rows = [
      rowToEditable({ title: "First", text: "One" }),
      rowToEditable({ title: "Second", text: "Two" }),
      rowToEditable({ title: "Third", text: "Three" }),
    ];

    const remainingRows = removeEditableImportRow(rows, 1);

    expect(remainingRows.map((row) => row.title)).toEqual(["First", "Third"]);
    expect(JSON.parse(editableRowsToJsonContent(remainingRows))).toHaveLength(
      2,
    );
  });

  it("applies a confirmed group to every row and serializes each groupId", () => {
    const rows = [
      rowToEditable({ title: "First", groupId: "old-group" }),
      rowToEditable({ title: "Second" }),
    ];

    const groupedRows = applyGroupToEditableImportRows(rows, "group-2");
    const json = JSON.parse(editableRowsToJsonContent(groupedRows));

    expect(groupedRows.map((row) => row.groupId)).toEqual([
      "group-2",
      "group-2",
    ]);
    expect(json.map((row: { groupId: string }) => row.groupId)).toEqual([
      "group-2",
      "group-2",
    ]);
  });

  it("detects blocking internal post links for import preview rows", () => {
    const publishedPost = {
      id: "ready-post",
      title: "Ready post",
      status: "PUBLISHED",
      telegramRemoteStatus: "PUBLISHED",
      telegramMessageIds: ["42"],
      lastError: null,
    } as unknown as TelegramManagedPost;
    const draftPost = {
      id: "draft-post",
      title: "Draft post",
      status: "DRAFT",
      telegramRemoteStatus: null,
      telegramMessageIds: [],
      lastError: null,
    } as unknown as TelegramManagedPost;

    const links = buildManagedPostInternalLinks(
      "[Ready](tg-post:ready-post) and [Draft](tg-post:draft-post)",
      [publishedPost, draftPost],
    );

    expect(links.map((link) => link.targetId)).toEqual([
      "ready-post",
      "draft-post",
    ]);
    expect(hasBlockingManagedPostInternalLinks(links, "12345")).toBe(true);
  });
});
