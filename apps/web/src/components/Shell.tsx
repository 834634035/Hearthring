import { adminEntities } from "@tribal-epic/shared";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

const icons: Record<string, ReactNode> = {
  tribes: "◇",
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
            <span className="nav-symbol">塘</span>
            <span>火塘场景</span>
          </NavLink>
          <NavLink to="/map" className={navClass}>
            <span className="nav-symbol">陆</span>
            <span>大陆地图</span>
          </NavLink>
          {adminEntities.map((entity) => (
            <NavLink
              key={entity.key}
              to={`/${entity.key}`}
              className={navClass}
              title={entity.description}
            >
              <span className="nav-symbol">{icons[entity.key]}</span>
              <span>{entity.title}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
