import { adminEntities } from "@tribal-epic/shared";
import { useEffect, useState } from "react";
import { apiGet } from "../api";
import type { DashboardData } from "../types";

export function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    void apiGet<DashboardData>("/dashboard").then(setDashboard);
  }, []);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Tribal Epic Admin</p>
          <h1>东大陆内容管理与原型控制台</h1>
        </div>
        <div className="status-pill">MySQL 本地库</div>
      </section>

      <section className="metric-grid">
        {adminEntities.slice(0, 6).map((entity) => (
          <div className="metric" key={entity.key}>
            <span>{entity.title}</span>
            <strong>{dashboard?.counts[entity.key] ?? 0}</strong>
          </div>
        ))}
        <div className="metric accent">
          <span>王兽</span>
          <strong>{dashboard?.counts.kingBeasts ?? 0}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>强部落态势</h2>
          <span>赤牙不是唯一强权</span>
        </div>
        <div className="strong-list">
          {dashboard?.strongTribes.map((tribe) => (
            <div className="strong-item" key={String(tribe.id)}>
              <strong>{tribe.name}</strong>
              <span>{tribe.region}</span>
              <span>强度 {tribe.strengthLevel}</span>
              <p>{tribe.stance}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
