import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MutualPromotionFolderDetailModal } from "./mutual-promotion-folder-detail-modal";

vi.mock("./mutual-promotion-post-import", () => ({
  MutualPromotionPostImport: () => <div>Post import</div>,
}));
vi.mock("./mutual-promotion-saved-post-card", () => ({
  MutualPromotionSavedPostCard: ({ index }: { index: number }) => (
    <div>Saved post {index + 1}</div>
  ),
}));

describe("MutualPromotionFolderDetailModal", () => {
  it("offers invite-link editing for an active folder", () => {
    const onEditInviteLinks = vi.fn();
    render(
      <MutualPromotionFolderDetailModal
        open
        folder={
          {
            id: "folder-1",
            title: "Active folder",
            status: "ACTIVE",
            startsAt: "2026-09-08T08:00:00.000Z",
            endsAt: "2026-09-10T08:00:00.000Z",
            participantCount: 0,
            publisherCount: 0,
            paidCount: 0,
            postCount: 0,
            participants: [],
            posts: [],
          } as never
        }
        timezone="Europe/Warsaw"
        accounts={[]}
        botConnected={false}
        botUsername={null}
        mutating={false}
        actionError={null}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onEditInviteLinks={onEditInviteLinks}
        onActivate={vi.fn()}
        onCancel={vi.fn()}
        onAddPost={vi.fn()}
        onUpdatePost={vi.fn()}
        onRemovePost={vi.fn()}
        onSaveExpense={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit invite links" }));
    expect(onEditInviteLinks).toHaveBeenCalledOnce();
    expect(screen.getByText("Active")).toHaveClass(
      "border-emerald-600/70",
      "bg-emerald-950/80",
      "text-emerald-200",
    );
    expect(screen.getByTestId("folder-status-dot")).toHaveClass(
      "bg-emerald-400",
    );
    expect(
      screen.queryByRole("button", { name: "Edit setup" }),
    ).not.toBeInTheDocument();
  });

  it("renders channel photos and finance account icons", () => {
    render(
      <MutualPromotionFolderDetailModal
        open
        folder={
          {
            id: "folder-1",
            title: "Folder",
            titleTemplate: null,
            status: "ACTIVE",
            startsAt: "2026-09-08T08:00:00.000Z",
            endsAt: "2026-09-10T08:00:00.000Z",
            notes: null,
            assignedMemberId: null,
            participantCount: 1,
            publisherCount: 0,
            paidCount: 1,
            postCount: 0,
            participants: [
              {
                id: "participant-1",
                telegramChannelId: "channel-1",
                role: "PAID",
                inviteLinkMode: "REUSABLE",
                channel: {
                  id: "channel-1",
                  title: "Business partners",
                  username: "business",
                  photoUrl: "https://cdn.test/channel.jpg",
                },
                inviteLink: {
                  id: "link-1",
                  name: "Folders",
                  url: "https://t.me/+folder",
                  joinedCount: 29,
                  creatorUsername: "okane_taikin",
                  creatorFirstName: "😇",
                  creatorPhotoUrl: null,
                  creatorMember: null,
                },
                subscribersAtStart: null,
                subscribersAtEnd: null,
                inviteJoinedAtStart: null,
                inviteJoinedAtEnd: null,
                baselineCapturedAt: null,
                finalCapturedAt: null,
                expense: {
                  transactionId: "transaction-1",
                  accountId: "account-1",
                  accountName: "Ukraine Card",
                  amount: 350,
                  currency: "UAH",
                  amountInPrimaryCurrency: 350,
                },
                stats: {
                  joinedCount: 29,
                  unsubscribedCount: 33,
                  unsubscribedIsEstimate: true,
                  audienceDelta: -4,
                  retainedCount: 0,
                  subscriberPrice: 350 / 29,
                  retainedSubscriberPrice: null,
                  currency: "UAH",
                  dataQuality: "PENDING",
                },
                attributionHistory: {
                  startsAt: "2026-09-08T08:00:00.000Z",
                  endsAt: "2026-09-11T08:00:00.000Z",
                  endsAtSource: "CURRENT_TIME",
                  points: [
                    {
                      at: "2026-09-08T08:00:00.000Z",
                      joinedCount: 0,
                      unsubscribedCount: 0,
                      audienceDelta: 0,
                    },
                    {
                      at: "2026-09-11T08:00:00.000Z",
                      joinedCount: 29,
                      unsubscribedCount: 33,
                      audienceDelta: -4,
                    },
                  ],
                },
              },
            ],
            posts: [],
            createdAt: "2026-09-08T08:00:00.000Z",
            updatedAt: "2026-09-08T08:00:00.000Z",
          } as never
        }
        timezone="Europe/Warsaw"
        accounts={
          [
            {
              id: "account-1",
              name: "Ukraine Card",
              currency: "UAH",
              initialBalance: 0,
              isActive: true,
              iconPresentation: {
                type: "image",
                id: "account-icon",
                url: "https://cdn.test/account.jpg",
              },
            },
          ] as never
        }
        botConnected={false}
        botUsername={null}
        mutating={false}
        actionError={null}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onEditInviteLinks={vi.fn()}
        onActivate={vi.fn()}
        onCancel={vi.fn()}
        onAddPost={vi.fn()}
        onUpdatePost={vi.fn()}
        onRemovePost={vi.fn()}
        onSaveExpense={vi.fn()}
      />,
    );

    expect(screen.getByText("Business partners")).toBeVisible();
    expect(
      document.querySelector('img[src="https://cdn.test/channel.jpg"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('img[src="https://cdn.test/account.jpg"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("😇")).toBeVisible();
    const metricLabels = Array.from(document.querySelectorAll("dt"));
    expect(metricLabels.map((label) => label.textContent?.trim())).toEqual([
      "Joined",
    ]);
    expect(metricLabels[0].querySelector("svg")).toHaveClass(
      "text-emerald-300",
    );
    expect(screen.getByText("12.07 UAH / paid subscriber")).toBeInTheDocument();
    expect(screen.getByText("Invite-link history")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Invite-link arrivals chart"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unsubscribed ≈")).not.toBeInTheDocument();
    expect(screen.queryByText("Net audience")).not.toBeInTheDocument();
  });

  it("places the activation explanation and action after the publications", () => {
    render(
      <MutualPromotionFolderDetailModal
        open
        folder={
          {
            id: "folder-1",
            title: "Folder",
            status: "DRAFT",
            startsAt: "2026-09-08T08:00:00.000Z",
            endsAt: "2026-09-10T08:00:00.000Z",
            participantCount: 1,
            publisherCount: 1,
            paidCount: 0,
            postCount: 5,
            participants: [
              {
                id: "participant-1",
                role: "PUBLISHER",
                channel: { id: "channel-1", title: "Publisher" },
                inviteLink: { name: "Folder link", url: "https://t.me/+x" },
                stats: {},
              },
            ],
            posts: Array.from({ length: 5 }, (_, index) => ({
              id: `post-${index}`,
            })),
          } as never
        }
        timezone="Europe/Warsaw"
        accounts={[]}
        botConnected
        botUsername="system_bot"
        mutating={false}
        actionError={null}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onEditInviteLinks={vi.fn()}
        onActivate={vi.fn()}
        onCancel={vi.fn()}
        onAddPost={vi.fn()}
        onUpdatePost={vi.fn()}
        onRemovePost={vi.fn()}
        onSaveExpense={vi.fn()}
      />,
    );

    const publications = screen.getByText("Publications (5)");
    const explanation = screen.getByText(
      "What happens when you activate this folder",
    );
    const activate = screen.getByRole("button", { name: "Activate" });
    expect(
      publications.compareDocumentPosition(explanation) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      explanation.compareDocumentPosition(activate) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText(/added immediately to Telegram Scheduled Messages/),
    ).toBeVisible();
    expect(screen.getByText("Unsubscribed")).toBeVisible();
  });
});
