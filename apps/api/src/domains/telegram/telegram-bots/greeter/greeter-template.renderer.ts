export type GreeterTemplateContext = {
  channel: { title: string; username?: string | null };
  user: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
  };
  captcha?: { answer?: string | null };
};

export const GREETER_TEMPLATE_VARIABLES = [
  'channel.title',
  'channel.username',
  'user.firstName',
  'user.username',
  'user.displayName',
  'captcha.answer',
] as const;

const templateVariableSet = new Set<string>(GREETER_TEMPLATE_VARIABLES);

export function findInvalidGreeterTemplateVariables(template: string) {
  const invalid = new Set<string>();
  for (const match of template.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
    const key = match[1].trim();
    if (!templateVariableSet.has(key)) invalid.add(key);
  }
  return [...invalid];
}

export function assertValidGreeterTemplate(template: string) {
  const invalid = findInvalidGreeterTemplateVariables(template);
  if (invalid.length) {
    throw new Error(
      `Unsupported Greeter template variables: ${invalid.join(', ')}`,
    );
  }
}

/** A deliberately small, allowlisted interpolation language for Bot API text. */
export function renderGreeterTemplate(
  template: string,
  context: GreeterTemplateContext,
) {
  assertValidGreeterTemplate(template);
  const displayName =
    [context.user.firstName, context.user.lastName].filter(Boolean).join(' ') ||
    context.user.username ||
    'there';
  const values: Record<string, string> = {
    'channel.title': context.channel.title,
    'channel.username': context.channel.username
      ? `@${context.channel.username.replace(/^@/, '')}`
      : context.channel.title,
    'user.firstName': context.user.firstName || displayName,
    'user.username': context.user.username
      ? `@${context.user.username.replace(/^@/, '')}`
      : displayName,
    'user.displayName': displayName,
    'captcha.answer': context.captcha?.answer || '',
  };
  return template.replace(
    /{{\s*([\w.]+)\s*}}/g,
    (_, key: string) => values[key] ?? '',
  );
}
