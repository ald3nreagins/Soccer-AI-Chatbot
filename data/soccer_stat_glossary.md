Soccer Analytics (SystemMemory/soccer_stat_glossary.md)
Purpose: Machine-readable reference file for training the Soccer AI Chatbot to define, calculate, and interpret standard and advanced football statistics for both casual and hardcore fans.
Compiled From:

Guide to Football A–Z Glossary
Pixellot Soccer Stat Sheet Abbreviations
FBref / soccerdata v1.9.1 Schema
API-Football v3 Documentation


1. Core Box-Score & Shooting Abbreviations
Abbreviation
Full Metric Name
Formula / Definition
Plain-English Translation for Fans
Per-90 / Season Benchmark
#Pl
Number of Players Used
Count of distinct squad players appearing in matches.
Shows squad rotation depth; fewer players used means a settled starting XI, while high numbers indicate injuries or heavy rotation.
Team Season: 22–25 low rotation; 28+ high rotation
Min / 90s
Minutes Played / 90-Minute Equivalents
90s = Total Minutes Played / 90
Standardizes playing time so a substitute playing 45 minutes can be fairly compared to a starter playing 90 minutes.
Full season = 38.0 team 90s
Gls
Goals Scored
Total goals scored (including penalty kicks).
The ultimate scoreboard tally, though it can mask whether a team was lucky or dominant.
Player: 0.50+ Gls/90 is elite
Ast
Assists
Final pass leading directly to a goal.
Credits the playmaker, but depends heavily on whether the teammate actually finishes the shot.
Player: 0.25+ Ast/90 is elite
Sh / Sh/90
Total Shots / Shots per 90
All goal attempts (excluding blocked passes or crosses).
Measures attacking volume and territorial dominance.
Team: 14.0+ Sh/90 elite; <10.5 Sh/90 low
SoT / SoT%
Shots on Target & Accuracy %
SoT% = (Shots on Target / Total Shots) × 100
Shots that would enter the net if not saved by the goalkeeper or last defender. Excludes shots hitting the post/crossbar and bouncing out.
Team SoT%: 35%+ high accuracy; <29% poor
G/Sh
Goals per Shot
G/Sh = Non-Penalty Goals / Total Shots
Measures shot-conversion efficiency. High G/Sh indicates either clinical finishing or patience in waiting for close-range shots.
Average: 0.09–0.11; Elite: 0.13+
G/SoT
Goals per Shot on Target
G/SoT = Non-Penalty Goals / Shots on Target
How often an on-target shot beats the keeper. Reflects shot placement power and close-range shot selection.
Average: 0.26–0.30; Elite: 0.33+
Dist
Average Shot Distance
Mean distance (in yards) from goal for all non-penalty shots.
Lower Dist (e.g., 14–16 yards) means a team works the ball into the penalty box; higher Dist (18+ yards) indicates settling for long-range speculative shots.
Closer (<16.5 yds) = higher chance quality
FK
Free Kick Shots
Direct shots taken from free kicks.
Shows dead-ball shooting threat outside the penalty box.
Team Season: 12–25 typical
PK / PKatt
Penalty Kicks Made / Attempted
Goals scored from the penalty spot vs. total penalties taken.
Penalties convert at roughly 76%–79% historically, inflating raw goal totals.
Historical conversion: ~78%



2. Advanced Expected Metrics (xG, xA, xT, Differentials)
Abbreviation
Full Metric Name
Formula / Definition
Plain-English Translation for Fans
Diagnostic Interpretation Rule
xG
Expected Goals
Probability (0.00 to 1.00) that a shot results in a goal based on distance, angle, body part, assist type (through ball, cross, cutback), and defensive pressure.
Measures chance quality rather than luck. If a player misses an open-net tap-in (0.85 xG), the stat still credits them for getting into a great scoring position.
Big Chance: Any single shot with xG ≥ 0.30.
npxG
Non-Penalty Expected Goals
npxG = Total xG - (PKatt × ~0.78)
Strips out penalty kicks (which are worth ~0.78 xG each) to reveal true open-play and set-piece attacking quality.
Always use npxG over raw xG when comparing strikers who don't take penalties.
npxG/Sh
Non-Penalty xG per Shot
npxG/Sh = npxG / (Total Shots - PKatt)
The single best indicator of shot selection quality. Does a team shoot from 30 yards out (0.03 xG) or work cutbacks to the six-yard box (0.35 xG)?
<0.09 poor shot selection; 0.10–0.11 average; 0.12+ elite box entries.
xGOT / PSxG
Expected Goals on Target (Post-Shot xG)
Evaluates shot quality after the ball leaves the boot, factoring in ball speed, curl, and exact placement in the goalframe.
Pre-shot xG measures the chance; xGOT measures the finish. A 25-yard shot (0.03 xG) rifled into the top corner can have 0.65 xGOT.
If xGOT > xG, the shooter added value with elite placement.
G-xG
Goals minus Expected Goals
G - xG = Actual Goals - Expected Goals
Measures finishing over/under-performance. Positive values mean clinical finishing (or hot streaks); negative values mean wasteful finishing.
> +3.0: Clinical overperformance.
-1.0 to +1.0: Finishing at expectation.

< -5.0: Severe finishing slump (e.g., Brighton -12.6).
np:G-xG
Non-Penalty Goals minus npxG
np:G - npxG = (Gls - PK) - npxG
Isolates open-play finishing skill without penalty kick distortion.
Elite finishers consistently sustain +2.0 to +5.0 per season.
xA
Expected Assists
Sum of the xG values of every shot resulting from a player's pass, regardless of whether the shooter scores.
Rewards playmakers fairly even when their striker misses a sitter. If a midfielder passes for a 0.60 xG chance that gets blazed over the bar, they still earn 0.60 xA.
Player: 0.25+ xA/90 is elite playmaking.
KP
Key Passes (Chances Created)
Any pass that leads directly to a teammate's shot (without resulting in a goal; if scored, it becomes an Assist).
Measures chance-creation volume. Compare xA per KP to see if a player creates dangerous cutbacks or just passes to teammates who shoot from 30 yards.
2.0+ KP/90 high creator; 3.0+ KP/90 elite #10.
xT
Expected Threat
Markov-chain model valuing every pass or dribble by how much it increases the probability of scoring within the next 5 actions.
Credits deep-lying midfielders and fullbacks who move the ball from safe midfield zones into dangerous penalty-box zones before the final pass.
High xT identifies ball-progressors who don't show up in goals or assists.
SCA / GCA
Shot-Creating / Goal-Creating Actions
The last two offensive actions (passes, dribbles, fouls drawn) directly leading to a shot (SCA) or goal (GCA).
Captures the hockey-assist ("pass before the assist") and dribble take-ons that break defensive lines.
Player: 4.0+ SCA/90 is elite.
PrgP / PrgC
Progressive Passes & Carries
Completed passes or ball carries that move the ball at least 10 yards closer to the opponent's goal (or into the penalty box).
Shows how a team breaks lines during build-up play rather than passing sideways between centre-backs.
Midfielders: 6.0+ PrgP/90 elite.
PPDA
Passes Allowed Per Defensive Action
PPDA = Opponent Passes in Build-Up Zone / Team Tackles, Interceptions & Fouls
Measures pressing intensity (counter-pressing / gegenpressing). Lower numbers mean a more aggressive high press; higher numbers mean sitting back in a low block.
< 9.0 PPDA: Relentless high press.

> 14.0 PPDA: Passive low/mid block.



3. Tactical Roles & Pitch Terminology (From Guide to Football)
Advanced Playmaker / Number Ten (No. 10): Creative midfielder operating "between the lines" (the space between the opponent's midfield and back four) to deliver key passes (KP) and high xA through balls.
Anchor Man / Double Pivot: Defensive midfielder(s) sitting in front of the centre-backs to screen passing lanes, win tackles/interceptions, and recycle possession.
False Nine: A central forward who drops deep into midfield to pull opposing centre-backs out of position, opening space in the channels for wide forwards to attack.
Deep-Lying Playmaker (Regista): A midfielder stationed at the base of midfield who dictates tempo and switches play with diagonal balls rather than operating near the opponent's box.
Low Block vs. High Block / Gegenpressing: A low block defends deep and compact inside the defensive third (high PPDA, forcing opponents into low-npxG/Sh long shots), while counter-pressing (gegenpressing) hunts the ball immediately after losing possession (low PPDA) to create high-xG attacking transitions while the opponent is out of shape.
Cutback: A pass driven backward from the byline toward the penalty spot—statistically one of the highest npxG/Sh pass types in modern football because defenders and goalkeepers are moving toward their own goal line.
