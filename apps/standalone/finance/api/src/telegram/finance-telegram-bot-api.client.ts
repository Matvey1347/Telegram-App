import { Injectable } from "@nestjs/common";

export interface FinanceTelegramWebhookInfo {
  url?: string;
}

export interface FinanceTelegramBotProfile {
  id: number;
  username?: string;
}

function getTelegramProfileImageUrl(profileHtml: string) {
  const match =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
      profileHtml,
    ) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(
      profileHtml,
    );
  if (!match?.[1]) return null;

  try {
    const imageUrl = new URL(match[1].replace(/&amp;/g, "&"));
    const isTelegramImageHost =
      imageUrl.protocol === "https:" &&
      (imageUrl.hostname === "telegram.org" ||
        imageUrl.hostname.endsWith(".telegram.org"));
    return isTelegramImageHost ? imageUrl.toString() : null;
  } catch {
    return null;
  }
}

/** Minimal Finance-owned Bot API boundary. It is used only during bounded
 * startup webhook reconciliation; it never polls for updates. */
@Injectable()
export class FinanceTelegramBotApiClient {
  async getMe(token: string): Promise<FinanceTelegramBotProfile> {
    return this.call<FinanceTelegramBotProfile>(token, "getMe", {});
  }

  async getMyName(token: string): Promise<{ name?: string }> {
    return this.call<{ name?: string }>(token, "getMyName", {});
  }

  async setMyName(token: string, name: string) {
    await this.call<boolean>(token, "setMyName", { name });
  }

  async setMyDescription(token: string, description: string) {
    await this.call<boolean>(token, "setMyDescription", { description });
  }

  async setMyProfilePhoto(token: string, image: Buffer, contentType: string) {
    const form = new FormData();
    form.set("photo", new Blob([new Uint8Array(image)], { type: contentType }), "bot-logo.jpg");
    const response = await fetch(`https://api.telegram.org/bot${token}/setMyProfilePhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
      throw new Error("Telegram Bot API setMyProfilePhoto failed");
    }
  }

  async getUserProfilePhoto(token: string, userId: string) {
    const photos = await this.call<{
      photos?: Array<Array<{ file_id: string }>>;
    }>(token, "getUserProfilePhotos", {
      user_id: userId,
      offset: 0,
      limit: 1,
    });
    return photos.photos?.[0]?.at(-1)?.file_id ?? null;
  }

  async downloadFile(token: string, fileId: string) {
    const file = await this.call<{ file_path?: string }>(token, "getFile", {
      file_id: fileId,
    });
    if (!file.file_path) return null;
    const response = await fetch(
      `https://api.telegram.org/file/bot${token}/${file.file_path}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error("Telegram Bot API file download failed");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) {
      throw new Error("Telegram bot profile photo is too large");
    }
    return {
      bytes,
      contentType: response.headers.get("content-type") || "image/jpeg",
    };
  }

  /** Bot API can omit a bot's own photo even though its Telegram profile
   * publishes a current preview image. */
  async downloadUsernameProfilePhoto(username: string) {
    const normalizedUsername = username.replace(/^@/, "").trim();
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(normalizedUsername)) return null;
    const profileResponse = await fetch(
      `https://t.me/${encodeURIComponent(normalizedUsername)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!profileResponse.ok) return null;

    const imageUrl = getTelegramProfileImageUrl(await profileResponse.text());
    if (!imageUrl) return null;

    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return null;
    return {
      bytes,
      contentType: response.headers.get("content-type") || "image/jpeg",
    };
  }

  async getWebhookInfo(token: string): Promise<FinanceTelegramWebhookInfo> {
    return this.call<FinanceTelegramWebhookInfo>(token, "getWebhookInfo", {});
  }

  async setWebhook(
    token: string,
    url: string,
    secretToken: string,
  ): Promise<void> {
    await this.call<boolean>(token, "setWebhook", {
      url,
      secret_token: secretToken,
      drop_pending_updates: false,
    });
  }

  private async call<T>(
    token: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const payload: unknown = await response.json();
    if (
      !response.ok ||
      !payload ||
      typeof payload !== "object" ||
      (payload as { ok?: unknown }).ok !== true
    ) {
      throw new Error(`Telegram Bot API ${method} failed`);
    }
    return (payload as { result: T }).result;
  }
}
