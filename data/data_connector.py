"""
data_connector.py — Data-to-AI Integration Pipeline for Soccer AI Chatbot
Course: ENGCMP 0600 Project #4 (AI Chatbot Implementation)
Authors: Quentin Sharr (Data-to-AI Integration), Matthew Sneyers (Data), Alden Reagins (AI), Ruadhan KellerMcleer (Web/UX)

Description:
Connects our raw football data sources:
1. `soccerdata` (FBref advanced expected metrics: xG, npxG, xA, KP, SoT%, G-xG)
2. `API-Football v3` (REST API for live fixtures, standings, and basic player stats)
3. `soccer_stat_glossary.md` (Canonical definitions and per-90 benchmarks)

Outputs a clean, machine-readable JSON/Markdown context bundle inside `SystemMemory/`
that can be uploaded directly to a Google Gemini Gem or injected into an LLM API call.
"""

import os
import json
import urllib.request
from pathlib import Path

# Optional import for local FBref scraping via soccerdata
try:
    import soccerdata as sd
    import pandas as pd
    HAS_SOCCERDATA = True
except ImportError:
    HAS_SOCCERDATA = False

SYSTEM_MEMORY_DIR = Path(__file__).resolve().parent
CSV_PATH = SYSTEM_MEMORY_DIR / "premier_league_team_player_stats.csv"
GLOSSARY_PATH = SYSTEM_MEMORY_DIR / "soccer_stat_glossary.md"
OUTPUT_BUNDLE_PATH = SYSTEM_MEMORY_DIR / "ai_context_bundle.json"

API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io"


def fetch_fbref_shooting_stats(leagues=None, seasons=None):
    """
    Fetches aggregated team shooting and expected goals (xG, npxG, G-xG) data
    from FBref using the `soccerdata` library and saves to CSV.
    """
    if not HAS_SOCCERDATA:
        print("[INFO] `soccerdata` not installed in current environment; falling back to cached CSV.")
        return None

    leagues = leagues or ["ENG-Premier League"]
    seasons = seasons or ["2324"]
    fbref = sd.FBref(leagues=leagues, seasons=seasons)
    df = fbref.read_team_season_stats(stat_type="shooting")
    return df.reset_index()


def fetch_api_football_endpoint(endpoint="leagues", params=None, api_key=None):
    """
    Queries the API-Football v3 REST API (https://v3.football.api-sports.io/{endpoint})
    using GET requests and the required `x-apisports-key` header.
    """
    api_key = api_key or os.environ.get("API_FOOTBALL_KEY", "")
    if not api_key:
        return {"status": "offline_cache_mode", "note": "Set API_FOOTBALL_KEY env var for live REST queries."}

    url = f"{API_FOOTBALL_BASE_URL}/{endpoint.lstrip('/')}"
    if params:
        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{query_string}"

    req = urllib.request.Request(
        url,
        headers={"x-apisports-key": api_key},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def build_llm_context_payload():
    """
    Combines the structured CSV statistics and the Markdown glossary into a single
    machine-readable JSON payload for LLM context injection or RAG retrieval.
    """
    csv_records = []
    if CSV_PATH.exists():
        lines = CSV_PATH.read_text(encoding="utf-8").strip().splitlines()
        headers = lines[0].split(",")
        for line in lines[1:]:
            values = line.split(",")
            row = dict(zip(headers, values))
            # Pre-compute tactical diagnostic tags for the AI
            try:
                g_minus_xg = float(row.get("G_minus_xG", 0.0))
                if g_minus_xg <= -5.0:
                    row["ai_finishing_diagnosis"] = "Severe Underperformance (Wasteful finishing vs chance quality)"
                elif g_minus_xg >= 2.0:
                    row["ai_finishing_diagnosis"] = "Clinical Overperformance (Finishing above expected probability)"
                else:
                    row["ai_finishing_diagnosis"] = "Performing in line with Expected Goals (xG) model"
            except ValueError:
                row["ai_finishing_diagnosis"] = "N/A"
            csv_records.append(row)

    glossary_text = GLOSSARY_PATH.read_text(encoding="utf-8") if GLOSSARY_PATH.exists() else ""

    bundle = {
        "bot_name": "PitchSide AI — Soccer Analytics Chatbot",
        "data_sources": [
            "https://soccerdata.readthedocs.io/en/latest/intro.html",
            "https://www.api-football.com/documentation-v3",
            "https://guidetofootball.com/glossary/a-z/",
            "https://docs.pixellot.tv/portal/en/kb/articles/abbreviations-in-soccer-stat-sheets",
        ],
        "records_count": len(csv_records),
        "structured_stats": csv_records,
        "glossary_markdown": glossary_text,
    }

    OUTPUT_BUNDLE_PATH.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
    print(f"[SUCCESS] Generated machine-readable AI context bundle at: {OUTPUT_BUNDLE_PATH}")
    return bundle


if __name__ == "__main__":
    build_llm_context_payload()
