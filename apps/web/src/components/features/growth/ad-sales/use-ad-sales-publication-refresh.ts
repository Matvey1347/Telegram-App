"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramAdSaleListItem } from "@telegram-system/shared";

type SalesPage = { items: TelegramAdSaleListItem[] };

function duePublicationKeys(items: TelegramAdSaleListItem[], now = Date.now()) {
  return items
    .flatMap((sale) => sale.placements)
    .filter(
      (placement) =>
        !placement.publishedAt &&
        placement.managedPost?.status !== "FAILED" &&
        !placement.managedPost?.lastError &&
        new Date(placement.scheduledAt).getTime() <= now,
    )
    .map((placement) => `${placement.id}:${placement.scheduledAt}`)
    .sort();
}

export function useAdSalesPublicationRefresh(options: {
  active: boolean;
  sales: TelegramAdSaleListItem[];
  refetch: () => Promise<{ data?: SalesPage }>;
}) {
  const { active, sales, refetch } = options;
  const attemptsRef = useRef(0);
  const [visibilityVersion, setVisibilityVersion] = useState(0);
  useEffect(() => {
    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible") {
        setVisibilityVersion((current) => current + 1);
      }
    };
    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () =>
      document.removeEventListener("visibilitychange", resumeWhenVisible);
  }, []);
  useEffect(() => {
    if (!active || document.visibilityState === "hidden") return;
    const keys = duePublicationKeys(sales);
    const signature = keys.join("|");
    if (!signature) {
      attemptsRef.current = 0;
      return;
    }
    if (attemptsRef.current >= 4) return;
    let cancelled = false;
    let timer: number | undefined;
    const delays = [3_000, 10_000, 20_000, 45_000];
    const read = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      const attempt = attemptsRef.current;
      if (attempt >= delays.length) {
        return;
      }
      attemptsRef.current = attempt + 1;
      const result = await refetch();
      if (cancelled) return;
      if (!duePublicationKeys(result.data?.items ?? []).length) {
        attemptsRef.current = 0;
        return;
      }
      if (attempt === delays.length - 1) return;
      timer = window.setTimeout(() => void read(), delays[attempt + 1]);
    };
    timer = window.setTimeout(() => void read(), delays[attemptsRef.current]);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, refetch, sales, visibilityVersion]);
}

export function useAdSalesDeletionDeadlineRefresh(options: {
  active: boolean;
  sales: TelegramAdSaleListItem[];
  refetch: () => Promise<unknown>;
}) {
  const { active, sales, refetch } = options;
  const refreshedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!active) return;
    const next = sales
      .flatMap((sale) => sale.placements)
      .filter(
        (placement) =>
          placement.publishedAt &&
          placement.plannedDeleteAt &&
          !placement.deletedAt &&
          placement.managedPost?.telegramRemoteStatus !== "MISSING",
      )
      .map((placement) => ({
        key: `${placement.id}:${placement.plannedDeleteAt}`,
        dueAt: new Date(placement.plannedDeleteAt!).getTime(),
      }))
      .filter(
        ({ key, dueAt }) =>
          Number.isFinite(dueAt) && !refreshedRef.current.has(key),
      )
      .sort((left, right) => left.dueAt - right.dueAt)[0];
    if (!next) return;
    const timeout = window.setTimeout(
      () => {
        refreshedRef.current.add(next.key);
        void refetch();
      },
      Math.min(Math.max(0, next.dueAt - Date.now()) + 3_000, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [active, refetch, sales]);
}

export function useAdSalesLifecycleRefresh(options: {
  active: boolean;
  sales: TelegramAdSaleListItem[];
  refetch: () => Promise<{ data?: SalesPage }>;
}) {
  useAdSalesPublicationRefresh(options);
  useAdSalesDeletionDeadlineRefresh(options);
}
