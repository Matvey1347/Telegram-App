import { BadRequestException } from '@nestjs/common';
import {
  CRM_AUTOMATION_OVERRIDES,
  CRM_CUSTOMER_AUTOMATION_TYPES,
  type CrmAutomationOverride,
  type CrmCustomerAutomationType,
} from '@telegram-system/shared';

export function validateCrmAutomationTypeOverrides(
  value: unknown,
): Partial<Record<CrmCustomerAutomationType, CrmAutomationOverride>> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(
      'Automation type overrides must be an object',
    );
  }
  const result: Partial<
    Record<CrmCustomerAutomationType, CrmAutomationOverride>
  > = {};
  for (const [key, override] of Object.entries(value)) {
    if (
      !CRM_CUSTOMER_AUTOMATION_TYPES.includes(
        key as CrmCustomerAutomationType,
      ) ||
      !CRM_AUTOMATION_OVERRIDES.includes(override as CrmAutomationOverride)
    ) {
      throw new BadRequestException('Invalid automation type override');
    }
    result[key as CrmCustomerAutomationType] =
      override as CrmAutomationOverride;
  }
  return result;
}
