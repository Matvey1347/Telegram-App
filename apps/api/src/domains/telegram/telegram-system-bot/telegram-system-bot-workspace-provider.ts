import { ContextIdFactory, type ModuleRef } from '@nestjs/core';

export function resolveSystemBotWorkspaceProvider<T>(
  moduleRef: ModuleRef,
  provider: new (...args: never[]) => T,
  workspaceId: string,
) {
  const contextId = ContextIdFactory.create();
  moduleRef.registerRequestByContextId(
    { headers: { 'x-workspace-id': workspaceId } },
    contextId,
  );
  return moduleRef.resolve(provider, contextId, { strict: false });
}
