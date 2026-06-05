import { adminEntities } from "@tribal-epic/shared";
import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AdminPage } from "./pages/AdminPage";
import { Dashboard } from "./pages/Dashboard";
import { HearthPage } from "./pages/HearthPage";
import { MapPage } from "./pages/MapPage";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/hearth" element={<HearthPage />} />
        <Route path="/map" element={<MapPage />} />
        {adminEntities.map((entity) => (
          <Route key={entity.key} path={`/${entity.key}`} element={<AdminPage entity={entity.key} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
