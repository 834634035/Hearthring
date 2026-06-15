import { canWriteContent, type CrudEntity } from "@tribal-epic/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiSave } from "../api";
import { useAuth } from "../auth";
import { DataTable } from "../components/DataTable";
import { EntityForm } from "../components/EntityForm";
import { Modal } from "../components/Modal";
import { entityLabels, fieldConfigs, tableColumns } from "../entityConfig";
import type { EntityRow } from "../types";

interface AdminPageProps {
  entity: CrudEntity;
}

export function AdminPage({ entity }: AdminPageProps) {
  const { user } = useAuth();
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EntityRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fields = fieldConfigs[entity];
  const columns = tableColumns[entity];
  const title = entityLabels[entity];
  const canWrite = user ? canWriteContent(user.role) : false;

  const emptyRow = useMemo(() => {
    const row: EntityRow = {};
    fields.forEach((field) => {
      if (field.type === "number") row[field.key] = 0;
      else if (field.type === "boolean") row[field.key] = false;
      else row[field.key] = "";
    });
    return row;
  }, [fields]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await apiGet<EntityRow[]>(`/${entity}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    setEditing(null);
    setIsCreating(false);
    void loadRows();
  }, [loadRows]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const { id, createdAt, updatedAt, ...payload } = editing;
      await apiSave(entity, payload, isCreating ? undefined : Number(id));
      setEditing(null);
      setIsCreating(false);
      await loadRows();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: EntityRow) {
    if (!window.confirm(`确认删除「${row.name ?? row.title}」？`)) return;
    setError("");
    try {
      await apiDelete(entity, Number(row.id));
      await loadRows();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    }
  }

  function closeEditor() {
    setEditing(null);
    setIsCreating(false);
  }

  const editorOpen = Boolean(editing);
  const editorTitle = isCreating ? `新增${title}` : `编辑${title}`;
  const editorSubtitle = isCreating ? "填写设定条目，保存后会同步到内容表。" : "调整现有条目，保存后会刷新列表。";

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Content Admin</p>
          <h1>{title}管理</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => void loadRows()} disabled={loading}>
            刷新
          </button>
          <button
            className="primary-button"
            disabled={!canWrite}
            onClick={() => {
              setEditing(emptyRow);
              setIsCreating(true);
            }}
          >
            新增
          </button>
        </div>
      </section>

      {error && <div className="error-line">{error}</div>}

      <Modal open={editorOpen} title={editorTitle} subtitle={editorSubtitle} onClose={closeEditor}>
        {editing && (
          <EntityForm
            fields={fields}
            value={editing}
            onChange={setEditing}
            onSubmit={save}
            onCancel={closeEditor}
            saving={saving}
            inModal
          />
        )}
      </Modal>

      <section className="panel">
        <DataTable
          columns={columns}
          rows={rows}
          onEdit={canWrite ? (row) => {
            setIsCreating(false);
            setEditing(row);
          } : undefined}
          onDelete={canWrite ? remove : undefined}
        />
      </section>
    </div>
  );
}
