# PitchSide AI — Soccer Analytics Chatbot

> **"Stats are everywhere. Insight isn't."**  
> PitchSide AI is a soccer analytics chatbot that translates advanced stats, including expected goals (`xG`), non-penalty xG (`npxG`), expected assists (`xA`), key passes (`KP`), and finishing differential (`G-xG`), into plain-English insight for casual watchers and hardcore fans alike.

---

## Team & Roles

* **Alden Reagins**: AI Model Architecture, System Prompt Engineering, Chat Orchestration (`server/prompt.js`, `server/index.js`)
* **Quentin Sharr**: Data-to-AI Integration, Stats Engine (`server/stats.js`, `data/ai_context_bundle.json`, `Training.md`)
* **Ruadhan KellerMcleer**: Frontend UI & Web Deployment (`frontend/`, `UXDesign.md`)
* **Matthew Sneyers**: Data Collection, API Research & Documentation (`data/`, `scripts/fetch_understat.py`, `DataNotes.md`)

---

## Project Overview

Broadcasts and apps show fans advanced stats everywhere, but casual viewers often lack the context to understand what those numbers mean on the pitch, and hardcore fans must dig through multiple websites to compare teams and players. PitchSide AI bridges this gap through a conversational interface that:

1. Explains statistical abbreviations (e.g., Expected Goals vs. Non-Penalty xG) in plain English.
2. Compares teams and players in side-by-side stat tables, names a leader, and shows which stats decided it.
3. Separates clinical finishing from bad luck using finishing differentials (`G - xG`).
4. Pulls every number from a stats engine through tool calls, so the AI model never invents a stat.
5. Explains what its data covers when a question falls outside it, and suggests questions it can answer.

PitchSide AI draws on player season stats for Europe's top five leagues (2024–25 to 2026–27, via Understat) and team season stats for five Premier League clubs (2020–21, via FBref). It runs on a local Ollama model (`qwen3:8b`) or a cloud model through Groq (`llama-3.1-8b-instant`).

---

## Repository Structure

```text
Soccer-AI-Chatbot/
├── README.md                      # Project overview, team roles, repository structure
├── Training.md                    # System prompt, training files, red-teaming and usability tests
├── ProcessVerification.md         # Teamwork and technical writing verification checklist
├── License.md                     # Open-source MIT License
├── Inclusive.md                   # Inclusivity and equitable communication guidelines
├── UXDesign.md                    # User groups, empathy map, and UX storyboard documentation
├── DataNotes.md                   # Data source research notes
├── render.yaml                    # Render deployment config for the backend (cloud mode)
├── data/                          # Data files read by the stats engine
│   ├── ai_context_bundle.json     # Team season stats (5 Premier League clubs, 2020–21) + stat glossary
│   ├── premier_league_team_player_stats.csv  # Same team stats in CSV form + sample player match logs
│   ├── players.json               # Top-five-league player season stats (generated)
│   └── players_meta.json          # Date the player data was last downloaded (generated)
├── scripts/
│   └── fetch_understat.py         # Downloads player stats from Understat via soccerdata
├── server/                        # Node.js backend server and stats engine
│   ├── index.js                   # Express server, tool definitions, and chat loop
│   ├── prompt.js                  # Production system prompt and stat glossary
│   ├── stats.js                   # Player and team lookups, per-90 rates, percentiles, verdicts
│   └── package.json
├── frontend/                      # Next.js web interface (deployed on Vercel)
│   ├── app/page.tsx               # Chat page, starter questions, and response streaming
│   └── components/                # UI components, including the stat table
└── ProjectPresentation/           # Slide deck links and presentation assets
```
