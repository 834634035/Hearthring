import { entityDefinitions } from "./definitions.ts";
import { CRUD_ENTITIES, type CrudEntity, type FieldConfig } from "./types.ts";

function resolveColumn(entity: CrudEntity, field: FieldConfig) {
  if (field.column) return field.column;

  const key = field.key;

  if (field.type === "textarea") return "TEXT NOT NULL";
  if (field.type === "boolean") return "BOOLEAN NOT NULL DEFAULT FALSE";

  if (field.type === "number") {
    if (key === "mapZoom") return "DOUBLE NOT NULL DEFAULT 1";
    if (key === "coordinatesX" || key === "coordinatesY" || key === "mapX" || key === "mapY") {
      return "DOUBLE NOT NULL";
    }
    if (key === "secretLevel") return "INT NOT NULL DEFAULT 1";
    if (key === "population") {
      if (entity === "settlements") return "INT NOT NULL DEFAULT 120";
      if (entity === "tribes") return "INT NOT NULL DEFAULT 300";
      return "INT NOT NULL DEFAULT 0";
    }
    if (key === "dangerLevel" || key === "rarity") return "INT NOT NULL DEFAULT 3";
    if (key === "strengthLevel") return "INT NOT NULL DEFAULT 3";
    return "INT NOT NULL DEFAULT 0";
  }

  if (entity === "events" && key === "title") return "VARCHAR(160) NOT NULL UNIQUE";
  if (key === "name") return "VARCHAR(120) NOT NULL UNIQUE";
  if (key === "role" && entity === "characters") return "VARCHAR(160) NOT NULL";
  if (key === "region") {
    if (entity === "resources" || entity === "creatures") return "VARCHAR(180) NOT NULL";
    if (entity === "events") return "VARCHAR(160) NOT NULL";
    return "VARCHAR(120) NOT NULL";
  }
  if (key === "continent") return "VARCHAR(80) NOT NULL";
  if (key === "factionType" && entity === "tribes") return "VARCHAR(80) NOT NULL DEFAULT '部落'";
  if (key === "hearthState" || key === "fireStatus") return "VARCHAR(80) NOT NULL";

  return "VARCHAR(120) NOT NULL";
}

export function buildEntityCreateTableSql(entity: CrudEntity) {
  const definition = entityDefinitions[entity];
  const fieldSql = definition.fields
    .map((field) => `      ${field.key} ${resolveColumn(entity, field)}`)
    .join(",\n");

  return `CREATE TABLE IF NOT EXISTS ${definition.tableName} (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
${fieldSql},
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;
}

export function buildEntityTablesSql() {
  return CRUD_ENTITIES.map((entity) => buildEntityCreateTableSql(entity));
}
