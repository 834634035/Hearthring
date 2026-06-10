import { useCallback, useEffect, useState } from "react";
import { canWriteContent } from "@tribal-epic/shared";
import { apiGet, apiSave } from "../api";
import { useAuth } from "../auth";
import { WorldMap } from "../components/WorldMap";
import type { EntityRow } from "../types";

export function MapPage() {
  const { user } = useAuth();
  const [tribes, setTribes] = useState<EntityRow[]>([]);
  const [settlements, setSettlements] = useState<EntityRow[]>([]);
  const canEditTribes = user ? canWriteContent(user.role) : false;

  useEffect(() => {
    void Promise.all([apiGet<EntityRow[]>("/tribes"), apiGet<EntityRow[]>("/settlements")]).then(
      ([tribeRows, settlementRows]) => {
        setTribes(tribeRows);
        setSettlements(settlementRows);
      }
    );
  }, []);

  const handleTribeCoordinatesChange = useCallback(
    async (tribeId: number, coordinatesX: number, coordinatesY: number) => {
      await apiSave("tribes", { coordinatesX, coordinatesY }, tribeId);
      setTribes((rows) =>
        rows.map((row) => (Number(row.id) === tribeId ? { ...row, coordinatesX, coordinatesY } : row))
      );
    },
    []
  );

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
        <WorldMap
          tribes={tribes}
          settlements={settlements}
          canEditTribes={canEditTribes}
          onTribeCoordinatesChange={handleTribeCoordinatesChange}
        />
      </section>
    </div>
  );
}
