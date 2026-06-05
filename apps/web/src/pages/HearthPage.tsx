import { ThreeHearthScene } from "../components/ThreeHearthScene";

export function HearthPage() {
  return (
    <div className="page-stack hearth-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Three.js Prototype</p>
          <h1>火塘场景</h1>
        </div>
        <div className="status-pill">石环 · 曜石 · 归海余火</div>
      </section>

      <section className="panel hearth-panel">
        <ThreeHearthScene />
      </section>
    </div>
  );
}
