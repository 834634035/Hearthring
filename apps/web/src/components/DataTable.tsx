import type { EntityRow } from "../types";

interface DataTableProps {
  columns: string[];
  rows: EntityRow[];
  onEdit?: (row: EntityRow) => void;
  onDelete?: (row: EntityRow) => void;
}

export function DataTable({ columns, rows, onEdit, onDelete }: DataTableProps) {
  const hasActions = Boolean(onEdit || onDelete);

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
            {hasActions && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              {columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
              {hasActions && (
                <td>
                  <div className="row-actions">
                    {onEdit && (
                      <button className="icon-button" title="编辑" onClick={() => onEdit(row)}>
                        改
                      </button>
                    )}
                    {onDelete && (
                      <button className="icon-button danger" title="删除" onClick={() => onDelete(row)}>
                        删
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty-state">暂无数据</div>}
    </div>
  );
}

function formatCell(value: EntityRow[string]) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined || value === "") return "-";
  const text = String(value);
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}
