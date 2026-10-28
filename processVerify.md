ProcessVerification.md

Teamwork Evaluation
We were proactive
We began with the end in mind
We put first things first
We looked for win-wins
We sought first to understand, then be understood
We synergized
We sharpened the saw
We assigned team roles (Matthew: Data Research; Quentin: Data-to-AI Integration & SystemMemory; Alden: AI Model & System Prompting; Ruadhan: Website UI & UX)
We used a communication system (Group iMessage chat & GitHub)
We organized 2–3 scrums per week
We each contributed one aspect of a product, system, or service
Repository Standards
Includes ProjectPresentation Directory (based on initial elevator pitch) with links to repository and chatbot
Includes README.md — instructions, project history, version history, style sheet
Includes License.md
Includes Inclusive.md — fair and equitable writing infrastructure
Includes Training.md / SystemMemory.md — list of system prompts, training files, and red-teaming test prompts/outputs
Includes SystemMemory Directory — includes all machine-readable files used to train the machine (soccer_stat_glossary.md, premier_league_team_player_stats.csv, data_connector.py)
Includes ProcessVerification.md
Technical Writing Compliance
We clearly organized content (Title, headings, paragraphs, sentences, bullet points)
We used strong topic sentences
We wrote concisely and used language to guide the reader through paragraph content
We used active voice and action verbs
We labeled all figures and provided alt-text for all images
AI Use Verification & Documentation
We verified all AI research
We verified all AI invention
We verified all AI drafting
We verified all AI revisions
AI Use Log
AI Use 1 (Background Research & Data Schema Normalization): Used AI to organize definitions from Guide to Football Glossary, Pixellot Abbreviations, and soccerdata FBref documentation into a unified Markdown table with per-90 benchmarks.
Prompt: "Convert our soccer stat glossary links (Guide to Football and Pixellot) and FBref shooting schema into a machine-readable Markdown table defining each abbreviation, formula, plain-English meaning, and per-90 benchmark."
AI Use 2 (System Prompt Engineering): Structured our chatbot's system prompt into Context, Cognitive Goal, Reasoning, Format, and Verification sections.
Prompt: "Draft a 5-part system prompt (Context, Cognitive Goal, Reasoning, Format, Verification) for PitchSide AI that grounds all player and team comparisons in our SystemMemory CSV and glossary without hallucinating stats."
AI Use 3 (Red-Teaming & Verification): Tested edge-case prompts to ensure the chatbot accurately computes G - xG differentials and declines to invent stats outside its dataset.
Prompt: "Run verification test prompts comparing Arsenal vs. Chelsea shooting stats, Brighton's G-xG underperformance, and an out-of-bounds La Liga query to verify hallucination guardrails."

