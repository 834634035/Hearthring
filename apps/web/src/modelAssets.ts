export type ModelEntry = {
  path: string;
  scale?: number;
  animations?: string[];
  pack?: string;
};

export type ModelManifest = {
  version: number;
  models: Record<string, ModelEntry>;
};

export type ModelId = keyof ModelManifest["models"] extends never
  ? string
  : keyof ModelManifest["models"] & string;

const MANIFEST_URL = "/models/manifest.json";
const THREE_GLTF_LOADER_URL = "https://esm.sh/three@0.176.0/examples/jsm/loaders/GLTFLoader.js";

let manifestPromise: Promise<ModelManifest> | undefined;
const gltfCache = new Map<string, Promise<unknown>>();

export function loadModelManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load model manifest: ${response.status}`);
      }
      return (await response.json()) as ModelManifest;
    });
  }
  return manifestPromise;
}

export async function getModelEntry(id: string) {
  const manifest = await loadModelManifest();
  const entry = manifest.models[id];
  if (!entry) {
    throw new Error(`Unknown model id: ${id}`);
  }
  return entry;
}

async function createGltfLoader() {
  const { GLTFLoader } = await import(/* @vite-ignore */ THREE_GLTF_LOADER_URL);
  return new GLTFLoader() as {
    loadAsync: (url: string) => Promise<{
      scene: { clone: () => unknown };
      animations: Array<{ name: string; duration: number }>;
    }>;
    parseAsync: (
      data: ArrayBuffer,
      path: string
    ) => Promise<{
      scene: { clone: () => unknown };
      animations: Array<{ name: string; duration: number }>;
    }>;
  };
}

function looksLikeHtml(buffer: ArrayBuffer) {
  const head = new TextDecoder().decode(buffer.slice(0, 64)).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
}

function isGlbBuffer(buffer: ArrayBuffer) {
  if (buffer.byteLength < 4) return false;
  return new TextDecoder().decode(buffer.slice(0, 4)) === "glTF";
}

export async function isModelUrlAvailable(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) return false;
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > 0 && !looksLikeHtml(buffer);
  } catch {
    return false;
  }
}

export async function loadModelById(THREE: unknown, id: string) {
  const entry = await getModelEntry(id);
  return loadModelFromUrl(THREE, entry.path) as Promise<{
    scene: unknown;
    animations: Array<{ name: string; duration: number }>;
  }>;
}

export async function loadModelFromUrl(THREE: unknown, url: string) {
  if (!gltfCache.has(url)) {
    const loaderPromise = (async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch model (${response.status}): ${url}`);
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        throw new Error(`Model file is empty: ${url}`);
      }
      if (looksLikeHtml(buffer)) {
        throw new Error(
          `Model file not found: ${url}. The server returned HTML instead of a GLB/GLTF asset.`
        );
      }
      const loader = await createGltfLoader();
      // GLB 可自包含解析；JSON GLTF 需 loadAsync 才能正确拉取外部 .bin / 贴图
      if (isGlbBuffer(buffer)) {
        return loader.parseAsync(buffer, url);
      }
      return loader.loadAsync(url);
    })();
    gltfCache.set(url, loaderPromise);
  }
  return gltfCache.get(url)!;
}

export function clearModelCache() {
  gltfCache.clear();
  manifestPromise = undefined;
}
