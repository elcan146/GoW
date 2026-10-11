import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/** 4x4 Bayer threshold matrix, values 0..15. */
const BAYER_4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

/** Renders the Bayer matrix to a 4x4 grayscale PNG data URL for feImage. */
function makeBayerTile(): string {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(4, 4);
  BAYER_4.forEach((b, i) => {
    const v = Math.round((b / 16) * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/** Cycle order: off -> 2 -> 4 -> 8 levels per channel. */
const MODES = [0, 2, 4, 8] as const;
type Mode = (typeof MODES)[number];

const LABELS: Record<Mode, string> = {
  0: 'dither off',
  2: 'dither 2-lvl',
  4: 'dither 4-lvl',
  8: 'dither 8-lvl',
};

/**
 * Real ordered dithering over the whole app via an SVG filter.
 * A Bayer tile is repeated across the screen, added to the source,
 * then each RGB channel is quantized to N levels — the Dither Boy /
 * Dither Guy look, in color.
 */
export function DitherOverlay() {
  const [mode, setMode] = useState<Mode>(4);
  const tile = useMemo(makeBayerTile, []);

  useEffect(() => {
    document.body.classList.toggle('dithered', mode > 0);
    return () => document.body.classList.remove('dithered');
  }, [mode]);

  // s = channel + (bayer - 0.5) / (levels - 1), then quantize to `levels` values
  const spread = mode > 1 ? 1 / (mode - 1) : 0;
  const table =
    mode > 1
      ? Array.from({ length: mode }, (_, i) => +(i / (mode - 1)).toFixed(4)).join(' ')
      : '0 1';

  return (
    <>
      {createPortal(
        <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
          <filter id="retro-dither" colorInterpolationFilters="sRGB">
            <feImage
              href={tile}
              x="0"
              y="0"
              width="2"
              height="2"
              preserveAspectRatio="none"
              result="bayer"
            />
            <feTile in="bayer" result="tile" />
            <feComposite
              in="SourceGraphic"
              in2="tile"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3={spread}
              k4={-0.5 * spread}
              result="shifted"
            />
            <feComponentTransfer in="shifted">
              <feFuncR type="discrete" tableValues={table} />
              <feFuncG type="discrete" tableValues={table} />
              <feFuncB type="discrete" tableValues={table} />
              <feFuncA type="linear" slope="0" intercept="1" />
            </feComponentTransfer>
          </filter>
        </svg>,
        document.body,
      )}
      <button
        type="button"
        className="dither-toggle"
        onClick={() => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length])}
        title="Cycle dither mode"
      >
        {LABELS[mode]}
      </button>
    </>
  );
}
