export type TitleTemplateValues = Readonly<
  Record<string, string | null | undefined>
>;

const TITLE_TOKEN_PATTERN = /\[([a-z][a-z0-9-]*)\]/gi;

/**
 * Resolves every known built-in token in a title. Unknown tokens are preserved
 * so drafts created by a newer client are not corrupted by an older one.
 */
export function resolveTitleTemplate(
  templateValue: string | null | undefined,
  values: TitleTemplateValues,
) {
  const template = String(templateValue ?? "").trim();
  if (!template) return "";

  const normalizedValues = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name.toLocaleLowerCase(),
      String(value ?? ""),
    ]),
  );

  return template
    .replace(TITLE_TOKEN_PATTERN, (token, name: string) => {
      const normalizedName = name.toLocaleLowerCase();
      return Object.prototype.hasOwnProperty.call(
        normalizedValues,
        normalizedName,
      )
        ? normalizedValues[normalizedName]
        : token;
    })
    .trim();
}
