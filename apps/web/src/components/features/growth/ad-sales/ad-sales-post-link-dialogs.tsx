"use client";

import type { Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { Button, FormField, Input, Modal, Select, Textarea } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import {
  invalidateTelegramAdSaleReads,
  invalidateTelegramAdSalesDerivedQueries,
  reconcileTelegramAdSaleCache,
} from "@/lib/features/growth/telegram-ad-sales-query";

type PastSlotAssignment = {
  saleId: string;
  placementId: string;
  channelTitle: string;
  slotDateLabel: string;
  posts: Array<{
    id: string;
    title: string;
    kind: "managed" | "telegram";
    status: string;
    dateValue: string;
  }>;
};
type PostEditorPlacement = { saleId: string; placementId: string };

export function AdSalesPostLinkDialogs({
  pastSlotAssignment,
  setPastSlotAssignment,
  selectedPastPostId,
  setSelectedPastPostId,
  postEditorPlacement,
  setPostEditorPlacement,
  postTitle,
  setPostTitle,
  postText,
  setPostText,
  postImages,
  setPostImages,
  queryClient,
}: {
  pastSlotAssignment: PastSlotAssignment | null;
  setPastSlotAssignment: Dispatch<SetStateAction<PastSlotAssignment | null>>;
  selectedPastPostId: string;
  setSelectedPastPostId: Dispatch<SetStateAction<string>>;
  postEditorPlacement: PostEditorPlacement | null;
  setPostEditorPlacement: Dispatch<SetStateAction<PostEditorPlacement | null>>;
  postTitle: string;
  setPostTitle: Dispatch<SetStateAction<string>>;
  postText: string;
  setPostText: Dispatch<SetStateAction<string>>;
  postImages: string;
  setPostImages: Dispatch<SetStateAction<string>>;
  queryClient: QueryClient;
}) {
  return (
    <>
      <Modal
        open={Boolean(pastSlotAssignment)}
        onClose={() => {
          setPastSlotAssignment(null);
          setSelectedPastPostId("");
        }}
        title="Link sold post"
        size="md"
      >
        {pastSlotAssignment ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              Choose the real ad post for {pastSlotAssignment.channelTitle} on{" "}
              {pastSlotAssignment.slotDateLabel}.
            </p>
            <FormField label="Published post">
              <Select
                value={selectedPastPostId}
                onChange={(event) => setSelectedPastPostId(event.target.value)}
              >
                {pastSlotAssignment.posts.map((post) => {
                  const label = post.title?.trim() || "Untitled post";
                  return (
                    <option key={post.id} value={post.id}>
                      {post.dateValue
                        ? `${new Date(post.dateValue).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · `
                        : ""}
                      {post.kind === "telegram" ? "Post · " : "Managed · "}
                      {label}
                    </option>
                  );
                })}
              </Select>
            </FormField>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPastSlotAssignment(null);
                  setSelectedPastPostId("");
                }}
              >
                Skip for now
              </Button>
              <Button
                disabled={!selectedPastPostId}
                onClick={async () => {
                  if (!pastSlotAssignment || !selectedPastPostId) return;
                  const current = pastSlotAssignment;
                  const selectedPost = current.posts.find(
                    (post) => post.id === selectedPastPostId,
                  );
                  setPastSlotAssignment(null);
                  setSelectedPastPostId("");
                  await telegramAdSalesApi.attachManagedPost(
                    current.saleId,
                    current.placementId,
                    {
                      ...(selectedPost?.kind === "telegram"
                        ? { telegramPostId: selectedPost.id }
                        : { managedPostId: selectedPost?.id }),
                    },
                  );
                  const updatedSale = await telegramAdSalesApi.reconcileSale(
                    current.saleId,
                    true,
                  );
                  reconcileTelegramAdSaleCache(queryClient, {
                    type: "update",
                    sale: updatedSale,
                  });
                  await invalidateTelegramAdSalesDerivedQueries(queryClient, {
                    availability: true,
                    analytics: true,
                    managedPosts: true,
                    channelIds: updatedSale.placements.map(
                      (placement) => placement.telegramChannelId,
                    ),
                  });
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(postEditorPlacement)}
        onClose={() => setPostEditorPlacement(null)}
        title="Create advertising post"
        size="xl"
      >
        <div className="space-y-4">
          <FormField label="Title">
            <Input
              value={postTitle}
              onChange={(event) => setPostTitle(event.target.value)}
            />
          </FormField>
          <FormField label="Text">
            <Textarea
              rows={8}
              value={postText}
              onChange={(event) => setPostText(event.target.value)}
            />
          </FormField>
          <FormField label="Image URLs">
            <Textarea
              rows={4}
              value={postImages}
              onChange={(event) => setPostImages(event.target.value)}
              placeholder="One URL per line"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setPostEditorPlacement(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!postEditorPlacement) return;
                await telegramAdSalesApi.createManagedPostFromPlacement(
                  postEditorPlacement.saleId,
                  postEditorPlacement.placementId,
                  {
                    title: postTitle,
                    text: postText,
                    imageUrls: postImages
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                );
                const saleId = postEditorPlacement.saleId;
                setPostEditorPlacement(null);
                await invalidateTelegramAdSaleReads(queryClient, {
                  saleId,
                  lists: true,
                });
                await invalidateTelegramAdSalesDerivedQueries(queryClient, {
                  analytics: true,
                  availability: true,
                });
              }}
            >
              Create post
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

