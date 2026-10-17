const FINANCE_FLOW_SELECTION_ACTIONS = new Set([
  'account',
  'category',
  'parent',
  'type',
  'currency',
  'language',
  'page',
  'emoji',
]);

const FINANCE_FLOW_ENTITY_ACTIONS = new Set([
  'edit-account',
  'edit-category',
  'archive-category',
]);

export function parseFinanceFlowCallback(value: string) {
  const [, , action, argument] = value.split(':');
  const separator = argument?.indexOf('.') ?? -1;
  const selectionAction = FINANCE_FLOW_SELECTION_ACTIONS.has(action);
  const revision =
    separator >= 0
      ? argument.slice(0, separator)
      : selectionAction
        ? undefined
        : argument;
  const callbackId =
    separator >= 0
      ? argument.slice(separator + 1)
      : selectionAction
        ? argument
        : undefined;
  return {
    action,
    revision,
    callbackId,
    entityId: FINANCE_FLOW_ENTITY_ACTIONS.has(action) ? argument : callbackId,
  };
}
