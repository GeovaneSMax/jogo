import { useEffect, useRef, useState } from 'react';
import { getHeroSprite, subscribeSpritesLoaded } from '../engine/spriteLoader';
import { HeroCatalogEntry } from '../types/game';

interface HeroPortraitProps {
  hero: HeroCatalogEntry;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function HeroPortrait({ hero, size = 'md', className = '' }: HeroPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tick, setTick] = useState(0);

  const pxSize = size === 'sm' ? 40 : size === 'lg' ? 96 : 56;
  const dims =
    size === 'sm'
      ? 'w-10 h-10 text-xs'
      : size === 'lg'
      ? 'w-24 h-24 text-2xl'
      : 'w-14 h-14 text-base';

  useEffect(() => {
    return subscribeSpritesLoaded(() => setTick((t) => t + 1));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = pxSize * dpr;
    canvas.height = pxSize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, pxSize, pxSize);

    // Warm prehistoric cave-earth radial backdrop behind pixel-art hero
    const bg = ctx.createRadialGradient(
      pxSize * 0.5,
      pxSize * 0.4,
      pxSize * 0.06,
      pxSize * 0.5,
      pxSize * 0.55,
      pxSize * 0.68
    );
    bg.addColorStop(0, hero.id === 'aegor' ? '#4C3D2B' : '#2C442B');
    bg.addColorStop(1, '#171412');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, pxSize, pxSize);

    const sprite = getHeroSprite(hero.id, 'idle');
    if (sprite) {
      ctx.imageSmoothingEnabled = false;
      const pad = Math.max(2, Math.round(pxSize * 0.06));
      const maxW = pxSize - pad * 2;
      const maxH = pxSize - pad * 2;
      const scale = Math.min(maxW / sprite.width, maxH / sprite.height);
      const dw = sprite.width * scale;
      const dh = sprite.height * scale;
      ctx.drawImage(sprite.canvas, (pxSize - dw) * 0.5, pxSize - pad - dh, dw, dh);
    } else {
      ctx.fillStyle = '#FFF8E7';
      ctx.font = `700 ${Math.round(pxSize * 0.32)}px "Cinzel", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hero.emblemSymbol, pxSize * 0.5, pxSize * 0.52);
    }
  }, [hero.id, hero.emblemSymbol, pxSize, tick]);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-lg border border-[#E5A93C]/40 bg-[#1B1815] ${dims} ${className}`}
      aria-label={`Retrato em pixel art de ${hero.name}, ${hero.title}`}
    >
      <canvas
        ref={canvasRef}
        style={{ width: pxSize, height: pxSize, imageRendering: 'pixelated' }}
        className="block w-full h-full"
      />
    </div>
  );
}
