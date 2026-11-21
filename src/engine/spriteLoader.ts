import { StructureType } from '../types/game';

export type HeroSpritePose = 'idle' | 'walk1' | 'walk2' | 'walk3' | 'attack';
export type BuildingVisualTier = 1 | 2 | 3;

export interface ProcessedSprite {
  canvas: HTMLCanvasElement;
  flashCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  aspect: number;
}

interface SheetSourceConfig {
  url: string;
  frameCount: 2 | 3;
  clearInteriorWhiteHoles?: boolean;
  minHolePixels?: number;
  whiteThreshold?: number;
}

/**
 * Era I — Idade da Pedra (Stone Age) 32-bit Pixel Art Sprite Sheets
 * - Heroes: 2-frame horizontal sheets [idle, attack]
 * - Buildings: 3-frame horizontal sheets [Level 1, Level 2, Level 3]
 */
const HERO_SHEETS: Record<string, SheetSourceConfig> = {
  aegor: {
    url: '/src/assets/images/pa_hero_aegor_1795194349792.jpg',
    frameCount: 2,
    clearInteriorWhiteHoles: true,
    minHolePixels: 14,
  },
  sylva: {
    url: '/src/assets/images/pa_hero_sylva_1795194353056.jpg',
    frameCount: 2,
    clearInteriorWhiteHoles: true,
    minHolePixels: 12,
  },
};

/**
 * Dedicated 3-frame horizontal walk-cycle sheets [strideA, passingCross, strideB]
 * so heroes genuinely step one leg in front of the other with zero hopping!
 */
const HERO_WALK_SHEETS: Record<string, SheetSourceConfig> = {
  aegor: {
    url: '/src/assets/images/pa_hero_aegor_stride_1795196751296.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 10,
  },
  sylva: {
    url: '/src/assets/images/pa_hero_sylva_walk3_1795196731318.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 10,
  },
};

const BUILDING_SHEETS: Record<Exclude<StructureType, 'trap'>, SheetSourceConfig> = {
  core: {
    url: '/src/assets/images/pa_bldg_core_1795194349585.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: false,
  },
  archer_tower: {
    url: '/src/assets/images/pa_bldg_archer_tower_1795194350031.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 8,
  },
  cannon: {
    url: '/src/assets/images/pa_bldg_cannon_1795194350222.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 10,
  },
  arcane_tower: {
    url: '/src/assets/images/pa_bldg_arcane_tower_1795194351307.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: false,
  },
  electric_tower: {
    url: '/src/assets/images/pa_bldg_electric_tower_1795194350201.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: false,
  },
  ice_tower: {
    url: '/src/assets/images/pa_bldg_ice_tower_1795194362067.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: false,
  },
  poison_tower: {
    url: '/src/assets/images/pa_bldg_poison_tower_1795194350131.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 10,
  },
  gold_mine: {
    url: '/src/assets/images/pa_bldg_gold_mine_1795194349761.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 10,
  },
  crystal_mine: {
    url: '/src/assets/images/pa_bldg_crystal_mine_1795194349725.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 10,
  },
  essence_well: {
    url: '/src/assets/images/pa_bldg_essence_well_1795194392551.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 10,
  },
  storage: {
    url: '/src/assets/images/pa_bldg_storage_1795194352848.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: false,
  },
  hero_altar: {
    url: '/src/assets/images/pa_bldg_hero_altar_1795197867544.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: false,
    whiteThreshold: 210,
  },
  wall: {
    url: '/src/assets/images/pa_bldg_wall_1795194350002.jpg',
    frameCount: 3,
    clearInteriorWhiteHoles: true,
    minHolePixels: 6,
  },
};

const processedCache = new Map<string, ProcessedSprite>();
const loadingSheets = new Set<string>();
const listeners = new Set<() => void>();
let preloaded = false;

function notifySpritesUpdated() {
  for (const cb of listeners) {
    cb();
  }
}

export function subscribeSpritesLoaded(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getBuildingVisualTier(level: number): BuildingVisualTier {
  if (level <= 1) return 1;
  if (level === 2) return 2;
  return 3;
}

/**
 * Finds the center X of the widest contiguous empty-column gap inside [minRatio..maxRatio].
 * This guarantees detached small props (e.g., campfire next to Core Lv3, stone hammer next to Crystal Lv1)
 * always remain grouped with their parent building while splitting the 2 or 3 sprites cleanly.
 */
function findWidestGapCenter(
  colOpaque: Uint32Array,
  width: number,
  minRatio: number,
  maxRatio: number
): number {
  const startX = Math.max(1, Math.floor(width * minRatio));
  const endX = Math.min(width - 2, Math.floor(width * maxRatio));

  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;

  for (let x = startX; x <= endX; x++) {
    if (colOpaque[x] <= 1) {
      if (curStart === -1) curStart = x;
    } else if (curStart !== -1) {
      const len = x - curStart;
      if (len > bestLen) {
        bestLen = len;
        bestStart = curStart;
      }
      curStart = -1;
    }
  }
  if (curStart !== -1) {
    const len = endX - curStart + 1;
    if (len > bestLen) {
      bestLen = len;
      bestStart = curStart;
    }
  }

  if (bestStart !== -1 && bestLen >= 2) {
    return Math.round(bestStart + bestLen * 0.5);
  }

  // Fallback: pick column with absolute fewest opaque pixels in window
  let minCol = Math.round((startX + endX) * 0.5);
  let minCount = Number.MAX_SAFE_INTEGER;
  for (let x = startX; x <= endX; x++) {
    if (colOpaque[x] < minCount) {
      minCount = colOpaque[x];
      minCol = x;
    }
  }
  return minCol;
}

/**
 * Processes a full horizontal pixel-art sprite sheet:
 * 1. Border-seeded BFS white background removal
 * 2. Optional enclosed pure-white hole removal (ladders, bowstrings, stone arches)
 * 3. Crisp 1px anti-aliased white-fringe cleanup
 * 4. Smart widest-gap horizontal slicing into 2 (hero) or 3 (building tiers) individual sprites
 * 5. Tight bounding-box crop + exact silhouette hit-flash canvas generation
 */
function processPixelArtSheet(
  img: HTMLImageElement,
  config: SheetSourceConfig
): ProcessedSprite[] {
  const MAX_WIDTH = config.frameCount === 3 ? 780 : 540;
  const scale = Math.min(1, MAX_WIDTH / Math.max(1, img.naturalWidth));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const total = w * h;
  const bgMask = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  const whiteMin = config.whiteThreshold ?? 224;

  const isOuterBackgroundPixel = (idx: number): boolean => {
    const p = idx * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    return minC >= whiteMin && maxC - minC <= 28;
  };

  const enqueueIfBg = (x: number, y: number) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    if (isOuterBackgroundPixel(idx)) {
      visited[idx] = 1;
      bgMask[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    enqueueIfBg(x, 0);
    enqueueIfBg(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    enqueueIfBg(0, y);
    enqueueIfBg(w - 1, y);
  }

  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) enqueueIfBg(x - 1, y);
    if (x < w - 1) enqueueIfBg(x + 1, y);
    if (y > 0) enqueueIfBg(x, y - 1);
    if (y < h - 1) enqueueIfBg(x, y + 1);
  }

  // Knock out enclosed pure-white gaps inside scaffolding, ladders, arches & bowstrings
  if (config.clearInteriorWhiteHoles) {
    const holeVisited = new Uint8Array(total);
    const compBuffer = new Int32Array(total);
    const minHole = config.minHolePixels ?? 12;

    const isPureWhiteHole = (idx: number): boolean => {
      if (bgMask[idx]) return false;
      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const minC = Math.min(r, g, b);
      const maxC = Math.max(r, g, b);
      return minC >= 242 && maxC - minC <= 14;
    };

    for (let i = 0; i < total; i++) {
      if (holeVisited[i] || !isPureWhiteHole(i)) continue;
      let cHead = 0;
      let cTail = 0;
      holeVisited[i] = 1;
      compBuffer[cTail++] = i;

      while (cHead < cTail) {
        const curr = compBuffer[cHead++];
        const cx = curr % w;
        const cy = (curr - cx) / w;
        const nbs = [
          cx > 0 ? curr - 1 : -1,
          cx < w - 1 ? curr + 1 : -1,
          cy > 0 ? curr - w : -1,
          cy < h - 1 ? curr + w : -1,
        ];
        for (let k = 0; k < 4; k++) {
          const nb = nbs[k];
          if (nb >= 0 && !holeVisited[nb] && isPureWhiteHole(nb)) {
            holeVisited[nb] = 1;
            compBuffer[cTail++] = nb;
          }
        }
      }

      if (cTail >= minHole) {
        for (let j = 0; j < cTail; j++) {
          bgMask[compBuffer[j]] = 1;
        }
      }
    }
  }

  for (let i = 0; i < total; i++) {
    if (bgMask[i]) {
      data[i * 4 + 3] = 0;
    }
  }

  // Clean 1px white edge fringe around pixel outlines
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (bgMask[idx]) continue;

      const touchesBg =
        bgMask[idx - 1] ||
        bgMask[idx + 1] ||
        bgMask[idx - w] ||
        bgMask[idx + w] ||
        bgMask[idx - w - 1] ||
        bgMask[idx - w + 1] ||
        bgMask[idx + w - 1] ||
        bgMask[idx + w + 1];

      if (!touchesBg) continue;

      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);

      if (lum > 206 && chroma < 30) {
        data[p + 3] = 0;
      } else if (lum > 158 && chroma < 34) {
        const factor = Math.max(0, Math.min(1, (212 - lum) / 54));
        data[p] = Math.round(r * 0.45);
        data[p + 1] = Math.round(g * 0.45);
        data[p + 2] = Math.round(b * 0.45);
        data[p + 3] = Math.round(255 * factor);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Column opacity projection to locate clean split boundaries
  const colOpaque = new Uint32Array(w);
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * 4 + 3] > 28) count++;
    }
    colOpaque[x] = count;
  }

  const spans: Array<[number, number]> = [];
  if (config.frameCount === 2) {
    const mid = findWidestGapCenter(colOpaque, w, 0.35, 0.65);
    spans.push([0, mid], [mid, w]);
  } else {
    const split1 = findWidestGapCenter(colOpaque, w, 0.22, 0.46);
    const split2 = findWidestGapCenter(colOpaque, w, 0.54, 0.78);
    spans.push([0, split1], [split1, split2], [split2, w]);
  }

  const results: ProcessedSprite[] = [];

  for (const [spanStart, spanEnd] of spans) {
    let minX = spanEnd;
    let maxX = spanStart;
    let minY = h;
    let maxY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = spanStart; x < spanEnd; x++) {
        if (data[(y * w + x) * 4 + 3] > 28) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) continue;

    const pad = 2;
    const sx = Math.max(spanStart, minX - pad);
    const sy = Math.max(0, minY - pad);
    const sw = Math.min(spanEnd - sx, maxX - minX + 1 + pad * 2);
    const sh = Math.min(h - sy, maxY - minY + 1 + pad * 2);

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = sw;
    trimmedCanvas.height = sh;
    const trimCtx = trimmedCanvas.getContext('2d');
    if (!trimCtx) continue;
    trimCtx.imageSmoothingEnabled = false;
    trimCtx.drawImage(workCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const flashCanvas = document.createElement('canvas');
    flashCanvas.width = sw;
    flashCanvas.height = sh;
    const flashCtx = flashCanvas.getContext('2d');
    if (flashCtx) {
      flashCtx.imageSmoothingEnabled = false;
      flashCtx.drawImage(trimmedCanvas, 0, 0);
      flashCtx.globalCompositeOperation = 'source-in';
      flashCtx.fillStyle = '#FFFBEB';
      flashCtx.fillRect(0, 0, sw, sh);
    }

    results.push({
      canvas: trimmedCanvas,
      flashCanvas,
      width: sw,
      height: sh,
      aspect: sw / sh,
    });
  }

  return results;
}

function loadHeroSheet(heroId: string) {
  const sheetKey = `sheet_hero_${heroId}`;
  if (loadingSheets.has(sheetKey)) return;
  const cfg = HERO_SHEETS[heroId];
  if (!cfg) return;

  loadingSheets.add(sheetKey);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const frames = processPixelArtSheet(img, cfg);
      if (frames[0]) processedCache.set(`hero_${heroId}_idle`, frames[0]);
      if (frames[1]) processedCache.set(`hero_${heroId}_attack`, frames[1]);
      if (frames.length > 0) notifySpritesUpdated();
    } catch {
      // Fall back cleanly if canvas read fails
    } finally {
      loadingSheets.delete(sheetKey);
    }
  };
  img.onerror = () => {
    loadingSheets.delete(sheetKey);
  };
  img.src = cfg.url;
}

function loadBuildingSheet(type: Exclude<StructureType, 'trap'>) {
  const sheetKey = `sheet_bldg_${type}`;
  if (loadingSheets.has(sheetKey)) return;
  const cfg = BUILDING_SHEETS[type];
  if (!cfg) return;

  loadingSheets.add(sheetKey);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const frames = processPixelArtSheet(img, cfg);
      if (frames[0]) processedCache.set(`bldg_${type}_t1`, frames[0]);
      if (frames[1]) processedCache.set(`bldg_${type}_t2`, frames[1]);
      if (frames[2]) processedCache.set(`bldg_${type}_t3`, frames[2]);
      if (frames.length > 0) notifySpritesUpdated();
    } catch {
      // Fall back cleanly if canvas read fails
    } finally {
      loadingSheets.delete(sheetKey);
    }
  };
  img.onerror = () => {
    loadingSheets.delete(sheetKey);
  };
  img.src = cfg.url;
}

function loadHeroWalkSheet(heroId: string) {
  const sheetKey = `sheet_hero_walk_${heroId}`;
  if (loadingSheets.has(sheetKey)) return;
  const cfg = HERO_WALK_SHEETS[heroId];
  if (!cfg) return;

  loadingSheets.add(sheetKey);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const frames = processPixelArtSheet(img, cfg);
      if (frames[0]) processedCache.set(`hero_${heroId}_walk1`, frames[0]);
      if (frames[1]) processedCache.set(`hero_${heroId}_walk2`, frames[1]);
      if (frames[2]) processedCache.set(`hero_${heroId}_walk3`, frames[2]);
      if (frames.length > 0) notifySpritesUpdated();
    } catch {
      // Fall back cleanly if canvas read fails
    } finally {
      loadingSheets.delete(sheetKey);
    }
  };
  img.onerror = () => {
    loadingSheets.delete(sheetKey);
  };
  img.src = cfg.url;
}

export function preloadGameSprites(): void {
  if (preloaded || typeof window === 'undefined') return;
  preloaded = true;
  for (const heroId of Object.keys(HERO_SHEETS)) {
    loadHeroSheet(heroId);
    loadHeroWalkSheet(heroId);
  }
  for (const type of Object.keys(BUILDING_SHEETS) as Array<Exclude<StructureType, 'trap'>>) {
    loadBuildingSheet(type);
  }
}

export function getHeroSprite(
  heroId: string,
  pose: HeroSpritePose
): ProcessedSprite | null {
  preloadGameSprites();
  const key = `hero_${heroId}_${pose}`;
  return processedCache.get(key) ?? processedCache.get(`hero_${heroId}_idle`) ?? null;
}

export function getBuildingSprite(
  type: StructureType,
  level = 1
): ProcessedSprite | null {
  if (type === 'trap') return null;
  preloadGameSprites();
  const tier = getBuildingVisualTier(level);
  return (
    processedCache.get(`bldg_${type}_t${tier}`) ??
    processedCache.get(`bldg_${type}_t1`) ??
    null
  );
}
