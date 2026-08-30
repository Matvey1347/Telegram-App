import { WorkspaceService } from '../../common/workspace.service';
import { WorkspaceAuthorizationService } from '../workspace/workspace-authorization/workspace-authorization.service';

// Compatibility for older directly-constructed unit tests. Nest always injects
// the real request-scoped provider in production.
export function financeAuthorizationTestFallback(
  workspaceService: WorkspaceService,
): WorkspaceAuthorizationService {
  const context = async (userId: string) => ({
    userId,
    workspaceId: await workspaceService.resolveWorkspaceIdForUser(userId),
    memberId: 'legacy-test-member',
    roleId: null,
    roleVersion: 0,
    isOwner: false,
    permissionKeys: [],
    featureIds: [],
  });
  return {
    context,
    can: async () => false,
    require: async (userId: string) => context(userId),
    requireOwnOrAny: async (userId: string) => context(userId),
    scope: async () => ({}),
  } as unknown as WorkspaceAuthorizationService;
}
