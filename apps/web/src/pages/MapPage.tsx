import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { WorldMap } from "../components/WorldMap";
import type { EntityRow } from "../types";

export function MapPage() {
  const [tribes, setTribes] = useState<EntityRow[]>([]);
  const [settlements, setSettlements] = useState<EntityRow[]>([]);

  useEffect(() => {
    void Promise.all([apiGet<EntityRow[]>("/tribes"), apiGet<EntityRow[]>("/settlements")]).then(
      ([tribeRows, settlementRows]) => {
        setTribes(tribeRows);
        setSettlements(settlementRows);
      }
    );
  }, []);

  return (
    <div className="page-stack map-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">OpenLayers Map</p>
          <h1>大陆地图</h1>
        </div>
        <div className="status-pill">部落 · 聚落 · 东大陆</div>
      </section>

      <section className="panel map-panel-full">
        <WorldMap tribes={tribes} settlements={settlements} />
      </section>
    </div>
  );
}
