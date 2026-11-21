import {
  DEPLOY_MARGIN,
  GRID_SIZE,
  HERO_ALTAR_PATROL_RADIUS,
  STRUCTURES_CATALOG,
} from '../data/gameCatalog';
import {
  BattleHeroEntity,
  BattleParticle,
  BattleProjectile,
  BattleStructureEntity,
  BattleVfx,
  FloatingText,
  PlacedStructure,
  StructureType,
} from '../types/game';
import { formatDurationSec, getHeroById } from './math';
import {
  getBuildingSprite,
  getBuildingVisualTier,
  getHeroSprite,
  preloadGameSprites,
} from './spriteLoader';

// Trigger background preloading of all Stone Age 32-bit pixel-art hero & building sprites immediately
preloadGameSprites();

export interface GameCamera {
  zoom: number;
  panX: number;
  panY: number;
}

export interface IsoViewport {
  width: number;
  height: number;
  originX: number;
  originY: number;
  tileW: number;
  tileH: number;
  zoom: number;
}

export function computeIsoViewport(
  width: number,
  height: number,
  camera?: GameCamera
): IsoViewport {
  const zoom = camera?.zoom ?? 1;
  const panX = camera?.panX ?? 0;
  const panY = camera?.panY ?? 0;

  const maxTileW = (width * 0.94) / GRID_SIZE;
  const maxTileH = (height * 0.88) / GRID_SIZE;
  const baseTileH = Math.max(18, Math.min(maxTileH, maxTileW * 0.5));
  const tileH = baseTileH * zoom;
  const tileW = tileH * 2;
  const totalDiamondH = GRID_SIZE * tileH;
  const originX = width * 0.5 + panX;
  const originY = (height - totalDiamondH) * 0.5 + tileH * 0.5 + panY;
  return { width, height, originX, originY, tileW, tileH, zoom };
}

export function gridToScreen(gx: number, gy: number, vp: IsoViewport): { x: number; y: number } {
  return {
    x: vp.originX + (gx - gy) * (vp.tileW * 0.5),
    y: vp.originY + (gx + gy) * (vp.tileH * 0.5),
  };
}

export function screenToGrid(sx: number, sy: number, vp: IsoViewport): { gx: number; gy: number } {
  const relX = sx - vp.originX;
  const relY = sy - vp.originY;
  const halfW = vp.tileW * 0.5;
  const halfH = vp.tileH * 0.5;
  const gx = Math.floor((relX / halfW + relY / halfH) * 0.5);
  const gy = Math.floor((relY / halfH - relX / halfW) * 0.5);
  return { gx, gy };
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
  lineWidth = 1
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.5);
  ctx.lineTo(cx + w * 0.5, cy);
  ctx.lineTo(cx, cy + h * 0.5);
  ctx.lineTo(cx - w * 0.5, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  depth: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
  outline = 'rgba(26, 22, 18, 0.42)'
) {
  const hw = w * 0.5;
  const hh = h * 0.5;

  // Left face
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy - depth);
  ctx.lineTo(cx, cy + hh - depth);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy - depth);
  ctx.lineTo(cx, cy + hh - depth);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx + hw, cy);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  ctx.stroke();

  // Top face
  drawDiamond(ctx, cx, cy - depth, w, h, topColor, outline, 1);
}

// Lush surrounding forest around the spacious 20x20 sunlit clearing (pines, sunlit oaks & golden-autumn trees)
type ScenicTreeKind = 'pine' | 'oak' | 'gold';

const PERIMETER_TREES: Array<{ gx: number; gy: number; scale: number; kind: ScenicTreeKind }> = [
  // Back-left woodland (gy < 0 / gx < 0)
  { gx: -2.4, gy: 1.5, scale: 1.25, kind: 'pine' },
  { gx: -1.7, gy: 4.8, scale: 1.12, kind: 'gold' },
  { gx: -2.6, gy: 8.2, scale: 1.28, kind: 'oak' },
  { gx: -1.8, gy: 11.8, scale: 1.18, kind: 'pine' },
  { gx: -2.5, gy: 15.6, scale: 1.24, kind: 'oak' },
  { gx: -1.6, gy: 18.8, scale: 1.1, kind: 'gold' },
  // Back-top ridge (gy < 0)
  { gx: 1.4, gy: -2.2, scale: 1.18, kind: 'oak' },
  { gx: 4.8, gy: -2.5, scale: 1.28, kind: 'pine' },
  { gx: 8.6, gy: -2.0, scale: 1.14, kind: 'gold' },
  { gx: 12.2, gy: -2.6, scale: 1.22, kind: 'pine' },
  { gx: 15.8, gy: -2.1, scale: 1.15, kind: 'oak' },
  // Right forest flanking the turquoise brook & cliffs (gx >= GRID_SIZE)
  { gx: 22.0, gy: 1.6, scale: 1.18, kind: 'oak' },
  { gx: 22.6, gy: 5.4, scale: 1.28, kind: 'pine' },
  { gx: 21.9, gy: 9.8, scale: 1.22, kind: 'gold' },
  { gx: 22.8, gy: 13.6, scale: 1.25, kind: 'oak' },
  { gx: 21.8, gy: 17.4, scale: 1.15, kind: 'pine' },
  // Lower foreground woodland framing the plateau (gy >= GRID_SIZE)
  { gx: 2.0, gy: 21.8, scale: 1.16, kind: 'oak' },
  { gx: 6.2, gy: 22.4, scale: 1.22, kind: 'pine' },
  { gx: 10.6, gy: 21.9, scale: 1.14, kind: 'oak' },
  { gx: 15.0, gy: 22.3, scale: 1.2, kind: 'gold' },
  { gx: 18.8, gy: 21.7, scale: 1.18, kind: 'pine' },
];

const SCENIC_BOULDERS: Array<{ gx: number; gy: number; scale: number }> = [
  { gx: -1.4, gy: 7.0, scale: 1.0 },
  { gx: -1.2, gy: 14.2, scale: 0.85 },
  { gx: 7.0, gy: -1.4, scale: 0.9 },
  { gx: 21.4, gy: 8.0, scale: 1.05 },
  { gx: 21.2, gy: 15.8, scale: 0.9 },
  { gx: 12.8, gy: 21.2, scale: 0.95 },
];

function drawScenicBoulder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + 2 * scale, y + 2 * scale, 11 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(24, 46, 22, 0.32)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - 10 * scale, y + 1 * scale);
  ctx.lineTo(x - 6 * scale, y - 8 * scale);
  ctx.lineTo(x + 3 * scale, y - 9 * scale);
  ctx.lineTo(x + 10 * scale, y - 2 * scale);
  ctx.lineTo(x + 8 * scale, y + 3 * scale);
  ctx.lineTo(x - 7 * scale, y + 4 * scale);
  ctx.closePath();
  ctx.fillStyle = '#8F9AA3';
  ctx.fill();
  ctx.strokeStyle = 'rgba(46, 56, 66, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Sunlit top rock facet
  ctx.beginPath();
  ctx.moveTo(x - 6 * scale, y - 8 * scale);
  ctx.lineTo(x + 3 * scale, y - 9 * scale);
  ctx.lineTo(x + 6 * scale, y - 4 * scale);
  ctx.lineTo(x - 3 * scale, y - 3 * scale);
  ctx.closePath();
  ctx.fillStyle = '#C2CCD4';
  ctx.fill();
  ctx.restore();
}

function drawScenicTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  kind: ScenicTreeKind,
  timeSec: number
) {
  const sway = Math.sin(timeSec * 1.45 + x * 0.025) * 1.5 * scale;
  ctx.save();
  // Soft sunlit ground shadow
  ctx.beginPath();
  ctx.ellipse(x + 4 * scale, y + 3 * scale, 14 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(24, 52, 24, 0.3)';
  ctx.fill();

  // Sturdy trunk
  ctx.fillStyle = '#734B29';
  ctx.fillRect(x - 3 * scale, y - 14 * scale, 6 * scale, 15 * scale);

  if (kind === 'pine') {
    const tiers = [
      { dy: -12, w: 15.5, h: 14, c: '#236334' },
      { dy: -21, w: 12.5, h: 13.5, c: '#32803E' },
      { dy: -30, w: 9, h: 12.5, c: '#4AA148' },
    ];
    for (const t of tiers) {
      ctx.beginPath();
      ctx.moveTo(x + sway, y + (t.dy - t.h) * scale);
      ctx.lineTo(x + t.w * scale + sway * 0.5, y + t.dy * scale);
      ctx.lineTo(x - t.w * scale + sway * 0.5, y + t.dy * scale);
      ctx.closePath();
      ctx.fillStyle = t.c;
      ctx.fill();
    }
  } else if (kind === 'gold') {
    // Warm golden-sunlit autumn tree (inspired by bright accent trees on the clearing edge)
    const puffs = [
      { dx: -7.5, dy: -18, r: 9.5, c: '#B48421' },
      { dx: 7.5, dy: -17, r: 9, c: '#9E7119' },
      { dx: 0, dy: -24.5, r: 10.8, c: '#D8A62E' },
      { dx: -3, dy: -27.5, r: 6.8, c: '#F4CD55' },
    ];
    for (const p of puffs) {
      ctx.beginPath();
      ctx.arc(x + p.dx * scale + sway, y + p.dy * scale, p.r * scale, 0, Math.PI * 2);
      ctx.fillStyle = p.c;
      ctx.fill();
    }
  } else {
    // Bright sunlit puffy oak canopy
    const puffs = [
      { dx: -7.5, dy: -18, r: 9.8, c: '#357E3B' },
      { dx: 7.5, dy: -17, r: 9.2, c: '#296A32' },
      { dx: 0, dy: -24.5, r: 10.8, c: '#54A749' },
      { dx: -3, dy: -27.5, r: 6.8, c: '#81C957' },
    ];
    for (const p of puffs) {
      ctx.beginPath();
      ctx.arc(x + p.dx * scale + sway, y + p.dy * scale, p.r * scale, 0, Math.PI * 2);
      ctx.fillStyle = p.c;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawScenicStreamAndBridge(
  ctx: CanvasRenderingContext2D,
  vp: IsoViewport,
  timeSec: number
) {
  const sc = vp.tileH / 28;
  // Upper-right mountain brook & turquoise cliff pond flowing gracefully outside the clearing
  const p0 = gridToScreen(17.5, -4.8, vp);
  const p1 = gridToScreen(19.6, -2.2, vp);
  const p2 = gridToScreen(22.4, -0.4, vp);
  const p3 = gridToScreen(25.2, 2.2, vp);

  ctx.save();
  // Rocky cliff bank beneath the brook
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
  ctx.quadraticCurveTo(p2.x + 18 * sc, p2.y + 18 * sc, p3.x, p3.y);
  ctx.strokeStyle = 'rgba(84, 108, 72, 0.72)';
  ctx.lineWidth = 34 * sc;
  ctx.stroke();

  // Deep turquoise riverbed
  ctx.strokeStyle = '#0E8BB8';
  ctx.lineWidth = 24 * sc;
  ctx.stroke();

  // Bright sunlit mountain stream surface
  ctx.strokeStyle = '#3CC2E8';
  ctx.lineWidth = 17 * sc;
  ctx.stroke();

  // Animated sparkling water foam highlights
  const rippleShift = (timeSec * 22) % 28;
  ctx.strokeStyle = 'rgba(224, 247, 255, 0.72)';
  ctx.lineWidth = 2.4 * sc;
  ctx.setLineDash([8 * sc, 20 * sc]);
  ctx.lineDashOffset = -rippleShift * sc;
  ctx.stroke();
  ctx.setLineDash([]);

  // Rustic wooden footbridge crossing the brook at (20.4, -1.5)
  const br = gridToScreen(20.4, -1.5, vp);
  ctx.save();
  ctx.translate(br.x, br.y);
  ctx.rotate(-0.46);
  // Bridge shadow on water
  ctx.fillStyle = 'rgba(12, 54, 76, 0.35)';
  ctx.fillRect(-13 * sc, -5 * sc, 26 * sc, 15 * sc);
  // Timber planks
  ctx.fillStyle = '#B87A42';
  ctx.fillRect(-13 * sc, -8 * sc, 26 * sc, 13 * sc);
  ctx.strokeStyle = '#6E431E';
  ctx.lineWidth = 1.4 * sc;
  ctx.strokeRect(-13 * sc, -8 * sc, 26 * sc, 13 * sc);
  for (let i = -9; i <= 9; i += 4.5) {
    ctx.beginPath();
    ctx.moveTo(i * sc, -8 * sc);
    ctx.lineTo(i * sc, 5 * sc);
    ctx.stroke();
  }
  // Wooden guard posts
  ctx.fillStyle = '#D99B5E';
  for (const px of [-11, 0, 11]) {
    ctx.fillRect((px - 1.5) * sc, -11 * sc, 3 * sc, 4 * sc);
    ctx.fillRect((px - 1.5) * sc, 3.5 * sc, 3 * sc, 4 * sc);
  }
  ctx.restore();

  // Small rocky outcrop on the far-left edge (misty highland cliff accent)
  const cliff = gridToScreen(-2.4, 21.0, vp);
  ctx.beginPath();
  ctx.moveTo(cliff.x - 42 * sc, cliff.y - 8 * sc);
  ctx.lineTo(cliff.x + 8 * sc, cliff.y - 22 * sc);
  ctx.lineTo(cliff.x + 36 * sc, cliff.y + 12 * sc);
  ctx.lineTo(cliff.x - 24 * sc, cliff.y + 34 * sc);
  ctx.closePath();
  ctx.fillStyle = '#5D6A74';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cliff.x - 32 * sc, cliff.y - 6 * sc);
  ctx.lineTo(cliff.x + 8 * sc, cliff.y - 22 * sc);
  ctx.lineTo(cliff.x + 22 * sc, cliff.y - 2 * sc);
  ctx.lineTo(cliff.x - 10 * sc, cliff.y + 10 * sc);
  ctx.closePath();
  ctx.fillStyle = '#759D54';
  ctx.fill();
  ctx.restore();
}

export function drawSunlitArena(
  ctx: CanvasRenderingContext2D,
  vp: IsoViewport,
  options: {
    highlightPerimeter?: boolean;
    showGridGuides?: boolean;
    hoverCell?: { gx: number; gy: number } | null;
    placingType?: StructureType | null;
    canPlace?: boolean;
    selectedCell?: { gx: number; gy: number } | null;
    rangeOverlay?: { gx: number; gy: number; range: number; color: string } | null;
    timeSec: number;
  }
) {
  // Bright, airy sunlit highland-meadow backdrop (Castle Clash inspired warmth & clarity)
  const bg = ctx.createRadialGradient(
    vp.width * 0.5,
    vp.height * 0.42,
    40,
    vp.width * 0.5,
    vp.height * 0.5,
    Math.max(vp.width, vp.height) * 0.84
  );
  bg.addColorStop(0, '#84BE50');
  bg.addColorStop(0.55, '#5D9842');
  bg.addColorStop(1, '#346130');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, vp.width, vp.height);

  // Warm golden morning sunlight wash from upper-left
  const sunGlow = ctx.createRadialGradient(
    vp.width * 0.14,
    vp.height * 0.08,
    12,
    vp.width * 0.14,
    vp.height * 0.08,
    vp.width * 0.62
  );
  sunGlow.addColorStop(0, 'rgba(255, 242, 186, 0.28)');
  sunGlow.addColorStop(1, 'rgba(255, 242, 186, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, vp.width, vp.height);

  // Scenic mountain stream, rustic footbridge & rocky cliff accents
  drawScenicStreamAndBridge(ctx, vp, options.timeSec);

  const treeScaleFactor = vp.tileH / 28;
  // Back scenic trees & boulders behind top two edges of the clearing
  for (const b of SCENIC_BOULDERS) {
    if (b.gx < 0 || b.gy < 0) {
      const p = gridToScreen(b.gx, b.gy, vp);
      drawScenicBoulder(ctx, p.x, p.y, b.scale * treeScaleFactor);
    }
  }
  for (const tree of PERIMETER_TREES) {
    if (tree.gx < 0 || tree.gy < 0) {
      const p = gridToScreen(tree.gx, tree.gy, vp);
      drawScenicTree(ctx, p.x, p.y, tree.scale * treeScaleFactor, tree.kind, options.timeSec);
    }
  }

  // Gentle grassy highland terrace edge beneath the 20x20 clearing (no heavy dark plinth)
  const topCorner = gridToScreen(0, 0, vp);
  const rightCorner = gridToScreen(GRID_SIZE, 0, vp);
  const bottomCorner = gridToScreen(GRID_SIZE, GRID_SIZE, vp);
  const leftCorner = gridToScreen(0, GRID_SIZE, vp);
  const lipDrop = Math.max(6, vp.tileH * 0.28);

  ctx.beginPath();
  ctx.moveTo(leftCorner.x, leftCorner.y);
  ctx.lineTo(bottomCorner.x, bottomCorner.y);
  ctx.lineTo(bottomCorner.x, bottomCorner.y + lipDrop);
  ctx.lineTo(leftCorner.x, leftCorner.y + lipDrop);
  ctx.closePath();
  ctx.fillStyle = '#5C8D3B';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(rightCorner.x, rightCorner.y);
  ctx.lineTo(bottomCorner.x, bottomCorner.y);
  ctx.lineTo(bottomCorner.x, bottomCorner.y + lipDrop);
  ctx.lineTo(rightCorner.x, rightCorner.y + lipDrop);
  ctx.closePath();
  ctx.fillStyle = '#48742E';
  ctx.fill();

  // Draw clean, spacious 20x20 sunlit lawn with subtle 2x2 Castle Clash patchwork
  const showGrid = Boolean(options.showGridGuides);
  const innerMin = DEPLOY_MARGIN;
  const innerMax = GRID_SIZE - DEPLOY_MARGIN - 1;

  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      const center = gridToScreen(gx + 0.5, gy + 0.5, vp);
      const isDeployZone =
        gx < innerMin || gy < innerMin || gx > innerMax || gy > innerMax;
      const patch2x2 = (Math.floor(gx / 2) + Math.floor(gy / 2)) % 2 === 0;
      const microTone = (gx + gy) % 2 === 0;

      let fill: string;
      if (isDeployZone) {
        // Fresh outer approach meadow where attacking heroes enter smoothly
        fill = patch2x2 ? '#8CC04E' : '#85B848';
      } else {
        // Bright, warm sunlit inner village lawn in clean 2x2 blocks
        fill = patch2x2
          ? microTone
            ? '#A6D261'
            : '#A1CD5C'
          : microTone
          ? '#9AC755'
          : '#95C251';
      }

      const stroke = showGrid
        ? isDeployZone
          ? 'rgba(255, 250, 224, 0.14)'
          : 'rgba(255, 250, 224, 0.34)'
        : !isDeployZone
        ? 'rgba(116, 158, 56, 0.12)'
        : undefined;

      drawDiamond(
        ctx,
        center.x,
        center.y,
        vp.tileW + 0.6,
        vp.tileH + 0.6,
        fill,
        stroke,
        showGrid ? 0.9 : 0.65
      );

      if (options.highlightPerimeter && isDeployZone) {
        const pulse = 0.16 + Math.sin(options.timeSec * 3.6) * 0.08;
        drawDiamond(
          ctx,
          center.x,
          center.y,
          vp.tileW * 0.95,
          vp.tileH * 0.95,
          `rgba(250, 204, 21, ${pulse})`,
          'rgba(254, 240, 138, 0.45)',
          0.9
        );
      }

      if (options.selectedCell && options.selectedCell.gx === gx && options.selectedCell.gy === gy) {
        drawDiamond(
          ctx,
          center.x,
          center.y,
          vp.tileW * 0.96,
          vp.tileH * 0.96,
          'rgba(250, 204, 21, 0.34)',
          '#FDE047',
          2
        );
      }

      if (options.hoverCell && options.hoverCell.gx === gx && options.hoverCell.gy === gy) {
        const fillColor = options.placingType
          ? options.canPlace
            ? 'rgba(34, 197, 94, 0.42)'
            : 'rgba(239, 68, 68, 0.45)'
          : 'rgba(255, 255, 255, 0.22)';
        const strokeColor = options.placingType
          ? options.canPlace
            ? '#4ADE80'
            : '#F87171'
          : 'rgba(255, 255, 255, 0.72)';
        drawDiamond(
          ctx,
          center.x,
          center.y,
          vp.tileW * 0.96,
          vp.tileH * 0.96,
          fillColor,
          strokeColor,
          1.8
        );
      }
    }
  }

  // Subtle sunlit sandstone border framing the inner buildable village courtyard
  const cTop = gridToScreen(innerMin, innerMin, vp);
  const cRight = gridToScreen(GRID_SIZE - innerMin, innerMin, vp);
  const cBottom = gridToScreen(GRID_SIZE - innerMin, GRID_SIZE - innerMin, vp);
  const cLeft = gridToScreen(innerMin, GRID_SIZE - innerMin, vp);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cTop.x, cTop.y);
  ctx.lineTo(cRight.x, cRight.y);
  ctx.lineTo(cBottom.x, cBottom.y);
  ctx.lineTo(cLeft.x, cLeft.y);
  ctx.closePath();
  ctx.strokeStyle = options.highlightPerimeter
    ? 'rgba(254, 240, 138, 0.88)'
    : 'rgba(246, 236, 192, 0.55)';
  ctx.lineWidth = options.highlightPerimeter ? 2.2 : 1.6;
  ctx.stroke();

  // Whisper-soft outer clearing edge
  ctx.beginPath();
  ctx.moveTo(topCorner.x, topCorner.y);
  ctx.lineTo(rightCorner.x, rightCorner.y);
  ctx.lineTo(bottomCorner.x, bottomCorner.y);
  ctx.lineTo(leftCorner.x, leftCorner.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(236, 248, 200, 0.34)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  // Foreground boulders & trees framing lower edges
  for (const b of SCENIC_BOULDERS) {
    if (b.gx >= GRID_SIZE || b.gy >= GRID_SIZE) {
      const p = gridToScreen(b.gx, b.gy, vp);
      drawScenicBoulder(ctx, p.x, p.y, b.scale * treeScaleFactor);
    }
  }
  for (const tree of PERIMETER_TREES) {
    if (tree.gx >= GRID_SIZE || tree.gy >= GRID_SIZE) {
      const p = gridToScreen(tree.gx, tree.gy, vp);
      drawScenicTree(ctx, p.x, p.y, tree.scale * treeScaleFactor, tree.kind, options.timeSec);
    }
  }

  // Optional Range Ring
  if (options.rangeOverlay && options.rangeOverlay.range > 0) {
    const center = gridToScreen(options.rangeOverlay.gx + 0.5, options.rangeOverlay.gy + 0.5, vp);
    const rx = options.rangeOverlay.range * vp.tileW * 0.5;
    const ry = options.rangeOverlay.range * vp.tileH * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = `${options.rangeOverlay.color}1E`;
    ctx.fill();
    ctx.strokeStyle = `${options.rangeOverlay.color}DD`;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 4]);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDestroyedRuins(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  type: StructureType,
  timeSec: number
) {
  if (type === 'trap') {
    // Sprung iron trap grate
    drawDiamond(ctx, cx, cy, w * 0.6, h * 0.6, '#451A03', '#78350F', 1);
    return;
  }

  ctx.save();
  // Scorched crater dirt base
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, w * 0.46, h * 0.46, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(34, 28, 22, 0.72)';
  ctx.fill();

  // Scattered broken limestone masonry blocks
  const chunks = [
    { dx: -9, dy: -2, rw: 7, rh: 5, c: '#948B7B' },
    { dx: 5, dy: -4, rw: 8, rh: 5, c: '#B3A894' },
    { dx: -2, dy: 4, rw: 9, rh: 4, c: '#756D60' },
    { dx: 9, dy: 3, rw: 5, rh: 4, c: '#8B8273' },
  ];
  for (const ch of chunks) {
    ctx.fillStyle = ch.c;
    ctx.fillRect(cx + ch.dx, cy + ch.dy, ch.rw, ch.rh);
    ctx.strokeStyle = 'rgba(20, 18, 16, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(cx + ch.dx, cy + ch.dy, ch.rw, ch.rh);
  }

  // Splintered timber cross-beam
  ctx.strokeStyle = '#5C3A1E';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + 3);
  ctx.lineTo(cx + 8, cy - 5);
  ctx.stroke();

  // Residual glowing ember pulse on major ruins
  if (type !== 'wall') {
    const glow = 0.45 + Math.sin(timeSec * 6 + cx) * 0.3;
    ctx.fillStyle = `rgba(249, 115, 22, ${glow})`;
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDamageCracksAndFire(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hpPct: number,
  isBurning: boolean,
  timeSec: number,
  scale: number
) {
  if (hpPct < 0.72) {
    // Dark jagged cracks on building masonry
    ctx.save();
    ctx.strokeStyle = 'rgba(28, 22, 18, 0.78)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - 7 * scale, cy - 12 * scale);
    ctx.lineTo(cx - 2 * scale, cy - 7 * scale);
    ctx.lineTo(cx - 5 * scale, cy - 2 * scale);
    ctx.stroke();

    if (hpPct < 0.45) {
      ctx.beginPath();
      ctx.moveTo(cx + 6 * scale, cy - 14 * scale);
      ctx.lineTo(cx + 3 * scale, cy - 8 * scale);
      ctx.lineTo(cx + 8 * scale, cy - 3 * scale);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (hpPct < 0.35 || isBurning) {
    // Live flickering flame tongues on the damaged/burning structure
    const flick = Math.sin(timeSec * 16 + cx) * 2.5;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - 7 * scale, cy - 10 * scale);
    ctx.quadraticCurveTo(cx - 2 * scale, cy - (24 + flick) * scale, cx + 2 * scale, cy - 10 * scale);
    ctx.fillStyle = 'rgba(249, 115, 22, 0.88)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - 3 * scale, cy - 10 * scale);
    ctx.quadraticCurveTo(cx + 4 * scale, cy - (20 - flick) * scale, cx + 8 * scale, cy - 9 * scale);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
    ctx.fill();
    ctx.restore();
  }
}

const BUILDING_SPRITE_METRICS: Record<
  Exclude<StructureType, 'trap'>,
  { heightMult: number; anchorY: number; shadowW: number; shadowH: number; hpBarOffset: number }
> = {
  core: { heightMult: 3.05, anchorY: 0.46, shadowW: 0.7, shadowH: 0.7, hpBarOffset: 2.95 },
  archer_tower: { heightMult: 2.52, anchorY: 0.38, shadowW: 0.52, shadowH: 0.52, hpBarOffset: 2.48 },
  cannon: { heightMult: 2.02, anchorY: 0.4, shadowW: 0.56, shadowH: 0.56, hpBarOffset: 2.04 },
  arcane_tower: { heightMult: 2.5, anchorY: 0.38, shadowW: 0.52, shadowH: 0.52, hpBarOffset: 2.45 },
  electric_tower: { heightMult: 2.48, anchorY: 0.38, shadowW: 0.52, shadowH: 0.52, hpBarOffset: 2.44 },
  ice_tower: { heightMult: 2.45, anchorY: 0.38, shadowW: 0.52, shadowH: 0.52, hpBarOffset: 2.4 },
  poison_tower: { heightMult: 2.28, anchorY: 0.38, shadowW: 0.54, shadowH: 0.54, hpBarOffset: 2.25 },
  gold_mine: { heightMult: 2.15, anchorY: 0.4, shadowW: 0.58, shadowH: 0.58, hpBarOffset: 2.12 },
  crystal_mine: { heightMult: 2.18, anchorY: 0.4, shadowW: 0.58, shadowH: 0.58, hpBarOffset: 2.15 },
  essence_well: { heightMult: 2.2, anchorY: 0.4, shadowW: 0.56, shadowH: 0.56, hpBarOffset: 2.18 },
  storage: { heightMult: 2.16, anchorY: 0.4, shadowW: 0.58, shadowH: 0.58, hpBarOffset: 2.14 },
  wall: { heightMult: 1.65, anchorY: 0.38, shadowW: 0.48, shadowH: 0.48, hpBarOffset: 1.62 },
  hero_altar: { heightMult: 1.92, anchorY: 0.44, shadowW: 0.64, shadowH: 0.64, hpBarOffset: 1.96 },
};

function drawBuildingAmbientFx(
  ctx: CanvasRenderingContext2D,
  type: StructureType,
  tier: 1 | 2 | 3,
  cx: number,
  topY: number,
  drawH: number,
  recoil: number,
  timeSec: number,
  sc: number
) {
  if (type === 'core') {
    // Tier 2+: gentle tribal hearth smoke; Tier 3: flickering campfire sparks & warm glow
    if (tier >= 2) {
      const puff = ((timeSec * 10 + cx) % 16) * sc;
      const alpha = Math.max(0, 0.34 * (1 - puff / (16 * sc)));
      ctx.save();
      ctx.fillStyle = `rgba(226, 232, 240, ${alpha})`;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(timeSec * 2.5) * 2.5 * sc, topY + drawH * 0.14 - puff, (2.2 + puff * 0.14) * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (tier === 3) {
      const flicker = 0.24 + Math.sin(timeSec * 11 + cx) * 0.1;
      const sparkLift = ((timeSec * 18 + cx) % 14) * sc;
      ctx.save();
      ctx.fillStyle = `rgba(251, 146, 60, ${flicker})`;
      ctx.beginPath();
      ctx.arc(cx - 10 * sc, topY + drawH * 0.78, 9 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(Math.round(cx - 11 * sc + Math.sin(timeSec * 8) * 2 * sc), Math.round(topY + drawH * 0.74 - sparkLift), 2, 2);
      ctx.restore();
    }
  } else if (type === 'arcane_tower') {
    // Pulsing ancestral shaman aura + orbiting spirit wisps
    const pulse = (0.2 + tier * 0.05) + Math.sin(timeSec * 5.2 + cx) * 0.12;
    const orbY = topY + drawH * 0.24;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, orbY, (10 + tier * 2) * sc, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(192, 132, 252, ${pulse})`;
    ctx.fill();
    const orbitX = cx + Math.cos(timeSec * 3.8 + cx) * (8 + tier) * sc;
    const orbitY = orbY + Math.sin(timeSec * 3.8 + cx) * 4 * sc;
    ctx.fillStyle = '#FDE68A';
    ctx.fillRect(Math.round(orbitX) - 1, Math.round(orbitY) - 1, 3, 3);
    ctx.restore();
  } else if (type === 'electric_tower') {
    // Crackling cyan thunder arcs jumping off the stone monolith
    if (Math.sin(timeSec * (12 + tier * 2) + cx) > (0.35 - tier * 0.12)) {
      const orbY = topY + drawH * 0.22;
      ctx.save();
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx - 3 * sc, orbY);
      ctx.lineTo(cx + 6 * sc, orbY + 4 * sc);
      ctx.lineTo(cx + 1 * sc, orbY + 11 * sc);
      ctx.stroke();
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  } else if (type === 'ice_tower') {
    // Drifting glacial frost crystal flakes & chill shimmer
    const f1 = ((timeSec * 12 + cx) % 16) * sc;
    const f2 = ((timeSec * 12 + cx + 8) % 16) * sc;
    ctx.save();
    ctx.fillStyle = 'rgba(186, 230, 253, 0.88)';
    ctx.fillRect(Math.round(cx - 6 * sc + Math.sin(timeSec * 3) * 2), Math.round(topY + drawH * 0.2 + f1), 2.5, 2.5);
    ctx.fillRect(Math.round(cx + 5 * sc + Math.cos(timeSec * 2.7) * 2), Math.round(topY + drawH * 0.18 + f2), 2, 2);
    ctx.restore();
  } else if (type === 'poison_tower') {
    // Rising emerald herbal bubbles & toxic steam from the stone cauldron
    const b1 = ((timeSec * 15 + cx) % 15) * sc;
    const b2 = ((timeSec * 15 + cx + 7) % 15) * sc;
    ctx.save();
    ctx.fillStyle = 'rgba(134, 239, 172, 0.9)';
    ctx.beginPath();
    ctx.arc(cx - 4 * sc, topY + drawH * 0.32 - b1, (2.1 + tier * 0.25) * sc, 0, Math.PI * 2);
    ctx.arc(cx + 4 * sc, topY + drawH * 0.34 - b2, (1.8 + tier * 0.2) * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (type === 'essence_well') {
    // Luminous ancestral spring droplets rising upward
    const lift = ((timeSec * 13 + cx) % 16) * sc;
    ctx.save();
    ctx.fillStyle = 'rgba(110, 231, 183, 0.92)';
    ctx.fillRect(Math.round(cx + Math.sin(timeSec * 4) * 3 * sc), Math.round(topY + drawH * 0.58 - lift), 3, 3);
    ctx.restore();
  } else if (type === 'hero_altar') {
    // Subtle tribal altar glow + Tier 3 flickering golden brazier sparks
    const glow = 0.16 + tier * 0.04 + Math.sin(timeSec * 4.2 + cx) * 0.06;
    ctx.save();
    ctx.fillStyle = `rgba(245, 158, 11, ${glow})`;
    ctx.beginPath();
    ctx.arc(cx, topY + drawH * 0.35, (8 + tier * 2) * sc, 0, Math.PI * 2);
    ctx.fill();
    if (tier === 3) {
      const s1 = ((timeSec * 16 + cx) % 14) * sc;
      const s2 = ((timeSec * 16 + cx + 7) % 14) * sc;
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(Math.round(cx - 11 * sc + Math.sin(timeSec * 7) * 1.5), Math.round(topY + drawH * 0.55 - s1), 2.5, 2.5);
      ctx.fillRect(Math.round(cx + 10 * sc + Math.cos(timeSec * 6.5) * 1.5), Math.round(topY + drawH * 0.55 - s2), 2.5, 2.5);
    }
    ctx.restore();
  } else if ((type === 'cannon' || type === 'archer_tower') && recoil > 0.45) {
    // Stone Age launch dust cloud & flint spark burst right as the tower fires
    const flashAlpha = Math.min(1, (recoil - 0.45) * 2);
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.beginPath();
    ctx.arc(cx, topY + drawH * 0.3, (type === 'cannon' ? 12 : 8.5) * sc, 0, Math.PI * 2);
    ctx.fillStyle = type === 'cannon' ? 'rgba(214, 211, 209, 0.85)' : '#FDE047';
    ctx.fill();
    ctx.restore();
  }
}

export function drawIsoStructure(
  ctx: CanvasRenderingContext2D,
  structure: PlacedStructure | BattleStructureEntity,
  vp: IsoViewport,
  options: {
    timeSec: number;
    nowMs?: number;
    isBattle?: boolean;
    isSelected?: boolean;
    isHovered?: boolean;
    hasCollectible?: boolean;
    collectLabel?: string;
    isGhost?: boolean;
    allStructures?: Array<PlacedStructure | BattleStructureEntity>;
  }
) {
  const isBattleEntity = 'hp' in structure;
  const nowMs = options.nowMs ?? Date.now();
  const isUnderConstruction =
    !isBattleEntity &&
    !options.isGhost &&
    Boolean(
      structure.constructionState &&
        structure.constructionEndsAt &&
        structure.constructionEndsAt > nowMs
    );
  const constructionRemainingSec =
    !isBattleEntity && isUnderConstruction
      ? Math.max(0, ((structure.constructionEndsAt ?? nowMs) - nowMs) / 1000)
      : 0;
  const constructionTotalSec = Math.max(
    1,
    !isBattleEntity ? (structure.constructionDurationSec ?? 10) : 10
  );
  const constructionProgress = isUnderConstruction
    ? Math.max(0, Math.min(1, 1 - constructionRemainingSec / constructionTotalSec))
    : 1;
  const center = gridToScreen(structure.gridX + 0.5, structure.gridY + 0.5, vp);
  const w = vp.tileW * 0.84;
  const h = vp.tileH * 0.84;
  const sc = vp.tileH / 34;

  // Draw scorched crumbling ruins instead of erasing destroyed buildings!
  if (isBattleEntity && structure.destroyed) {
    drawDestroyedRuins(ctx, center.x, center.y, w, h, structure.type, options.timeSec);
    return;
  }

  if (isBattleEntity && structure.type === 'trap' && !structure.triggered) {
    return;
  }

  const recoilVal = isBattleEntity ? structure.recoil : 0;
  const recoilOffset = recoilVal * 3;
  const shakeX =
    isBattleEntity && structure.shakeTime > 0
      ? Math.sin(options.timeSec * 55) * 3.4 * (structure.shakeTime / 0.24)
      : 0;
  const aimAngle = isBattleEntity ? structure.aimAngle : -0.35;

  ctx.save();
  if (options.isGhost) {
    ctx.globalAlpha = 0.65;
  }

  const cx = center.x + shakeX;
  const cy = center.y + 2 * sc - recoilOffset * 0.35;

  // Render 3-tier Stone Age 32-bit pixel-art isometric building sprite if loaded
  const bldgSprite =
    structure.type !== 'trap' ? getBuildingSprite(structure.type, structure.level) : null;
  if (bldgSprite && structure.type !== 'trap') {
    const m = BUILDING_SPRITE_METRICS[structure.type];
    const tier = getBuildingVisualTier(structure.level);
    const tierScale = tier === 1 ? 0.92 : tier === 2 ? 1.0 : 1.08;
    const targetH = vp.tileH * m.heightMult * tierScale;
    const targetW = targetH * bldgSprite.aspect;
    const baseY = center.y + vp.tileH * m.anchorY;

    // Tethered circular patrol boundary drawn cleanly on the ground around every Hero Altar
    if (structure.type === 'hero_altar' && !options.isGhost) {
      const prx = HERO_ALTAR_PATROL_RADIUS * vp.tileW * 0.52;
      const pry = HERO_ALTAR_PATROL_RADIUS * vp.tileH * 0.52;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + 2 * sc, prx, pry, 0, 0, Math.PI * 2);
      ctx.fillStyle = options.isBattle
        ? 'rgba(245, 158, 11, 0.08)'
        : 'rgba(250, 204, 21, 0.12)';
      ctx.fill();
      ctx.strokeStyle = options.isBattle
        ? 'rgba(251, 146, 60, 0.48)'
        : 'rgba(250, 204, 21, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // Lush grounded isometric contact shadow
    ctx.beginPath();
    ctx.ellipse(
      center.x + 2 * sc,
      center.y + 4 * sc,
      w * m.shadowW * tierScale,
      h * m.shadowH * tierScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(14, 28, 18, 0.42)';
    ctx.fill();

    // Squash-and-stretch on recoil or impact shake
    const hitSquash = isBattleEntity && structure.shakeTime > 0 ? structure.shakeTime * 0.22 : 0;
    const scaleX = 1 + recoilVal * 0.1 + hitSquash;
    const scaleY = 1 - recoilVal * 0.11 - hitSquash * 0.8;

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(scaleX, scaleY);
    ctx.imageSmoothingEnabled = false;
    if (isUnderConstruction && structure.constructionState === 'building') {
      ctx.globalAlpha = 0.56 + constructionProgress * 0.44;
    }
    ctx.drawImage(bldgSprite.canvas, -targetW * 0.5, -targetH, targetW, targetH);

    // Exact silhouette hit flash when struck!
    if (isBattleEntity && structure.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.72, structure.hitFlash * 3.4);
      ctx.drawImage(bldgSprite.flashCanvas, -targetW * 0.5, -targetH, targetW, targetH);
      ctx.restore();
    }
    ctx.restore();

    // Stone Age wooden scaffolding, animated hammering sparks & countdown bar while building/upgrading
    if (isUnderConstruction) {
      ctx.save();
      const scafW = Math.max(24 * sc, targetW * 0.44);
      const scafH = Math.max(18 * sc, targetH * 0.62);
      const baseScafY = center.y + 3 * sc;

      // Vertical lashed timber poles
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = Math.max(2, 2.4 * sc);
      ctx.beginPath();
      ctx.moveTo(cx - scafW, baseScafY);
      ctx.lineTo(cx - scafW, baseScafY - scafH);
      ctx.moveTo(cx + scafW, baseScafY);
      ctx.lineTo(cx + scafW, baseScafY - scafH);
      ctx.stroke();

      // Horizontal & diagonal rawhide-tied cross-beams
      ctx.strokeStyle = '#B45309';
      ctx.lineWidth = Math.max(1.5, 1.8 * sc);
      ctx.beginPath();
      ctx.moveTo(cx - scafW - 2 * sc, baseScafY - scafH * 0.42);
      ctx.lineTo(cx + scafW + 2 * sc, baseScafY - scafH * 0.42);
      ctx.moveTo(cx - scafW - 2 * sc, baseScafY - scafH * 0.82);
      ctx.lineTo(cx + scafW + 2 * sc, baseScafY - scafH * 0.82);
      ctx.moveTo(cx - scafW, baseScafY - scafH * 0.42);
      ctx.lineTo(cx + scafW, baseScafY - scafH * 0.82);
      ctx.stroke();

      // Rhythmic hammering sparks & rising construction dust
      const hammerBeat = (options.timeSec * 3.2 + structure.gridX * 0.7) % 1;
      if (hammerBeat < 0.45) {
        const burst = hammerBeat / 0.45;
        for (let k = 0; k < 4; k++) {
          const ang = -Math.PI * 0.85 + (k * Math.PI) / 3.4;
          const dist = (4 + burst * 11) * sc;
          const sx = cx + Math.cos(ang) * dist;
          const sy = baseScafY - scafH * 0.55 + Math.sin(ang) * dist;
          ctx.fillStyle = k % 2 === 0 ? '#FEF08A' : '#F59E0B';
          ctx.globalAlpha = 1 - burst;
          ctx.fillRect(Math.round(sx) - 1.5, Math.round(sy) - 1.5, 3, 3);
        }
      }
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = '#D6C7A9';
      const dustY = baseScafY - ((options.timeSec * 14 + structure.gridY * 7) % 14) * sc;
      ctx.beginPath();
      ctx.arc(cx - scafW * 0.35, dustY, 3.2 * sc, 0, Math.PI * 2);
      ctx.arc(cx + scafW * 0.35, dustY + 2 * sc, 2.6 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Floating Stone Age construction timer pill + golden progress bar
      const label =
        structure.constructionState === 'building'
          ? `Construindo · ${formatDurationSec(constructionRemainingSec)}`
          : `Nv.${structure.level + 1} · ${formatDurationSec(constructionRemainingSec)}`;
      ctx.font = '700 9px "JetBrains Mono", monospace';
      const boxW = Math.max(66, ctx.measureText(label).width + 12);
      const boxH = 20;
      const bx = cx - boxW * 0.5;
      const by = baseY - targetH - 22;

      ctx.fillStyle = 'rgba(15, 20, 28, 0.92)';
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 5);
      ctx.fill();
      ctx.strokeStyle =
        structure.constructionState === 'building'
          ? 'rgba(250, 204, 21, 0.78)'
          : 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#FFF8E7';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, by + 10.5);

      const barPad = 5;
      const barW = boxW - barPad * 2;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(bx + barPad, by + 14, barW, 3);
      ctx.fillStyle = structure.constructionState === 'building' ? '#FACC15' : '#38BDF8';
      ctx.fillRect(bx + barPad, by + 14, barW * constructionProgress, 3);
      ctx.restore();
    }

    // Live animated Stone Age tier-aware ambient accents on top of the pixel-art sprite
    if (!isUnderConstruction || structure.constructionState !== 'building') {
      drawBuildingAmbientFx(
        ctx,
        structure.type,
        tier,
        cx,
        baseY - targetH,
        targetH,
        recoilVal,
        options.timeSec,
        sc
      );
    }

    // Progressive cracks, live flames, stun halo & HP bar in battle
    if (isBattleEntity) {
      const hpPct = structure.hp / structure.maxHp;
      drawDamageCracksAndFire(
        ctx,
        cx,
        baseY - targetH * 0.28,
        hpPct,
        structure.burnTimer > 0,
        options.timeSec,
        sc
      );

      if (structure.stunTimer > 0) {
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - targetH * 0.72, 16 * sc, 7 * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (structure.hp < structure.maxHp) {
        const barW = 38;
        const barH = 5;
        const bx = cx - barW * 0.5;
        const by = baseY - vp.tileH * m.hpBarOffset - 6;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
        ctx.fillStyle = hpPct > 0.5 ? '#22C55E' : hpPct > 0.25 ? '#F59E0B' : '#EF4444';
        ctx.fillRect(bx, by, barW * Math.max(0, hpPct), barH);
      }
    }

    // Clean, uncluttered village badges: Hero Altars show a sleek micro-tag; regular buildings show level on hover/selection
    if (!options.isBattle && !options.isGhost && structure.type !== 'wall') {
      if (structure.type === 'hero_altar') {
        const assignedName = structure.assignedHeroId
          ? getHeroById(structure.assignedHeroId)?.name
          : null;
        const label = assignedName
          ? `${assignedName} · N${structure.level}`
          : `Altar N${structure.level}`;
        ctx.font = '600 9px "JetBrains Mono", monospace';
        const pillW = Math.max(48, ctx.measureText(label).width + 10);
        ctx.fillStyle = 'rgba(21, 26, 34, 0.86)';
        ctx.beginPath();
        ctx.roundRect(cx - pillW * 0.5, center.y + h * 0.28, pillW, 13, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(244, 196, 98, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#F4C462';
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, center.y + h * 0.28 + 9.5);
      } else if (options.isSelected || options.isHovered) {
        ctx.fillStyle = 'rgba(21, 26, 34, 0.9)';
        ctx.beginPath();
        ctx.roundRect(cx - 12, center.y + h * 0.24, 24, 13, 4);
        ctx.fill();
        ctx.fillStyle = '#F4C462';
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`N${structure.level}`, cx, center.y + h * 0.24 + 9.5);
      }
    }

    // Collectible resource bubble on mines in Fortress mode
    if (options.hasCollectible && options.collectLabel && !options.isBattle) {
      const bob = Math.sin(options.timeSec * 3.5 + structure.gridX) * 3;
      const py = baseY - targetH - 6 + bob;
      ctx.fillStyle = '#151A22';
      ctx.beginPath();
      ctx.roundRect(cx - 24, py - 11, 48, 19, 6);
      ctx.fill();
      ctx.strokeStyle = '#E5A93C';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#FFF8E7';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(options.collectLabel, cx, py + 2);
    }

    ctx.restore();
    return;
  }

  // Instant procedural fallback (used for spike trap or briefly while sprites load)
  ctx.beginPath();
  ctx.ellipse(center.x + 3 * sc, center.y + 4 * sc, w * 0.46, h * 0.46, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(18, 30, 22, 0.38)';
  ctx.fill();

  switch (structure.type) {
    case 'core': {
      // Chunky sunlit medieval Town Hall / Citadel Keep (Clash-inspired original craft)
      // Stone foundation plinth
      drawIsoBox(ctx, cx, cy + 2 * sc, w * 1.16, h * 1.16, 10 * sc, '#C7BBA3', '#9E9079', '#7C6F5B');
      // Main limestone keep body
      drawIsoBox(ctx, cx, cy - 8 * sc, w * 0.96, h * 0.96, 22 * sc, '#EDE3CE', '#D2C3A6', '#AD9D80');

      // Arched timber double gate on front-right face
      ctx.fillStyle = '#5C3518';
      ctx.beginPath();
      ctx.arc(cx + 10 * sc, cy - 8 * sc, 5.5 * sc, Math.PI, 0);
      ctx.lineTo(cx + 15.5 * sc, cy - 1 * sc);
      ctx.lineTo(cx + 4.5 * sc, cy - 1 * sc);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#D99B26';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Pitched royal-blue shingled roof
      ctx.beginPath();
      ctx.moveTo(cx, cy - 52 * sc);
      ctx.lineTo(cx + w * 0.52, cy - 30 * sc);
      ctx.lineTo(cx, cy - 19 * sc);
      ctx.lineTo(cx - w * 0.52, cy - 30 * sc);
      ctx.closePath();
      ctx.fillStyle = '#1D4ED8';
      ctx.fill();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Lighter sunlit left roof facet
      ctx.beginPath();
      ctx.moveTo(cx, cy - 52 * sc);
      ctx.lineTo(cx, cy - 19 * sc);
      ctx.lineTo(cx - w * 0.52, cy - 30 * sc);
      ctx.closePath();
      ctx.fillStyle = '#2563EB';
      ctx.fill();

      // Corner stone mini-turrets
      for (const tx of [-17 * sc, 17 * sc]) {
        drawIsoBox(ctx, cx + tx, cy - 4 * sc, 11 * sc, 6 * sc, 24 * sc, '#F1E8D5', '#CBBBA0', '#9E8F76');
      }

      // Waving golden heraldic banner on roof spire
      const wave = Math.sin(options.timeSec * 5) * 3 * sc;
      ctx.strokeStyle = '#E5A93C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 50 * sc);
      ctx.lineTo(cx, cy - 66 * sc);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 65 * sc);
      ctx.quadraticCurveTo(cx + 8 * sc, cy - 66 * sc + wave, cx + 15 * sc, cy - 61 * sc + wave);
      ctx.lineTo(cx + 13 * sc, cy - 55 * sc + wave * 0.6);
      ctx.lineTo(cx, cy - 57 * sc);
      ctx.closePath();
      ctx.fillStyle = '#F59E0B';
      ctx.fill();
      break;
    }

    case 'archer_tower': {
      // Stone footing + tall timber watchtower with crossbeams + archer lookout on top
      drawIsoBox(ctx, cx, cy, w * 0.78, h * 0.78, 8 * sc, '#B5A894', '#8F8270', '#6F6353');
      // 4 sturdy timber legs
      ctx.strokeStyle = '#6B4226';
      ctx.lineWidth = 3 * sc;
      for (const ox of [-10 * sc, 10 * sc]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox, cy - 6 * sc);
        ctx.lineTo(cx + ox * 0.82, cy - 30 * sc);
        ctx.stroke();
      }
      // Cross timber bracing
      ctx.strokeStyle = '#8C5832';
      ctx.lineWidth = 1.8 * sc;
      ctx.beginPath();
      ctx.moveTo(cx - 10 * sc, cy - 8 * sc);
      ctx.lineTo(cx + 8 * sc, cy - 26 * sc);
      ctx.moveTo(cx + 10 * sc, cy - 8 * sc);
      ctx.lineTo(cx - 8 * sc, cy - 26 * sc);
      ctx.stroke();

      // Elevated wooden battlement deck
      drawIsoBox(ctx, cx, cy - 28 * sc, w * 0.84, h * 0.84, 8 * sc, '#C78E4E', '#9C662F', '#754A1E');
      // Crimson heraldic pennant hanging off front
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(cx - 4 * sc, cy - 26 * sc, 8 * sc, 11 * sc);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(cx - 1.5 * sc, cy - 23 * sc, 3 * sc, 5 * sc);

      // Visible lookout archer silhouette on top platform
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.arc(cx, cy - 37 * sc, 4.2 * sc, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.arc(cx, cy - 42 * sc, 3 * sc, 0, Math.PI * 2);
      ctx.fill();
      // Tiny bow aimed toward target
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(aimAngle) * 4 * sc,
        cy - 39 * sc + Math.sin(aimAngle) * 2 * sc,
        4.5 * sc,
        aimAngle - 0.9,
        aimAngle + 0.9
      );
      ctx.stroke();
      break;
    }

    case 'cannon': {
      // Chunky octagonal stone siege base + rotating heavy iron-and-brass cannon!
      drawIsoBox(ctx, cx, cy, w * 0.86, h * 0.86, 10 * sc, '#CBD5E1', '#8E9AA8', '#64748B');
      // Wooden carriage wheels
      ctx.fillStyle = '#78350F';
      ctx.beginPath();
      ctx.ellipse(cx - 6 * sc, cy - 11 * sc, 5 * sc, 6.5 * sc, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 6 * sc, cy - 11 * sc, 5 * sc, 6.5 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Rotating cannon barrel with physical recoil!
      const kick = isBattleEntity ? structure.recoil * 5 * sc : 0;
      ctx.save();
      ctx.translate(cx - Math.cos(aimAngle) * kick, cy - 16 * sc - Math.sin(aimAngle) * kick * 0.5);
      ctx.rotate(aimAngle);
      // Cannon iron body
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.roundRect(-11 * sc, -6.5 * sc, 24 * sc, 13 * sc, 4 * sc);
      ctx.fill();
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // Brass reinforcement rings
      ctx.fillStyle = '#E5A93C';
      ctx.fillRect(-5 * sc, -6.8 * sc, 3 * sc, 13.6 * sc);
      ctx.fillRect(6 * sc, -6.8 * sc, 3 * sc, 13.6 * sc);
      // Dark bore muzzle
      ctx.fillStyle = '#090D14';
      ctx.beginPath();
      ctx.ellipse(13 * sc, 0, 2.2 * sc, 5 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'arcane_tower': {
      // Carved stone mage spire + glowing violet crystal prism + rotating rune ring
      drawIsoBox(ctx, cx, cy, w * 0.78, h * 0.78, 28 * sc, '#DDD6FE', '#7C3AED', '#4C1D95');
      // Stone collar parapet
      drawIsoBox(ctx, cx, cy - 26 * sc, w * 0.86, h * 0.86, 5 * sc, '#EDE9FE', '#A78BFA', '#6D28D9');
      // Levitating rotating arcane crystal
      const bob = Math.sin(options.timeSec * 4.2) * 3.5 * sc;
      const py = cy - 44 * sc + bob;
      ctx.beginPath();
      ctx.arc(cx, py, 10 * sc, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(192, 132, 252, 0.25)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, py - 10 * sc);
      ctx.lineTo(cx + 7 * sc, py);
      ctx.lineTo(cx, py + 10 * sc);
      ctx.lineTo(cx - 7 * sc, py);
      ctx.closePath();
      ctx.fillStyle = '#C084FC';
      ctx.fill();
      ctx.strokeStyle = '#FAF5FF';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      break;
    }

    case 'electric_tower': {
      // Bronze-and-slate Tesla Coil tower with crackling arcs
      drawIsoBox(ctx, cx, cy, w * 0.8, h * 0.8, 18 * sc, '#94A3B8', '#475569', '#334155');
      // Stacked copper induction coils
      for (let i = 0; i < 3; i++) {
        const ringY = cy - (22 + i * 7) * sc;
        ctx.beginPath();
        ctx.ellipse(cx, ringY, (11 - i * 1.8) * sc, (5 - i * 0.7) * sc, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#D97706';
        ctx.fill();
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      // Top glowing Tesla sphere
      const orbY = cy - 44 * sc;
      ctx.beginPath();
      ctx.arc(cx, orbY, 6.5 * sc, 0, Math.PI * 2);
      ctx.fillStyle = '#38BDF8';
      ctx.fill();
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Ambient electric arc
      if (Math.sin(options.timeSec * 14 + cx) > 0.25) {
        ctx.strokeStyle = '#7DD3FC';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, orbY);
        ctx.lineTo(cx + 8 * sc, orbY + 4 * sc);
        ctx.lineTo(cx + 4 * sc, orbY + 11 * sc);
        ctx.stroke();
      }
      break;
    }

    case 'ice_tower': {
      // Frosted marble bastion + triple jagged translucent frost crystal spires
      drawIsoBox(ctx, cx, cy, w * 0.82, h * 0.82, 16 * sc, '#E0F2FE', '#7DD3FC', '#0284C7');
      // Central giant ice spire
      ctx.beginPath();
      ctx.moveTo(cx, cy - 50 * sc);
      ctx.lineTo(cx + 9 * sc, cy - 18 * sc);
      ctx.lineTo(cx, cy - 13 * sc);
      ctx.lineTo(cx - 9 * sc, cy - 18 * sc);
      ctx.closePath();
      ctx.fillStyle = '#67E8F9';
      ctx.fill();
      ctx.strokeStyle = '#ECFEFF';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // Twin side frost crystals
      for (const ox of [-10 * sc, 10 * sc]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox, cy - 34 * sc);
        ctx.lineTo(cx + ox + 4 * sc, cy - 16 * sc);
        ctx.lineTo(cx + ox - 4 * sc, cy - 16 * sc);
        ctx.closePath();
        ctx.fillStyle = '#22D3EE';
        ctx.fill();
      }
      break;
    }

    case 'poison_tower': {
      // Alchemist timber-stone bastion with bubbling emerald cauldron
      drawIsoBox(ctx, cx, cy, w * 0.8, h * 0.8, 20 * sc, '#A3B899', '#5A6B54', '#3D4B38');
      // Iron cauldron rim
      ctx.beginPath();
      ctx.ellipse(cx, cy - 24 * sc, 12 * sc, 7 * sc, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy - 25 * sc, 9.5 * sc, 5 * sc, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#22C55E';
      ctx.fill();
      // Rising green bubbles
      const b1 = ((options.timeSec * 16 + cx) % 14) * sc;
      ctx.fillStyle = '#86EFAC';
      ctx.beginPath();
      ctx.arc(cx - 3 * sc, cy - 26 * sc - b1, 2.6 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 4 * sc, cy - 29 * sc - (b1 * 0.6), 2 * sc, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'gold_mine': {
      // Timber mine shaft + spinning wooden hoist wheel + golden ore pile
      drawIsoBox(ctx, cx, cy, w * 0.88, h * 0.88, 12 * sc, '#B98446', '#8C5E2A', '#69441B');
      // Dark mine arch
      ctx.fillStyle = '#1C1917';
      ctx.beginPath();
      ctx.arc(cx + 6 * sc, cy - 6 * sc, 6 * sc, Math.PI, 0);
      ctx.lineTo(cx + 12 * sc, cy + 1 * sc);
      ctx.lineTo(cx, cy + 1 * sc);
      ctx.closePath();
      ctx.fill();
      // Spinning pulley wheel on roof
      ctx.save();
      ctx.translate(cx - 5 * sc, cy - 18 * sc);
      ctx.rotate(options.timeSec * 2.2);
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 6.5 * sc, 0, Math.PI * 2);
      ctx.moveTo(-6.5 * sc, 0);
      ctx.lineTo(6.5 * sc, 0);
      ctx.moveTo(0, -6.5 * sc);
      ctx.lineTo(0, 6.5 * sc);
      ctx.stroke();
      ctx.restore();
      // Glittering gold nuggets
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(cx + 4 * sc, cy - 14 * sc, 4.2 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 10 * sc, cy - 12 * sc, 3.5 * sc, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'crystal_mine': {
      drawIsoBox(ctx, cx, cy, w * 0.88, h * 0.88, 11 * sc, '#CBD5E1', '#64748B', '#475569');
      const pulse = Math.sin(options.timeSec * 3.5) * 1.5 * sc;
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 34 * sc - pulse);
      ctx.lineTo(cx + 8 * sc, cy - 14 * sc);
      ctx.lineTo(cx, cy - 10 * sc);
      ctx.lineTo(cx - 8 * sc, cy - 14 * sc);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#0EA5E9';
      ctx.beginPath();
      ctx.moveTo(cx + 9 * sc, cy - 25 * sc);
      ctx.lineTo(cx + 14 * sc, cy - 13 * sc);
      ctx.lineTo(cx + 6 * sc, cy - 13 * sc);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'essence_well': {
      // Sunlit marble fountain basin with swirling emerald essence
      drawIsoBox(ctx, cx, cy, w * 0.86, h * 0.86, 12 * sc, '#F1F5F9', '#CBD5E1', '#94A3B8');
      ctx.beginPath();
      ctx.ellipse(cx, cy - 13 * sc, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#22C55E';
      ctx.fill();
      ctx.strokeStyle = '#DCFCE7';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Rising light mote
      const lift = ((options.timeSec * 14 + cy) % 14) * sc;
      ctx.fillStyle = '#86EFAC';
      ctx.beginPath();
      ctx.arc(cx, cy - 15 * sc - lift, 2.4 * sc, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'storage': {
      // Timber-and-brass Royal Treasury Vault
      drawIsoBox(ctx, cx, cy, w * 0.94, h * 0.94, 18 * sc, '#D97706', '#B45309', '#78350F');
      // Pitched warm wooden roof
      ctx.beginPath();
      ctx.moveTo(cx, cy - 34 * sc);
      ctx.lineTo(cx + w * 0.48, cy - 19 * sc);
      ctx.lineTo(cx, cy - 11 * sc);
      ctx.lineTo(cx - w * 0.48, cy - 19 * sc);
      ctx.closePath();
      ctx.fillStyle = '#92400E';
      ctx.fill();
      ctx.strokeStyle = '#FDE68A';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // Gold coin heap emblem
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(cx, cy - 22 * sc, 4 * sc, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'wall': {
      // Chunky crenellated medieval stone wall block
      drawIsoBox(ctx, cx, cy, w * 0.86, h * 0.86, 15 * sc, '#E2E8F0', '#94A3B8', '#64748B');
      // Top merlons (castle battlements)
      for (const mx of [-8 * sc, 8 * sc]) {
        drawIsoBox(ctx, cx + mx, cy - 15 * sc, 8 * sc, 4.5 * sc, 4.5 * sc, '#F8FAFC', '#CBD5E1', '#94A3B8');
      }
      break;
    }

    case 'trap': {
      drawDiamond(ctx, cx, cy, w * 0.68, h * 0.68, '#78350F', '#F59E0B', 1.4);
      ctx.fillStyle = '#E2E8F0';
      for (const ox of [-6 * sc, 0, 6 * sc]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox, cy - 9 * sc);
        ctx.lineTo(cx + ox + 3 * sc, cy);
        ctx.lineTo(cx + ox - 3 * sc, cy);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case 'hero_altar': {
      drawIsoBox(ctx, cx, cy, w * 0.92, h * 0.92, 9 * sc, '#C7BBA3', '#8F8270', '#695F50');
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 10 * sc, w * 0.28, h * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  // Hit flash overlay when structure just got struck
  if (isBattleEntity && structure.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.65, structure.hitFlash * 3);
    ctx.beginPath();
    ctx.ellipse(cx, cy - 14 * sc, w * 0.44, h * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFBEB';
    ctx.fill();
    ctx.restore();
  }

  // Progressive cracks & burning flames directly on the building!
  if (isBattleEntity) {
    const hpPct = structure.hp / structure.maxHp;
    drawDamageCracksAndFire(ctx, cx, cy, hpPct, structure.burnTimer > 0, options.timeSec, sc);

    if (structure.stunTimer > 0) {
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 26 * sc, 15 * sc, 7 * sc, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (structure.hp < structure.maxHp) {
      const barW = 36;
      const barH = 5;
      const bx = cx - barW * 0.5;
      const by = cy - (structure.type === 'core' ? 68 : 50) * sc;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = hpPct > 0.5 ? '#22C55E' : hpPct > 0.25 ? '#F59E0B' : '#EF4444';
      ctx.fillRect(bx, by, barW * Math.max(0, hpPct), barH);
    }
  }

  // Level badge on Fortress mode
  if (!options.isBattle && !options.isGhost && structure.type !== 'wall' && structure.type !== 'trap') {
    ctx.fillStyle = 'rgba(21, 26, 34, 0.86)';
    ctx.beginPath();
    ctx.roundRect(cx - 12, cy + h * 0.16, 24, 13, 4);
    ctx.fill();
    ctx.fillStyle = '#F4C462';
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`N${structure.level}`, cx, cy + h * 0.16 + 9.5);
  }

  // Collectible bubble on mines in Fortress mode
  if (options.hasCollectible && options.collectLabel && !options.isBattle) {
    const bob = Math.sin(options.timeSec * 3.5 + structure.gridX) * 3;
    const py = cy - 42 * sc + bob;
    ctx.fillStyle = '#151A22';
    ctx.beginPath();
    ctx.roundRect(cx - 24, py - 11, 48, 19, 6);
    ctx.fill();
    ctx.strokeStyle = '#E5A93C';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#FFF8E7';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(options.collectLabel, cx, py + 2);
  }

  ctx.restore();
}

/**
 * Draws a Stone Age 32-bit pixel-art hero sprite with a grounded leg-by-leg walk cycle
 * (alternating strideA -> passing -> strideB -> passing with feet firmly on the ground,
 * NO hopping), idle breathing, dynamic attack pose switch with weapon VFX, ultimate aura,
 * and exact silhouette hit-flash.
 */
export function drawBattleHero(
  ctx: CanvasRenderingContext2D,
  hero: BattleHeroEntity,
  vp: IsoViewport,
  timeSec: number
) {
  if (!hero.alive) return;
  const entry = getHeroById(hero.heroId);
  const pos = gridToScreen(hero.x, hero.y, vp);
  const sc = Math.max(0.78, vp.tileH / 32);

  const isAttacking = hero.attackAnim > 0.04 || hero.ultAnim > 0.04;
  // Grounded 4-phase stepping walk cadence: walk1 (stride A) -> walk2 (passing) -> walk3 (stride B) -> walk2 (passing)
  const walkRate = hero.heroId === 'aegor' ? 6.4 : 7.8;
  const stepPhase = Math.floor(hero.animTime * walkRate) % 4;
  const walkPhase = hero.animTime * walkRate * Math.PI * 0.5;
  const stride = hero.isMoving ? Math.sin(walkPhase) : 0;

  // Natural tiny passing-step head rise (~1px) instead of hopping in the air
  const bounce = hero.isMoving
    ? stepPhase % 2 === 1
      ? 1.05 * sc
      : 0
    : 0;
  const ultLift = hero.ultAnim > 0 ? Math.sin(hero.ultAnim * Math.PI) * 10 * sc : 0;
  const swing = hero.attackAnim > 0 ? Math.sin(hero.attackAnim * Math.PI) : 0;

  ctx.save();
  if (hero.stealthTimer > 0) {
    ctx.globalAlpha = 0.48;
  }

  // Ground shadow firmly anchored under walking boots
  const shadowScale = Math.max(0.8, 1 - ultLift / (48 * sc));
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 4 * sc, 14 * sc * shadowScale, 6.5 * sc * shadowScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(12, 20, 14, 0.44)';
  ctx.fill();

  // Subtle grounded footstep dust puff when heel plants on stride frames
  if (hero.isMoving && !isAttacking && (stepPhase === 0 || stepPhase === 2)) {
    const dustFade = 1 - ((hero.animTime * walkRate) % 1);
    const footDir = hero.facing >= 0 ? -1 : 1;
    ctx.save();
    ctx.globalAlpha = dustFade * 0.35;
    ctx.fillStyle = '#D6C7A9';
    ctx.beginPath();
    ctx.arc(pos.x + footDir * (7 + (1 - dustFade) * 6) * sc, pos.y + 3 * sc, (2.2 + (1 - dustFade) * 2) * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Hero-specific living ground aura (always visible in patrol & battle so heroes feel heroic!)
  const auraPulse = 0.5 + 0.5 * Math.sin(timeSec * 3.4 + hero.x * 0.9);
  ctx.save();
  const auraGrad = ctx.createRadialGradient(
    pos.x,
    pos.y + 3 * sc,
    2 * sc,
    pos.x,
    pos.y + 3 * sc,
    22 * sc
  );
  if (hero.heroId === 'aegor') {
    auraGrad.addColorStop(0, `rgba(251, 191, 36, ${0.28 + auraPulse * 0.14})`);
    auraGrad.addColorStop(0.65, `rgba(217, 119, 6, ${0.14 + auraPulse * 0.08})`);
    auraGrad.addColorStop(1, 'rgba(217, 119, 6, 0)');
  } else {
    auraGrad.addColorStop(0, `rgba(249, 115, 22, ${0.28 + auraPulse * 0.14})`);
    auraGrad.addColorStop(0.65, `rgba(250, 204, 21, ${0.14 + auraPulse * 0.08})`);
    auraGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
  }
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 3 * sc, 22 * sc, 10.5 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Team ground ring + subtle veteran inner rune ring at Lv.5+
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 3 * sc, 16 * sc, 7.2 * sc, 0, 0, Math.PI * 2);
  ctx.strokeStyle = hero.team === 'attacker' ? 'rgba(250, 204, 21, 0.9)' : 'rgba(239, 68, 68, 0.92)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (hero.heroLevel >= 5) {
    ctx.save();
    ctx.strokeStyle =
      hero.heroId === 'aegor' ? 'rgba(147, 197, 253, 0.7)' : 'rgba(251, 146, 60, 0.78)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(
      pos.x,
      pos.y + 3 * sc,
      (19.5 + auraPulse * 1.5) * sc,
      (8.8 + auraPulse * 0.7) * sc,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  // High-energy charging sparks + Ready Ultimate golden sunburst halo (when skill is unlocked at Lv.5+)
  if (hero.team === 'attacker' && hero.skillLevel > 0) {
    const enRatio = hero.energy / Math.max(1, hero.maxEnergy);
    if (enRatio >= 1) {
      const pulse = (18.5 + Math.sin(timeSec * 8) * 3.5) * sc;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 3 * sc, pulse, pulse * 0.48, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      // Radiant rotating sunburst rays behind hero when Ultimate is ready!
      ctx.save();
      ctx.translate(pos.x, pos.y - 22 * sc - bounce - ultLift);
      ctx.rotate(timeSec * 1.4);
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.42)';
      ctx.lineWidth = 2 * sc;
      for (let r = 0; r < 8; r++) {
        const ang = (r * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 10 * sc, Math.sin(ang) * 10 * sc);
        ctx.lineTo(Math.cos(ang) * (20 + auraPulse * 5) * sc, Math.sin(ang) * (20 + auraPulse * 5) * sc);
        ctx.stroke();
      }
      ctx.restore();
    } else if (enRatio >= 0.72) {
      // Crackling charging motes spiraling upward as Ultimate nears ready
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const ang = timeSec * 4.2 + (i * Math.PI * 2) / 3;
        const ox = pos.x + Math.cos(ang) * 16 * sc;
        const oy = pos.y - (8 + ((timeSec * 16 + i * 10) % 24)) * sc;
        ctx.fillStyle = '#FDE047';
        ctx.fillRect(Math.round(ox) - 1.5, Math.round(oy) - 1.5, 3, 3);
      }
      ctx.restore();
    }
  }

  // Active Ultimate radiant sunburst + expanding energy bloom behind hero
  if (hero.ultAnim > 0) {
    const ultPulse = Math.sin(hero.ultAnim * Math.PI);
    ctx.save();
    ctx.globalAlpha = ultPulse * 0.75;
    const bloomR = (26 + ultPulse * 18) * sc;
    const bloomGrad = ctx.createRadialGradient(
      pos.x,
      pos.y - 24 * sc - ultLift,
      3 * sc,
      pos.x,
      pos.y - 24 * sc - ultLift,
      bloomR
    );
    if (hero.heroId === 'aegor') {
      bloomGrad.addColorStop(0, 'rgba(254, 249, 195, 0.92)');
      bloomGrad.addColorStop(0.5, 'rgba(96, 165, 250, 0.55)');
      bloomGrad.addColorStop(1, 'rgba(59, 130, 246, 0)');
    } else {
      bloomGrad.addColorStop(0, 'rgba(255, 251, 235, 0.95)');
      bloomGrad.addColorStop(0.5, 'rgba(249, 115, 22, 0.62)');
      bloomGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
    }
    ctx.fillStyle = bloomGrad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 24 * sc - ultLift, bloomR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Choose true animation frame: attack -> walk cycle (walk1/walk2/walk3/walk2) -> idle
  const walkFrames = ['walk1', 'walk2', 'walk3', 'walk2'] as const;
  const activePose = isAttacking
    ? 'attack'
    : hero.isMoving
    ? walkFrames[stepPhase]
    : 'idle';
  const heroSprite = getHeroSprite(hero.heroId, activePose);

  if (heroSprite) {
    // Grounded sprite animation anchored cleanly at feet — NO hopping or bouncy squash!
    const targetH = vp.tileH * (hero.heroId === 'aegor' ? 2.25 : 2.12);
    const targetW = targetH * heroSprite.aspect;

    const lungeX = (swing * 7.5 + (hero.ultAnim > 0 ? 4 : 0)) * sc * (hero.facing >= 0 ? 1 : -1);
    const tiltRad = isAttacking
      ? swing * 0.12
      : hero.isMoving
      ? 0.025
      : Math.sin(timeSec * 2.4 + hero.x) * 0.015;

    const breathe = !hero.isMoving && !isAttacking ? Math.sin(timeSec * 3.2 + hero.x) * 0.02 : 0;
    const scaleX = 1 + (isAttacking ? swing * 0.11 : -breathe * 0.5);
    const scaleY = 1 + (isAttacking ? -swing * 0.06 : breathe);

    ctx.save();
    ctx.translate(pos.x + lungeX, pos.y + 4 * sc - bounce - ultLift);
    ctx.scale(hero.facing >= 0 ? 1 : -1, 1);
    ctx.rotate(tiltRad);
    ctx.scale(scaleX, scaleY);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(heroSprite.canvas, -targetW * 0.5, -targetH, targetW, targetH);

    // Exact silhouette hit-flash on damage
    if (hero.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.75, hero.hitFlash * 3.5);
      ctx.drawImage(heroSprite.flashCanvas, -targetW * 0.5, -targetH, targetW, targetH);
      ctx.restore();
    }

    // Dynamic Stone Age attack swing / flint fire bow flare right on top of the pixel-art sprite
    if (swing > 0.15) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, swing * 1.15);
      if (hero.heroId === 'aegor') {
        // Heavy stone-club impact smash arc + dust burst
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 4.6 * sc;
        ctx.beginPath();
        ctx.arc(targetW * 0.18, -targetH * 0.46, targetH * 0.44, -1.15 + swing * 0.65, 0.78 + swing * 0.35);
        ctx.stroke();
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 2.4 * sc;
        ctx.beginPath();
        ctx.arc(targetW * 0.24, -targetH * 0.46, targetH * 0.5, -0.95 + swing * 0.65, 0.65 + swing * 0.35);
        ctx.stroke();
        // Rock impact sparks at club tip
        ctx.fillStyle = '#FEF9C3';
        ctx.fillRect(Math.round(targetW * 0.44), Math.round(-targetH * 0.34), 4, 4);
      } else if (hero.heroId === 'sylva') {
        // Blazing flint-arrow fire flare at bow tip
        const tipX = targetW * 0.42;
        const tipY = -targetH * 0.54;
        ctx.fillStyle = 'rgba(249, 115, 22, 0.48)';
        ctx.beginPath();
        ctx.arc(tipX, tipY, (7 + swing * 4.5) * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.arc(tipX, tipY, (3.8 + swing * 2.5) * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FB923C';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tipX - 9 * sc, tipY);
        ctx.lineTo(tipX + 9 * sc, tipY);
        ctx.moveTo(tipX, tipY - 9 * sc);
        ctx.lineTo(tipX, tipY + 9 * sc);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore(); // end animated sprite transform

    // Active status effects around Stone Age pixel hero
    const auraCenterY = pos.y - targetH * 0.46 - bounce - ultLift;
    if (hero.shield > 0) {
      // Tribal stone-and-sky protective barrier dome with rotating golden rune ticks
      const r = targetH * 0.58;
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, auraCenterY, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.fill();
      ctx.strokeStyle = '#93C5FD';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Rotating golden tribal ward marks around the barrier edge
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const ang = timeSec * 1.6 + (i * Math.PI * 2) / 6;
        const rx1 = pos.x + Math.cos(ang) * (r - 2.5);
        const ry1 = auraCenterY + Math.sin(ang) * (r - 2.5);
        const rx2 = pos.x + Math.cos(ang) * (r + 2.5);
        const ry2 = auraCenterY + Math.sin(ang) * (r + 2.5);
        ctx.beginPath();
        ctx.moveTo(rx1, ry1);
        ctx.lineTo(rx2, ry2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (hero.slowTimer > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, auraCenterY, targetH * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Orbiting frost shard squares
      const fx = pos.x + Math.cos(timeSec * 4) * targetH * 0.48;
      const fy = auraCenterY + Math.sin(timeSec * 4) * targetH * 0.25;
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(Math.round(fx) - 2, Math.round(fy) - 2, 4, 4);
      ctx.restore();
    }
    // Living hero-specific elemental & level particles orbiting around the sprite (patrol + combat)
    ctx.save();
    const moteCount = hero.heroLevel >= 15 ? 4 : hero.heroLevel >= 5 ? 3 : 2;
    for (let i = 0; i < moteCount; i++) {
      if (hero.heroId === 'aegor') {
        // Orbiting golden stone-rune sparks around Aegor's shield & club
        const ang = timeSec * (1.7 + i * 0.25) + (i * Math.PI * 2) / moteCount;
        const ox = pos.x + Math.cos(ang) * targetH * 0.44;
        const oy = auraCenterY + Math.sin(ang) * targetH * 0.2 + Math.sin(timeSec * 3 + i) * 3 * sc;
        ctx.fillStyle = i % 2 === 0 ? '#FDE047' : '#93C5FD';
        ctx.globalAlpha = 0.72 + 0.25 * Math.sin(timeSec * 6 + i);
        ctx.fillRect(Math.round(ox) - 1.5, Math.round(oy) - 1.5, 3, 3);
      } else {
        // Rising fiery ember sparks drifting around Sylva's flaming flint bow
        const cycle = (timeSec * 0.85 + i / moteCount) % 1;
        const sway = Math.sin(timeSec * 4.5 + i * 2.1) * 9 * sc;
        const ex = pos.x + (hero.facing >= 0 ? 5 : -5) * sc + sway;
        const ey = pos.y - targetH * (0.2 + cycle * 0.72) - bounce - ultLift;
        ctx.fillStyle = cycle < 0.45 ? '#FEF08A' : cycle < 0.78 ? '#FB923C' : '#EA580C';
        ctx.globalAlpha = (1 - cycle) * 0.85;
        const sz = cycle < 0.5 ? 3 : 2;
        ctx.fillRect(Math.round(ex), Math.round(ey), sz, sz);
      }
    }
    ctx.restore();

    // Attack speed / Fury wind-flame streaks around Sylva (or any buffed hero)
    if (hero.attackSpeedBuffTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 1.6 * sc;
      ctx.globalAlpha = 0.75;
      for (let k = 0; k < 3; k++) {
        const yOff = auraCenterY + (k - 1) * 9 * sc;
        const drift = ((timeSec * 45 + k * 14) % 20) * sc;
        const dir = hero.facing >= 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(pos.x + dir * (6 * sc + drift), yOff);
        ctx.lineTo(pos.x + dir * (16 * sc + drift), yOff - 2 * sc);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Damage reduction golden tribal armor glint (Aegor's Warcry / Guard)
    if (hero.damageReductionTimer > 0 && hero.shield <= 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, auraCenterY, targetH * 0.48, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }

    if (hero.poisonTimer > 0) {
      const py = auraCenterY - 8 * sc + Math.sin(timeSec * 8) * 3;
      ctx.fillStyle = '#4ADE80';
      ctx.beginPath();
      ctx.arc(pos.x - 10 * sc, py, 2.8, 0, Math.PI * 2);
      ctx.arc(pos.x + 10 * sc, py + 4, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#DCFCE7';
      ctx.fillRect(Math.round(pos.x - 11 * sc), Math.round(py - 1), 2, 2);
    }

    // Crisp compact Name + HP / Shield / Energy Bar cleanly positioned overhead
    const barW = 42;
    const bx = pos.x - barW * 0.5;
    const by = pos.y - targetH - 7 - bounce - ultLift;

    const showEnergyBar = hero.team === 'attacker' && hero.skillLevel > 0;
    if (entry) {
      const nameTag = `${entry.name} N${hero.heroLevel}`;
      ctx.font = '700 9.5px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillText(nameTag, pos.x + 0.8, by - 3.2);
      ctx.fillStyle = hero.team === 'attacker' ? '#FFF8E7' : '#FCA5A5';
      ctx.fillText(nameTag, pos.x, by - 4);
    }

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, showEnergyBar ? 8.5 : 5.5);

    const hpPct = Math.max(0, hero.hp / hero.maxHp);
    ctx.fillStyle = hero.team === 'attacker' ? '#22C55E' : '#EF4444';
    ctx.fillRect(bx, by, barW * hpPct, 4);

    if (hero.shield > 0) {
      const shPct = Math.min(1, hero.shield / hero.maxHp);
      ctx.fillStyle = '#60A5FA';
      ctx.fillRect(bx, by, barW * shPct, 2);
    }

    if (showEnergyBar) {
      const enPct = Math.max(0, Math.min(1, hero.energy / hero.maxEnergy));
      ctx.fillStyle = enPct >= 1 ? '#FACC15' : '#38BDF8';
      ctx.fillRect(bx, by + 4.8, barW * enPct, 2);
    }

    ctx.restore();
    return;
  }

  // Procedural fallback while hero sprites load on initial page boot
  ctx.save();
  ctx.translate(pos.x, pos.y - bounce - ultLift);
  ctx.scale(hero.facing >= 0 ? 1 : -1, 1);

  const legL = stride * 4.2 * sc;
  const legR = -stride * 4.2 * sc;
  const capeSway = (hero.isMoving ? -5 : -1.5) * sc + Math.sin(timeSec * 5 + hero.x) * 1.5 * sc;

  if (hero.heroId === 'aegor') {
    // ===== AEGOR — THE GUARDIAN (Paladin Tank with Kite Shield & Plumed Helm) =====
    // Royal blue billowing cape
    ctx.fillStyle = '#1E3A8A';
    ctx.beginPath();
    ctx.moveTo(-4 * sc, -21 * sc);
    ctx.lineTo(-13 * sc + capeSway, -4 * sc);
    ctx.lineTo(-3 * sc, -4 * sc);
    ctx.closePath();
    ctx.fill();

    // Armored boots walking
    ctx.fillStyle = '#475569';
    ctx.fillRect(-5 * sc + legL, -7 * sc, 4.5 * sc, 7 * sc);
    ctx.fillRect(1 * sc + legR, -7 * sc, 4.5 * sc, 7 * sc);

    // Broad blue-and-gold plate cuirass
    ctx.fillStyle = '#1D4ED8';
    ctx.beginPath();
    ctx.roundRect(-8 * sc, -22 * sc, 16 * sc, 16 * sc, 4 * sc);
    ctx.fill();
    ctx.strokeStyle = '#E5A93C';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Gold shoulder pauldrons
    ctx.fillStyle = '#E5A93C';
    ctx.beginPath();
    ctx.arc(-8 * sc, -19 * sc, 4.5 * sc, 0, Math.PI * 2);
    ctx.arc(8 * sc, -19 * sc, 4.5 * sc, 0, Math.PI * 2);
    ctx.fill();

    // Helmeted head + royal blue plume
    ctx.fillStyle = '#94A3B8';
    ctx.beginPath();
    ctx.arc(0, -27 * sc, 6.2 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E5A93C';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Visor face & beard
    ctx.fillStyle = '#F5CBA7';
    ctx.fillRect(-1 * sc, -28 * sc, 5 * sc, 3 * sc);
    ctx.fillStyle = '#5C3A21';
    ctx.fillRect(-1 * sc, -25 * sc, 5.5 * sc, 3 * sc);
    // Blue helmet plume
    ctx.fillStyle = '#2563EB';
    ctx.beginPath();
    ctx.moveTo(-2 * sc, -32 * sc);
    ctx.quadraticCurveTo(-10 * sc + capeSway * 0.5, -39 * sc, -11 * sc, -28 * sc);
    ctx.closePath();
    ctx.fill();

    // Golden Broadsword swinging forward on attack!
    ctx.save();
    ctx.translate(6 * sc, -16 * sc);
    ctx.rotate(-0.6 + swing * 1.9);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(-1.5 * sc, -17 * sc, 3.5 * sc, 16 * sc);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-4.5 * sc, -2 * sc, 9 * sc, 2.5 * sc);
    ctx.restore();

    // Radiant Heraldic Kite Shield held forward
    ctx.save();
    ctx.translate(7 * sc, -12 * sc);
    ctx.fillStyle = '#1E40AF';
    ctx.beginPath();
    ctx.moveTo(-5 * sc, -8 * sc);
    ctx.lineTo(6 * sc, -8 * sc);
    ctx.lineTo(6 * sc, 2 * sc);
    ctx.lineTo(0.5 * sc, 9 * sc);
    ctx.lineTo(-5 * sc, 2 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Golden lion crest dot
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(0.5 * sc, -1 * sc, 2.5 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (hero.heroId === 'nyra') {
    // ===== NYRA — THE INCENDIARY (Crimson & Gold Pyromancer Mage) =====
    // Flowing crimson cloak
    ctx.fillStyle = '#991B1B';
    ctx.beginPath();
    ctx.moveTo(-3 * sc, -21 * sc);
    ctx.lineTo(-14 * sc + capeSway, -2 * sc);
    ctx.lineTo(2 * sc, -2 * sc);
    ctx.closePath();
    ctx.fill();

    // Walking boots peeking under robe
    ctx.fillStyle = '#451A03';
    ctx.fillRect(-4 * sc + legL, -5 * sc, 3.5 * sc, 5 * sc);
    ctx.fillRect(1 * sc + legR, -5 * sc, 3.5 * sc, 5 * sc);

    // Embroidered crimson-and-gold mage dress/robe
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(-6 * sc, -21 * sc);
    ctx.lineTo(6 * sc, -21 * sc);
    ctx.lineTo(8 * sc, -4 * sc);
    ctx.lineTo(-8 * sc, -4 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Flowing auburn hair + head
    ctx.fillStyle = '#B45309';
    ctx.beginPath();
    ctx.arc(-2 * sc, -27 * sc, 6.5 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FAD7B8';
    ctx.beginPath();
    ctx.arc(1.5 * sc, -26.5 * sc, 4.8 * sc, 0, Math.PI * 2);
    ctx.fill();
    // Glowing amber eyes
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(2.5 * sc, -27.5 * sc, 2 * sc, 1.5 * sc);

    // Channeling flaming solar orb in outstretched hand
    const orbScale = (1 + swing * 0.65) * sc;
    const ox = (10 + swing * 4) * sc;
    const oy = (-18 - swing * 4) * sc;
    ctx.beginPath();
    ctx.arc(ox, oy, 7 * orbScale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(249, 115, 22, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox, oy, 4.5 * orbScale, 0, Math.PI * 2);
    ctx.fillStyle = '#F97316';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox, oy, 2.2 * orbScale, 0, Math.PI * 2);
    ctx.fillStyle = '#FEF08A';
    ctx.fill();
  } else if (hero.heroId === 'kael') {
    // ===== KAEL — THE SHADOW (Hooded Twin-Dagger Assassin) =====
    // Billowing shadow scarf
    ctx.fillStyle = '#312E81';
    ctx.beginPath();
    ctx.moveTo(-2 * sc, -20 * sc);
    ctx.lineTo(-16 * sc + capeSway * 1.4, -13 * sc);
    ctx.lineTo(-10 * sc + capeSway, -7 * sc);
    ctx.closePath();
    ctx.fill();

    // Agile striding legs
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(-5 * sc + legL * 1.25, -8 * sc, 4 * sc, 8 * sc);
    ctx.fillRect(1 * sc + legR * 1.25, -8 * sc, 4 * sc, 8 * sc);

    // Sleek charcoal-indigo leather tunic leaning forward
    ctx.save();
    ctx.rotate(0.14);
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(-6 * sc, -21 * sc, 12 * sc, 14 * sc, 3 * sc);
    ctx.fill();
    ctx.strokeStyle = '#A78BFA';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Deep indigo hood + masked face
    ctx.fillStyle = '#3730A3';
    ctx.beginPath();
    ctx.arc(0, -26 * sc, 6.2 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-1 * sc, -25 * sc, 6 * sc, 3.5 * sc);
    ctx.fillStyle = '#E0E7FF';
    ctx.fillRect(2 * sc, -27.5 * sc, 2.2 * sc, 1.3 * sc);
    ctx.restore();

    // Twin curved silver daggers whipping forward!
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate((7 + swing * 5) * sc, (-14 + dir * 3) * sc);
      ctx.rotate(dir * (0.45 - swing * 1.5));
      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(11 * sc, -2 * sc);
      ctx.lineTo(9 * sc, 2 * sc);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#C4B5FD';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  } else if (hero.heroId === 'zarek') {
    // ===== ZAREK — THE STORM (Bronze & Teal Tempest Artificer) =====
    // Boots
    ctx.fillStyle = '#451A03';
    ctx.fillRect(-5 * sc + legL, -7 * sc, 4.5 * sc, 7 * sc);
    ctx.fillRect(1 * sc + legR, -7 * sc, 4.5 * sc, 7 * sc);

    // Teal artificer coat & bronze pauldrons
    ctx.fillStyle = '#0F766E';
    ctx.beginPath();
    ctx.roundRect(-7.5 * sc, -22 * sc, 15 * sc, 16 * sc, 4 * sc);
    ctx.fill();
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = '#B45309';
    ctx.beginPath();
    ctx.arc(-7.5 * sc, -19 * sc, 4.2 * sc, 0, Math.PI * 2);
    ctx.arc(7.5 * sc, -19 * sc, 4.2 * sc, 0, Math.PI * 2);
    ctx.fill();

    // Silver-haired bearded head
    ctx.fillStyle = '#F5CBA7';
    ctx.beginPath();
    ctx.arc(0, -27 * sc, 5.5 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94A3B8';
    ctx.beginPath();
    ctx.arc(0, -29.5 * sc, 5.5 * sc, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-3.5 * sc, -25.5 * sc, 7.5 * sc, 3.8 * sc);

    // Crackling brass lightning crystal staff
    ctx.save();
    ctx.translate(8 * sc, -14 * sc);
    ctx.rotate(0.15 + swing * 0.55);
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2.6 * sc;
    ctx.beginPath();
    ctx.moveTo(0, 10 * sc);
    ctx.lineTo(0, -17 * sc);
    ctx.stroke();
    // Glowing sapphire crystal tip
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.moveTo(0, -25 * sc);
    ctx.lineTo(4.5 * sc, -18 * sc);
    ctx.lineTo(0, -13 * sc);
    ctx.lineTo(-4.5 * sc, -18 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#E0F2FE';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  } else if (hero.heroId === 'sylva') {
    // ===== SYLVA — SOLAR HUNTER (Emerald Ranger with Gilded Recurve Bow) =====
    // Quiver with golden arrows
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-9 * sc, -24 * sc, 4 * sc, 11 * sc);
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-9 * sc, -27 * sc, 4 * sc, 3 * sc);

    // Forest cloak
    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.moveTo(-3 * sc, -21 * sc);
    ctx.lineTo(-13 * sc + capeSway, -4 * sc);
    ctx.lineTo(-1 * sc, -4 * sc);
    ctx.closePath();
    ctx.fill();

    // Boots
    ctx.fillStyle = '#5C3A21';
    ctx.fillRect(-4 * sc + legL, -7 * sc, 3.8 * sc, 7 * sc);
    ctx.fillRect(1 * sc + legR, -7 * sc, 3.8 * sc, 7 * sc);

    // Emerald ranger tunic
    ctx.fillStyle = '#15803D';
    ctx.beginPath();
    ctx.roundRect(-6 * sc, -21 * sc, 12 * sc, 15 * sc, 3 * sc);
    ctx.fill();
    ctx.strokeStyle = '#E5A93C';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Emerald hood & face
    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.arc(-0.5 * sc, -26.5 * sc, 6 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FAD7B8';
    ctx.beginPath();
    ctx.arc(1.5 * sc, -26.5 * sc, 4.4 * sc, 0, Math.PI * 2);
    ctx.fill();

    // Tall Gilded Recurve Bow drawing sunlit arrow!
    ctx.save();
    ctx.translate(7 * sc, -16 * sc);
    ctx.strokeStyle = '#E5A93C';
    ctx.lineWidth = 2.4 * sc;
    ctx.beginPath();
    ctx.arc(0, 0, 10 * sc, -1.25, 1.25);
    ctx.stroke();
    // Bowstring pulling back on attackAnim
    const pull = swing * 5 * sc;
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(3 * sc, -9.5 * sc);
    ctx.lineTo(-1 * sc - pull, 0);
    ctx.lineTo(3 * sc, 9.5 * sc);
    ctx.stroke();
    // Glowing solar arrow nocked
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1 * sc - pull, 0);
    ctx.lineTo(13 * sc - pull * 0.4, 0);
    ctx.stroke();
    ctx.restore();
  } else {
    // ===== ELOWEN — GOLDEN LIGHT (Ivory & Sage Cleric with Glowing Lantern Staff) =====
    // Golden-trimmed mantle
    ctx.fillStyle = '#E5A93C';
    ctx.beginPath();
    ctx.moveTo(-4 * sc, -21 * sc);
    ctx.lineTo(-12 * sc + capeSway, -3 * sc);
    ctx.lineTo(2 * sc, -3 * sc);
    ctx.closePath();
    ctx.fill();

    // Ivory & sage ceremonial robe
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.moveTo(-6 * sc, -21 * sc);
    ctx.lineTo(6 * sc, -21 * sc);
    ctx.lineTo(8 * sc, -3 * sc);
    ctx.lineTo(-8 * sc, -3 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#65A37A';
    ctx.fillRect(-3 * sc, -20 * sc, 6 * sc, 17 * sc);

    // Hooded ivory veil & serene face
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.arc(-0.5 * sc, -26.5 * sc, 6.2 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E5A93C';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#FAD7B8';
    ctx.beginPath();
    ctx.arc(1.5 * sc, -26.5 * sc, 4.4 * sc, 0, Math.PI * 2);
    ctx.fill();

    // Luminous Golden Lantern Staff
    ctx.save();
    ctx.translate(8 * sc, -15 * sc);
    ctx.rotate(-0.08 + swing * 0.35);
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 2.2 * sc;
    ctx.beginPath();
    ctx.moveTo(0, 12 * sc);
    ctx.lineTo(0, -15 * sc);
    ctx.stroke();
    // Lantern housing & warm emerald-gold glow
    ctx.beginPath();
    ctx.arc(0, -18 * sc, 7.5 * sc, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.28)';
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-3.5 * sc, -22 * sc, 7 * sc, 8 * sc);
    ctx.fillStyle = '#FEF9C3';
    ctx.fillRect(-2 * sc, -20.5 * sc, 4 * sc, 5 * sc);
    ctx.restore();
  }

  // Hit flash silhouette
  if (hero.hitFlash > 0) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, -16 * sc, 12 * sc, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // end mirrored character body

  // Active status effects around character
  const auraCenterY = pos.y - 17 * sc - bounce;
  if (hero.shield > 0) {
    ctx.beginPath();
    ctx.arc(pos.x, auraCenterY, 17 * sc, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(96, 165, 250, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#93C5FD';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (hero.slowTimer > 0) {
    ctx.beginPath();
    ctx.arc(pos.x, auraCenterY, 15 * sc, 0, Math.PI * 2);
    ctx.strokeStyle = '#22D3EE';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (hero.poisonTimer > 0) {
    ctx.fillStyle = '#4ADE80';
    const py = auraCenterY - 8 * sc + Math.sin(timeSec * 8) * 3;
    ctx.beginPath();
    ctx.arc(pos.x - 8 * sc, py, 2.5, 0, Math.PI * 2);
    ctx.arc(pos.x + 8 * sc, py + 4, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crisp compact Name + HP / Shield / Energy Bar overhead
  const barW = 38;
  const bx = pos.x - barW * 0.5;
  const by = pos.y - 44 * sc - bounce - ultLift;

  const showEnergyBar = hero.team === 'attacker' && hero.skillLevel > 0;
  // Hero name micro-tag for immediate clarity
  if (entry) {
    const nameTag = `${entry.name} N${hero.heroLevel}`;
    ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillText(nameTag, pos.x + 0.8, by - 3.2);
    ctx.fillStyle = hero.team === 'attacker' ? '#FFF8E7' : '#FCA5A5';
    ctx.fillText(nameTag, pos.x, by - 4);
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(bx - 1, by - 1, barW + 2, showEnergyBar ? 8.5 : 5.5);

  const hpPct = Math.max(0, hero.hp / hero.maxHp);
  ctx.fillStyle = hero.team === 'attacker' ? '#22C55E' : '#EF4444';
  ctx.fillRect(bx, by, barW * hpPct, 4);

  if (hero.shield > 0) {
    const shPct = Math.min(1, hero.shield / hero.maxHp);
    ctx.fillStyle = '#60A5FA';
    ctx.fillRect(bx, by, barW * shPct, 2);
  }

  if (showEnergyBar) {
    const enPct = Math.max(0, Math.min(1, hero.energy / hero.maxEnergy));
    ctx.fillStyle = enPct >= 1 ? '#FACC15' : '#38BDF8';
    ctx.fillRect(bx, by + 4.8, barW * enPct, 2);
  }

  ctx.restore();
}

export function drawBattleEffects(
  ctx: CanvasRenderingContext2D,
  projectiles: BattleProjectile[],
  particles: BattleParticle[],
  vfx: BattleVfx[],
  floatingTexts: FloatingText[],
  vp: IsoViewport
) {
  // 1. Physics Debris, Smoke, Embers & Healing Particles
  for (const pt of particles) {
    const t = pt.age / pt.duration;
    const alpha = Math.max(0, pt.alpha * (1 - t));
    const pos = gridToScreen(pt.x, pt.y, vp);
    const px = pos.x;
    const py = pos.y - pt.z;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (pt.shape === 'smoke' || pt.shape === 'dust') {
      ctx.beginPath();
      ctx.arc(px, py, pt.size * (0.7 + t * 0.9), 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    } else if (pt.shape === 'stone' || pt.shape === 'wood') {
      ctx.translate(px, py);
      ctx.rotate(pt.rotation);
      ctx.fillStyle = pt.color;
      if (pt.shape === 'wood') {
        ctx.fillRect(-pt.size, -pt.size * 0.35, pt.size * 2, pt.size * 0.7);
      } else {
        ctx.fillRect(-pt.size * 0.6, -pt.size * 0.6, pt.size * 1.2, pt.size * 1.2);
      }
    } else if (pt.shape === 'heal') {
      ctx.fillStyle = pt.color;
      ctx.fillRect(px - 1, py - pt.size, 2, pt.size * 2);
      ctx.fillRect(px - pt.size, py - 1, pt.size * 2, 2);
    } else {
      ctx.beginPath();
      ctx.arc(px, py, pt.size * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. Arcing Projectiles with Ground Shadows & Directional Rendering
  for (const p of projectiles) {
    const pos = gridToScreen(p.x, p.y, vp);
    const prev = gridToScreen(p.prevX, p.prevY, vp);
    const arcZ = Math.sin(p.progress * Math.PI) * p.arcHeight;
    const px = pos.x;
    const py = pos.y - 12 - arcZ;
    const angle = Math.atan2(pos.y - prev.y, pos.x - prev.x);

    ctx.save();
    if (p.style === 'electric') {
      // Multi-segment crackling thunderbolt from Monólito do Trovão
      const from = gridToScreen(p.fromX, p.fromY, vp);
      const x1 = from.x + (px - from.x) * 0.34 + (Math.random() - 0.5) * 14;
      const y1 = from.y - 22 + (py - (from.y - 22)) * 0.34 + (Math.random() - 0.5) * 10;
      const x2 = from.x + (px - from.x) * 0.68 + (Math.random() - 0.5) * 14;
      const y2 = from.y - 22 + (py - (from.y - 22)) * 0.68 + (Math.random() - 0.5) * 10;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y - 24);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(px, py);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 6.5;
      ctx.stroke();
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // Spark node at impact tip
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.style === 'solar') {
      // Sylva's flaming flint arrow with wooden shaft, glowing fire head & ember trail
      ctx.translate(px, py);
      ctx.rotate(angle);
      // Warm fire glow behind arrowhead
      ctx.fillStyle = 'rgba(249, 115, 22, 0.38)';
      ctx.beginPath();
      ctx.ellipse(3, 0, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wooden arrow shaft
      ctx.strokeStyle = '#A16207';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      // Tan feather fletching
      ctx.strokeStyle = '#FDE68A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-13, -3);
      ctx.moveTo(-10, 0);
      ctx.lineTo(-13, 3);
      ctx.stroke();
      // Blazing flint tip
      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(4, -3.5);
      ctx.lineTo(4, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(6.5, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.style === 'arrow') {
      // Torre de Caçadores Stone Age flint spear-arrow
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      // Feather fletching
      ctx.strokeStyle = '#E7E5E4';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-12, -2.5);
      ctx.moveTo(-9, 0);
      ctx.lineTo(-12, 2.5);
      ctx.stroke();
      // Chipped stone flint arrowhead
      ctx.fillStyle = '#CBD5E1';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(4, -3.2);
      ctx.lineTo(4, 3.2);
      ctx.closePath();
      ctx.fill();
    } else if (p.style === 'cannon') {
      // Catapulta de Pedra: spinning faceted rough boulder + ground shadow
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 2, 6, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fill();
      ctx.translate(px, py);
      ctx.rotate(p.progress * Math.PI * 3.5);
      ctx.fillStyle = '#78716C';
      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, -2);
      ctx.lineTo(-2, -6.5);
      ctx.lineTo(4.5, -5);
      ctx.lineTo(6.5, 1);
      ctx.lineTo(2.5, 6);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Pixel stone highlight facet
      ctx.fillStyle = '#D6D3D1';
      ctx.fillRect(-3, -4, 4, 3);
    } else if (p.style === 'ice') {
      // Altar Glacial: sharp rotating diamond glacial shard
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7DD3FC';
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(0, -4);
      ctx.lineTo(-7, 0);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (p.style === 'poison') {
      // Caldeirão de Ervas: bubbling toxic emerald glob
      ctx.beginPath();
      ctx.arc(px, py, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 4.8, 0, Math.PI * 2);
      ctx.fillStyle = '#22C55E';
      ctx.fill();
      ctx.fillStyle = '#BBF7D0';
      ctx.beginPath();
      ctx.arc(px - 1.5, py - 1.5, 1.8, 0, Math.PI * 2);
      ctx.arc(px + 2, py + 1.2, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.style === 'fire' || p.style === 'arcane') {
      // Totem Xamânico ancestral spirit orb / fiery ember orb
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = p.style === 'fire' ? 'rgba(249,115,22,0.34)' : 'rgba(168,85,247,0.36)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 5.2, 0, Math.PI * 2);
      ctx.fillStyle = p.style === 'fire' ? '#F97316' : '#C084FC';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FEF9C3';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, 4.8, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Dramatic Stone Age Combat VFX (Slams, Fire-Spear Beams, Forked Thunder, Boulders, Shields)
  for (const v of vfx) {
    const t = v.age / v.duration;
    const alpha = Math.max(0, 1 - t);
    const pos = gridToScreen(v.x, v.y, vp);
    ctx.save();
    ctx.globalAlpha = alpha;

    if (v.kind === 'meteor') {
      if (t < 0.45) {
        const fallT = t / 0.45;
        const startX = pos.x - 90;
        const startY = pos.y - 210;
        const mx = startX + (pos.x - startX) * fallT;
        const my = startY + (pos.y - startY) * fallT;
        ctx.globalAlpha = 1;
        const grad = ctx.createLinearGradient(mx - 35, my - 75, mx, my);
        grad.addColorStop(0, 'rgba(249, 115, 22, 0)');
        grad.addColorStop(1, 'rgba(250, 204, 21, 0.95)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(mx - 35, my - 75);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx, my, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#EA580C';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FEF08A';
        ctx.fill();
      } else {
        const blastT = (t - 0.45) / 0.55;
        const rx = v.radius * vp.tileW * 0.46 * (0.35 + blastT * 0.7);
        const ry = v.radius * vp.tileH * 0.46 * (0.35 + blastT * 0.7);
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(249, 115, 22, 0.42)';
        ctx.fill();
        ctx.strokeStyle = '#FDE047';
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }
    } else if (v.kind === 'beam') {
      // Sylva's Flecha Incendiária Perfurante: blazing triple-layered fire-spear beam
      const target = gridToScreen(v.targetX ?? v.x, v.targetY ?? v.y, vp);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - 18);
      ctx.lineTo(target.x, target.y - 18);
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.55)';
      ctx.lineWidth = 16 * alpha;
      ctx.stroke();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 8.5 * alpha;
      ctx.stroke();
      ctx.strokeStyle = '#FFFBEB';
      ctx.lineWidth = 3.5 * alpha;
      ctx.stroke();
    } else if (v.kind === 'lightning') {
      // Forked crackling thunderbolt with secondary branch
      const target = gridToScreen(v.targetX ?? v.x, v.targetY ?? v.y, vp);
      const mx1 = pos.x + (target.x - pos.x) * 0.33 + (Math.random() - 0.5) * 18;
      const my1 = pos.y + (target.y - pos.y) * 0.33 - 18;
      const mx2 = pos.x + (target.x - pos.x) * 0.66 + (Math.random() - 0.5) * 18;
      const my2 = pos.y + (target.y - pos.y) * 0.66 - 18;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - 18);
      ctx.lineTo(mx1, my1);
      ctx.lineTo(mx2, my2);
      ctx.lineTo(target.x, target.y - 18);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 7.5;
      ctx.stroke();
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 2.8;
      ctx.stroke();
      // Fork branch
      ctx.beginPath();
      ctx.moveTo(mx1, my1);
      ctx.lineTo(mx1 + (Math.random() - 0.5) * 22, my1 + 14);
      ctx.strokeStyle = '#7DD3FC';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (v.kind === 'slash') {
      // Heavy Stone-Club slam starburst / impact X
      const s = v.radius * 20 * (0.6 + t * 0.5);
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 4.2 * alpha;
      ctx.beginPath();
      ctx.moveTo(pos.x - s, pos.y - 16 - s * 0.52);
      ctx.lineTo(pos.x + s, pos.y - 16 + s * 0.52);
      ctx.moveTo(pos.x + s, pos.y - 16 - s * 0.52);
      ctx.lineTo(pos.x - s, pos.y - 16 + s * 0.52);
      ctx.stroke();
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 2 * alpha;
      ctx.stroke();
    } else if (v.kind === 'explosion') {
      const r = v.radius * 28 * (0.35 + t * 0.85);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 10, r, 0, Math.PI * 2);
      ctx.fillStyle = v.color === '#A8A29E' ? 'rgba(168, 162, 158, 0.45)' : 'rgba(249, 115, 22, 0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 10, r * 0.58, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.78)';
      ctx.fill();
    } else if (v.kind === 'muzzle') {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 16, 12 * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fillStyle = v.color || '#FDE047';
      ctx.fill();
    } else if (v.kind === 'shield') {
      // Expanding tribal stone-ward stomp rings
      const rx = v.radius * vp.tileW * 0.45 * (0.35 + t * 0.75);
      const ry = v.radius * vp.tileH * 0.45 * (0.35 + t * 0.75);
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - 4, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.14)';
      ctx.fill();
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - 4, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (v.kind === 'pillar') {
      // Heroic vertical sky-light beam on deploy or Ultimate cast
      const colW = (14 + v.radius * 9) * (1 - t * 0.45);
      const colH = 140 + v.radius * 26;
      const grad = ctx.createLinearGradient(pos.x, pos.y, pos.x, pos.y - colH);
      grad.addColorStop(0, v.color || '#FACC15');
      grad.addColorStop(0.55, v.color || '#FACC15');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = alpha * 0.42;
      ctx.fillRect(pos.x - colW * 0.5, pos.y - colH, colW, colH);
      ctx.fillStyle = '#FFFBEB';
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillRect(pos.x - colW * 0.18, pos.y - colH * 0.9, colW * 0.36, colH * 0.9);
      // Base luminous pool
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, colW * 0.85, colW * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = v.color || '#FACC15';
      ctx.globalAlpha = alpha * 0.55;
      ctx.fill();
    } else if (v.kind === 'shockwave') {
      // Expanding twin isometric ground shockwave rings
      const rx = v.radius * vp.tileW * 0.52 * (0.22 + t * 0.92);
      const ry = v.radius * vp.tileH * 0.52 * (0.22 + t * 0.92);
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = v.color || '#FACC15';
      ctx.lineWidth = Math.max(1.5, 4.2 * alpha);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - 2, rx * 0.68, ry * 0.68, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#FFFBEB';
      ctx.lineWidth = Math.max(1, 2.2 * alpha);
      ctx.stroke();
    } else if (v.kind === 'ember_nova') {
      // Fiery 8-ray solar starburst explosion (Sylva crits & Ultimate)
      const r = v.radius * 26 * (0.35 + t * 0.85);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 12, r * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 12, r * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFBEB';
      ctx.fill();
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = Math.max(1.5, 3 * alpha);
      for (let ray = 0; ray < 8; ray++) {
        const ang = (ray * Math.PI) / 4 + t * 0.4;
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(ang) * r * 0.25, pos.y - 12 + Math.sin(ang) * r * 0.25);
        ctx.lineTo(pos.x + Math.cos(ang) * r * 1.15, pos.y - 12 + Math.sin(ang) * r * 1.15);
        ctx.stroke();
      }
    } else {
      const rx = v.radius * vp.tileW * 0.45 * (0.4 + t * 0.7);
      const ry = v.radius * vp.tileH * 0.45 * (0.4 + t * 0.7);
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - 4, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4. Floating Damage / Heal / Skill Texts
  for (const ft of floatingTexts) {
    const alpha = Math.max(0, 1 - ft.age / ft.duration);
    const pos = gridToScreen(ft.x, ft.y, vp);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = ft.large
      ? '700 13px "Cinzel", serif'
      : '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillText(ft.text, pos.x + 1, pos.y - 26 + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, pos.x, pos.y - 26);
    ctx.restore();
  }
}

export function getStructureSummaryColor(type: StructureType): string {
  return STRUCTURES_CATALOG[type].color;
}
