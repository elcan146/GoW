import { useEffect, useState, type ReactNode } from 'react';

/**
 * Approach 1 — "Game Canvas" scaling wrapper.
 *
 * The entire app is laid out once inside a fixed-resolution stage
 * (DESIGN_W x DESIGN_H). A uniform CSS `scale()` transform fits that stage
 * into the usable window area, letterboxing the overflow — exactly like a
 * video player. Zero layout shifts: every px value inside keeps its meaning.
 */

/**
 * Design stage size — hugs the real content width (256 player + 1500 board +
 * 384 inspector + margins) at a 16:9 aspect, so the stage fills 16:9 screens
 * edge-to-edge and scales uniformly elsewhere.
 */
const DESIGN_W = 2176;
const DESIGN_H = 1224;

interface StageFit {
  scale: number;
  cx: number;
  cy: number;
}

/**
 * Fit box for the stage: the whole window viewport. `innerHeight` already
 * excludes OS chrome (taskbar) for maximized windows, and fullscreen auto-
 * hides it — so we scale to the viewport directly and center. The stage is a
 * fixed 16:9 box, so any aspect mismatch shows as thin, symmetric letterbox
 * bars rather than dead space on one side.
 */
function stageFit(): StageFit {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    scale: Math.min(w / DESIGN_W, h / DESIGN_H),
    cx: w / 2,
    cy: h / 2,
  };
}

/** Uniform scale + center point that fits the fixed design stage into the usable window area. */
function useStageFit(): StageFit {
  const [fit, setFit] = useState(stageFit);
  useEffect(() => {
    const onResize = () => setFit(stageFit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return fit;
}

export function GameStage({ children }: { children: ReactNode }) {
  const fit = useStageFit();

  return (
    <div className="void-deck fixed inset-0 overflow-hidden">
      {/* Fixed-proportion stage — always DESIGN_W x DESIGN_H, scaled to fit. */}
      <div
        className="absolute flex items-stretch overflow-hidden"
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          left: fit.cx,
          top: fit.cy,
          transform: `translate(-50%, -50%) scale(${fit.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
