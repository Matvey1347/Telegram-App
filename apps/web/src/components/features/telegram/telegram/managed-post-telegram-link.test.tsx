import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ManagedPostTelegramIdentityIndicator,
  ManagedPostTelegramLink,
  managedPostPublishedTelegramUrl,
  managedPostTelegramIdentityTone,
} from "./managed-post-telegram-link";
import {
  canScheduleManagedPost,
  isManagedPostInternalLinkReady,
} from "./managed-post-internal-links-notice";
import type { TelegramManagedPost } from "@/lib/api";

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

function scheduledPost(
  overrides: Partial<TelegramManagedPost> = {},
): TelegramManagedPost {
  return {
    id: "scheduled-post",
    status: "SCHEDULED",
    telegramScheduledMessageIds: ["2806"],
    telegramMessageIds: [],
    telegramMessageUrls: [],
    telegramIdVerificationStatus: "UNVERIFIED",
    telegramLinkSource: "AUTO",
    telegramRemoteStatus: "SCHEDULED",
    lastError: null,
    ...overrides,
  } as TelegramManagedPost;
}

function renderLink(post: TelegramManagedPost) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ManagedPostTelegramLink channelId="channel-1" post={post} canManage />
    </QueryClientProvider>,
  );
}

describe("managed post Telegram identity presentation", () => {
  it("never exposes a scheduled message URL as a published permalink", () => {
    expect(
      managedPostPublishedTelegramUrl({
        status: "SCHEDULED",
        telegramMessageUrls: ["https://t.me/c/123/2806"],
      }),
    ).toBeNull();
  });

  it("exposes the backend-provided URL only for a published post", () => {
    expect(
      managedPostPublishedTelegramUrl({
        status: "PUBLISHED",
        telegramMessageUrls: ["https://t.me/c/123/4427"],
      }),
    ).toBe("https://t.me/c/123/4427");
  });

  it("keeps manual unverified and mismatched links visibly amber", () => {
    expect(
      managedPostTelegramIdentityTone({
        telegramIdVerificationStatus: "UNVERIFIED",
        telegramLinkSource: "MANUAL",
        telegramRemoteStatus: "PUBLISHED",
        lastError: null,
        status: "PUBLISHED",
      }),
    ).toBe("warning");
    render(
      <ManagedPostTelegramIdentityIndicator
        post={{
          telegramIdVerificationStatus: "MISMATCH",
          telegramLinkSource: "MANUAL",
          telegramRemoteStatus: "PUBLISHED",
          lastError: null,
          status: "PUBLISHED",
        }}
      />,
    );
    expect(screen.getByLabelText("Telegram ID mismatch")).toHaveClass(
      "text-amber-400",
    );
  });

  it("does not show an unverified warning for a draft that was never scheduled", () => {
    const post = scheduledPost({
      status: "DRAFT",
      telegramScheduledMessageIds: [],
      telegramRemoteStatus: "NONE",
    });

    expect(managedPostTelegramIdentityTone(post)).toBe("normal");
    render(<ManagedPostTelegramIdentityIndicator post={post} />);
    expect(
      screen.queryByLabelText("Telegram ID has not been verified"),
    ).toBeNull();
  });

  it("renders a persistent red indicator when Telegram reports the post missing", () => {
    render(
      <ManagedPostTelegramIdentityIndicator
        post={{
          telegramIdVerificationStatus: "MISSING",
          telegramLinkSource: "AUTO",
          telegramRemoteStatus: "MISSING",
          lastError: null,
          status: "PUBLISHED",
        }}
      />,
    );
    expect(screen.getByLabelText("Telegram post was not found")).toHaveClass(
      "text-red-400",
    );
  });

  it("preserves legacy broken-link red presentation", () => {
    render(
      <ManagedPostTelegramIdentityIndicator
        post={{
          telegramIdVerificationStatus: "UNVERIFIED",
          telegramLinkSource: "AUTO",
          telegramRemoteStatus: "BROKEN",
          lastError: "Telegram link is broken",
          status: "PUBLISHED",
        }}
      />,
    );
    expect(screen.getByLabelText("Telegram post was not found")).toHaveClass(
      "text-red-400",
    );
  });

  it("keeps a scheduled missing identity red without exposing a permalink", () => {
    const post = scheduledPost({
      telegramIdVerificationStatus: "MISSING",
      telegramRemoteStatus: "MISSING",
    });

    expect(managedPostTelegramIdentityTone(post)).toBe("error");
    expect(managedPostPublishedTelegramUrl(post)).toBeNull();
    renderLink(post);
    expect(
      screen.getByRole("button", { name: "Scheduled in Telegram" }),
    ).toHaveClass("border-red-700");
    expect(screen.queryByRole("button", { name: "Open in TG" })).toBeNull();
  });

  it("shows scheduled status without manual URL, save, or verification controls", async () => {
    renderLink(scheduledPost());

    await userEvent.click(
      screen.getByRole("button", { name: "Scheduled in Telegram" }),
    );

    expect(screen.getByText("Scheduled Telegram status")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Telegram link will be available after publication and verification.",
      ),
    ).toHaveLength(2);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save link" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Check Telegram ID" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("identifies local Bot API delivery without claiming it is in Telegram", async () => {
    renderLink(
      scheduledPost({
        scheduleMode: "LOCAL",
        telegramScheduledMessageIds: [],
        telegramRemoteStatus: "NONE",
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Scheduled via Nexeloq" }),
    );

    expect(screen.getByText("Scheduled delivery status")).toBeInTheDocument();
    expect(
      screen.getAllByText(/not currently in Telegram Scheduled Messages/i),
    ).toHaveLength(2);
  });

  it("does not resolve internal links until the published ID is verified", () => {
    const post = {
      status: "PUBLISHED",
      telegramRemoteStatus: "PUBLISHED",
      telegramMessageIds: ["4427"],
      telegramIdVerificationStatus: "UNVERIFIED",
      lastError: null,
    } as TelegramManagedPost;

    expect(isManagedPostInternalLinkReady(post, "123")).toBe(false);
    expect(
      isManagedPostInternalLinkReady(
        { ...post, telegramIdVerificationStatus: "VERIFIED" },
        "123",
      ),
    ).toBe(true);
  });

  it("does not offer a post for scheduling when it links to a scheduled post", () => {
    const target = scheduledPost({ id: "scheduled-target" });
    const dependent = scheduledPost({
      id: "dependent-draft",
      status: "DRAFT",
      text: "[Read this first](tg-post:scheduled-target)",
    });

    expect(
      canScheduleManagedPost(dependent, [dependent, target], "-100123"),
    ).toBe(false);
  });
});
