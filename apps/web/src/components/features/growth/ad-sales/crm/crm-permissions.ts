import type { EffectiveWorkspaceAccess } from "@telegram-system/shared";

const key = (capability: string) => `adSales.crm.${capability}`;

export function crmPermissions(access?: EffectiveWorkspaceAccess) {
  const permissions = new Set(access?.permissionKeys ?? []);
  const owner = access?.isOwner === true;
  const has = (capability: string) => owner || permissions.has(key(capability));
  return {
    canViewOwn: has("viewOwn"),
    canViewAll: has("viewAny"),
    canEditOwn: has("editOwn"),
    canEditAll: has("editAny") || has("manage"),
    canSendManual: has("sendManualMessages"),
    canViewSales: owner || permissions.has("adSales.sales.view"),
    canCreateSales:
      owner || permissions.has("adSales.sales.create") || permissions.has("adSales.sales.manage"),
    canRegisterPayment:
      owner || permissions.has("adSales.sales.registerPayment"),
  };
}
