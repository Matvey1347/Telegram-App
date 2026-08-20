"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceCategory } from "@telegram-system/shared";
import { Button, Card, EmptyState, FormField, Input, Select } from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { financeCopy, type FinanceLocale } from "./finance-i18n";

export function FinanceCategories({ botId, locale }: { botId: string; locale: FinanceLocale }) {
  const t = financeCopy(locale); const client = useQueryClient(); const [name, setName] = useState(""); const [type, setType] = useState<ConsumerFinanceCategory["type"]>("EXPENSE");
  const categories = useQuery({ queryKey: consumerFinanceKeys.categories(botId), queryFn: () => consumerFinanceApi.categories(botId) });
  const create = useMutation({ mutationFn: () => consumerFinanceApi.createCategory(botId, { name, type }), onSuccess: (item) => { client.setQueryData(consumerFinanceKeys.categories(botId), (rows: ConsumerFinanceCategory[] | undefined) => [...(rows ?? []), item]); setName(""); } });
  const archive = useMutation({ mutationFn: (id: string) => consumerFinanceApi.archiveCategory(botId, id), onSuccess: () => void client.invalidateQueries({ queryKey: consumerFinanceKeys.categories(botId) }) });
  return <div className="space-y-4"><p className="text-sm text-neutral-400">{t.categoriesHelp}</p><Card><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><FormField label={t.categoryName}><Input value={name} onChange={(event) => setName(event.target.value)} /></FormField><FormField label={t.categories}><Select value={type} onChange={(event) => setType(event.target.value as ConsumerFinanceCategory["type"])}><option value="EXPENSE">{t.expenseCategories}</option><option value="INCOME">{t.incomeCategories}</option></Select></FormField></div><Button className="mt-3 w-full" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>{t.addCategory}</Button></Card>{(["EXPENSE", "INCOME"] as const).map((categoryType) => { const rows = categories.data?.filter((item) => item.type === categoryType && !item.archivedAt) ?? []; return <Card key={categoryType}><h2 className="font-medium">{categoryType === "EXPENSE" ? t.expenseCategories : t.incomeCategories}</h2>{rows.length ? <div className="mt-2 divide-y divide-neutral-800">{rows.map((item) => <div key={item.id} className="flex items-center justify-between py-2"><span>{item.name}</span><Button variant="secondary" disabled={archive.isPending} onClick={() => archive.mutate(item.id)}>{t.archive}</Button></div>)}</div> : <EmptyState text={t.noCategories} />}</Card>; })}</div>;
}
