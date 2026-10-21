const toCamel = (key) => key.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());

export function camelizeKeys(value) {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [toCamel(k), camelizeKeys(v)]));
  }
  return value;
}

/** Copies the defined camelCase fields of `dto` into a snake_case row using `mapping`. */
export function toRow(dto, mapping) {
  const row = {};
  for (const [camel, snake] of Object.entries(mapping)) {
    if (dto[camel] !== undefined) row[snake] = dto[camel];
  }
  return row;
}
