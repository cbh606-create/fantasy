# Fantasy Matchup 모듈 Feature Guide

**제품:** Fantasy Draft Tool — Matchup workspace  
**대상:** H2H 카테고리 리그(주간 매치업) 매니저  
**문서 목적:** Matchup 모듈이 무엇을 하는지, 화면·규칙·차별점을 한 번에 설명

---

## 1. 한 줄 포지셔닝

Matchup은 **이번 주 H2H 매치업을 이기기 위한 의사결정 도구**입니다.

시즌 랭크 매트릭스나 드래프트 보드가 아니라,

- 이번 매치업 주의 **데일리 라인업(매일 10 active 슬롯)**,
- **카테고리 승패 전망(board)**,
- **주간 streaming add(보통 7회)** 운용

이 중심입니다.

| 매니저가 묻는 질문 | Matchup이 답하는 것 |
|---|---|
| 이번 주 카테고리 판은 어떤가? | 9-cat board + winProb + W/L/T |
| 오늘/남은 날 누구를 넣고 뺄까? | Daily lineup + Sit/Start + Ratio sits |
| 주간 7 add를 어떻게 쓸까? | 1 / 2 / 3-spot Streaming plans |
| 상대는 어떻게 스트리밍할까? | Opponent week strip (유저와 같은 플래너) |
| 어제까지의 실제 vs 전망은? | Morning check + Day comparison |
| 이미 이긴 cat 자원을 옮길 수 있나? | Surplus harvest (2nd pass) |

---

## 2. 제품 원칙 (Matchup Analysis)

### 2.1 “이번 주”만 본다

- 시즌 14인 로스터 랭크 vs 상대 시즌 랭크는 **비교 세트가 아님**
- 올바른 비교: 각 날짜마다 **경기 있는 선수 중 eligible한 10 active 슬롯**을 채운 뒤, 그 날들의 합
- 월요일 10명을 주 내내 고정하지 않음 — **매일 다시 fill**
- IL / Out / BE는 그날 start하지 않으면 카운트하지 않음

### 2.2 목표 함수

**가중 expected category wins**를 최대화합니다. 9–0이 목표가 아니라 대략 **5–6 cat 승리**입니다.

자동으로 양보하는 것:

- 선언된 punt (`effectiveWeight == 0` 또는 세션 Punt 칩)
- 이번 주 hopeless gap (대략 winProb가 경쟁 구간 밖)

### 2.3 Roster-change 정책 (캘리브레이션된 감각)

12팀 daily 9-cat 시즌에서 실제로 통했던 패턴을 제품 규칙으로 고정했습니다.

1. **Chase는 최대 두 카테고리.** 경쟁 가능한 간격(`winProb` 대략 0.28–0.72, punt 아님). 시즌 leak(~33% 승률)이 이번 주에도 contestable하면 우선.
2. **Stream the hole, not the wire.** FA 점수 ≈ `(이번 주 경기) × chase delta − hold cat 해악` (특히 FG% / FT% / TO). PTS/3PM을 이미 이기는 상황에서 범용 윙을 줍는 것보다, chase 특화 선수를 선호.
3. **Silent-punt 금지.** leak을 코드에서 weight=0으로 만들지 않음. 유저가 선언하거나, 이번 주만 양보.
4. **이미 잡은 cat(대략 70%+)** 에는 streaming 자원을 쓰지 않음.
5. **Drop:** start 기여가 낮고 hold cat을 덜 해치는 쪽. ADP는 keeper floor이지 stream 랭킹이 아님.
6. **상대 모델:** 상대 **현재 로스터**를 이번 주 스케줄·IL·daily 10-slot로 투영. 시즌 카테고리 매트릭스가 상대가 아님.

---

## 3. Workspace 화면 맵

경로: `/matchup/[id]` (시즌 리그 단위)

### 3.1 상단 컨텍스트

- **Opponent picker** — 상대 팀 선택 (브라우저에 기억)
- **Stat window** — Season / L7 / L15 / L30  
  투영 통계 창을 바꿈. Morning check로 잠긴 “누구를 그날에 썼는지” id는 유지하고, 숫자만 재계산.
- **Scoring mode 라벨** — Each Category vs Most Categories
- Incomplete active roster 배너, ESPN 연동 상태

### 3.2 Week Scoreboard (`MatchupBoard`)

- 9개 카테고리 행: You 합계 / Opp 합계 / **W·L·T** / **winProb**
- 주 헤드라인
  - **Each Category:** 카테고리 승패 기록 (예: 5–3–1)
  - **Most Categories:** 주 단위 **1–0 / 0–1 / 0–0–1** (wins > losses → 1–0, 등)
- Streaming plan을 preview하면 **카테고리 delta** (플랜 적용 전후 변화) 표시
- 보드 합산 = **마감된 날의 actual + 오늘~주말 projection** (morning check와 연동)

### 3.3 Morning check & Day comparison

**목표:** 매치업 주가 진행 중일 때 “이미 일어난 일”과 “남은 날 무엇을 할지”를 나눔.

**언제 도는지**

- 하루 한 번, 전날 경기가 final 된 뒤 ~ 오늘 라인업 lock 전
- 그 창에 페이지를 열면 체크 수행 후 저장
- 같은 아침 재오픈은 저장된 체크 사용
- **진행 중 경기는 반영하지 않음** — Today는 다음날 아침까지 unfinished

**닫힌 날이 기여하는 것**

- ESPN 해당 scoring period의 **실제 9-cat 합계** (You / Opp)
- 그날 projection에 쓰였던 **startable player id** (처음 닫힐 때 저장, 이후 로스터 add로 바꾸지 않음)
- Stat window를 바꿔도 id는 유지, projection 숫자만 재계산
- Counting cat은 합산, FG%/FT%는 makes/attempts 집계 후 %
- 경기 없는 매치업 날도 닫힘 (양측 0)

**Day comparison UI**

- 스코어보드 아래
- 닫힌 날만 행 (오늘 이후는 없음)
- 날마다 You / Opp 행, 셀에 projection(위) + actual(아래)

**Morning summary 개념**

- 9개 cat의 현재 주 outcome + flip 표시
- 상대: 예상 밖 add, 예상했는데 안 한 add, 예상 밖 drop
- Us: 남은 날 startable이었는데 Out, 또는 닫힌 날 박스에 DNP
- 위 fact가 있을 때만 남은 날 추천 변경 최대 3개 (오늘 우선)

### 3.4 Daily Lineup

- 매치업 주 날짜 × 슬롯 그리드 (기본: PG SG SF PF C G F UTIL×3 + BE + IL)
- **그날 경기가 있는 선수만** active에 앉힘
- 클릭 sit/start, 리그별 localStorage 저장
- Streaming plan preview가 라인업 위에 오버레이 (예정 add/drop 반영)
- ESPN에 실제 writeback은 하지 않음 (로컬 미리보기)

### 3.5 Streaming Plans (핵심 패널)

항상 **세 가지 대안**을 나란히 보여 줍니다.

| Plan | 의미 |
|---|---|
| **1-spot** | 스트리머 자리 1개 — off-night마다 비우고 그날 FA로 커버 |
| **2-spot** | 자리 2개 — 2-in-3 / B2B density 블록을 off-night에도 hold |
| **3-spot** | 자리 3개 — 더 긴 window(3-in-4 등), hole calendar·even pacing |

공통 UI:

- **Weekly add budget** (기본 7, 증감 가능) — ESPN식 **acquisition**만 카운트. Drop은 예산 미소모.
- 날짜 × spot 그리드: **Hold / Add / Drop→Add / Empty** + add 일련번호
- Plan별 adds used (`k/N`), 대략적인 **game-starts** 커버리지
- **Punt 칩** — 이번 매치업 세션에서 chase 제외
  - Most Categories: `winProb < 0.28` cat 자동 seed
  - Each Category: 수동만
- Plan 선택 시 Daily / Board / Opponent strip에 **라이브 preview**
- **Add override:** 셀 클릭 → FA 검색·교체 → hold-end까지 잠금 → 보드 delta 재계산
- Roster drop override / “hold through” 옵션

### 3.6 Opponent week strip

- 상대도 **유저와 동일한 `buildStreamingPlan` 알고리즘** 사용  
  (2-in-3 hold, harvest, drop/ADP 정책 등 — 예전 단순 일별 filler가 아님)
- **유저 FA를 먼저 확정**한 뒤, 상대는 남은 풀로 재계획 (충돌 시 유저 우선)
- Opp spot 수: Auto(빈 non-IL 슬롯 기반) / 1 / 2 / 3
- Spot별 **강제 상대 roster drop**

### 3.7 Sit / Start

- 같은 날 active가 가득 찰 때, 벤치↔스타트 교체로 cat 기대값을 올리는 추천
- Apply로 daily에 반영
- Streaming preview와 자리가 충돌하면 숨기거나 조정

### 3.8 Ratio sits

- FG% / FT% 등 **비율 카테고리를 해치는 선수**를 그날 sit 추천
- Streaming preview 중에는 비활성 (플랜이 우선)

### 3.9 Injury alerts

- Out/부상 관련 pickup 긴급도 추천 패널

### 3.10 Stat pairs

- 카테고리 페어 상관(Pearson r) 표시
- Streaming 랭킹에 **pair penalty**로 반영  
  예: STL·TO가 강하게 역상관이면, STL chase 시 TO 해악을 점수에 반영

---

## 4. Streaming 엔진 — 상세 규칙

### 4.1 Chase 선택

- Board에서 punt가 아닌 행 중, **contestable** 구간(대략 0.28–0.72)의 낮은 winProb 쪽을 최대 2개
- Season leak cat이 그 구간에 있으면 우선
- Hopeless(&lt;0.28)나 이미 넉넉한 W(&gt;~0.72)는 1st-pass chase에서 제외

### 4.2 Spot별 스케줄 운용

| Spot | Off-night | Density / hold |
|---|---|---|
| 1 | 자리 비움 → 그날 다른 FA | 하루 단위 커버 우선 |
| 2 | 2-in-3 블록이면 hold | 블록 끝난 뒤 교체 |
| 3 | 긴 window hold | hole starts·density tier·even add |

**One-game add 억제 (최근):**  
한 경기짜리 add를 하려 할 때, 풀에 **2-in-3 선수**가 있으면 그쪽을 넣어 자리를 붙잡고, **다음 add로 빈 spot을 연다**.

### 4.3 Add pacing & caps

- 주간 add limit (기본 7, UI override)
- **Daily pace:** 남은 날 대비 오늘 쓸 수 있는 add 상한
- Spot별 even distribution (한 spot만 과도하게 churn하지 않음)
- **Remaining-game roster cuts / day ≤ 2** — 아직 경기가 남은 선수를 하루 너무 많이 자르지 않음

### 4.4 Drop / ADP

- **ADP ≤ 60** 보호 (ADP 없으면 비보호)
- 보호된 스트리머: open slot이나 다른 drop으로 우회, 또는 hold
- 강제 drop id가 있으면 보호도 뚫을 수 있음 (opponent forced cuts 포함)
- Waiver cooldown: 리그 `waiverPeriodDays` (매치업 일 기준)

### 4.5 Surplus harvest (2nd pass)

1st pass(스케줄·chase 채우기) 이후, add 예산이 남으면:

1. **Surplus lock:** outcome W 이고 winProb &gt; ~0.72 이며 punt 아님
2. **Harvest chase:** L/T 중 winProb 낮은 쪽 최대 2개 (hopeless 포함 가능 — 2nd pass 목적)
3. Surplus에 기여하고 chase에는 덜 기여하는 **ADP&gt;60 로스터/스트리머**를 drop 후보
4. Drop 후에도 surplus lock이 유지되는지 검증 후 apply
5. Empty stream spot 또는 그 occupant가 drop 대상인 spot에 chase FA 투입

**충돌·한도 (그대로 유지되는 규칙):**

- 주간 add budget
- 2-in-3 hold 중인 선수는 harvest drop에서 제외
- Remaining-game cuts/day 한도
- Empty/대상 stream spot이 필요
- `youIdle`(상대만 돌릴 때)에서는 harvest 스킵

1-spot / 2-spot / 3-spot **모두**, Each Category / Most Categories **모두** 적용.

### 4.6 Winner-stream prior

ESPN 리그 히스토리에서 “이런 cat 상황에서 우승팀이 이런 유형 FA를 주웠다”는 레시피로 tie-break를 보조합니다. 주 랭킹을 대체하지는 않습니다.

### 4.7 Add override

- Plan 셀에서 FA를 수동 지정
- Hold-until까지 그 spot을 잠금
- 나머지 날은 플래너가 재계산
- Board에 baseline plan 대비 **category deltas** 표시

---

## 5. Scoring format 분기

리그 `scoringMode`: `each_category` (기본) | `most_categories`

| | Each Category | Most Categories |
|---|---|---|
| 9-cat 행 | 동일 | 동일 |
| 주 헤드라인 | cat 승패 기록 | **1–0 / 0–1 / 0–0–1** |
| Punt seed | 수동 | winProb &lt; 0.28 자동 seed (상대·stat window 변경 시 재seed) |
| Streaming 목표 | expected cat wins (non-punt) | **동일 수학** — 이미 1–0이어도 chase 계속 |
| Trade / waivers / standings | scoringMode 미사용 | 동일 |

예시: 카테고리 5–4 → Most Categories 헤드라인 **1–0**. 4–4–1 → **0–0–1**.

---

## 6. 데이터 · 연동

| 소스 | 용도 |
|---|---|
| Published NBA schedule | 매치업 주 경기일, B2B, 팀 abbr (프리시즌 필터) |
| ESPN season import + cookies | 로스터, FA pool, morning box actuals, winner-stream history |
| Projection pool (`proj_*.json`) | 시즌/창별 스탯, ADP, injury overlay |
| Stat pair table | Pearson r → streaming pair penalty |
| LocalStorage | Daily lineup, opponent 선택, stat window, plan locks |

**명시적 비범위**

- ESPN에 lineup / add / drop **자동 쓰기**
- 경기 진행 중 morning check 실시간 갱신
- 전체 FA에 대한 전역 DP 최적해
- 선수 이름 하드코딩 특수 케이스

---

## 7. 차별점 (피치용)

1. **시즌 랭크가 아니라 이번 주 daily 10-slot 합**으로 상대와 비교한다.
2. **Chase 최대 2 cat + punt/hopeless 양보** — “구멍 특화” 스트리밍이지 범용 볼륨 줍기가 아니다.
3. **1 / 2 / 3-spot 스케줄 운용을 명시적으로 비교**한다. 베스트 FA 리스트가 아니다.
4. **유저와 상대가 같은 운용 규칙**으로 시뮬레이션되어 보드가 일관된다.
5. **Morning check**로 “어제 actual + 오늘부터 재계획” 루프를 제공한다.
6. **Surplus harvest**로 “이미 이긴 cat에서 자원을 빼 추격”을 2nd pass로 지원한다.
7. **Stat window · scoring mode · punt · add override**로 매니저가 가정을 바꿀 수 있다.

---

## 8. 의도적으로 하지 않는 것

- 전역 combinatorial FA search
- ESPN writeback (apply lineup API는 실험/제한적일 수 있으나, 스트리밍 add 자동 실행은 제품 목표가 아님)
- 시즌 스탠딩·트레이드 엔진과 scoringMode 공유
- Questionable 태그를 morning summary “fact”로 취급
- 한 경기 진행 중 actual로 morning check를 갱신

---

## 9. 모듈 파일 맵 (개발자용 참고)

### UI (`src/components/matchup/`)

- `MatchupWorkspace.tsx` — 페이지 오케스트레이션
- `MatchupBoard.tsx` — 주 스코어보드
- `DayComparison.tsx` — 날별 projection vs actual
- `DailyLineupPanel.tsx` — 데일리 그리드
- `StreamingPlansPanel.tsx` / `AddOverridePicker.tsx` — 스트리밍 플랜·오버라이드
- `OpponentWeekStrip.tsx` / `OpponentPicker.tsx` / `MatchupPlanBar.tsx`
- `SitStartPanel.tsx` / `RatioSitsPanel.tsx` / `InjuryAlertsPanel.tsx` / `StatPairTable.tsx`

### Core (`src/lib/matchup/`)

- `advise.ts` — API advice 조립
- `board.ts` / `weekly.ts` / `dailyLineups.ts` — 보드·합산·라인업
- `streamingPlans.ts` — 1/2/3-spot + opponent self-plan
- `streamerMove.ts` / `streamers.ts` / `streamingStrategy.ts`
- `streamingDropPolicy.ts` / `streamingDropExplain.ts` / `streamingWaiver.ts`
- `streamingHoleCalendar.ts` / `streamingBlocks.ts` / `streamingAddOverride.ts`
- `chasePair.ts` / `mostCategories.ts`
- `morningCheck.ts` / `morningCheckStore.ts`
- `sitStart.ts` / `ratioSits.ts` / `opponentStreaming.ts`
- `scheduleLive.ts` / `games.ts` / `applyStreamingPlanPreview.ts`

### API

- `GET/POST` 성격의 `/api/matchup` — schedule, board, morning, recipes
- `/api/matchup/apply-lineup` — (제한적) 라인업 적용 경로

---

## 10. 데모 시 추천 스토리라인

1. 리그·상대·stat window 선택 → **보드가 이번 주 판**을 보여 줌  
2. Morning이 있으면 **Day comparison**으로 “어제 실제” 확인  
3. **1 vs 2 vs 3-spot** 플랜을 비교하고 하나를 preview  
4. Daily 그리드에 스트리머가 앉는지, 보드 delta가 움직이는지 확인  
5. **Opponent strip**이 같은 규칙(2-in-3 hold 등)으로 움직이는지 확인  
6. Punt / Most Categories seed / Add override / Surplus harvest 중 하나를 깊게

---

*이 문서는 코드·스펙(streaming plans, morning check, most categories, add override, opponent streaming 등)을 기준으로 정리했습니다. UI 카피나 상수(winProb 임계값 등)는 구현과 함께 미세 조정될 수 있습니다.*
