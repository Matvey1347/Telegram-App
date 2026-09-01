import { describe, expect, it } from "vitest";
import { crmPermissions } from "./crm-permissions";

const access = (permissionKeys: string[], isOwner = false) => ({
  roleId: "role-1",
  roleVersion: 1,
  isOwner,
  permissionKeys,
  featureIds: ["adSales.crm"],
});

describe("crmPermissions", () => {
  it("keeps own, all, manual-send and automation capabilities independent", () => {
    const permissions = crmPermissions(access([
      "adSales.crm.viewOwn",
      "adSales.crm.editOwn",
      "adSales.crm.sendManualMessages",
    ]));

    expect(permissions).toMatchObject({
      canViewOwn: true,
      canViewAll: false,
      canEditOwn: true,
      canEditAll: false,
      canSendManual: true,
      canManageAutomation: false,
    });
  });

  it("grants the complete capability set to the workspace owner", () => {
    expect(crmPermissions(access([], true))).toMatchObject({
      canViewOwn: true,
      canViewAll: true,
      canEditOwn: true,
      canEditAll: true,
      canSendManual: true,
      canManageAutomation: true,
      canViewSales: true,
      canCreateSales: true,
      canRegisterPayment: true,
    });
  });

  it("does not treat the base feature grant as an ownership scope", () => {
    expect(crmPermissions(access(["adSales.crm.view"]))).toMatchObject({
      canViewOwn: false,
      canViewAll: false,
    });
  });
});
