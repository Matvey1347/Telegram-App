export function searchText(value: unknown) {
  return String(value ?? '').trim();
}

function contains(query: string) {
  return { contains: query, mode: 'insensitive' as const };
}

function queryVariants(query: string) {
  return Array.from(
    new Set(
      [query, query.toLocaleLowerCase(), query.toLocaleUpperCase()].filter(
        Boolean,
      ),
    ),
  );
}

export function textMatches(field: string, query: string) {
  return queryVariants(query).map((variant) => ({
    [field]: contains(variant),
  }));
}

export function relationTextMatches(
  relation: string,
  field: string,
  query: string,
) {
  return queryVariants(query).map((variant) => ({
    [relation]: { is: { [field]: contains(variant) } },
  }));
}

export function canSearchFeature(
  featureIds: readonly string[],
  featureId: string,
  permissionKeys: readonly string[] = [],
) {
  if (!featureIds.includes(featureId)) return false;
  const permissions = new Set(permissionKeys);
  const ownOnly =
    (permissions.has(`${featureId}.editOwn`) ||
      permissions.has(`${featureId}.deleteOwn`)) &&
    !permissions.has(`${featureId}.editAny`) &&
    !permissions.has(`${featureId}.deleteAny`) &&
    !permissions.has(`${featureId}.manage`);
  // Search currently has workspace-wide read models. Until each repository has
  // an ownership predicate, omit own-only features rather than leak other data.
  return !ownOnly;
}
