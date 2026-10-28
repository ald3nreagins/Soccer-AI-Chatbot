"""
Pulls Understat player season stats for the top 5 leagues via soccerdata
and saves them to data/players.json for the Node server.

Run once (takes a few minutes the first time; soccerdata caches after):
    pip install soccerdata pandas
    python scripts/fetch_understat.py
"""
import json
import math
from pathlib import Path

import soccerdata as sd

LEAGUES = [
    "ENG-Premier League",
    "ESP-La Liga",
    "ITA-Serie A",
    "GER-Bundesliga",
    "FRA-Ligue 1",
]
# Current season first. "2627" = 2026-27.
SEASONS = ["2627", "2526", "2425"]

OUT = Path(__file__).resolve().parent.parent / "data" / "players.json"


def clean(v):
    """Make values JSON-safe (NaN -> None, numpy types -> python)."""
    if v is None:
        return None
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def main():
    rows = []
    for league in LEAGUES:
        try:
            us = sd.Understat(leagues=[league], seasons=SEASONS)
            df = us.read_player_season_stats().reset_index()
        except Exception as e:
            print(f"!! Failed {league}: {e}")
            continue
        df.columns = [str(c).lower() for c in df.columns]
        for rec in df.to_dict(orient="records"):
            rows.append({k: clean(v) for k, v in rec.items()})
        print(f"OK {league}: {len(df)} rows")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved {len(rows)} rows to {OUT}")
    if rows:
        print("Columns:", sorted(rows[0].keys()))


if __name__ == "__main__":
    main()