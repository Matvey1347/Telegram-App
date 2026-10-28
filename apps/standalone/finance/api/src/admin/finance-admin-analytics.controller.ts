import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { FinanceAdminAnalyticsService } from "./finance-admin-analytics.service";

@Controller("admin/analytics")
export class FinanceAdminAnalyticsController {
  constructor(private readonly analytics: FinanceAdminAnalyticsService) {}

  @Get()
  overview(
    @Headers("x-finance-admin-analytics-token") token?: string,
    @Headers("x-nexeloq-workspace-id") workspaceId?: string,
  ) {
    this.analytics.authorize(token, workspaceId);
    return this.analytics.overview();
  }

  @Get("users")
  users(
    @Headers("x-finance-admin-analytics-token") token: string | undefined,
    @Headers("x-nexeloq-workspace-id") workspaceId: string | undefined,
    @Query("environment") environment: "LOCAL" | "PRODUCTION",
    @Query("cursor") cursor?: string,
  ) {
    this.analytics.authorize(token, workspaceId);
    return this.analytics.users(environment, cursor);
  }

  @Get("avatar")
  async avatar(
    @Headers("x-finance-admin-analytics-token") token: string | undefined,
    @Headers("x-nexeloq-workspace-id") workspaceId: string | undefined,
    @Query("environment") environment: "LOCAL" | "PRODUCTION",
    @Res() response: Response,
  ) {
    this.analytics.authorize(token, workspaceId);
    const avatar = await this.analytics.avatar(environment);
    if (!avatar) return response.status(204).send();
    response.setHeader("Content-Type", avatar.contentType);
    response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    return response.send(avatar.bytes);
  }

  @Post("avatars/refresh")
  async refreshAvatars(
    @Headers("x-finance-admin-analytics-token") token: string | undefined,
    @Headers("x-nexeloq-workspace-id") workspaceId: string | undefined,
  ) {
    this.analytics.authorize(token, workspaceId);
    return this.analytics.refreshAvatars();
  }

  @Patch("bots/:environment/profile")
  updateProfile(
    @Headers("x-finance-admin-analytics-token") token: string | undefined,
    @Headers("x-nexeloq-workspace-id") workspaceId: string | undefined,
    @Param("environment") environment: "LOCAL" | "PRODUCTION",
    @Body() body: { name?: string; description?: string; confirmTelegramUpdate?: string },
  ) {
    this.analytics.authorize(token, workspaceId);
    if (body.confirmTelegramUpdate !== "true") throw new Error("Telegram confirmation is required");
    return this.analytics.updateProfile(environment, { name: body.name, description: body.description });
  }
}
