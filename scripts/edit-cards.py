#!/usr/bin/env python3
"""Edit card stats/abilities in mechanics/*.txt, then regenerate cards.ts.

Card data lives in the mechanics text files — src/game/cards.ts is generated
from them by scripts/gen-cards.mjs. This tool edits the source files and
(optionally) re-runs the generator.

NOTE: this edits card DATA (name, power, ability text, rarity, faction).
Unique ability LOGIC is hardcoded per card id in src/game/effects.ts — the
ability text only selects the 'kind' family (see kind_of below). If you give
a card a brand-new effect, you still need a matching case in effects.ts.

Usage:
  python scripts/edit-cards.py list [--kind chaos] [--faction monster] [--rarity mythic]
  python scripts/edit-cards.py show 0001
  python scripts/edit-cards.py set 0001 --power 7
  python scripts/edit-cards.py set 0001 --text "Chaos (2 turns): Burn chance = (7 / Side Total) * 100."
  python scripts/edit-cards.py set 0001 --name "Maneater" --rarity mythic --faction monster
  python scripts/edit-cards.py regen
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MECH = ROOT / "mechanics"
POWERS = MECH / "powers.txt"
RARITY = MECH / "rarity.txt"
FACTIONS = MECH / "name_fac_background.txt"
GEN = ROOT / "scripts" / "gen-cards.mjs"

RARITIES = ["mortal", "cursed", "arcane", "forbidden", "mythic", "relic", "divine"]
FACTIONS_OK = ["elarion", "elderveld", "kalthrone", "hochreich", "ravaria",
               "varkazan", "monster", "hotc", "unknown"]

ROW = re.compile(r"^\|\s*(\d{4})\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*$")
RAR_ROW = re.compile(r"(\d{4})\s*-\s*[^:\n]+:\s*(\w+)")


def kind_of(text: str) -> str:
    """Mirror of kindOf() in gen-cards.mjs — the kind the text will generate."""
    t = text.lower()
    for prefix, kind in [
        ("chaos", "chaos"), ("spy", "spy"), ("on reveal", "onReveal"),
        ("ongoing", "ongoing"), ("medic", "medic"), ("muster", "muster"),
        ("move", "move"), ("faction bond", "factionBond"), ("hero", "hero"),
        ("relic", "ongoing"),
    ]:
        if t.startswith(prefix):
            return kind
    return "none"


def load_powers() -> dict[str, dict]:
    cards = {}
    for line in POWERS.read_text(encoding="utf-8").splitlines():
        m = ROW.match(line)
        if m:
            cards[m.group(1)] = {"name": m.group(2), "power": int(m.group(3)), "text": m.group(4)}
    return cards


def load_rarity() -> dict[str, str]:
    return {m.group(1): m.group(2).lower()
            for m in RAR_ROW.finditer(RARITY.read_text(encoding="utf-8"))}


def load_faction() -> dict[str, str]:
    out = {}
    for block in re.split(r"(?=^\d{4}\s*-)", FACTIONS.read_text(encoding="utf-8"), flags=re.M):
        hm = re.match(r"^(\d{4})\s*-", block)
        if not hm:
            continue
        fm = re.search(r"Faction:\s*(\w+)", block, re.I) or re.search(r"Type:\s*(\w+)", block, re.I)
        out[hm.group(1)] = fm.group(1).lower() if fm else "unknown"
    return out


def cmd_list(args):
    cards, rar, fac = load_powers(), load_rarity(), load_faction()
    for cid, c in sorted(cards.items()):
        k, r, f = kind_of(c["text"]), rar.get(cid, "mortal"), fac.get(cid, "unknown")
        if args.kind and k != args.kind:
            continue
        if args.rarity and r != args.rarity:
            continue
        if args.faction and f != args.faction:
            continue
        print(f"{cid}  {c['name']:<28} pwr {c['power']:<3} {r:<10} {f:<10} {k:<12} {c['text'][:60]}")


def cmd_show(args):
    cards, rar, fac = load_powers(), load_rarity(), load_faction()
    c = cards.get(args.id)
    if not c:
        sys.exit(f"no card {args.id}")
    print(f"{args.id}  {c['name']}")
    print(f"  power:   {c['power']}")
    print(f"  rarity:  {rar.get(args.id, 'mortal')}")
    print(f"  faction: {fac.get(args.id, 'unknown')}")
    print(f"  kind:    {kind_of(c['text'])}   (derived from text prefix)")
    print(f"  text:    {c['text']}")


def cmd_set(args):
    cid = args.id
    if args.power is None and not args.name and not args.text and not args.rarity and not args.faction:
        sys.exit("nothing to set — pass --power/--name/--text/--rarity/--faction")

    # --- powers.txt: name / power / text ---
    if args.power is not None or args.name or args.text:
        lines = POWERS.read_text(encoding="utf-8").splitlines(keepends=True)
        for i, line in enumerate(lines):
            m = ROW.match(line.rstrip("\n"))
            if m and m.group(1) == cid:
                name = args.name or m.group(2)
                power = str(args.power) if args.power is not None else m.group(3)
                text = args.text or m.group(4)
                for v in (name, text):
                    if "|" in v:
                        sys.exit("'|' is not allowed in name/text — it breaks the table")
                lines[i] = f"| {cid} | {name} | {power} | {text} |\n"
                break
        else:
            sys.exit(f"no card {cid} in powers.txt")
        POWERS.write_text("".join(lines), encoding="utf-8")
        if args.text:
            print(f"text set — kind will be '{kind_of(args.text)}' after regen")

    # --- rarity.txt: rarity ---
    if args.rarity:
        if args.rarity not in RARITIES:
            sys.exit(f"rarity must be one of {RARITIES}")
        src = RARITY.read_text(encoding="utf-8")
        new, n = re.subn(
            rf"({cid}\s*-\s*[^:\n]+:\s*)\w+", rf"\g<1>{args.rarity.capitalize()}", src)
        if not n:
            sys.exit(f"no card {cid} in rarity.txt")
        RARITY.write_text(new, encoding="utf-8")

    # --- name_fac_background.txt: faction ---
    if args.faction:
        if args.faction not in FACTIONS_OK:
            sys.exit(f"faction must be one of {FACTIONS_OK}")
        src = FACTIONS.read_text(encoding="utf-8")
        block = re.search(rf"^{cid}\s*-.*?(?=^\d{{4}}\s*-|\Z)", src, re.M | re.S)
        if not block:
            sys.exit(f"no card {cid} in name_fac_background.txt")
        b = block.group(0)
        nb, n = re.subn(r"Faction:\s*\w+", f"Faction: {args.faction.capitalize()}", b, count=1)
        if not n:
            nb, n = re.subn(r"Type:\s*\w+", f"Type: {args.faction.capitalize()}", b, count=1)
        if not n:
            sys.exit(f"card {cid} has no Faction:/Type: line")
        FACTIONS.write_text(src[:block.start()] + nb + src[block.end():], encoding="utf-8")

    print(f"card {cid} updated")
    if not args.no_regen:
        cmd_regen(args)


def cmd_regen(_args):
    r = subprocess.run(["node", str(GEN)], cwd=ROOT)
    if r.returncode:
        sys.exit("gen-cards.mjs failed")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("list", help="list all cards")
    p.add_argument("--kind"); p.add_argument("--faction"); p.add_argument("--rarity")
    p.set_defaults(fn=cmd_list)

    p = sub.add_parser("show", help="show one card")
    p.add_argument("id")
    p.set_defaults(fn=cmd_show)

    p = sub.add_parser("set", help="edit a card")
    p.add_argument("id")
    p.add_argument("--power", type=int)
    p.add_argument("--name")
    p.add_argument("--text", help="ability text — prefix sets the kind (Chaos/Spy/On Reveal/Ongoing/Medic/Muster/Move/Faction Bond/Hero)")
    p.add_argument("--rarity", choices=RARITIES)
    p.add_argument("--faction", choices=FACTIONS_OK)
    p.add_argument("--no-regen", action="store_true", help="don't regenerate cards.ts")
    p.set_defaults(fn=cmd_set)

    p = sub.add_parser("regen", help="re-run gen-cards.mjs")
    p.set_defaults(fn=cmd_regen)

    # Bare `python edit-cards.py` → launch the PyQt6 editor.
    if len(sys.argv) == 1:
        gui = Path(__file__).with_name("card_editor.py")
        sys.exit(subprocess.run([sys.executable, str(gui)], cwd=ROOT).returncode)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
