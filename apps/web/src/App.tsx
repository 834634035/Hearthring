import { adminEntities } from "@tribal-epic/shared";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { ChapterPlanPage } from "./pages/ChapterPlanPage";
import { Dashboard } from "./pages/Dashboard";
import { LoginPage } from "./pages/LoginPage";
import { MapPage } from "./pages/MapPage";
import { TribeRelationsPage } from "./pages/TribeRelationsPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="auth-loading">守火人正在辨认来客...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={user ? (
          <Shell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/tribe-relations" element={<TribeRelationsPage />} />
              <Route path="/chapter-plan" element={<ChapterPlanPage />} />
              {adminEntities.map((entity) => (
                <Route key={entity.key} path={`/${entity.key}`} element={<AdminPage entity={entity.key} />} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
        ) : (
          <Navigate to="/login" replace />
        )}
      />
    </Routes>
  );
}
