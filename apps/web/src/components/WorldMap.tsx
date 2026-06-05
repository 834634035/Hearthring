/**
 * 东大陆静态底图 + 部落标记。
 * 使用自定义像素投影，坐标来自数据库中的 coordinatesX/Y（0–100 百分比）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import { defaults as defaultControls } from "ol/control/defaults";
import Point from "ol/geom/Point";
import ImageLayer from "ol/layer/Image";
import VectorLayer from "ol/layer/Vector";
import { unByKey } from "ol/Observable";
import Projection from "ol/proj/Projection";
import ImageStatic from "ol/source/ImageStatic";
import VectorSource from "ol/source/Vector";
import { Icon, Style } from "ol/style";
import { getCenter } from "ol/extent";
import type { EntityRow } from "../types";

interface WorldMapProps {
  tribes: EntityRow[];
  /** 预留：后续可在地图上叠加聚落标记 */
  settlements: EntityRow[];
}

// 底图原始像素尺寸，与 public/map-assets/east-continent-base.png 一致
const imageWidth = 1586;
const imageHeight = 992;
const mapExtent = [0, 0, imageWidth, imageHeight];
const mapCenter = getCenter(mapExtent);

// 不用 EPSG:4326（经纬度），直接用图片像素作为坐标系
const mapProjection = new Projection({
  code: "east-continent-image",
  units: "pixels",
  extent: mapExtent
});

export function WorldMap({ tribes }: WorldMapProps) {
  // shellRef → 外层 .world-map-shell，用于全屏（requestFullscreen 作用在这个容器上）
  const shellRef = useRef<HTMLDivElement | null>(null);
  // ref → 内层 .world-map，OpenLayers 把 canvas 画在这个 div 里
  const ref = useRef<HTMLDivElement | null>(null);
  // 保存 OpenLayers Map 实例，供全屏切换等场景在 useEffect 外调用 updateSize()
  const mapRef = useRef<Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  /**
   * useMemo：只有 tribes 变化时才重新计算 markerRows。
   * - 有 API 数据 → 用 tribes
   * - 无数据 → 用 demoTribeMarkers 兜底，避免空地图
   * 同时稳定数组引用，防止下方 useEffect([markerRows]) 无意义地反复销毁/重建地图。
   */
  const markerRows = useMemo(() => (tribes.length > 0 ? tribes : demoTribeMarkers), [tribes]);

  /**
   * useCallback：固定函数引用，避免每次 render 生成新函数。
   * 切换全屏逻辑：
   * - document.fullscreenElement === shell → 当前已是全屏，调用 exitFullscreen() 退出
   * - 否则 → requestFullscreen() 进入全屏
   * requestFullscreen 必须在用户手势（点击/按键）下调用，且不能并发多次，否则报 Permissions check failed
   */
  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;

    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
        return;
      }

      await shell.requestFullscreen();
    } catch {
      // 浏览器拒绝全屏（无用户手势、重复请求等）时静默忽略
    }
  }, []);

  /**
   * 快捷键 F 切换全屏。
   * 必须写在 useEffect 里：挂载时 addEventListener，卸载时 removeEventListener。
   * 若写在组件函数体里，每次 re-render 都会重复绑定，按一次键会触发多次 toggleFullscreen。
   * 注意：F11 由浏览器占用，页面 keydown 通常监听不到，所以用 F 键。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "f" && event.key !== "F") return;
      if (event.repeat) return; // 长按时不重复触发
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      event.preventDefault();
      void toggleFullscreen();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  /**
   * 监听浏览器 fullscreenchange 事件（含 Esc 退出全屏）。
   * 全屏后容器尺寸变了，OpenLayers 不会自动感知，需手动 updateSize() 重算画布。
   */
  useEffect(() => {
    const onFullscreenChange = () => {
      const shell = shellRef.current;
      setIsFullscreen(Boolean(shell && document.fullscreenElement === shell));
      mapRef.current?.updateSize();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  /**
   * 初始化 OpenLayers 地图。依赖 markerRows，部落数据变化时重建图层。
   * useEffect 在组件挂载后执行，此时 ref.current 已指向真实 DOM。
   */
  useEffect(() => {
    // target = ref.current，即 <div class="world-map">，OpenLayers 的挂载容器
    const target = ref.current;
    if (!target) return; // DOM 尚未就绪时跳过

    const baseLayer = new ImageLayer({
      source: new ImageStatic({
        url: "/map-assets/east-continent-base.png",
        imageExtent: mapExtent,
        projection: mapProjection
      })
    });

    const tribeLayer = new VectorLayer({
      source: new VectorSource({
        features: markerRows.map((row) => createTribeFeature(row))
      }),
      style: new Style({
        image: new Icon({
          src: "/map-assets/tribe-marker-transparent.png",
          scale: 0.2,
          // 锚点在图标底部，让标记“插”在地图位置上
          anchor: [0.5, 0.86]
        })
      })
    });

    const initialView = createBoundedView(target);
    const map = new Map({
      target, // 告诉 OpenLayers 把地图画在哪个 DOM 节点里
      layers: [baseLayer, tribeLayer],
      controls: defaultControls({ rotate: false, attribution: false }),
      view: initialView
    });
    mapRef.current = map;

    let isClamping = false; // 防止 setCenter 触发 change:center 造成递归
    let centerKey = bindCenterClamp(initialView);

    /**
     * ResizeObserver：监听 .world-map 容器宽高变化（窗口缩放、全屏切换等）。
     * OpenLayers 不会自动跟随 DOM 尺寸更新，需要：
     * 1. updateSize() — 按新尺寸重绘画布
     * 2. 重建 View — 按新容器重新计算最远/最近缩放边界
     * 3. 重新绑定边缘限制 — 防止拖地图时露出空白
     */
    const observer = new ResizeObserver(() => {
      map.updateSize();
      const currentView = map.getView();
      // 尽量保留当前中心点和缩放级别，只更新边界约束
      const nextView = createBoundedView(target, currentView.getCenter(), currentView.getResolution());
      unByKey(centerKey); // 移除旧 View 上的 change:center 监听，避免重复绑定
      map.setView(nextView);
      centerKey = bindCenterClamp(nextView);
      clampViewToMap(nextView); // 立即校正一次中心，防止 resize 后偏出边界
    });
    observer.observe(target);

    /** 拖动地图时持续限制视口中心，不让边缘露出空白区域 */
    function bindCenterClamp(view: View) {
      return view.on("change:center", () => clampViewToMap(view));
    }

    /**
     * 根据当前缩放级别和视口大小，计算中心点允许移动的范围。
     * halfWidth/halfHeight = 视口一半对应的地图距离，中心不能超出 mapExtent 减去这个余量。
     */
    function clampViewToMap(view: View) {
      const size = map.getSize();
      const resolution = view.getResolution();
      const center = view.getCenter();
      if (!size || !resolution || !center || isClamping) return;

      const halfWidth = (size[0] * resolution) / 2;
      const halfHeight = (size[1] * resolution) / 2;
      const nextCenter = [
        clampAxis(center[0], mapExtent[0] + halfWidth, mapExtent[2] - halfWidth, mapCenter[0]),
        clampAxis(center[1], mapExtent[1] + halfHeight, mapExtent[3] - halfHeight, mapCenter[1])
      ];

      if (nextCenter[0] !== center[0] || nextCenter[1] !== center[1]) {
        isClamping = true;
        view.setCenter(nextCenter);
        isClamping = false;
      }
    }

    // 组件卸载或 markerRows 变化时清理，防止内存泄漏
    return () => {
      unByKey(centerKey);
      observer.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [markerRows]);

  return (
    <div className="world-map-shell" ref={shellRef}>
      <div className="world-map" ref={ref} />
      <button
        type="button"
        className="map-fullscreen-btn"
        onClick={() => void toggleFullscreen()}
        aria-label={isFullscreen ? "退出全屏" : "全屏展示"}
      >
        {isFullscreen ? "退出全屏" : "全屏"}
      </button>
      <div className="map-legend">
        <div className="legend-row">
          <img alt="" src="/map-assets/tribe-marker-transparent.png" />
          <span>部落</span>
        </div>
      </div>
    </div>
  );
}

// 本地无 API 数据时的占位部落坐标（百分比）
const demoTribeMarkers: EntityRow[] = [
  { name: "灰芽", coordinatesX: 50, coordinatesY: 22 },
  { name: "赤牙", coordinatesX: 55, coordinatesY: 48 },
  { name: "鹿角", coordinatesX: 51, coordinatesY: 36 },
  { name: "石集", coordinatesX: 61, coordinatesY: 44 },
  { name: "云箕", coordinatesX: 28, coordinatesY: 50 }
];

/**
 * 根据容器尺寸计算缩放边界：
 * - wholeMapResolution：最远只能缩到整图刚好铺满视口
 * - minResolution：最近可放大到 wholeMapResolution 的 1/64
 */
function createBoundedView(target: HTMLDivElement, center = mapCenter, preferredResolution?: number) {
  const width = Math.max(1, target.clientWidth);
  const height = Math.max(1, target.clientHeight);
  const wholeMapResolution = Math.max(imageWidth / width, imageHeight / height);

  return new View({
    center,
    resolution: Math.min(preferredResolution ?? wholeMapResolution, wholeMapResolution),
    maxResolution: wholeMapResolution,
    minResolution: wholeMapResolution / 64,
    projection: mapProjection,
    extent: mapExtent,
    smoothExtentConstraint: false,
    constrainResolution: false
  });
}

function createTribeFeature(row: EntityRow) {
  const x = Number(row.coordinatesX ?? 50);
  const y = Number(row.coordinatesY ?? 50);
  return new Feature({
    geometry: new Point(toMapCoordinate(x, y)),
    name: String(row.name ?? "未命名部落"),
    kind: "tribe"
  });
}

/** 业务坐标为左上角原点百分比，OpenLayers 像素坐标 Y 轴向上，需翻转 */
function toMapCoordinate(xPercent: number, yPercent: number) {
  const x = (xPercent / 100) * imageWidth;
  const y = imageHeight - (yPercent / 100) * imageHeight;
  return [x, y];
}

/** 视口大于地图时 min > max，回退到地图中心 */
function clampAxis(value: number, min: number, max: number, fallback: number) {
  if (min > max) return fallback;
  return Math.max(min, Math.min(max, value));
}
