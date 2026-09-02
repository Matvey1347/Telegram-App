import { Injectable } from '@nestjs/common';
import {
  CompleteTelegramAdvertiserTaskDto,
  CreateTelegramAdvertiserActivityDto,
  CreateTelegramAdvertiserContactDto,
  CreateTelegramAdvertiserDto,
  CreateTelegramAdvertiserTaskDto,
  SkipTelegramAdvertiserTaskDto,
  TelegramAdvertiserActivitiesQueryDto,
  TelegramAdvertiserSearchDto,
  TelegramAdvertiserTasksQueryDto,
  TelegramAdvertisersQueryDto,
  UpdateTelegramAdvertiserContactDto,
  UpdateTelegramAdvertiserDto,
  UpdateTelegramAdvertiserTaskDto,
} from './dto';
import { TelegramCrmLegacyAuthorizationService } from '../telegram-crm/telegram-crm-legacy-authorization.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';
import { TelegramAdSalesCrmTasksService } from './telegram-ad-sales-crm-tasks.service';

/** RBAC facade for the compatibility advertiser/CRM routes. */
@Injectable()
export class TelegramAdSalesLegacyCrmService {
  constructor(
    private readonly service: TelegramAdSalesService,
    private readonly authorization: TelegramCrmLegacyAuthorizationService,
    private readonly tasks: TelegramAdSalesCrmTasksService,
  ) {}

  async listAdvertisers(userId: string, query: TelegramAdvertisersQueryDto) {
    const scope = await this.authorization.readScope(userId);
    return this.service.listAdvertisers(userId, {
      ...query,
      ...(scope.ownerMemberId ? { ownerMemberId: scope.ownerMemberId } : {}),
    });
  }

  async advertiserSearch(userId: string, query: TelegramAdvertiserSearchDto) {
    const scope = await this.authorization.readScope(userId);
    return this.service.advertiserSearch(userId, query, scope.ownerMemberId);
  }

  async getAdvertiserDetails(userId: string, contactId: string) {
    await this.authorization.requireReadContact(userId, contactId);
    return this.service.getAdvertiserDetails(userId, contactId);
  }

  async createAdvertiser(userId: string, dto: CreateTelegramAdvertiserDto) {
    const context = await this.authorization.createContactContext(
      userId,
      dto.ownerMemberId,
    );
    return this.service.createAdvertiser(userId, {
      ...dto,
      ownerMemberId: context.resolvedOwnerMemberId ?? undefined,
    });
  }

  async updateAdvertiser(
    userId: string,
    contactId: string,
    dto: UpdateTelegramAdvertiserDto,
  ) {
    if (dto.ownerMemberId === undefined) {
      await this.authorization.requireEditContact(userId, contactId);
    } else {
      await this.authorization.requireOwnerChange(
        userId,
        contactId,
        dto.ownerMemberId,
      );
    }
    return this.service.updateAdvertiser(userId, contactId, dto);
  }

  async archiveAdvertiser(userId: string, contactId: string) {
    await this.authorization.requireEditContact(userId, contactId);
    return this.service.archiveAdvertiser(userId, contactId);
  }

  async restoreAdvertiser(userId: string, contactId: string) {
    await this.authorization.requireEditContact(userId, contactId);
    return this.service.restoreAdvertiser(userId, contactId);
  }

  async addAdvertiserContact(
    userId: string,
    contactId: string,
    dto: CreateTelegramAdvertiserContactDto,
  ) {
    await this.authorization.requireEditContact(userId, contactId);
    return this.service.addAdvertiserContact(userId, contactId, dto);
  }

  async updateAdvertiserContact(
    userId: string,
    contactId: string,
    detailId: string,
    dto: UpdateTelegramAdvertiserContactDto,
  ) {
    await this.authorization.requireEditContact(userId, contactId);
    return this.service.updateAdvertiserContact(
      userId,
      contactId,
      detailId,
      dto,
    );
  }

  async deleteAdvertiserContact(
    userId: string,
    contactId: string,
    detailId: string,
  ) {
    await this.authorization.requireEditContact(userId, contactId);
    return this.service.deleteAdvertiserContact(userId, contactId, detailId);
  }

  async setPrimaryAdvertiserContact(
    userId: string,
    contactId: string,
    detailId: string,
  ) {
    await this.authorization.requireContactDetail(userId, contactId, detailId);
    return this.service.setPrimaryAdvertiserContact(
      userId,
      contactId,
      detailId,
    );
  }

  async listAdvertiserActivities(
    userId: string,
    contactId: string,
    query: TelegramAdvertiserActivitiesQueryDto,
  ) {
    await this.authorization.requireReadContact(userId, contactId);
    return this.service.listAdvertiserActivities(userId, contactId, query);
  }

  async createAdvertiserActivityEntry(
    userId: string,
    contactId: string,
    dto: CreateTelegramAdvertiserActivityDto,
  ) {
    await this.authorization.requireEditContact(userId, contactId);
    return this.service.createAdvertiserActivityEntry(userId, contactId, dto);
  }

  async createAdvertiserNote(
    userId: string,
    contactId: string,
    dto: CreateTelegramAdvertiserActivityDto,
  ) {
    await this.authorization.requireEditContact(userId, contactId);
    return this.service.createAdvertiserNote(userId, contactId, dto);
  }

  async listCrmTasks(userId: string, query: TelegramAdvertiserTasksQueryDto) {
    const scope = await this.authorization.readScope(userId);
    return this.tasks.list(userId, query, scope.ownerMemberId);
  }

  async createAdvertiserTask(
    userId: string,
    contactId: string,
    dto: CreateTelegramAdvertiserTaskDto,
  ) {
    await this.authorization.requireEditContact(userId, contactId);
    return this.tasks.create(userId, contactId, dto);
  }

  async updateCrmTask(
    userId: string,
    taskId: string,
    dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    await this.authorization.requireEditTask(userId, taskId);
    return this.tasks.update(userId, taskId, dto);
  }

  async completeCrmTask(
    userId: string,
    taskId: string,
    dto: CompleteTelegramAdvertiserTaskDto,
  ) {
    await this.authorization.requireEditTask(userId, taskId);
    return this.tasks.complete(userId, taskId, dto);
  }

  async snoozeCrmTask(
    userId: string,
    taskId: string,
    dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    await this.authorization.requireEditTask(userId, taskId);
    return this.tasks.snooze(userId, taskId, dto);
  }

  async skipCrmTask(
    userId: string,
    taskId: string,
    dto: SkipTelegramAdvertiserTaskDto,
  ) {
    await this.authorization.requireEditTask(userId, taskId);
    return this.tasks.skip(userId, taskId, dto);
  }
}
