import type { CardDef, Rarity } from '../game/types';

interface Props {
  card: CardDef;
  bonus?: number;
  power?: number; // computed board power (overrides card.power + bonus)
  selected?: boolean;
  disabled?: boolean;
  size?: 'hand' | 'board' | 'mini';
  faceDown?: boolean;
  anim?: 'slam' | 'spy' | 'move';
  onClick?: () => void;
  onInspect?: () => void; // opens the detail panel — works even when disabled
}

const SIZES = {
  hand: 'h-48 w-[8.75rem]',
  board: 'h-[6.5rem] w-[4.5rem]',
  mini: 'h-16 w-11',
};

export const RARITY_STYLE: Record<Rarity, { border: string; text: string; label: string; frame: string }> = {
  mortal: { border: 'border-slate-500', text: 'text-chrome', label: 'Mortal', frame: 'frame-mortal' },
  cursed: { border: 'border-emerald-600', text: 'text-emerald-400', label: 'Cursed', frame: 'frame-cursed' },
  arcane: { border: 'border-sky-500', text: 'text-cyan-300', label: 'Arcane', frame: 'frame-arcane' },
  forbidden: { border: 'border-violet-500', text: 'text-violet-300', label: 'Forbidden', frame: 'frame-forbidden' },
  mythic: { border: 'border-red-500', text: 'text-blood-neon', label: 'Mythic', frame: 'frame-mythic' },
  relic: { border: 'border-teal-400', text: 'text-teal-300', label: 'Relic', frame: 'frame-relic' },
  divine: { border: 'border-amber-300', text: 'text-amber-200', label: 'Divine', frame: 'frame-divine' },
};

const ANIM_CLASS = { slam: 'anim-slam', spy: 'anim-spy', move: 'anim-move' } as const;

export function CardView({
  card,
  bonus = 0,
  power,
  selected,
  disabled,
  size = 'hand',
  faceDown,
  anim,
  onClick,
  onInspect,
}: Props) {
  const shown = Math.max(0, power ?? card.power + bonus);
  const r = RARITY_STYLE[card.rarity];
  const isHand = size === 'hand';
  const isMini = size === 'mini';
  const vanilla = card.kind === 'none';

  if (faceDown) {
    return (
      <div className={`card-frame ${SIZES[size]} overflow-hidden shadow-lg`} data-size={size}>
        <img
          src={`/card_back/${card.faction}_back.png`}
          alt="card back"
          className="h-full w-full object-cover"
          draggable={false}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.display = 'none';
            img.parentElement!.classList.add('card-back-pattern');
          }}
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      {/* Ability tooltip — appears above the card on hover */}
      {isHand && (
        <div
          className={`pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-44 -translate-x-1/2 px-2.5 py-1.5 text-center font-mono text-[10px] leading-snug opacity-0 shadow-[0_6px_18px_rgba(0,0,0,0.85)] transition-opacity duration-150 group-hover:opacity-100 ${
            vanilla ? 'vanilla-notch uppercase tracking-widest' : 'ability-strip'
          }`}
        >
          {vanilla ? '— no ability —' : card.text}
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onClick?.();
          onInspect?.();
        }}
        disabled={disabled && !onInspect}
        data-size={size}
        className={`card-frame ${r.frame} relative ${SIZES[size]} select-none overflow-hidden text-left
        ${anim ? ANIM_CLASS[anim] : ''}
        ${card.kind === 'ongoing' && size === 'board' ? 'aura-ongoing' : ''}
        ${card.kind === 'chaos' && size === 'board' ? 'aura-chaos' : ''}
        ${selected ? '-translate-y-5 shadow-[0_0_28px_rgba(255,42,60,0.65)]' : ''}
        ${!disabled && !selected ? 'hover:-translate-y-3 hover:shadow-[0_10px_24px_rgba(0,0,0,0.85)]' : ''}
        ${disabled && !onInspect ? 'cursor-default' : 'cursor-pointer'}
        bg-[#0a080c]`}
      >
      <img
        src={card.art}
        alt={card.name}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

      {/* Power coin — bottom corner, heavy metallic; pops on value change */}
      <div
        key={shown}
        className={`power-coin anim-coin-pop absolute bottom-1 right-1 z-10 flex items-center justify-center rounded-full border-2 font-black
        ${r.border}
        ${isMini ? 'h-5 w-5 text-[10px]' : isHand ? 'h-9 w-9 text-lg' : 'h-6 w-6 text-xs'}
        ${bonus > 0 ? 'buffed' : bonus < 0 ? 'debuffed' : ''}`}
      >
        {shown}
      </div>

      {/* Chaos badge */}
      {card.kind === 'chaos' && !isMini && (
        <div className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-[#3a0a12] text-[9px] font-black text-blood-neon shadow-[0_0_8px_rgba(255,42,60,0.8)] ring-1 ring-blood">
          ☄
        </div>
      )}

      {/* Name plate — black-glass strip */}
      <div className="name-plate absolute inset-x-0 bottom-0 z-[5] px-1 pb-0.5 pt-1">
        <div
          className={`font-gothic truncate font-bold leading-tight text-chrome-bright ${
            isMini ? 'text-[8px]' : isHand ? 'text-[13px]' : 'text-[9px]'
          }`}
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
        >
          {card.name}
        </div>
        {isHand && (
          <div className={`font-mono text-[9px] uppercase tracking-wider ${r.text}`}>
            {r.label} · {card.faction}
          </div>
        )}
      </div>

      </button>
    </div>
  );
}
