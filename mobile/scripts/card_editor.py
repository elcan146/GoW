#!/usr/bin/env python3
"""PyQt6 card editor for mobile — edits data/cards.json and regenerates
src/game/cards.ts + src/game/backgrounds.ts via scripts/gen-cards.mjs.

Run:  python scripts/card_editor.py   (needs: pip install PyQt6)

Everything about a card's identity is editable here: name, power, faction,
rarity, kind, ability text, lore background, art file, token flag, and the
data-driven `effect` (type + params) that the engine interprets — no more
hardcoded per-card logic in effects.ts.
"""

import json
import subprocess
import sys
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QFormLayout, QGroupBox, QHBoxLayout,
    QLabel, QLineEdit, QListWidget, QListWidgetItem, QMainWindow, QMessageBox,
    QPlainTextEdit, QPushButton, QScrollArea, QSpinBox, QSplitter, QVBoxLayout,
    QWidget,
)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "cards.json"
GEN = ROOT / "scripts" / "gen-cards.mjs"
ART_DIR = ROOT / "assets" / "cards"

RARITIES = ["mortal", "cursed", "arcane", "forbidden", "mythic", "relic", "divine"]
FACTIONS = ["elarion", "elderveld", "kalthrone", "hochreich", "ravaria",
            "varkazan", "monster", "hotc", "unknown"]
KINDS = ["none", "onReveal", "ongoing", "chaos", "spy", "medic", "muster",
         "move", "factionBond", "hero"]

# effect type -> ordered list of param names shown in the form
EFFECT_PARAMS = {
    "auraAllHere": ["amount"],
    "auraFriendlyHere": ["amount"],
    "auraFactionHere": ["faction", "amount"],
    "auraKindHere": ["kind", "amount"],
    "auraFactionGlobal": ["faction", "scope", "amount"],
    "auraKindGlobal": ["kind", "amount"],
    "auraNameMatch": ["namePattern", "amount"],
    "auraAdjacent": ["amount"],
    "doubleAuras": [],
    "selfPerHand": ["amount"],
    "selfPerFaction": ["amount"],
    "protect": [],
    "hideCards": [],
    "debuffOnEnemyPlay": ["amount"],
    "buffOnFriendlyPlay": ["amount"],
    "blockEnemyOnReveal": [],
    "doubleOnReveal": [],
    "buffDrawn": ["amount"],
    "buffHand": ["amount"],
    "growPerTurn": ["amount"],
    "moveRandomEachTurn": [],
    "moveOnceAdjacent": [],
    "pullFriendly": [],
    "moveRandomEnemy": [],
    "trapOnEnemyMove": [],
    "spyDrawSteal": ["count"],
    "spyDraw": ["count"],
    "spyCopyLast": [],
    "spyRevealHand": [],
    "resurrect": ["faction", "toHand", "amount", "includeHeroes"],
    "resurrectEnemy": [],
    "sacrificeResurrect": [],
    "muster": [],
    "destroyHighestIfTotal": ["threshold"],
    "debuffAllEnemies": ["amount"],
    "silenceOngoingHere": [],
    "repeatOnReveal": [],
    "destroyLowest": [],
    "destroyRandom": [],
    "draw": ["count"],
    "silenceNext": [],
    "copyEnemyPlayedHere": [],
    "resurrectAll": ["maxPower"],
    "summon": ["token", "count", "target"],
    "buffKindHere": ["kind", "amount"],
    "destroyBelow": ["maxPower", "all"],
    "sacrificeLowestDraw": ["count"],
    "moveRandomEnemyAdjacent": [],
    "silenceAllEnemies": [],
    "copyOngoing": [],
    "stealOngoing": [],
    "stealPowerAll": ["amount"],
    "devour": [],
    "chaos": ["turns"],
    "factionBond": ["faction"],
    "hero": [],
    "none": [],
}
EFFECT_TYPES = list(EFFECT_PARAMS)

INT_PARAMS = {"amount", "turns", "threshold", "maxPower", "count"}
BOOL_PARAMS = {"all", "toHand", "includeHeroes"}
COMBO_PARAMS = {
    "faction": [""] + FACTIONS,
    "kind": [""] + KINDS,
    "target": ["", "here", "adjacent"],
    "scope": ["", "mine", "all"],
}


def load_data() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def save_data(data: dict) -> None:
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")


class Editor(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Grails of War — Mobile Card Editor")
        self.resize(1100, 700)
        self.data = load_data()
        self.all_cards = self.data["cards"] + self.data["tokens"]
        self.by_id = {c["id"]: c for c in self.all_cards}
        self.token_ids = [c["id"] for c in self.data["tokens"]]
        self.current: str | None = None
        self.dirty = False
        self._prev_item: QListWidgetItem | None = None
        self.param_widgets: dict[str, QWidget] = {}

        # --- left: search + list ---
        self.search = QLineEdit(placeholderText="Search name or id…")
        self.search.textChanged.connect(self.refill)
        self.list = QListWidget()
        self.list.currentItemChanged.connect(self.on_select)
        left = QWidget()
        lv = QVBoxLayout(left)
        lv.setContentsMargins(0, 0, 0, 0)
        lv.addWidget(self.search)
        lv.addWidget(self.list)

        # --- right: edit form (scrollable) ---
        self.id_lbl = QLabel("—")
        self.name = QLineEdit()
        self.power = QSpinBox(minimum=0, maximum=99)
        self.rarity = QComboBox(); self.rarity.addItems(RARITIES)
        self.faction = QComboBox(); self.faction.addItems(FACTIONS)
        self.kind = QComboBox(); self.kind.addItems(KINDS)
        self.token = QCheckBox("Summon-only token")
        self.art = QComboBox(); self.art.setEditable(True)
        self.art.addItem("")
        if ART_DIR.is_dir():
            for f in sorted(ART_DIR.iterdir()):
                if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                    self.art.addItem(f"/cards/{f.name}")
        self.text = QPlainTextEdit()
        self.text.setMaximumHeight(70)
        self.text.setPlaceholderText("Ability text shown on the card")
        self.background = QPlainTextEdit()
        self.background.setMaximumHeight(90)
        self.background.setPlaceholderText("Lore / background description")

        self.effect_type = QComboBox(); self.effect_type.addItems(EFFECT_TYPES)
        self.effect_type.currentTextChanged.connect(self.rebuild_params)
        self.params_box = QGroupBox("Effect params")
        self.params_form = QFormLayout(self.params_box)

        # --- image previews: card art + faction card back ---
        self.art_preview = QLabel("no art")
        self.art_preview.setFixedSize(200, 280)
        self.art_preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.art_preview.setStyleSheet("border: 1px solid #444; color: #888;")
        self.back_preview = QLabel("no back")
        self.back_preview.setFixedSize(200, 280)
        self.back_preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.back_preview.setStyleSheet("border: 1px solid #444; color: #888;")
        previews = QHBoxLayout()
        previews.addStretch(1)
        previews.addWidget(self.art_preview)
        previews.addWidget(self.back_preview)
        previews.addStretch(1)

        form = QFormLayout()
        form.addRow("ID", self.id_lbl)
        form.addRow("Name", self.name)
        form.addRow("Power", self.power)
        form.addRow("Rarity", self.rarity)
        form.addRow("Faction", self.faction)
        form.addRow("Kind", self.kind)
        form.addRow("Token", self.token)
        form.addRow("Art", self.art)
        form.addRow("Ability", self.text)
        form.addRow("Background", self.background)
        form.addRow("Effect", self.effect_type)
        form.addRow(self.params_box)

        self.name.textChanged.connect(self.mark_dirty)
        self.art.editTextChanged.connect(self.mark_dirty)
        self.art.currentTextChanged.connect(self.mark_dirty)
        self.art.currentTextChanged.connect(self.update_previews)
        self.faction.currentTextChanged.connect(self.update_previews)
        for w in (self.power,):
            w.valueChanged.connect(self.mark_dirty)
        for w in (self.rarity, self.faction, self.kind):
            w.currentTextChanged.connect(self.mark_dirty)
        self.token.toggled.connect(self.mark_dirty)
        self.text.textChanged.connect(self.mark_dirty)
        self.background.textChanged.connect(self.mark_dirty)
        self.effect_type.currentTextChanged.connect(self.mark_dirty)

        save = QPushButton("Save && Regenerate")
        save.clicked.connect(lambda: self.save(regen=True))
        save_nr = QPushButton("Save Only")
        save_nr.clicked.connect(lambda: self.save(regen=False))
        reload_b = QPushButton("Reload JSON")
        reload_b.clicked.connect(self.reload)
        btns = QHBoxLayout()
        btns.addWidget(save)
        btns.addWidget(save_nr)
        btns.addStretch(1)
        btns.addWidget(reload_b)

        inner = QWidget()
        rv = QVBoxLayout(inner)
        rv.addLayout(previews)
        rv.addLayout(form)
        rv.addLayout(btns)
        rv.addStretch(1)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(inner)

        split = QSplitter()
        split.addWidget(left)
        split.addWidget(scroll)
        split.setSizes([320, 780])
        self.setCentralWidget(split)
        self.statusBar()

        self.refill()

    # ------------------------------------------------------------- list/select
    def refill(self):
        q = self.search.text().lower()
        self.list.clear()
        for c in self.all_cards:
            label = f"{c['id']}  {c['name']}" + ("  [token]" if c.get("token") else "")
            if q and q not in c["id"] and q not in c["name"].lower():
                continue
            item = QListWidgetItem(label)
            item.setData(Qt.ItemDataRole.UserRole, c["id"])
            self.list.addItem(item)

    def on_select(self, item, _prev):
        if not item:
            return
        if self.dirty and self.current:
            r = QMessageBox.question(self, "Unsaved changes", "Discard unsaved changes?")
            if r != QMessageBox.StandardButton.Yes:
                self.list.blockSignals(True)
                self.list.setCurrentItem(self._prev_item)
                self.list.blockSignals(False)
                return
        cid = item.data(Qt.ItemDataRole.UserRole)
        c = self.by_id[cid]
        self.current = cid
        self.id_lbl.setText(cid)
        self.name.setText(c["name"])
        self.power.setValue(c["power"])
        self.rarity.setCurrentText(c["rarity"])
        self.faction.setCurrentText(c["faction"])
        self.kind.setCurrentText(c["kind"])
        self.token.setChecked(bool(c.get("token")))
        self.art.setCurrentText(c.get("art", ""))
        self.text.setPlainText(c.get("text", ""))
        self.background.setPlainText(c.get("background", ""))
        eff = c.get("effect") or {"type": "none"}
        self.effect_type.setCurrentText(eff.get("type", "none"))
        self.rebuild_params()  # creates widgets, then we fill values
        for k, w in self.param_widgets.items():
            v = eff.get(k)
            if isinstance(w, QSpinBox):
                w.setValue(int(v) if v is not None else 0)
            elif isinstance(w, QCheckBox):
                w.setChecked(bool(v))
            elif isinstance(w, QComboBox):
                w.setCurrentText(str(v) if v is not None else "")
            elif isinstance(w, QLineEdit):
                w.setText(str(v) if v is not None else "")
        self.dirty = False
        self._prev_item = item
        self.update_previews()

    # ------------------------------------------------------------- previews
    @staticmethod
    def _show(label: QLabel, path: Path, missing: str):
        if path.is_file():
            pm = QPixmap(str(path))
            if not pm.isNull():
                label.setPixmap(pm.scaled(
                    label.size(),
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation))
                return
        label.setPixmap(QPixmap())
        label.setText(missing)

    def update_previews(self):
        art = self.art.currentText().strip().lstrip("/")
        self._show(self.art_preview, ROOT / "assets" / art, "no art")
        fac = self.faction.currentText()
        self._show(self.back_preview,
                   ROOT / "assets" / "card_back" / f"{fac}_back.png",
                   "no back")

    # ------------------------------------------------------------- effect params
    def rebuild_params(self):
        while self.params_form.rowCount():
            self.params_form.removeRow(0)
        self.param_widgets = {}
        for p in EFFECT_PARAMS.get(self.effect_type.currentText(), []):
            if p in INT_PARAMS:
                w = QSpinBox(minimum=0, maximum=99)
                w.valueChanged.connect(self.mark_dirty)
            elif p in BOOL_PARAMS:
                w = QCheckBox()
                w.toggled.connect(self.mark_dirty)
            elif p == "token":
                w = QComboBox(); w.addItem(""); w.addItems(self.token_ids)
                w.currentTextChanged.connect(self.mark_dirty)
            elif p in COMBO_PARAMS:
                w = QComboBox(); w.addItems(COMBO_PARAMS[p])
                w.currentTextChanged.connect(self.mark_dirty)
            else:  # namePattern and any future string params
                w = QLineEdit()
                w.textChanged.connect(self.mark_dirty)
            self.param_widgets[p] = w
            self.params_form.addRow(p, w)
        self.params_box.setVisible(bool(self.param_widgets))

    def collect_effect(self) -> dict:
        eff = {"type": self.effect_type.currentText()}
        for k, w in self.param_widgets.items():
            if isinstance(w, QSpinBox):
                if w.value():
                    eff[k] = w.value()
            elif isinstance(w, QCheckBox):
                if w.isChecked():
                    eff[k] = True
            elif isinstance(w, QComboBox):
                if w.currentText():
                    eff[k] = w.currentText()
            elif isinstance(w, QLineEdit):
                if w.text().strip():
                    eff[k] = w.text().strip()
        return eff

    # ------------------------------------------------------------- save/reload
    def mark_dirty(self, *_):
        self.dirty = True

    def save(self, regen: bool):
        if not self.current:
            return
        c = self.by_id[self.current]
        c["name"] = self.name.text().strip()
        c["power"] = self.power.value()
        c["rarity"] = self.rarity.currentText()
        c["faction"] = self.faction.currentText()
        c["kind"] = self.kind.currentText()
        c["text"] = self.text.toPlainText().strip()
        c["art"] = self.art.currentText().strip()
        c["effect"] = self.collect_effect()
        is_token = self.token.isChecked()
        was_token = bool(c.get("token"))
        if is_token:
            c["token"] = True
            c.pop("background", None)
        else:
            c.pop("token", None)
            c["background"] = self.background.toPlainText().strip()
        # move between cards/tokens lists if the flag changed
        if is_token != was_token:
            src, dst = (self.data["cards"], self.data["tokens"]) if is_token else (self.data["tokens"], self.data["cards"])
            src.remove(c)
            dst.append(c)
            dst.sort(key=lambda x: x["id"])
        try:
            save_data(self.data)
        except OSError as e:
            QMessageBox.critical(self, "Save failed", str(e))
            return
        self.dirty = False
        self.list.currentItem().setText(
            f"{c['id']}  {c['name']}" + ("  [token]" if is_token else ""))
        if regen:
            r = subprocess.run(["node", str(GEN)], cwd=ROOT,
                               capture_output=True, text=True)
            if r.returncode:
                QMessageBox.critical(self, "Regen failed", r.stderr or r.stdout)
                return
            warn = r.stdout.strip()
            self.statusBar().showMessage(
                f"Saved {c['id']} — regenerated. {warn.splitlines()[0] if warn else ''}", 6000)
            if "WARNINGS" in warn:
                QMessageBox.warning(self, "Generator warnings", warn)
        else:
            self.statusBar().showMessage(f"Saved {c['id']} (not regenerated)", 5000)

    def reload(self):
        self.data = load_data()
        self.all_cards = self.data["cards"] + self.data["tokens"]
        self.by_id = {c["id"]: c for c in self.all_cards}
        self.token_ids = [c["id"] for c in self.data["tokens"]]
        self.current = None
        self.dirty = False
        self.refill()
        self.statusBar().showMessage("Reloaded data/cards.json", 4000)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    w = Editor()
    w.show()
    sys.exit(app.exec())
