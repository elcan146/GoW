#!/usr/bin/env python3
"""PyQt6 card editor — edits mechanics/*.txt and regenerates cards.ts.

Run:  python scripts/card_editor.py   (needs: pip install PyQt6)

Edits card DATA only (name, power, ability text, rarity, faction).
Unique ability LOGIC is hardcoded per card id in src/game/effects.ts —
the ability text only selects the 'kind' family via its prefix.
"""

import re
import subprocess
import sys
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QApplication, QComboBox, QFormLayout, QHBoxLayout, QLabel, QLineEdit,
    QListWidget, QListWidgetItem, QMainWindow, QMessageBox, QPlainTextEdit,
    QPushButton, QSpinBox, QSplitter, QVBoxLayout, QWidget,
)

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


def save_powers(cid: str, name: str, power: int, text: str) -> None:
    lines = POWERS.read_text(encoding="utf-8").splitlines(keepends=True)
    for i, line in enumerate(lines):
        m = ROW.match(line.rstrip("\n"))
        if m and m.group(1) == cid:
            lines[i] = f"| {cid} | {name} | {power} | {text} |\n"
            POWERS.write_text("".join(lines), encoding="utf-8")
            return
    raise ValueError(f"no card {cid} in powers.txt")


def save_rarity(cid: str, rarity: str) -> None:
    src = RARITY.read_text(encoding="utf-8")
    new, n = re.subn(rf"({cid}\s*-\s*[^:\n]+:\s*)\w+", rf"\g<1>{rarity.capitalize()}", src)
    if not n:
        raise ValueError(f"no card {cid} in rarity.txt")
    RARITY.write_text(new, encoding="utf-8")


def save_faction(cid: str, faction: str) -> None:
    src = FACTIONS.read_text(encoding="utf-8")
    block = re.search(rf"^{cid}\s*-.*?(?=^\d{{4}}\s*-|\Z)", src, re.M | re.S)
    if not block:
        raise ValueError(f"no card {cid} in name_fac_background.txt")
    b = block.group(0)
    nb, n = re.subn(r"Faction:\s*\w+", f"Faction: {faction.capitalize()}", b, count=1)
    if not n:
        nb, n = re.subn(r"Type:\s*\w+", f"Type: {faction.capitalize()}", b, count=1)
    if not n:
        raise ValueError(f"card {cid} has no Faction:/Type: line")
    FACTIONS.write_text(src[:block.start()] + nb + src[block.end():], encoding="utf-8")


class Editor(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Grails of War — Card Editor")
        self.resize(980, 620)
        self.cards = load_powers()
        self.rar = load_rarity()
        self.fac = load_faction()
        self.current: str | None = None
        self.dirty = False
        self._prev_item: QListWidgetItem | None = None

        # --- left: search + card list ---
        self.search = QLineEdit(placeholderText="Search name or id…")
        self.search.textChanged.connect(self.refill)
        self.list = QListWidget()
        self.list.currentItemChanged.connect(self.on_select)
        left = QWidget()
        lv = QVBoxLayout(left)
        lv.setContentsMargins(0, 0, 0, 0)
        lv.addWidget(self.search)
        lv.addWidget(self.list)

        # --- right: edit form ---
        self.id_lbl = QLabel("—")
        self.name = QLineEdit()
        self.power = QSpinBox(minimum=0, maximum=99)
        self.rarity = QComboBox(); self.rarity.addItems(RARITIES)
        self.faction = QComboBox(); self.faction.addItems(FACTIONS_OK)
        self.text = QPlainTextEdit()
        self.text.setMaximumHeight(90)
        self.kind_lbl = QLabel("kind: —")
        self.kind_lbl.setStyleSheet("color: #8a7; font-style: italic")
        self.text.textChanged.connect(self.on_text)

        # dirty tracking — connected once, not per selection
        self.name.textChanged.connect(self.mark_dirty)
        self.power.valueChanged.connect(self.mark_dirty)
        self.rarity.currentTextChanged.connect(self.mark_dirty)
        self.faction.currentTextChanged.connect(self.mark_dirty)
        self.text.textChanged.connect(self.mark_dirty)

        form = QFormLayout()
        form.addRow("ID", self.id_lbl)
        form.addRow("Name", self.name)
        form.addRow("Power", self.power)
        form.addRow("Rarity", self.rarity)
        form.addRow("Faction", self.faction)
        form.addRow("Ability", self.text)
        form.addRow("", self.kind_lbl)

        save = QPushButton("Save && Regenerate")
        save.clicked.connect(lambda: self.save(regen=True))
        save_nr = QPushButton("Save Only")
        save_nr.clicked.connect(lambda: self.save(regen=False))
        reload_b = QPushButton("Reload Files")
        reload_b.clicked.connect(self.reload)
        btns = QHBoxLayout()
        btns.addWidget(save)
        btns.addWidget(save_nr)
        btns.addStretch(1)
        btns.addWidget(reload_b)

        right = QWidget()
        rv = QVBoxLayout(right)
        rv.addLayout(form)
        rv.addLayout(btns)
        rv.addStretch(1)
        note = QLabel("New ability kinds still need a case in src/game/effects.ts")
        note.setStyleSheet("color: #a97")
        rv.addWidget(note)

        split = QSplitter()
        split.addWidget(left)
        split.addWidget(right)
        split.setSizes([330, 650])
        self.setCentralWidget(split)
        self.statusBar()

        self.refill()

    def refill(self):
        q = self.search.text().lower()
        self.list.clear()
        for cid, c in sorted(self.cards.items()):
            if q and q not in cid and q not in c["name"].lower():
                continue
            item = QListWidgetItem(f"{cid}  {c['name']}")
            item.setData(Qt.ItemDataRole.UserRole, cid)
            self.list.addItem(item)

    def on_select(self, item, _prev):
        if not item:
            return
        if self.dirty and self.current:
            r = QMessageBox.question(
                self, "Unsaved changes", "Discard unsaved changes?")
            if r != QMessageBox.StandardButton.Yes:
                self.list.blockSignals(True)
                self.list.setCurrentItem(self._prev_item)
                self.list.blockSignals(False)
                return
        cid = item.data(Qt.ItemDataRole.UserRole)
        c = self.cards[cid]
        self.current = cid
        self.dirty = False
        self.id_lbl.setText(cid)
        self.name.setText(c["name"])
        self.power.setValue(c["power"])
        self.rarity.setCurrentText(self.rar.get(cid, "mortal"))
        self.faction.setCurrentText(self.fac.get(cid, "unknown"))
        self.text.setPlainText(c["text"])
        self.on_text()
        self.dirty = False
        self._prev_item = item

    def mark_dirty(self, *_):
        self.dirty = True

    def on_text(self):
        self.kind_lbl.setText(f"kind: {kind_of(self.text.toPlainText())}")

    def save(self, regen: bool):
        if not self.current:
            return
        cid = self.current
        name, text = self.name.text().strip(), self.text.toPlainText().strip()
        if "|" in name or "|" in text:
            QMessageBox.warning(self, "Invalid", "'|' is not allowed in name/text")
            return
        try:
            save_powers(cid, name, self.power.value(), text)
            save_rarity(cid, self.rarity.currentText())
            save_faction(cid, self.faction.currentText())
        except ValueError as e:
            QMessageBox.critical(self, "Save failed", str(e))
            return
        self.cards[cid] = {"name": name, "power": self.power.value(), "text": text}
        self.rar[cid] = self.rarity.currentText()
        self.fac[cid] = self.faction.currentText()
        self.dirty = False
        self.list.currentItem().setText(f"{cid}  {name}")
        if regen:
            r = subprocess.run(["node", str(GEN)], cwd=ROOT, capture_output=True, text=True)
            if r.returncode:
                QMessageBox.critical(self, "Regen failed", r.stderr or r.stdout)
                return
            self.statusBar().showMessage(f"Saved {cid} — cards.ts regenerated", 5000)
        else:
            self.statusBar().showMessage(f"Saved {cid} (not regenerated)", 5000)

    def reload(self):
        self.cards = load_powers()
        self.rar = load_rarity()
        self.fac = load_faction()
        self.current = None
        self.dirty = False
        self.refill()
        self.statusBar().showMessage("Reloaded from mechanics/*.txt", 4000)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    w = Editor()
    w.show()
    sys.exit(app.exec())
