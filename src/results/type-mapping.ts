export function trinoTypeToAthenaType(type: string): string {
  const normalized = type.toLowerCase();

  if (normalized.startsWith("decimal(")) {
    return "decimal";
  }
  if (normalized.startsWith("array(")) {
    return "array";
  }
  if (normalized.startsWith("map(")) {
    return "map";
  }
  if (normalized.startsWith("row(")) {
    return "row";
  }

  switch (normalized) {
    case "integer":
      return "integer";
    case "real":
      return "float";
    default:
      return normalized;
  }
}
