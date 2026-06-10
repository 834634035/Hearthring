import type { FieldConfig, EntityRow } from "../types";

interface EntityFormProps {
  fields: FieldConfig[];
  value: EntityRow;
  onChange: (value: EntityRow) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
}

export function EntityForm({ fields, value, onChange, onSubmit, onCancel, saving }: EntityFormProps) {
  function update(field: FieldConfig, raw: string | boolean) {
    const nextValue = field.type === "number" ? Number(raw) : raw;
    onChange({ ...value, [field.key]: nextValue });
  }

  function fieldClass(field: FieldConfig) {
    return [
      "field",
      `field-${field.type ?? "text"}`,
      field.type === "textarea" ? "field-wide" : "",
      field.required ? "field-required" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div className="editor-panel">
      <div className="form-grid">
        {fields.map((field) => (
          <label className={fieldClass(field)} key={field.key}>
            <span>{field.label}</span>
            {field.type === "textarea" ? (
              <textarea value={String(value[field.key] ?? "")} onChange={(event) => update(field, event.target.value)} rows={4} />
            ) : field.type === "boolean" ? (
              <input checked={Boolean(value[field.key])} type="checkbox" onChange={(event) => update(field, event.target.checked)} />
            ) : field.type === "select" ? (
              <select value={String(value[field.key] ?? "")} onChange={(event) => update(field, event.target.value)}>
                <option value="">未选择</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                required={field.required}
                type={field.type === "number" ? "number" : "text"}
                value={String(value[field.key] ?? "")}
                onChange={(event) => update(field, event.target.value)}
              />
            )}
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          取消
        </button>
        <button className="primary-button" disabled={saving} onClick={onSubmit} type="button">
          {saving ? "保存中" : "保存"}
        </button>
      </div>
    </div>
  );
}
