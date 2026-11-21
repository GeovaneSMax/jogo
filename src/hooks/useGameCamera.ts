import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCamera } from '../engine/isoRenderer';

export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 2.8;
const DEFAULT_CAMERA: GameCamera = { zoom: 1.08, panX: 0, panY: 0 };

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function clampPan(panX: number, panY: number, zoom: number, width: number, height: number) {
  const maxPanX = Math.max(180, width * 0.55 * zoom);
  const maxPanY = Math.max(140, height * 0.5 * zoom);
  return {
    panX: clamp(panX, -maxPanX, maxPanX),
    panY: clamp(panY, -maxPanY, maxPanY),
  };
}

/**
 * Manages canvas-only isometric camera zoom & pan (wheel, trackpad pinch, touch pinch,
 * keyboard Ctrl/Cmd + +/-/0, and pointer drag) while blocking full-page browser zoom
 * so UI overlays stay crisp and fixed at 100%.
 */
export function useGameCamera(
  containerRef: React.RefObject<HTMLDivElement | null>,
  active = true
) {
  const [camera, setCamera] = useState<GameCamera>(DEFAULT_CAMERA);
  const cameraRef = useRef<GameCamera>(DEFAULT_CAMERA);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, origPanX: 0, origPanY: 0, moved: false });
  const suppressNextClickRef = useRef(false);

  const commitCamera = useCallback((next: GameCamera) => {
    cameraRef.current = next;
    setCamera(next);
  }, []);

  const zoomAroundPoint = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const el = containerRef.current;
      const rect = el?.getBoundingClientRect();
      const w = rect?.width ?? window.innerWidth;
      const h = rect?.height ?? window.innerHeight;

      const cur = cameraRef.current;
      const nextZoom = clamp(Number((cur.zoom * factor).toFixed(3)), MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(nextZoom - cur.zoom) < 0.001) return;

      const ratio = nextZoom / cur.zoom;
      const dx = clientX !== undefined && rect ? clientX - rect.left - w * 0.5 : 0;
      const dy = clientY !== undefined && rect ? clientY - rect.top - h * 0.5 : 0;

      const rawPanX = dx - (dx - cur.panX) * ratio;
      const rawPanY = dy - (dy - cur.panY) * ratio;
      const clamped = clampPan(rawPanX, rawPanY, nextZoom, w, h);

      commitCamera({
        zoom: nextZoom,
        panX: nextZoom <= 1.01 ? clamped.panX * 0.5 : clamped.panX,
        panY: nextZoom <= 1.01 ? clamped.panY * 0.5 : clamped.panY,
      });
    },
    [commitCamera, containerRef]
  );

  const zoomIn = useCallback(() => zoomAroundPoint(1.2), [zoomAroundPoint]);
  const zoomOut = useCallback(() => zoomAroundPoint(1 / 1.2), [zoomAroundPoint]);
  const resetCamera = useCallback(() => commitCamera(DEFAULT_CAMERA), [commitCamera]);

  // 1. Intercept browser zoom globally while the game view is active:
  //    - Trackpad pinch-to-zoom (wheel + ctrlKey) anywhere on page
  //    - Keyboard Ctrl/Cmd + '+', '-', '=', '0'
  //    - Safari gesturestart/gesturechange
  useEffect(() => {
    if (!active) return;

    const onGlobalWheel = (e: WheelEvent) => {
      const el = containerRef.current;
      const insideCanvas = el ? el.contains(e.target as Node) : false;

      if (e.ctrlKey || e.metaKey) {
        // Always prevent browser page zoom and redirect zoom to the game canvas!
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0045);
        zoomAroundPoint(factor, e.clientX, e.clientY);
        return;
      }

      if (insideCanvas) {
        // Regular mouse wheel over the arena zooms only the game world
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAroundPoint(factor, e.clientX, e.clientY);
      }
    };

    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault();
        zoomAroundPoint(1.18);
      } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        zoomAroundPoint(1 / 1.18);
      } else if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault();
        resetCamera();
      }
    };

    const onGesture = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('wheel', onGlobalWheel, { passive: false });
    window.addEventListener('keydown', onGlobalKeyDown);
    window.addEventListener('gesturestart', onGesture, { passive: false } as AddEventListenerOptions);
    window.addEventListener('gesturechange', onGesture, { passive: false } as AddEventListenerOptions);

    return () => {
      window.removeEventListener('wheel', onGlobalWheel);
      window.removeEventListener('keydown', onGlobalKeyDown);
      window.removeEventListener('gesturestart', onGesture);
      window.removeEventListener('gesturechange', onGesture);
    };
  }, [active, containerRef, resetCamera, zoomAroundPoint]);

  // 2. Touch pinch-to-zoom + pointer drag panning on the arena container
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !active) return;

    let pinchDist = 0;

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchDist = getTouchDist(e.touches[0], e.touches[1]);
        dragStateRef.current.active = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchDist > 0) {
        e.preventDefault();
        const nextDist = getTouchDist(e.touches[0], e.touches[1]);
        const factor = nextDist / pinchDist;
        pinchDist = nextDist;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) * 0.5;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
        zoomAroundPoint(factor, midX, midY);
      }
    };

    const onTouchEnd = () => {
      pinchDist = 0;
    };

    const onMouseDown = (e: MouseEvent) => {
      // Allow smooth click-drag panning across the spacious village at any zoom level
      if (e.button === 0 || e.button === 1 || e.button === 2) {
        dragStateRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          origPanX: cameraRef.current.panX,
          origPanY: cameraRef.current.panY,
          moved: false,
        };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag.active) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 6) {
        drag.moved = true;
      }
      if (drag.moved) {
        const rect = el.getBoundingClientRect();
        const clamped = clampPan(
          drag.origPanX + dx,
          drag.origPanY + dy,
          cameraRef.current.zoom,
          rect.width,
          rect.height
        );
        commitCamera({
          zoom: cameraRef.current.zoom,
          panX: clamped.panX,
          panY: clamped.panY,
        });
      }
    };

    const onMouseUp = () => {
      if (dragStateRef.current.active && dragStateRef.current.moved) {
        suppressNextClickRef.current = true;
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 50);
      }
      dragStateRef.current.active = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      if (dragStateRef.current.moved) {
        e.preventDefault();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [active, commitCamera, containerRef, zoomAroundPoint]);

  return {
    camera,
    cameraRef,
    zoomPercent: Math.round(camera.zoom * 100),
    zoomIn,
    zoomOut,
    resetCamera,
    suppressNextClickRef,
  };
}
