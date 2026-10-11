import { useEffect, useState } from 'react';
import { BACKGROUNDS } from '../game/backgrounds';
import { useGameStore } from '../game/store';
import type { InspectedCard } from '../game/store';
import type { AbilityKind } from '../game/types';
import { RARITY_STYLE } from './CardView';

const KIND_LABEL: Record<AbilityKind, string> = {
  none: 'No Ability',
  onReveal: 'On Reveal',
  ongoing: 'Ongoing',
  chaos: 'Chaos',
  spy: 'Spy',
  medic: 'Medic',
  muster: 'Muster',
  move: 'Move',
  factionBond: 'Faction Bond',
  hero: 'Hero',
};

/** Fixed detail panel on the right edge of the screen — shows the last clicked card. */
export function CardInspector() {
  const inspected = useGameStore((s) => s.inspected);
  const closeInspector = useGameStore((s) => s.closeInspector);

  // Keep the last inspected card mounted while the slide-out animation plays.
  const [shown, setShown] = useState<InspectedCard | null>(inspected);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (inspected) {
      setShown(inspected);
      setClosing(false);
      return;
    }
    if (!shown) return;
    setClosing(true);
    const t = setTimeout(() => {
      setShown(null);
      setClosing(false);
    }, 240); // matches .anim-inspector-out duration
    return () => clearTimeout(t);
  }, [inspected, shown]);

  if (!shown) return null;
  const { def, bonus, power } = shown;
  const r = RARITY_STYLE[def.rarity];
  const shownPower = Math.max(0, power ?? def.power + bonus);
  const background = BACKGROUNDS[def.id];

  return (
    <aside
      className={`zone-frame inspector-panel my-4 mr-4 flex w-[24rem] shrink-0 flex-col overflow-hidden rounded-lg ${
        closing ? 'anim-inspector-out' : 'anim-inspector-in'
      }`}
    >
      {/* Card art with rarity frame */}
      <div className="flex shrink-0 justify-center bg-black/60 p-4">
        <div
          key={def.id}
          className={`card-frame ${r.frame} anim-inspector-card relative h-80 w-56 shrink-0 overflow-hidden`}
        >
          <img
            src={def.art}
            alt={def.name}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
          <div className="power-coin absolute bottom-2 right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full text-xl font-black">
            {shownPower}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="anim-inspector-rise" style={{ animationDelay: '0.12s' }}>
          <div className="font-gothic metal-text text-2xl font-black leading-tight tracking-wide">
            {def.name}
          </div>
          <div className={`mt-1 font-mono text-xs uppercase tracking-widest ${r.text}`}>
            {r.label} · {def.faction}
          </div>
        </div>

        <div className="panel-inset anim-inspector-rise px-3 py-2.5" style={{ animationDelay: '0.18s' }}>
          <div className="font-mono text-[10px] uppercase tracking-widest text-blood-neon/60">
            Power
          </div>
          <div className="font-mono text-lg font-bold text-chrome-bright">
            {shownPower}
            {bonus !== 0 && (
              <span className={bonus > 0 ? 'text-emerald-400' : 'text-blood-neon'}>
                {' '}
                ({def.power} {bonus > 0 ? `+${bonus}` : bonus})
              </span>
            )}
          </div>
        </div>

        <div className="panel-inset anim-inspector-rise px-3 py-2.5" style={{ animationDelay: '0.24s' }}>
          <div className="font-mono text-[10px] uppercase tracking-widest text-blood-neon/60">
            {KIND_LABEL[def.kind]}
          </div>
          <p className="mt-1 text-sm leading-snug text-chrome-bright/90">{def.text}</p>
        </div>

        {background && (
          <div className="panel-inset anim-inspector-rise px-3 py-2.5" style={{ animationDelay: '0.3s' }}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-blood-neon/60">
              Background
            </div>
            <p className="mt-1 text-xs italic leading-relaxed text-chrome">{background}</p>
          </div>
        )}
      </div>

      <button
        onClick={closeInspector}
        className="btn-chrome m-4 mt-0 shrink-0 py-2 font-mono text-xs uppercase tracking-widest"
      >
        Close
      </button>
    </aside>
  );
}
