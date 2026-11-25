import type { ReactNode } from "react";
import type { DashboardTrafficKind } from "@telegram-system/shared";
import {
  ArrowRightLeft,
  Bot,
  BriefcaseBusiness,
  CircleHelp,
  Folder,
  Handshake,
  Landmark,
  Link2,
  Mail,
  Megaphone,
  Radio,
  Repeat2,
  ShoppingCart,
  Tags,
  UserRound,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import {
  DashboardMixChart,
  type DashboardMixSegment,
} from "./dashboard-mix-chart";
import { Card } from "@/components/ui/primitives";
import type { DashboardSummary } from "@/lib/api-types/operations/dashboard";
import { useOptionalI18n } from "@/providers/i18n-provider";

type FormatMoney = (amount: number) => ReactNode;
const colors = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#818cf8",
];

const sourceIcons: Record<DashboardTrafficKind, LucideIcon> = {
  MUTUAL_PROMOTION: Handshake,
  AD_CAMPAIGNS: Megaphone,
  BOT: Bot,
  AUDIENCE_TRANSFER: ArrowRightLeft,
  BROADCAST: Mail,
  OTHER: Link2,
  FOLDERS: Folder,
};

function useDashboardLabels() {
  const ru = useOptionalI18n()?.locale === "ru";
  const t = (en: string, ruText: string) => (ru ? ruText : en);
  const number = new Intl.NumberFormat(ru ? "ru" : "en", {
    maximumFractionDigits: 1,
  });
  const count = (value: number | null | undefined) =>
    value == null ? "—" : number.format(value);
  return {
    t,
    count,
    percent: (value: number | null) =>
      value == null ? "—" : `${count(value)}%`,
  };
}

export function DashboardInsights({
  data,
  money,
}: {
  data: DashboardSummary;
  money: FormatMoney;
}) {
  const { t, count, percent } = useDashboardLabels();
  const { expensesBreakdownForPeriod: expenses, spendingMix, salesMix } = data;
  const capital = data.investmentBreakdownForPeriod;
  const contributions = (reinvested: boolean) =>
    (capital ?? [])
      .filter((group) => (group.origin === "REINVESTMENT") === reinvested)
      .flatMap((group) => group.movements)
      .filter((movement) => movement.movementType === "CONTRIBUTION")
      .reduce((sum, movement) => sum + movement.amountInPrimaryCurrency, 0);
  const categories = (data.categoryBreakdown ?? [])
    .filter((item) => item.flow === "expense")
    .sort((a, b) => b.amount - a.amount);
  const segment = (
    label: string,
    value: number,
    index: number,
    Icon: LucideIcon,
  ): DashboardMixSegment => ({
    label,
    value,
    Icon,
    color: colors[index % colors.length],
  });

  return (
    <>
      {(capital || (expenses && spendingMix)) && (
        <Card>
          <h3 className="mb-4 text-lg font-semibold text-white">
            {t("Investment and spending", "Вложения и расходы")}
          </h3>
          <div className="grid gap-3 xl:grid-cols-3">
            {capital && (
              <DashboardMixChart
                percent={percent}
                title={t("Capital contributions", "Внесённый капитал")}
                format={money}
                segments={[
                  segment(
                    t("Investments", "Инвестиции"),
                    contributions(false),
                    0,
                    Landmark,
                  ),
                  segment(
                    t("Reinvestments", "Реинвестиции"),
                    contributions(true),
                    1,
                    Repeat2,
                  ),
                ]}
              />
            )}
            {expenses && spendingMix && (
              <>
                <DashboardMixChart
                  percent={percent}
                  title={t("All spending", "Все расходы")}
                  format={money}
                  segments={[
                    segment(
                      t("Channels", "Каналы"),
                      expenses.channels,
                      0,
                      Radio,
                    ),
                    segment(
                      t("Everything else", "Всё остальное"),
                      expenses.other,
                      1,
                      WalletCards,
                    ),
                  ]}
                />
                <DashboardMixChart
                  percent={percent}
                  title={t("Channel spending", "Расходы на каналы")}
                  format={money}
                  segments={[
                    segment(
                      t("Ad purchases", "Закупка рекламы"),
                      spendingMix.advertising,
                      0,
                      Megaphone,
                    ),
                    segment(
                      t("Channel purchases", "Покупка каналов"),
                      spendingMix.channelPurchases,
                      1,
                      ShoppingCart,
                    ),
                    segment(
                      t("Other channel expenses", "Прочие расходы на каналы"),
                      spendingMix.otherChannelExpenses,
                      2,
                      Tags,
                    ),
                  ]}
                />
              </>
            )}
          </div>
          {expenses && categories.length > 0 && (
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {(["channels", "other"] as const).map((bucket) => {
                const items = categories.filter(
                  (item) => item.bucket === bucket,
                );
                return (
                  items.length > 0 && (
                    <DashboardMixChart
                      percent={percent}
                      key={bucket}
                      title={
                        bucket === "channels"
                          ? t(
                              "Channel expense categories",
                              "Категории расходов на каналы",
                            )
                          : t(
                              "Other expense categories",
                              "Категории прочих расходов",
                            )
                      }
                      format={money}
                      segments={items.map((item, index) => ({
                        ...segment(item.name, item.amount, index, Tags),
                        key: item.id ?? item.name,
                        iconPresentation: item.iconPresentation,
                      }))}
                    />
                  )
                );
              })}
            </div>
          )}
        </Card>
      )}

      {data.trafficSources && (
        <Traffic sources={data.trafficSources} money={money} />
      )}

      {salesMix && (
        <Card>
          <h3 className="text-lg font-semibold text-white">
            {t("Ad sales", "Продажи рекламы")}
          </h3>
          <p className="mb-4 mt-1 text-sm text-neutral-400">
            {t("Deals in the selected period", "Сделки за выбранный период")} ·{" "}
            {count(salesMix.total)}
          </p>
          <div
            className={`grid gap-3 lg:grid-cols-2 ${salesMix.revenueBySeller ? "2xl:grid-cols-3" : ""}`}
          >
            <DashboardMixChart
              percent={percent}
              title={t("Sales by seller", "Кто продал")}
              format={count}
              segments={[
                segment(
                  t("Workspace owner", "Владелец"),
                  salesMix.owner,
                  0,
                  UserRound,
                ),
                segment(
                  t("Other sellers", "Другие продавцы"),
                  salesMix.otherSellers,
                  1,
                  Users,
                ),
                segment(
                  t("Unassigned seller", "Продавец не указан"),
                  salesMix.unassigned,
                  2,
                  CircleHelp,
                ),
              ]}
            />
            <DashboardMixChart
              percent={percent}
              title={t("Where the ad was sold", "Куда продали рекламу")}
              format={count}
              segments={[
                segment(
                  t(
                    "Deals including external channels",
                    "Сделки с размещением в чужих каналах",
                  ),
                  salesMix.external,
                  1,
                  Radio,
                ),
                segment(
                  t("Other deals", "Остальные сделки"),
                  salesMix.total - salesMix.external,
                  0,
                  BriefcaseBusiness,
                ),
              ]}
            />
            {salesMix.revenueBySeller && (
              <DashboardMixChart
                percent={percent}
                title={t(
                  "Ad revenue by seller",
                  "Выручка от рекламы по продавцам",
                )}
                format={money}
                segments={salesMix.revenueBySeller.map(
                  ({ id, name, amount }, index) => ({
                    ...segment(
                      name ??
                        (id
                          ? t("Unnamed seller", "Продавец без имени")
                          : t("Unassigned seller", "Продавец не указан")),
                      amount,
                      index,
                      id ? UserRound : CircleHelp,
                    ),
                    key: id ?? "unassigned",
                  }),
                )}
              />
            )}
          </div>
        </Card>
      )}
    </>
  );
}

function Traffic({
  sources,
  money,
}: {
  sources: NonNullable<DashboardSummary["trafficSources"]>;
  money: FormatMoney;
}) {
  const { t, count, percent } = useDashboardLabels();
  const labels: Record<DashboardTrafficKind, string> = {
    MUTUAL_PROMOTION: t("Mutual promotions", "Взаимопиар"),
    AD_CAMPAIGNS: t("Ad campaigns", "Рекламные кампании"),
    BOT: t("Welcome bot", "Приветственный бот"),
    AUDIENCE_TRANSFER: t("Audience transfer", "Перелив аудитории"),
    BROADCAST: t("Broadcast links", "Ссылки рассылок"),
    OTHER: t("Other invite links", "Прочие пригласительные ссылки"),
    FOLDERS: t("Folders", "Папки"),
  };
  const requestTotal = sources.reduce(
    (sum, source) => sum + (source.requests ?? 0),
    0,
  );
  const botRequests = sources.find((source) => source.kind === "BOT")?.requests;
  const botShare =
    botRequests != null && requestTotal > 0
      ? (100 * botRequests) / requestTotal
      : null;
  const amount = (value: number | null) => (value == null ? "—" : money(value));
  const headings = [
    t("Source", "Источник"),
    t("Attributed arrivals", "Переходы с результатом"),
    t("Requests", "Заявки"),
    t("Joined", "Вступили"),
    t("Left", "Отписались"),
    t("Spend", "Расходы"),
    t("Per request", "За заявку"),
    t("Per subscriber", "За подписчика"),
  ];

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">
          {t("Audience acquisition", "Привлечение аудитории")}
        </h3>
        <span className="rounded-md bg-sky-500/10 px-2.5 py-1 text-sm text-sky-200">
          {t(
            "Bot share of measured requests",
            "Доля бота в измеренных заявках",
          )}{" "}
          · {percent(botShare)}
        </span>
      </div>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        {(
          [
            [
              "arrivals",
              t("Audience gained by source", "Привлечение по источникам"),
            ],
            [
              "departures",
              t("Unsubscribes by source", "Отписки по источникам"),
            ],
          ] as const
        ).map(([key, title]) => (
          <DashboardMixChart
            key={key}
            title={title}
            format={count}
            percent={percent}
            segments={sources
              .flatMap((source, index) => {
                const value = source[key];
                return value == null
                  ? []
                  : [
                      {
                        key: source.kind,
                        label: labels[source.kind],
                        value,
                        color: colors[index % colors.length],
                        Icon: sourceIcons[source.kind],
                      },
                    ];
              })
              .sort((left, right) => right.value - left.value)}
          />
        ))}
      </div>
      <div
        className="overflow-x-auto rounded-lg border border-neutral-800"
        tabIndex={0}
        role="region"
        aria-label={t("Acquisition table", "Таблица привлечения")}
      >
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-neutral-900 text-neutral-300">
            <tr>
              {headings.map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 tabular-nums">
            {sources.map((source) => (
              <tr key={source.kind}>
                <th scope="row" className="px-3 py-2.5 font-medium text-white">
                  <div className="flex items-center gap-2">
                    <TrafficIcon kind={source.kind} />
                    <div>
                      {labels[source.kind]}
                      <span className="block text-xs font-normal text-neutral-400">
                        {source.measuredLinks}/{source.trackedLinks}{" "}
                        {t("links measured", "ссылок с данными")}
                      </span>
                    </div>
                  </div>
                </th>
                <td className="px-3 py-2">{count(source.arrivals)}</td>
                <td className="px-3 py-2">{count(source.requests)}</td>
                <td className="px-3 py-2">{count(source.joined)}</td>
                <td className="px-3 py-2">
                  {count(source.departures)}
                  {source.departurePercent != null &&
                    ` · ${percent(source.departurePercent)}`}
                </td>
                <td className="px-3 py-2">{amount(source.spend)}</td>
                <td className="px-3 py-2">{amount(source.costPerRequest)}</td>
                <td className="px-3 py-2">
                  {amount(source.costPerSubscriber)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-400">
        {t(
          "Estimates use Telegram counter changes in the selected period. Arrivals mean new joins or pending requests observed in the counters. The departure rate uses the starting audience plus new joins. It covers all subscribers on those links during the period. Unit costs divide period spend by measured results.",
          "Оценки основаны на изменениях счётчиков Telegram за выбранный период. Переходы — новые вступления или заявки, видимые в счётчиках. Процент отписок считается от аудитории на начало периода плюс новые вступления и включает всех подписчиков по этим ссылкам за период. Стоимость результата считается по расходам за период и измеренным результатам.",
        )}
      </p>
    </Card>
  );
}

function TrafficIcon({ kind }: { kind: DashboardTrafficKind }) {
  const Icon = sourceIcons[kind];
  return (
    <Icon aria-hidden="true" className="shrink-0 text-sky-400" size={17} />
  );
}
