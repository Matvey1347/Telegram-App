#!/usr/bin/env node
/**
 * Explicit production smoke. Reads secrets only from injected process env.
 * Requires SMOKE_EXECUTE=publish-private-test-only and explicit guarded channel IDs.
 * Railway usage: railway run --service 'Nexeloq API' node scripts/publication-production-smoke.mjs
 * Set non-secret SMOKE_AD_CHANNEL_ID / SMOKE_VP_CHANNEL_ID in the invoking environment.
 * Creates one ad and a draft VP folder with five logical posts (four tomorrow).
 * Canonical API activation/scheduling wakes the actual production scheduler.
 * Always cancels VP future work and ad publications before exiting normally.
 */
import { createRequire } from "node:module";
import { createHmac, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const workspaceId = "cmptsyujx0001flritxdrq84b";
const nonce = `smoke-publication-${randomUUID()}`;
const state = {
  nonce,
  workspaceId,
  saleId: null,
  placementId: null,
  folderId: null,
};
let stage = "preflight";
let prisma;
let request;
let cleaned = false;
let cleanupRunning;
class SafeSmokeError extends Error {}
function requireThat(condition, message) {
  if (!condition) throw new SafeSmokeError(message);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cleanup() {
  if (cleaned || !request) return;
  if (cleanupRunning) return cleanupRunning;
  cleanupRunning = (async () => {
    const failures = [];
    if (state.folderId) {
      try {
        await request(`/mutual-promotion-folders/${state.folderId}/cancel`, {});
      } catch {
        failures.push("VP cancellation requires manual followup");
      }
    }
    if (state.saleId) {
      try {
        await request(
          `/telegram-ad-sales/${state.saleId}/cancel-publications`,
          {},
        );
      } catch {
        failures.push("Ad cancellation requires manual followup");
      }
    }
    cleaned = !failures.length;
    if (failures.length) throw new Error(failures.join("; "));
  })();
  try {
    return await cleanupRunning;
  } finally {
    cleanupRunning = undefined;
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void cleanup()
      .catch(() =>
        console.error(
          JSON.stringify({
            smokeId: nonce,
            stage: "interrupted cleanup",
            cleanupFailure: true,
          }),
        ),
      )
      .finally(async () => {
        await prisma?.$disconnect();
        process.exit(1);
      });
  });
}

try {
  requireThat(
    process.env.SMOKE_EXECUTE === "publish-private-test-only",
    "Explicit smoke execution guard missing",
  );
  requireThat(
    process.env.DATABASE_URL && process.env.JWT_SECRET,
    "Injected DATABASE_URL and JWT_SECRET required",
  );
  const channelIds = [
    process.env.SMOKE_AD_CHANNEL_ID,
    process.env.SMOKE_VP_CHANNEL_ID,
  ];
  requireThat(
    channelIds.every(Boolean) && channelIds[0] !== channelIds[1],
    "Two explicit distinct channel IDs required",
  );
  const base = new URL(
    process.env.SMOKE_API_BASE_URL || "https://api.nexeloq.com/api",
  );
  requireThat(
    base.protocol === "https:" &&
      ["api.nexeloq.com", "www.nexeloq.com"].includes(base.hostname) &&
      !base.username &&
      !base.password &&
      !base.search,
    "Unexpected production API origin",
  );
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const channels = await prisma.telegramChannel.findMany({
    where: { workspaceId, id: { in: channelIds } },
    select: {
      id: true,
      title: true,
      username: true,
      currentSubscribersCount: true,
      telegramChatId: true,
    },
  });
  requireThat(
    channels.length === 2,
    "Guarded channels not found in expected workspace",
  );
  for (const channel of channels) {
    requireThat(
      ["Test", "Test 2", "Test2", "Test4"].includes(channel.title) &&
        !channel.username &&
        channel.telegramChatId &&
        channel.currentSubscribersCount !== null &&
        channel.currentSubscribersCount <= 5,
      "Private test-channel guard failed",
    );
  }
  const owner = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "owner" },
    select: {
      userId: true,
      user: { select: { email: true, authVersion: true } },
    },
  });
  requireThat(owner, "Workspace owner not found");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: owner.userId, email: owner.user.email, ver: owner.user.authVersion, iat: nowSeconds, exp: nowSeconds + 1200 })}`;
  const token = `${unsigned}.${createHmac("sha256", process.env.JWT_SECRET).update(unsigned).digest("base64url")}`;
  request = async (path, body, method = "POST") => {
    const response = await fetch(`${base.href.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "x-workspace-id": workspaceId,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(90_000),
    });
    requireThat(
      response.ok,
      `Canonical API request failed at ${stage}: HTTP ${response.status}`,
    );
    if (response.headers.get("content-type")?.includes("ndjson")) {
      const events = (await response.text())
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      requireThat(
        events.some((event) => event.type === "complete") &&
          !events.some((event) => event.type === "error"),
        `Canonical stream failed at ${stage}`,
      );
      return events.find((event) => event.type === "complete").result;
    }
    return response.status === 204 ? null : response.json();
  };
  const persistState = () =>
    writeFile(join(tmpdir(), `${nonce}.json`), JSON.stringify(state), {
      mode: 0o600,
    });
  const adChannel = channelIds[0];
  const vpChannel = channelIds[1];
  const link = await prisma.telegramInviteLink.findFirst({
    where: {
      workspaceId,
      telegramChannelId: vpChannel,
      isRevoked: false,
      adCampaignId: null,
      snapshots: { none: { adCampaignId: { not: null } } },
      mutualPromotionParticipants: { none: {} },
    },
    select: { id: true },
  });
  requireThat(
    link,
    "Test VP channel requires an existing unused cached invite link",
  );
  const scheduledAt = new Date(Date.now() + 120_000);
  const buttons = [
    [
      {
        text: "Smoke verification",
        url: "https://telegram.org",
        style: "default",
      },
    ],
  ];
  stage = "ad creation";
  const sale = await request("/telegram-ad-sales", {
    advertiserName: nonce,
    title: nonce,
    settlementCurrency: "UAH",
    createAdvertiser: false,
    origin: "DIRECT",
  });
  state.saleId = sale.id;
  await persistState();
  await prisma.telegramAdSale.update({
    where: { id: sale.id },
    data: {
      scheduledBotConfirmationSentAt: new Date(),
      publishedBotConfirmationSentAt: new Date(),
      financeSkipped: true,
    },
  });
  await request(`/telegram-ad-sales/${sale.id}/placements`, {
    telegramChannelId: adChannel,
    scheduledAt: scheduledAt.toISOString(),
    timezone: "UTC",
    agreedPrice: 0,
    currency: "UAH",
    manualPriceReason: nonce,
  });
  const placement = await prisma.telegramAdSalePlacement.findFirstOrThrow({
    where: {
      workspaceId,
      telegramAdSaleId: sale.id,
      telegramChannelId: adChannel,
    },
    select: { id: true },
  });
  state.placementId = placement.id;
  await persistState();
  const adPost = await request(
    `/telegram-ad-sales/${sale.id}/placements/${placement.id}/managed-post`,
    {
      title: nonce,
      text: `Private production reliability verification ${nonce}`,
      imageUrls: [],
      buttonRows: buttons,
    },
  );
  await request(`/telegram-ad-sales/${sale.id}/reserve`, {});
  await request(`/telegram-ad-sales/${sale.id}/confirm`, {});
  stage = "VP draft creation";
  const folder = await request("/mutual-promotion-folders", {
    title: nonce,
    startsAt: scheduledAt.toISOString(),
    endsAt: new Date(scheduledAt.getTime() + 3 * 86400_000).toISOString(),
    participants: [
      {
        telegramChannelId: vpChannel,
        inviteLinkId: link.id,
        role: "PUBLISHER",
      },
    ],
  });
  state.folderId = folder.id;
  await persistState();
  // Draft-only fixture bypasses the interactive System Bot import, never a delivery queue.
  await prisma.mutualPromotionFolder.update({
    where: { id: folder.id },
    data: { scheduledBotConfirmationSentAt: new Date() },
  });
  const postIds = Array.from(
    { length: 5 },
    (_, index) => `${nonce}-vp-${index}`,
  );
  await prisma.mutualPromotionFolderPost.createMany({
    data: postIds.map((id, index) => ({
      id,
      workspaceId,
      folderId: folder.id,
      title: `${nonce} ${index}`,
      text: `Private production VP verification ${nonce}`,
      imageUrls: [],
      buttonRows: buttons,
      position: index,
      publishedBotConfirmationSentAt: new Date(),
      scheduledAt:
        index === 0
          ? scheduledAt
          : new Date(scheduledAt.getTime() + 86400_000 + index * 60_000),
    })),
  });
  stage = "canonical scheduling";
  requireThat(
    scheduledAt.getTime() - Date.now() > 30_000,
    "Fixture preparation consumed schedule lead time; cancel and rerun",
  );
  await request(
    `/telegram-ad-sales/${sale.id}/placements/${placement.id}/schedule`,
    { scheduledAt: scheduledAt.toISOString() },
  );
  await request(`/mutual-promotion-folders/${folder.id}/activate`, {});
  const vpDelivery = await prisma.mutualPromotionPostDelivery.findFirstOrThrow({
    where: {
      workspaceId,
      folderPostId: postIds[0],
      telegramChannelId: vpChannel,
    },
    select: { id: true, managedPostId: true },
  });
  const ids = [adPost.id, vpDelivery.managedPostId];
  state.managedPostIds = ids;
  await persistState();
  const pendingPosts = await prisma.telegramManagedPost.findMany({
    where: { workspaceId, id: { in: ids } },
    select: { id: true, scheduleMode: true, scheduledAt: true },
  });
  requireThat(
    pendingPosts.length === 2 &&
      pendingPosts.every(
        (post) =>
          post.scheduleMode === "LOCAL" &&
          post.scheduledAt?.getTime() === scheduledAt.getTime(),
      ),
    "Smoke did not exercise both LOCAL queues",
  );
  stage = "publication verification";
  const expiresAt = scheduledAt.getTime() + 8 * 60_000;
  let proof;
  while (Date.now() < expiresAt) {
    const posts = await prisma.telegramManagedPost.findMany({
      where: { workspaceId, id: { in: ids } },
      select: {
        id: true,
        status: true,
        publishedAt: true,
        telegramMessageIds: true,
        telegramMessageUrls: true,
      },
    });
    const ad = await prisma.telegramAdSalePlacement.findUnique({
      where: { id: placement.id },
      select: { status: true },
    });
    const vp = await prisma.mutualPromotionPostDelivery.findUnique({
      where: { id: vpDelivery.id },
      select: { status: true },
    });
    if (
      posts.length === 2 &&
      posts.every(
        (post) =>
          post.status === "PUBLISHED" &&
          post.publishedAt &&
          post.telegramMessageIds.length &&
          post.telegramMessageUrls.length,
      ) &&
      ad.status === "PUBLISHED" &&
      vp.status === "PUBLISHED"
    ) {
      proof = posts.map((post) => ({
        surface: post.id === adPost.id ? "ad" : "folder-vp",
        latencyMs: post.publishedAt.getTime() - scheduledAt.getTime(),
        messageUrls: post.telegramMessageUrls,
      }));
      break;
    }
    await sleep(3000);
  }
  requireThat(
    proof,
    "Timed out waiting for confirmed post and placement publications",
  );
  state.proof = proof;
  stage = "publication deadline verification";
  requireThat(
    proof.every((item) => item.latencyMs >= -1000 && item.latencyMs <= 15000),
    "Publication exceeded15second smoke tolerance",
  );
  stage = "cleanup";
  await cleanup();
  console.log(
    JSON.stringify({
      smokeId: nonce,
      scheduledAt: scheduledAt.toISOString(),
      results: proof,
      futurePostsCancelled: true,
    }),
  );
} catch (error) {
  let cleanupFailure = false;
  try {
    await cleanup();
  } catch {
    cleanupFailure = true;
  }
  // Never print API bodies, tokens, environment data, or raw third-party errors.
  console.error(
    JSON.stringify({
      smokeId: nonce,
      stage,
      failed: true,
      ...(error instanceof SafeSmokeError ? { reason: error.message } : {}),
      cleanupFailure,
      ...(state.proof ? { results: state.proof } : {}),
    }),
  );
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
}
