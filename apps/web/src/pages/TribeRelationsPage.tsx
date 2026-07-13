import { TribeRelationCanvas } from "../components/TribeRelationCanvas";

export function TribeRelationsPage() {
  return (
    <div className="page-stack tribe-relations-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">World Graph</p>
          <h1>部落关系图</h1>
          <p className="dashboard-subtitle">Canvas 图结构视图：点击节点查看关系，筛选按钮切换连线类型。</p>
        </div>
        <div className="status-pill">Canvas 图结构</div>
      </section>

      <TribeRelationCanvas />
    </div>
  );
}
