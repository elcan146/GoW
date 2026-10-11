import { canPlayAt, cardPower, sideTotal, useGameStore } from '../game/store';
import { capacityFor } from '../game/effects';
import { locationArt } from '../game/locations';
import type { BoardCard, FxEvent, LocationState, Side } from '../game/types';
import { CardView } from './CardView';

interface Props {
  location: LocationState;
  index: number;
}

/** Ambient environmental overlay per location id. */
const AMBIENT: Record<string, string> = {
  'dense-forest': 'amb-fog',
  shadowland: 'amb-fog',
  swamps: 'amb-murk',
  intestines: 'amb-murk',
  lava: 'amb-embers',
  dragons: 'amb-embers',
  hell: 'amb-embers',
  heaven: 'amb-holy',
  valhalla: 'amb-holy',
  snowy: 'amb-snow',
  abyss: 'amb-void',
};

function animFor(fx: FxEvent[], c: BoardCard): 'slam' | 'spy' | 'move' | undefined {
  const f = fx.find((e) => e.instanceId === c.instanceId);
  if (!f) return undefined;
  return f.kind === 'spy' ? 'spy' : f.kind === 'move' ? 'move' : f.kind === 'slam' ? 'slam' : undefined;
}

function CardSlots({
  cards,
  capacity,
  side,
  locIndex,
  fx,
}: {
  cards: BoardCard[];
  capacity: number;
  side: Side;
  locIndex: number;
  fx: FxEvent[];
}) {
  const state = useGameStore.getState();
  const inspectCard = useGameStore((s) => s.inspectCard);
  return (
    <div className="relative flex min-h-[7rem] flex-wrap items-center justify-center gap-1.5">
      {Array.from({ length: capacity }).map((_, i) => {
        const c = cards[i];
        return c ? (
          <CardView
            key={c.instanceId}
            card={c.def}
            bonus={c.bonus}
            power={cardPower(state, locIndex, side, c)}
            size="board"
            faceDown={side === 'ai' && c.faceDown}
            anim={animFor(fx, c)}
            disabled
            onInspect={
              side === 'ai' && c.faceDown
                ? undefined
                : () => inspectCard(c.def, c.bonus, cardPower(state, locIndex, side, c))
            }
          />
        ) : (
          <div key={`empty-${i}`} className="slot-empty h-[6.5rem] w-[4.5rem] rounded-md" />
        );
      })}
    </div>
  );
}

function ChaosSlot({ card, side, locIndex, fx }: { card: BoardCard | null; side: Side; locIndex: number; fx: FxEvent[] }) {
  const state = useGameStore.getState();
  const inspectCard = useGameStore((s) => s.inspectCard);
  return (
    <div className="flex items-center justify-center">
      {card ? (
        <div className="relative">
          <CardView
            card={card.def}
            bonus={card.bonus}
            power={cardPower(state, locIndex, side, card)}
            size="board"
            faceDown={side === 'ai' && card.faceDown}
            anim={animFor(fx, card)}
            disabled
            onInspect={
              side === 'ai' && card.faceDown
                ? undefined
                : () => inspectCard(card.def, card.bonus, cardPower(state, locIndex, side, card))
            }
          />
          <span className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 bg-[#3a0a12] px-1 font-mono text-[7px] uppercase text-blood-neon shadow-[0_0_8px_rgba(255,42,60,0.7)] ring-1 ring-blood">
            chaos
          </span>
        </div>
      ) : (
        <div className="flex h-[6.5rem] w-[4.5rem] items-center justify-center border border-dashed border-blood/40 bg-[#1a0508]/30 font-mono text-[9px] uppercase text-blood/60">
          chaos
        </div>
      )}
    </div>
  );
}

/** Transient burn/destroy overlays for one side of the location. */
function SideFx({ fx, li, side }: { fx: FxEvent[]; li: number; side: Side }) {
  const events = fx.filter((e) => e.li === li && e.side === side && (e.kind === 'burn' || e.kind === 'destroy'));
  return (
    <>
      {events.map((e) => (
        <div key={e.id} className="pointer-events-none absolute inset-0 z-30">
          {e.kind === 'burn' && <div className="burn-burst" />}
          <div className="ash-crumble" />
        </div>
      ))}
    </>
  );
}

export function LocationColumn({ location, index }: Props) {
  const phase = useGameStore((s) => s.phase);
  const playAtLocation = useGameStore((s) => s.playAtLocation);
  const selectedHand = useGameStore((s) => s.selectedHand);
  const hand = useGameStore((s) => s.player.hand);
  const fx = useGameStore((s) => s.fx);
  const state = useGameStore.getState();

  const pTotal = sideTotal(state, index, 'player');
  const aTotal = sideTotal(state, index, 'ai');
  const capacity = capacityFor(location);
  const selected = selectedHand !== null ? hand[selectedHand] : null;
  const playable =
    phase === 'player-turn' &&
    selected !== null &&
    canPlayAt(state, 'player', selected.def, index);

  const scoring = phase === 'round-end' || phase === 'game-end';
  const winner = scoring ? (pTotal > aTotal ? 'player' : aTotal > pTotal ? 'ai' : 'tie') : null;
  const ambient = AMBIENT[location.def.id];
  const slams = fx.filter((e) => e.li === index && e.kind === 'slam');

  return (
    <div
      onClick={() => playable && playAtLocation(index)}
      role={playable ? 'button' : undefined}
      className={`zone-frame group relative flex flex-1 flex-col overflow-hidden rounded-lg transition-all duration-150
        ${playable ? 'neon-glow cursor-pointer' : ''}
        ${winner === 'player' ? 'shadow-[0_0_28px_rgba(232,236,241,0.35)]' : ''}
        ${winner === 'ai' ? 'shadow-[0_0_28px_rgba(255,42,60,0.45)]' : ''}`}
    >
      {/* Location art backdrop — cinematic fade+settle on round start */}
      <img
        key={`${location.def.id}-${index}`}
        src={locationArt(location.def.id, index)}
        alt=""
        className="anim-art pointer-events-none absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/60" />
      {ambient && <div className={ambient} />}

      {/* AI cards (top half) */}
      <div className="relative z-10 flex-1 border-b border-black/50 p-1.5">
        <CardSlots cards={location.ai} capacity={capacity} side="ai" locIndex={index} fx={fx} />
        <div className="mt-1">
          <ChaosSlot card={location.aiChaos} side="ai" locIndex={index} fx={fx} />
        </div>
        <SideFx fx={fx} li={index} side="ai" />
      </div>

      {/* Location banner with power totals */}
      <div className="panel-inset relative z-10 flex items-center gap-2 border-y border-blood/30 px-2 py-1.5">
        <span
          key={aTotal}
          className={`power-coin anim-total flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-black
          ${aTotal >= pTotal && aTotal > 0 ? 'debuffed' : 'opacity-60'}`}
        >
          {aTotal}
        </span>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-gothic metal-text truncate text-sm font-black tracking-widest">
            {location.def.name}
          </div>
          <div className="font-mono text-[10px] leading-tight text-chrome-dark line-clamp-2">
            {location.def.text}
          </div>
        </div>
        <span
          key={pTotal}
          className={`power-coin anim-total flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-black
          ${pTotal >= aTotal && pTotal > 0 ? 'buffed' : 'opacity-60'}`}
        >
          {pTotal}
        </span>
      </div>

      {/* Player cards (bottom half) */}
      <div className="relative z-10 flex-1 border-t border-black/50 p-1.5">
        <div className="mb-1">
          <ChaosSlot card={location.playerChaos} side="player" locIndex={index} fx={fx} />
        </div>
        <CardSlots cards={location.player} capacity={capacity} side="player" locIndex={index} fx={fx} />
        <SideFx fx={fx} li={index} side="player" />
      </div>

      {/* Dust rings + cracked-stone decals where cards slammed in */}
      {slams.map((e) => (
        <span key={e.id}>
          <span className="dust-ring" style={{ top: e.side === 'player' ? '72%' : '22%' }} />
          <span className="crack-decal" style={{ left: '45%', top: e.side === 'player' ? '72%' : '18%' }} />
        </span>
      ))}

      {playable && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="btn-neon px-3 py-1 font-mono text-xs uppercase tracking-widest opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            Play here
          </span>
        </div>
      )}
    </div>
  );
}
