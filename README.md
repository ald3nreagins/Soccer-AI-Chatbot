# Soccer Analytics & Match Insight Chatbot

[[https://img.shields.io/badge/Project%20Status-Active-brightgreen.svg]](https://github.com/ald3nreagins/Soccer-AI-Chatbot)
[[https://img.shields.io/badge/License-MIT-blue.svg]](License.md)
[[https://img.shields.io/badge/Course-ENGCMP%200600-orange.svg]](https://canvas.pitt.edu)

> **"Stats are everywhere. Insight isn't."**  
> PitchSide AI is a domain-specific soccer analytics chatbot that translates dense match numbers and advanced expected metrics (`xG`, `xA`, `KP`, `G-xG`, `PPDA`) into plain-English tactical insights for casual watchers and hardcore fans alike.

---

## Team & Roles

* **Alden Reagins**: AI Model Architecture, System Prompt Engineering (`server/prompt.js`)
* **Quentin Sharr**: Data-to-AI Integration, Knowledge Base Architecture (`SystemMemory/`, `Training.md`)
* **Ruadhan KellerMcleer**: Frontend UI & Web Deployment (`frontend/`, `UXDesign.md`)
* **Matthew Sneyers**: Data Collection, API Research & Documentation (`data/`, `Soccer ChatBot Doc`)

---

## Project Overview

While modern sports broadcasting bombards fans with advanced data, casual viewers often lack the context to understand what those numbers mean on the pitch. PitchSide AI bridges this gap through a conversational interface that:
1. Explains complex statistical abbreviations (e.g., Expected Goals vs. Non-Penalty xG) in plain English.
2. Compares player and team performances using structured Markdown tables.
3. Evaluates clinical finishing vs. bad luck using finishing differentials (`G - xG`).
4. Grounds all answers strictly in verified machine-readable datasets without hallucinating stats.

---

## Repository Structure

```text
Soccer-AI-Chatbot/
├── README.md                      # Project overview, setup instructions, version history
├── Training.md                    # 5-part system prompt, training file inventory, red-teaming tests
├── ProcessVerification.md         # Teamwork and technical writing verification checklist
├── License.md                     # Open-source MIT License
├── Inclusive.md                   # Inclusivity and equitable communication guidelines
├── UXDesign.md                    # User Groups, Empathy Map, and UX Storyboard documentation
├── data/                          # Data directory holding core stat files
│   ├── soccer_stat_glossary.md    # Canonical definitions & per-90 fan benchmarks
│   ├── premier_league_team_player_stats.csv  # Relational match and team season records
│   └── ai_context_bundle.json     # Pre-compiled JSON context payload for LLM ingestion
├── SystemMemory/                  # AI Knowledge base directory (mirrors data/)
│   ├── soccer_stat_glossary.md
│   ├── premier_league_team_player_stats.csv
│   ├── ai_context_bundle.json
│   └── data_connector.py          # Python pipeline fetching from soccerdata & API-Football
├── frontend/                      # Web interface assets (HTML, CSS, JS)
├── server/                        # Node.js backend server and stats engine
│   ├── index.js                   # Express server entry point
│   ├── prompt.js                  # Production system prompt
│   └── stats.js                   # Query resolution and analytical calculations
└── ProjectPresentation/           # Slide deck links and presentation assets
