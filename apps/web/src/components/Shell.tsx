import { adminEntities } from "@tribal-epic/shared";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const icons: Record<string, ReactNode> = {
  tribes: "部",
  characters: "人",
  regions: "图",
  settlements: "火",
  resources: "石",
  creatures: "兽",
  factions: "盟",
  events: "事"
};

interface ShellProps {
  children: ReactNode;
}

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? "nav-item active" : "nav-item";
}

export function Shell({ children }: ShellProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("/")}>
          <span className="nav-symbol">火</span>
          <span>火环设定台</span>
        </button>
        <nav className="nav-list">
          <NavLink to="/" end className={navClass}>
            <span className="nav-symbol">总</span>
            <span>总览</span>
          </NavLink>
          <NavLink to="/hearth" className={navClass}>
            <span className="nav-symbol">境</span>
            <span>灰芽场景</span>
          </NavLink>
          <NavLink to="/map" className={navClass}>
            <span className="nav-symbol">陆</span>
            <span>大陆地图</span>
          </NavLink>
          <NavLink to="/account" className={navClass}>
            <span className="nav-symbol">钥</span>
            <span>账号安全</span>
          </NavLink>
          {user?.role === "admin" ? (
            <NavLink to="/users" className={navClass}>
              <span className="nav-symbol">权</span>
              <span>权限管理</span>
            </NavLink>
          ) : null}
          {adminEntities.map((entity) => (
            <NavLink key={entity.key} to={`/${entity.key}`} className={navClass} title={entity.description}>
              <span className="nav-symbol">{icons[entity.key]}</span>
              <span>{entity.title}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-auth">
          <div>
            <span>当前守火人</span>
            <strong>{user?.displayName ?? user?.username}</strong>
          </div>
          <button className="secondary-button logout-button" onClick={handleLogout}>
            登出
          </button>
        </div>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
