import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramAdSaleStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
} from '@prisma/client';
import {
  OperationsNotificationMember,
  OperationsNotificationPermissionService,
  operationsNotificationMemberSelect,
} from '../../operations/notifications/operations-notification-permission.service';

type ContactFact = Prisma.TelegramAdvertiserGetPayload<{
  select: typeof contactSelect;
}>;

const recipientSelect = {
  ...operationsNotificationMemberSelect,
  operationsNotificationPreference: {
    select: {
      crmNotificationsEnabled: true,
      crmIncomingMessagesEnabled: true,
      crmMessagePreviewEnabled: true,
      crmFollowUpEnabled: true,
      crmAiLeadsEnabled: true,
    },
  },
} satisfies Prisma.WorkspaceMemberSelect;
type RecipientMember = OperationsNotificationMember & {
  operationsNotificationPreference?: {
    crmNotificationsEnabled: boolean;
    crmIncomingMessagesEnabled: boolean;
    crmMessagePreviewEnabled: boolean;
    crmFollowUpEnabled?: boolean;
    crmAiLeadsEnabled?: boolean;
  } | null;
};

const ACTIVE_DEAL_STATUSES = [
  TelegramAdSaleStatus.RESERVED,
  TelegramAdSaleStatus.CONFIRMED,
  TelegramAdSaleStatus.IN_PROGRESS,
];

const contactSelect = {
  id: true,
  displayName: true,
  stage: true,
  ownerMemberId: true,
  sales: {
    where: { status: { in: ACTIVE_DEAL_STATUSES } },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }],
    take: 1,
    select: { id: true, status: true, assignedMemberId: true },
  },
  tasks: {
    where: {
      status: {
        in: [
          TelegramAdvertiserTaskStatus.OPEN,
          TelegramAdvertiserTaskStatus.IN_PROGRESS,
        ],
      },
      priority: {
        in: [
          TelegramAdvertiserTaskPriority.HIGH,
          TelegramAdvertiserTaskPriority.URGENT,
        ],
      },
    },
    select: { dueAt: true },
    orderBy: [{ dueAt: 'asc' as const }, { id: 'asc' as const }],
    take: 1,
  },
} satisfies Prisma.TelegramAdvertiserSelect;

@Injectable()
export class TelegramCrmNotificationRecipientService {
  constructor(
    private readonly permissions: OperationsNotificationPermissionService,
  ) {}

  async load(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    contactIds: readonly string[],
  ) {
    const uniqueContactIds = [...new Set(contactIds)];
    if (uniqueContactIds.length) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "TelegramAdvertiser"
        WHERE "workspaceId" = ${workspaceId}
          AND "id" IN (${Prisma.join(uniqueContactIds)})
        FOR SHARE
      `);
    }
    const [contacts, members] = await Promise.all([
      uniqueContactIds.length
        ? tx.telegramAdvertiser.findMany({
            where: { workspaceId, id: { in: uniqueContactIds } },
            select: contactSelect,
          })
        : Promise.resolve([] as ContactFact[]),
      tx.workspaceMember.findMany({
        where: { workspaceId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: recipientSelect,
      }),
    ]);
    return new TelegramCrmRecipientSnapshot(
      contacts,
      members,
      this.permissions,
    );
  }
}

export class TelegramCrmRecipientSnapshot {
  private readonly contacts: Map<string, ContactFact>;
  private readonly members: Map<string, RecipientMember>;

  constructor(
    contacts: ContactFact[],
    members: RecipientMember[],
    private readonly permissions: OperationsNotificationPermissionService,
  ) {
    this.contacts = new Map(contacts.map((item) => [item.id, item]));
    this.members = new Map(members.map((item) => [item.id, item]));
  }

  contact(id: string | null) {
    return id ? (this.contacts.get(id) ?? null) : null;
  }

  recipient(contact: ContactFact | null) {
    const orderedIds = contact
      ? [
          contact.ownerMemberId,
          ...contact.sales.map((sale) => sale.assignedMemberId),
          this.owner()?.id,
        ]
      : [this.owner()?.id];
    const seen = new Set<string>();
    for (const id of orderedIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const member = this.members.get(id);
      if (member && this.canView(member, contact?.ownerMemberId ?? null)) {
        return member;
      }
    }
    return [...this.members.values()].find(
      (member) =>
        !seen.has(member.id) &&
        this.base(member) &&
        this.permissions.has(member, 'adSales.crm.viewAny'),
    );
  }

  incomingEnabled(member: RecipientMember) {
    const preferences = member.operationsNotificationPreference;
    return (
      (preferences?.crmNotificationsEnabled ?? true) &&
      (preferences?.crmIncomingMessagesEnabled ?? false)
    );
  }

  preferences(member: RecipientMember) {
    const preference = member.operationsNotificationPreference;
    return {
      crmNotificationsEnabled: preference?.crmNotificationsEnabled ?? true,
      crmIncomingMessagesEnabled:
        preference?.crmIncomingMessagesEnabled ?? false,
      crmMessagePreviewEnabled: preference?.crmMessagePreviewEnabled ?? false,
      crmFollowUpEnabled: preference?.crmFollowUpEnabled ?? true,
      crmAiLeadsEnabled: preference?.crmAiLeadsEnabled ?? false,
    };
  }

  previewEnabled(member: RecipientMember) {
    return (
      member.operationsNotificationPreference?.crmMessagePreviewEnabled ?? false
    );
  }

  priority(
    contact: ContactFact | null,
    now: Date,
    awaitingClientReply = false,
  ) {
    if (awaitingClientReply) return 'HIGH' as const;
    if (!contact) return 'LOW' as const;
    if (
      contact.sales.length > 0 ||
      contact.tasks.some((task) => task.dueAt < now)
    ) {
      return 'HIGH' as const;
    }
    return 'NORMAL' as const;
  }

  private owner() {
    return [...this.members.values()].find((member) => member.role === 'owner');
  }

  private base(member: OperationsNotificationMember) {
    return (
      this.permissions.canReceive(member) &&
      this.permissions.has(member, 'adSales.crm.view')
    );
  }

  private canView(
    member: OperationsNotificationMember,
    ownerMemberId: string | null,
  ) {
    if (!this.base(member)) return false;
    if (this.permissions.has(member, 'adSales.crm.viewAny')) return true;
    return Boolean(
      ownerMemberId === member.id &&
      this.permissions.has(member, 'adSales.crm.viewOwn'),
    );
  }
}
