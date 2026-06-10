import { entityDefinitions } from "./definitions.ts";
import type { AdminEntityConfig, CrudEntity, FieldConfig, TableColumn } from "./types.ts";
import { CRUD_ENTITIES } from "./types.ts";

export { CRUD_ENTITIES, entityDefinitions };
export { buildEntityCreateTableSql, buildEntityTablesSql } from "./schema.ts";
export type { AdminEntityConfig, CrudEntity, EntityDefinition, FieldConfig, FieldType, TableColumn } from "./types.ts";

export const crudEntities: CrudEntity[] = [...CRUD_ENTITIES];

export const adminEntities: AdminEntityConfig[] = crudEntities.map((key) => ({
  key,
  title: entityDefinitions[key].label,
  description: entityDefinitions[key].description
}));

export const entityLabels = Object.fromEntries(
  crudEntities.map((key) => [key, entityDefinitions[key].label])
) as Record<CrudEntity, string>;

export const fieldConfigs = Object.fromEntries(
  crudEntities.map((key) => [key, entityDefinitions[key].fields])
) as Record<CrudEntity, FieldConfig[]>;

export const tableColumns = Object.fromEntries(
  crudEntities.map((key) => {
    const definition = entityDefinitions[key];
    const labelByKey = Object.fromEntries(definition.fields.map((field) => [field.key, field.label]));
    return [
      key,
      definition.tableColumns.map((columnKey) => ({
        key: columnKey,
        label: labelByKey[columnKey] ?? columnKey
      }))
    ];
  })
) as Record<CrudEntity, TableColumn[]>;

/** API 允许读写的字段白名单 */
export const entityFieldKeys = Object.fromEntries(
  crudEntities.map((key) => [key, entityDefinitions[key].fields.map((field) => field.key)])
) as Record<CrudEntity, string[]>;

/** API 实体 key → MySQL 表名 */
export const entityTableNames = Object.fromEntries(
  crudEntities.map((key) => [key, entityDefinitions[key].tableName])
) as Record<CrudEntity, string>;
