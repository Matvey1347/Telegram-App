import { Injectable } from '@nestjs/common';
import { GreeterAutomationEnvironment } from '@prisma/client';
import type {
  GreeterSequenceStepInput,
  GreeterTemplateContextInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { GreeterAdminService } from './greeter-admin.service';
import {
  GreeterEnrollmentService,
  type RuntimeEnrollmentInput,
} from './greeter-enrollment.service';
import { GreeterSequenceAdminService } from './greeter-sequence-admin.service';
import { GreeterAutomationTestService } from './greeter-automation-test.service';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';

export type GreeterButtonRows = Array<
  Array<{ text: string; url?: string; callbackData?: string }>
>;

@Injectable()
export class GreeterAutomationService {
  private readonly sequences: GreeterSequenceAdminService;
  private readonly enrollments: GreeterEnrollmentService;
  private readonly tests: GreeterAutomationTestService;

  constructor(
    prisma: PrismaService,
    delivery: TelegramBotDeliveryService,
    admin: GreeterAdminService,
  ) {
    this.sequences = new GreeterSequenceAdminService(prisma, admin);
    this.enrollments = new GreeterEnrollmentService(prisma, delivery);
    this.tests = new GreeterAutomationTestService(
      prisma,
      this.sequences,
      this.enrollments,
    );
  }

  listSequences(userId: string, botId: string) {
    return this.sequences.list(userId, botId);
  }

  createSequence(
    userId: string,
    botId: string,
    input: {
      name: string;
      trigger: 'AFTER_START' | 'AFTER_CAPTCHA_SUCCESS';
      channelId?: string | null;
    },
  ) {
    return this.sequences.create(userId, botId, input);
  }

  updateSequence(
    userId: string,
    botId: string,
    sequenceId: string,
    input: {
      name?: string;
      trigger?: 'AFTER_START' | 'AFTER_CAPTCHA_SUCCESS';
      enabled?: boolean;
      channelId?: string | null;
    },
  ) {
    return this.sequences.update(userId, botId, sequenceId, input);
  }

  sequenceDetail(userId: string, botId: string, sequenceId: string) {
    return this.sequences.detail(userId, botId, sequenceId);
  }

  replaceDraftSteps(
    userId: string,
    botId: string,
    sequenceId: string,
    steps: GreeterSequenceStepInput[],
    expectedRevision?: number,
  ) {
    return this.sequences.replaceDraftSteps(
      userId,
      botId,
      sequenceId,
      steps,
      expectedRevision,
    );
  }

  async publish(
    userId: string,
    botId: string,
    sequenceId: string,
    expectedRevision: number,
  ) {
    const snapshot = await this.sequences.publish(
      userId,
      botId,
      sequenceId,
      expectedRevision,
    );
    const enrollment = await this.enrollments.enrollExistingAcquisitions(
      snapshot.sequence,
      snapshot.version.id,
    );
    return { ...snapshot.view, enrollment };
  }

  versionDetail(
    userId: string,
    botId: string,
    sequenceId: string,
    versionId: string,
  ) {
    return this.sequences.versionDetail(userId, botId, sequenceId, versionId);
  }

  preview(
    userId: string,
    botId: string,
    input: GreeterTemplateContextInput & {
      messageText: string;
      buttons?: GreeterButtonRows;
    },
  ) {
    return this.sequences.preview(userId, botId, input);
  }

  lookupTesters(userId: string, botId: string, search = '') {
    return this.tests.lookupTesters(userId, botId, search);
  }

  selectTester(
    userId: string,
    botId: string,
    sequenceId: string,
    input: { telegramBotUserId: string; channelId: string; enabled?: boolean },
  ) {
    return this.tests.selectTester(userId, botId, sequenceId, input);
  }

  disableTester(userId: string, botId: string, sequenceId: string) {
    return this.tests.disableTester(userId, botId, sequenceId);
  }

  runTest(userId: string, botId: string, sequenceId: string) {
    return this.tests.run(userId, botId, sequenceId);
  }

  resetTest(userId: string, botId: string, sequenceId: string) {
    return this.tests.reset(userId, botId, sequenceId);
  }

  enrollForTrigger(input: RuntimeEnrollmentInput) {
    return this.enrollments.enrollForTrigger(
      input,
      input.environment === GreeterAutomationEnvironment.TEST
        ? (sequenceId) => this.sequences.snapshotPreview(sequenceId)
        : undefined,
    );
  }

  /** Compatibility facade for callers migrating to enrollForTrigger. */
  enroll(input: {
    workspaceId: string;
    botIntegrationId: string;
    sequenceId: string;
    versionId?: string;
    telegramBotUserId: string;
    environment: GreeterAutomationEnvironment;
    acquiredChannelId?: string | null;
    acquisitionJoinRequestId?: string;
    testRunKey?: string;
    runKey?: string;
  }) {
    return this.enrollments.enrollLegacy(input);
  }

  queueExecution(executionId: string) {
    return this.enrollments.queueExecution(executionId);
  }

  repairPendingExecutions(limit = 100) {
    return this.enrollments.repairPendingExecutions(limit);
  }

  validateButtons(buttons?: GreeterButtonRows) {
    return GreeterSequenceAdminService.validateButtons(buttons);
  }
}
