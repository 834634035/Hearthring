import { ThreeHearthScene } from "../components/ThreeHearthScene";

export function HearthPage() {
  return (
    <div className="page-stack hearth-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Three.js Prototype</p>
          <h1>灰芽部落基础场景</h1>
        </div>
        <div className="status-pill">火塘 · 火种 · 鹿角旁支聚落</div>
      </section>

      <section className="panel hearth-panel">
        <ThreeHearthScene />
      </section>
    </div>
  );
}
