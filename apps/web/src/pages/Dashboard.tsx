import { adminEntities } from "@tribal-epic/shared";
import type { EChartsOption } from "echarts";
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import { EChart } from "../components/EChart";
import type { DashboardData, TimelineEvent } from "../types";

const entityBadges: Record<string, string> = {
  tribes: "TR",
  characters: "NPC",
  regions: "MAP",
  settlements: "SET",
  resources: "RES",
  creatures: "BST",
  factions: "FAC",
  events: "EVT"
};

export function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    void apiGet<DashboardData>("/dashboard").then(setDashboard);
  }, []);

  const continentOption = useMemo(() => createContinentOption(dashboard), [dashboard]);
  const ageOption = useMemo(() => createAgeOption(dashboard), [dashboard]);
  const tribeOption = useMemo(() => createTribeOption(dashboard), [dashboard]);
  const timelineOption = useMemo(() => createTimelineOption(dashboard), [dashboard]);

  return (
    <div className="page-stack dashboard-page">
      <section className="page-header dashboard-hero">
        <div>
          <p className="eyebrow">Tribal Epic Admin</p>
          <h1>东大陆内容管理与原型控制台</h1>
          <p className="dashboard-subtitle">人口、部落、编年史与资源设定的总览。</p>
        </div>
        <div className="status-pill">MySQL 本地库</div>
      </section>

      <section className="metric-grid">
        <div className="metric metric-population">
          <StatBadge label="POP" />
          <span>大陆登记人口</span>
          <strong>{formatNumber(dashboard?.totalPopulation ?? 0)}</strong>
        </div>
        {adminEntities.map((entity) => (
          <div className="metric" key={entity.key}>
            <StatBadge label={entityBadges[entity.key] ?? "DAT"} />
            <span>{entity.title}</span>
            <strong>{dashboard?.counts[entity.key] ?? 0}</strong>
          </div>
        ))}
        <div className="metric accent">
          <StatBadge label="KING" />
          <span>王兽</span>
          <strong>{dashboard?.counts.kingBeasts ?? 0}</strong>
        </div>
      </section>

      <section className="dashboard-insight-grid">
        <article className="panel population-panel">
          <div className="panel-title">
            <div>
              <h2>大陆人口</h2>
              <span>按部落所属大陆汇总</span>
            </div>
            <strong className="panel-stat">{formatNumber(dashboard?.totalPopulation ?? 0)}</strong>
          </div>
          <EChart option={continentOption} className="echart echart-medium" ariaLabel="大陆人口图表" />
        </article>

        <article className="panel age-panel">
          <div className="panel-title">
            <div>
              <h2>年龄分布</h2>
              <span>基于总人口的社会结构估算</span>
            </div>
          </div>
          <EChart option={ageOption} className="echart echart-medium" ariaLabel="年龄分布图表" />
        </article>
      </section>

      <section className="dashboard-main-grid">
        <article className="panel">
          <div className="panel-title">
            <div>
              <h2>部落人口排行</h2>
              <span>用于快速判断势力规模与地图密度</span>
            </div>
            <strong className="panel-stat">{dashboard?.tribePopulations?.length ?? 0}</strong>
          </div>
          <EChart option={tribeOption} className="echart echart-large" ariaLabel="部落人口排行图表" />
        </article>

        <article className="panel timeline-panel">
          <div className="panel-title">
            <div>
              <h2>时间线编年史</h2>
              <span>事件类型分布与最近维护节点</span>
            </div>
          </div>
          <EChart option={timelineOption} className="echart echart-small" ariaLabel="编年史事件类型图表" />
          <Timeline events={dashboard?.timeline ?? []} />
        </article>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>强部落态势</h2>
            <span>强度 4 以上的重点势力</span>
          </div>
        </div>
        <div className="strong-list">
          {(dashboard?.strongTribes ?? []).map((tribe) => (
            <div className="strong-item" key={String(tribe.id)}>
              <strong>{tribe.name}</strong>
              <span>{tribe.region}</span>
              <span>强度 {tribe.strengthLevel}</span>
              <p>{tribe.stance}</p>
            </div>
          ))}
          {!dashboard?.strongTribes?.length && <div className="empty-state">暂无强部落数据</div>}
        </div>
      </section>
    </div>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <div className="empty-state">暂无编年史事件</div>;

  return (
    <ol className="timeline-list">
      {events.map((event, index) => (
        <li className="timeline-item" key={`${event.title}-${index}`}>
          <div className="timeline-marker" />
          <div>
            <span className="timeline-meta">
              {event.act || "未分幕"} · {event.region || "未知地域"}
            </span>
            <strong>{event.title}</strong>
            <p>{event.eventType}{event.description ? ` · ${clipText(event.description, 42)}` : ""}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function StatBadge({ label }: { label: string }) {
  return (
    <span className="metric-badge" aria-hidden="true">
      {label}
    </span>
  );
}

function createContinentOption(dashboard: DashboardData | null): EChartsOption {
  const data = dashboard?.continentPopulation?.map((item) => ({
    name: item.continent,
    value: item.population
  })) ?? [];

  return {
    color: ["#2d6559", "#8f4f35", "#293c5c", "#c58b58", "#6b9b73"],
    tooltip: { trigger: "item", valueFormatter: (value) => formatNumber(Number(value)) },
    legend: { bottom: 0, left: "center", itemWidth: 10, itemHeight: 10, textStyle: { color: "#5d665d" } },
    series: [
      {
        type: "pie",
        radius: ["48%", "72%"],
        center: ["50%", "42%"],
        avoidLabelOverlap: true,
        label: { formatter: "{b}\n{d}%", color: "#253632", fontSize: 12 },
        labelLine: { length: 10, length2: 8 },
        data
      }
    ]
  };
}

function createAgeOption(dashboard: DashboardData | null): EChartsOption {
  const items = dashboard?.ageDistribution ?? [];
  return {
    color: ["#2d6559", "#6b9b73", "#c58b58", "#8f4f35"],
    tooltip: { trigger: "item", valueFormatter: (value) => formatNumber(Number(value)) },
    legend: { bottom: 0, left: "center", itemWidth: 10, itemHeight: 10, textStyle: { color: "#5d665d" } },
    series: [
      {
        type: "pie",
        radius: ["42%", "70%"],
        center: ["50%", "42%"],
        label: { formatter: "{b} {d}%", color: "#253632" },
        data: items.map((item) => ({ name: item.label, value: item.value }))
      }
    ]
  };
}

function createTribeOption(dashboard: DashboardData | null): EChartsOption {
  const tribes = [...(dashboard?.tribePopulations ?? [])].reverse();
  return {
    color: ["#8f4f35"],
    grid: { left: 72, right: 56, top: 10, bottom: 28 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value) => formatNumber(Number(value)) },
    xAxis: {
      type: "value",
      axisLabel: { color: "#5d665d" },
      splitLine: { lineStyle: { color: "#e3e2d7" } }
    },
    yAxis: {
      type: "category",
      data: tribes.map((tribe) => tribe.name),
      axisLabel: { color: "#253632", width: 64, overflow: "truncate" },
      axisTick: { show: false },
      axisLine: { show: false }
    },
    series: [
      {
        type: "bar",
        data: tribes.map((tribe) => tribe.population),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 7, 7, 0] },
        label: {
          show: true,
          position: "right",
          color: "#5d665d",
          formatter: ({ value }) => formatNumber(Number(value))
        }
      }
    ]
  };
}

function createTimelineOption(dashboard: DashboardData | null): EChartsOption {
  const counts = new Map<string, number>();
  (dashboard?.timeline ?? []).forEach((event) => {
    const key = event.eventType || "未分类";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()];

  return {
    color: ["#293c5c"],
    grid: { left: 28, right: 16, top: 12, bottom: 36 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: entries.map(([name]) => name),
      axisLabel: { color: "#5d665d", interval: 0, rotate: entries.length > 3 ? 18 : 0 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#d9d8ca" } }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: "#5d665d" },
      splitLine: { lineStyle: { color: "#e3e2d7" } }
    },
    series: [
      {
        type: "bar",
        data: entries.map(([, count]) => count),
        barMaxWidth: 28,
        itemStyle: { borderRadius: [6, 6, 0, 0] }
      }
    ]
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function clipText(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}
