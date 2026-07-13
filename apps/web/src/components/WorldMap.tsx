/**
 * 东大陆静态底图 + 部落标记。
 * 使用自定义像素投影，坐标来自数据库中的 coordinatesX/Y（0–100 百分比）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Feature, { type FeatureLike } from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import { defaults as defaultControls } from "ol/control/defaults";
import Translate, { type TranslateEvent } from "ol/interaction/Translate";
import type Geometry from "ol/geom/Geometry";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import ImageLayer from "ol/layer/Image";
import VectorLayer from "ol/layer/Vector";
import WebGLVectorLayer from "ol/layer/WebGLVector";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import Projection from "ol/proj/Projection";
import ImageStatic from "ol/source/ImageStatic";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from "ol/style";
import { getCenter } from "ol/extent";
import type { EntityRow } from "../types";

interface WorldMapProps {
  tribes: EntityRow[];
  /** 预留：后续可在地图上叠加聚落标记 */
  settlements: EntityRow[];
  canEditTribes?: boolean;
  onTribeCoordinatesChange?: (tribeId: number, coordinatesX: number, coordinatesY: number) => Promise<void>;
}

type DevStatus =
  | { kind: "idle" }
  | { kind: "dragging"; name: string; coordinatesX: number; coordinatesY: number }
  | { kind: "saving"; name: string }
  | { kind: "saved"; name: string; coordinatesX: number; coordinatesY: number }
  | { kind: "error"; message: string };

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

const markerIconScale = 0.2;
const markerIconAnchor: [number, number] = [0.5, 0.86];
/** 文字落在标识圆形区域中部，相对锚点向上偏移 */
const markerLabelOffsetY = -30;
const fixedTradeRoute = {
  name: "盐曜商路",
  durationMs: 7200,
  stops: [
    { name: "环城盐井", x: 18, y: 68 },
    { name: "云箭驿口", x: 28, y: 53 },
    { name: "灰芽溪谷", x: 36, y: 16 },
    { name: "鹿角集市", x: 46, y: 28 },
    { name: "黑石曜矿", x: 50, y: 11 }
  ]
};

function createTribeMarkerStyle(feature: FeatureLike) {
  const name = String(feature.get("name") ?? "");

  return new Style({
    image: new Icon({
      src: "/map-assets/tribe-marker-transparent.png",
      scale: markerIconScale,
      anchor: markerIconAnchor
    }),
    text: new Text({
      text: name,
      font: '600 11px "Microsoft YaHei", sans-serif',
      offsetY: markerLabelOffsetY,
      textAlign: "center",
      textBaseline: "middle",
      fill: new Fill({ color: "#fff6df" }),
      stroke: new Stroke({ color: "rgba(16, 22, 20, 0.9)", width: 3 }),
      overflow: true,
      padding: [1, 2, 1, 2]
    })
  });
}

function createTradeRouteStyle(feature: FeatureLike) {
  const kind = feature.get("kind");

  if (kind === "trade-route") {
    return [
      new Style({
        stroke: new Stroke({
          color: "rgba(55, 29, 13, 0.76)",
          width: 8
        })
      }),
      new Style({
        stroke: new Stroke({
          color: "rgba(242, 196, 95, 0.38)",
          lineDash: [10, 10],
          width: 2.2
        }),
        text: new Text({
          text: String(feature.get("name") ?? ""),
          placement: "line",
          repeat: 280,
          font: '800 13px "Microsoft YaHei", sans-serif',
          fill: new Fill({ color: "#fff4ce" }),
          stroke: new Stroke({ color: "rgba(35, 20, 9, 0.92)", width: 4 })
        })
      })
    ];
  }

  if (kind === "trade-trail") {
    return new Style({
      stroke: new Stroke({
        color: "#ffe08a",
        width: 5
      })
    });
  }

  if (kind === "trade-traveler") {
    return [
      new Style({
        image: new CircleStyle({
          radius: 12,
          fill: new Fill({ color: "rgba(255, 224, 138, 0.22)" })
        })
      }),
      new Style({
        image: new CircleStyle({
          radius: 5.5,
          fill: new Fill({ color: "#fff0a6" }),
          stroke: new Stroke({ color: "rgba(59, 32, 13, 0.92)", width: 2 })
        }),
        text: new Text({
          text: String(feature.get("name") ?? ""),
          font: '800 12px "Microsoft YaHei", sans-serif',
          offsetY: -20,
          fill: new Fill({ color: "#fff6df" }),
          stroke: new Stroke({ color: "rgba(16, 22, 20, 0.92)", width: 3 })
        })
      })
    ];
  }

  return new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: "#f7d072" }),
      stroke: new Stroke({ color: "rgba(35, 20, 9, 0.9)", width: 2 })
    }),
    text: new Text({
      text: String(feature.get("name") ?? ""),
      font: '700 11px "Microsoft YaHei", sans-serif',
      offsetY: -16,
      fill: new Fill({ color: "#fff6df" }),
      stroke: new Stroke({ color: "rgba(16, 22, 20, 0.92)", width: 3 }),
      overflow: true
    })
  });
}

function createTradeRouteWebGLStyle() {
  return [
    {
      style: {
        "stroke-width": 7,
        "stroke-color": "rgba(55,29,13,0.74)"
      },
      filter: ["<=", ["line-metric"], ["var", "timestamp"]]
    },
    {
      style: {
        "stroke-width": 3.8,
        "stroke-color": [
          "interpolate",
          ["linear"],
          ["line-metric"],
          0,
          "hsl(42,100%,82%)",
          0.55,
          "hsl(36,100%,50%)",
          1,
          "hsl(15,94%,56%)"
        ]
      },
      filter: ["<=", ["line-metric"], ["var", "timestamp"]]
    }
  ] as never;
}

export function WorldMap({ tribes, canEditTribes = false, onTribeCoordinatesChange }: WorldMapProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const tribeSourceRef = useRef<VectorSource | null>(null);
  const tribeLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const translateRef = useRef<Translate | null>(null);
  const translateKeyRef = useRef<EventsKey[]>([]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [devStatus, setDevStatus] = useState<DevStatus>({ kind: "idle" });

  const markerRows = useMemo(() => (tribes.length > 0 ? tribes : demoTribeMarkers), [tribes]);
  const markerRowsRef = useRef(markerRows);
  markerRowsRef.current = markerRows;

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "f" && event.key !== "F") return;
      if (event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      event.preventDefault();
      void toggleFullscreen();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const shell = shellRef.current;
      setIsFullscreen(Boolean(shell && document.fullscreenElement === shell));
      mapRef.current?.updateSize();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!canEditTribes) setDevMode(false);
  }, [canEditTribes]);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    const tribeSource = new VectorSource();
    tribeSourceRef.current = tribeSource;

    const tribeLayer = new VectorLayer({
      source: tribeSource,
      style: createTribeMarkerStyle
    });
    tribeLayerRef.current = tribeLayer;

    const tradeRoute = createTradeRouteFeatures();
    const tradeRouteSource = new VectorSource({
      features: [tradeRoute.routeFeature]
    });
    const tradeRouteLayer = new WebGLVectorLayer({
      source: tradeRouteSource,
      style: createTradeRouteWebGLStyle(),
      variables: {
        timestamp: 0
      }
    });
    const tradeRouteStopsLayer = new VectorLayer({
      source: new VectorSource({
        features: tradeRoute.stopFeatures
      }),
      style: createTradeRouteStyle
    });

    const baseLayer = new ImageLayer({
      source: new ImageStatic({
        url: "/map-assets/east-continent-base.png",
        imageExtent: mapExtent,
        projection: mapProjection
      })
    });

    const initialView = createBoundedView(target);
    const map = new Map({
      target,
      layers: [baseLayer, tradeRouteLayer, tradeRouteStopsLayer, tribeLayer],
      controls: defaultControls({ rotate: false, attribution: false }),
      view: initialView
    });
    mapRef.current = map;
    const tradeRouteFrameId = animateTradeRouteMetric(tradeRouteLayer, map);

    let isClamping = false;
    let centerKey = bindCenterClamp(initialView);

    const observer = new ResizeObserver(() => {
      map.updateSize();
      const currentView = map.getView();
      const nextView = createBoundedView(target, currentView.getCenter(), currentView.getResolution());
      unByKey(centerKey);
      map.setView(nextView);
      centerKey = bindCenterClamp(nextView);
      clampViewToMap(nextView);
    });
    observer.observe(target);

    function bindCenterClamp(view: View) {
      return view.on("change:center", () => clampViewToMap(view));
    }

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

    return () => {
      unByKey(centerKey);
      observer.disconnect();
      for (const key of translateKeyRef.current) unByKey(key);
      if (translateRef.current) map.removeInteraction(translateRef.current);
      cancelAnimationFrame(tradeRouteFrameId.current);
      map.setTarget(undefined);
      mapRef.current = null;
      tribeSourceRef.current = null;
      tribeLayerRef.current = null;
      translateRef.current = null;
      translateKeyRef.current = [];
    };
  }, []);

  useEffect(() => {
    const source = tribeSourceRef.current;
    if (!source) return;

    source.clear();
    source.addFeatures(markerRows.map((row) => createTribeFeature(row)));
  }, [markerRows]);

  useEffect(() => {
    const map = mapRef.current;
    const tribeLayer = tribeLayerRef.current;
    if (!map || !tribeLayer) return;

    if (translateKeyRef.current.length > 0) {
      for (const key of translateKeyRef.current) unByKey(key);
      translateKeyRef.current = [];
    }
    if (translateRef.current) {
      map.removeInteraction(translateRef.current);
      translateRef.current = null;
    }

    if (!devMode || !canEditTribes) return;

    const translate = new Translate({ layers: [tribeLayer] });
    translateRef.current = translate;
    map.addInteraction(translate);

    function handleTranslate(event: TranslateEvent) {
      const feature = event.features.item(0);
      if (!feature) return;

      const geometry = feature.getGeometry();
      if (!(geometry instanceof Point)) return;

      const coords = geometry.getCoordinates();
      const [coordinatesX, coordinatesY] = fromMapCoordinate(coords[0], coords[1]);
      const name = String(feature.get("name") ?? "未命名部落");
      const tribeId = feature.get("tribeId");

      if (event.type === "translateend") {
        if (typeof tribeId !== "number" || !onTribeCoordinatesChange) {
          setDevStatus({ kind: "error", message: "该标记无法保存（缺少部落 ID 或保存回调）" });
          return;
        }

        setDevStatus({ kind: "saving", name });
        void onTribeCoordinatesChange(tribeId, coordinatesX, coordinatesY)
          .then(() => {
            setDevStatus({ kind: "saved", name, coordinatesX, coordinatesY });
          })
          .catch((error) => {
            const source = tribeSourceRef.current;
            if (source) {
              source.clear();
              source.addFeatures(markerRowsRef.current.map((row) => createTribeFeature(row)));
            }
            setDevStatus({
              kind: "error",
              message: error instanceof Error ? error.message : "保存失败"
            });
          });
        return;
      }

      setDevStatus({ kind: "dragging", name, coordinatesX, coordinatesY });
    }

    translateKeyRef.current = [
      translate.on("translating", handleTranslate),
      translate.on("translateend", handleTranslate)
    ];

    return () => {
      for (const key of translateKeyRef.current) unByKey(key);
      translateKeyRef.current = [];
      if (translateRef.current) map.removeInteraction(translateRef.current);
      translateRef.current = null;
    };
  }, [canEditTribes, devMode, onTribeCoordinatesChange]);

  return (
    <div className={`world-map-shell${devMode ? " world-map-shell--dev" : ""}`} ref={shellRef}>
      <div className="world-map" ref={ref} />
      <div className="map-toolbar">
        {canEditTribes ? (
          <button
            type="button"
            className={`map-toolbar-btn${devMode ? " map-toolbar-btn-active" : ""}`}
            onClick={() => {
              setDevMode((value) => !value);
              setDevStatus({ kind: "idle" });
            }}
            aria-pressed={devMode}
          >
            {devMode ? "退出开发" : "开发模式"}
          </button>
        ) : null}
        <button
          type="button"
          className="map-toolbar-btn"
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? "退出全屏" : "全屏展示"}
        >
          {isFullscreen ? "退出全屏" : "全屏"}
        </button>
      </div>
      {devMode ? (
        <div className="map-dev-panel" aria-live="polite">
          <strong>开发模式</strong>
          <p>拖动部落标记即可调整位置，松手后自动保存到数据库。</p>
          {devStatus.kind === "dragging" ? (
            <p className="map-dev-meta">
              {devStatus.name} · X {devStatus.coordinatesX.toFixed(1)} · Y {devStatus.coordinatesY.toFixed(1)}
            </p>
          ) : null}
          {devStatus.kind === "saving" ? <p className="map-dev-meta">正在保存 {devStatus.name}…</p> : null}
          {devStatus.kind === "saved" ? (
            <p className="map-dev-meta map-dev-meta-ok">
              已保存 {devStatus.name} · X {devStatus.coordinatesX.toFixed(1)} · Y {devStatus.coordinatesY.toFixed(1)}
            </p>
          ) : null}
          {devStatus.kind === "error" ? <p className="map-dev-meta map-dev-meta-error">{devStatus.message}</p> : null}
        </div>
      ) : null}
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
  { name: "眠梦", coordinatesX: 28, coordinatesY: 16 },
  { name: "灰芽", coordinatesX: 36, coordinatesY: 16 },
  { name: "霜骨", coordinatesX: 78, coordinatesY: 9 },
  { name: "听潮", coordinatesX: -24, coordinatesY: 49 },
  { name: "鹿角", coordinatesX: 46, coordinatesY: 28 },
  { name: "黑石", coordinatesX: 50, coordinatesY: 11 },
  { name: "石集", coordinatesX: 54, coordinatesY: 41 },
  { name: "赤牙", coordinatesX: 44, coordinatesY: 40 },
  { name: "玉", coordinatesX: 64, coordinatesY: 35 },
  { name: "砺石", coordinatesX: 61, coordinatesY: 37 },
  { name: "云箕", coordinatesX: 24, coordinatesY: 53 },
  { name: "长弓", coordinatesX: 74, coordinatesY: 32 },
  { name: "雷鼓", coordinatesX: 70, coordinatesY: 49 }
];

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
    kind: "tribe",
    tribeId: row.id != null ? Number(row.id) : undefined
  });
}

function createTradeRouteFeatures() {
  const coordinates = fixedTradeRoute.stops.map((stop) => toMapCoordinate(stop.x, stop.y));
  const metricCoordinates = coordinates.map((coordinate, index) => [
    coordinate[0],
    coordinate[1],
    index / Math.max(1, coordinates.length - 1)
  ]);
  const routeFeature = new Feature({
    geometry: new LineString(metricCoordinates, "XYM"),
    kind: "trade-route",
    name: fixedTradeRoute.name
  });
  const stopFeatures = fixedTradeRoute.stops.map(
    (stop) =>
      new Feature({
        geometry: new Point(toMapCoordinate(stop.x, stop.y)),
        kind: "trade-stop",
        name: stop.name
      })
  );

  return { routeFeature, stopFeatures };
}

function animateTradeRouteMetric(vectorLayer: WebGLVectorLayer, map: Map) {
  const frameId = { current: 0 };
  const startedAt = performance.now();

  const animate = (now: number) => {
    const timestamp = ((now - startedAt) % fixedTradeRoute.durationMs) / fixedTradeRoute.durationMs;
    vectorLayer.updateStyleVariables({ timestamp });
    map.render();
    frameId.current = requestAnimationFrame(animate);
  };

  frameId.current = requestAnimationFrame(animate);
  return frameId;
}

function toMapCoordinate(xPercent: number, yPercent: number) {
  const x = (xPercent / 100) * imageWidth;
  const y = imageHeight - (yPercent / 100) * imageHeight;
  return [x, y];
}

function fromMapCoordinate(x: number, y: number) {
  const coordinatesX = formatCoord((x / imageWidth) * 100);
  const coordinatesY = formatCoord(((imageHeight - y) / imageHeight) * 100);
  return [coordinatesX, coordinatesY] as const;
}

function formatCoord(value: number) {
  return Math.round(value * 10) / 10;
}

function clampAxis(value: number, min: number, max: number, fallback: number) {
  if (min > max) return fallback;
  return Math.max(min, Math.min(max, value));
}
