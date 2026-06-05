export type EntityRow = Record<string, string | number | boolean | null | undefined>;

export interface DashboardData {
  counts: Record<string, number>;
  strongTribes: EntityRow[];
}

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select";

export interface FieldConfig {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  required?: boolean;
}
