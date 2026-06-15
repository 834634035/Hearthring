export const CRUD_ENTITIES = [
  "tribes",
  "characters",
  "regions",
  "settlements",
  "resources",
  "creatures",
  "factions",
  "events",
  "artifacts"
] as const;

export type CrudEntity = (typeof CRUD_ENTITIES)[number];

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select";

export interface FieldConfig {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  required?: boolean;
  /** MySQL 列定义，省略时由 schema.ts 按类型推断 */
  column?: string;
}

export interface EntityDefinition {
  label: string;
  description: string;
  tableName: string;
  fields: FieldConfig[];
  tableColumns: string[];
}

export interface AdminEntityConfig {
  key: CrudEntity;
  title: string;
  description: string;
}

export interface TableColumn {
  key: string;
  label: string;
}
