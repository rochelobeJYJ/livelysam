# 미니게임 명예의전당 이관

이 문서는 기존 Google Sheets 명예의전당 데이터를 Firebase Firestore로 옮길 때 사용합니다.

## 준비

1. Google Sheets에서 명예의전당 데이터를 `.xlsx` 또는 `.csv`로 내보냅니다.
2. 내보낸 파일을 작업 폴더 안에 둡니다.
   예시: `migration/leaderboards.xlsx`
3. Firebase 콘솔에서 서비스 계정 키(JSON)를 받아서 작업 폴더 안에 둡니다.
   예시: `firebase-service-account.json`
4. 서비스 계정 파일은 이미 `.gitignore`에 제외되어 있으므로 저장소에 올라가지 않습니다.

## 지원 형식

### XLSX

- 여러 시트가 있으면 시트별로 읽습니다.
- 시트 이름이 아래 이름 중 하나면 자동으로 게임 ID를 추론합니다.

| 시트 이름 예시 | gameId |
| --- | --- |
| `Dino Run`, `Dino Run 1`, `Dino1` | `dino-run-1` |
| `Dino Run 2`, `Dino2` | `dino-run-2` |
| `Dino Run Hard`, `Hard` | `dino-run-hard` |
| `Wing Tap 1`, `WingTap1`, `game1` | `wing-tap-1` |
| `Wing Tap 2`, `WingTap2`, `game2` | `wing-tap-2` |
| `Wing Boss`, `WingBoss`, `game3` | `wing-boss` |

### CSV

- 헤더에 `gameId`가 있으면 그대로 사용합니다.
- `gameId` 헤더가 없으면 실행 시 `--game-id`를 같이 넣어야 합니다.

### 헤더 이름

아래 중 하나면 자동 인식합니다.

- 닉네임: `nickname`, `name`, `player`, `username`, `닉네임`, `이름`
- 점수: `score`, `highscore`, `record`, `점수`, `기록`
- 게임 ID: `gameId`, `game_id`, `game`, `게임`, `mode`, `sheet`
- 순위: `rank`, `순위`

## 1차 확인

먼저 업로드 없이 파싱만 확인합니다.

```powershell
python .\tools\import_minigame_leaderboards.py `
  --input .\migration\leaderboards.xlsx `
  --project-id jworld-cf60e `
  --season-id season-1 `
  --credentials .\firebase-service-account.json `
  --dry-run
```

## 실제 업로드

```powershell
python .\tools\import_minigame_leaderboards.py `
  --input .\migration\leaderboards.xlsx `
  --project-id jworld-cf60e `
  --season-id season-1 `
  --credentials .\firebase-service-account.json
```

## CSV 한 게임만 올릴 때

```powershell
python .\tools\import_minigame_leaderboards.py `
  --input .\migration\dino-run-1.csv `
  --project-id jworld-cf60e `
  --season-id season-1 `
  --credentials .\firebase-service-account.json `
  --game-id dino-run-1
```

## 확인 포인트

Firestore 경로는 아래 구조로 들어갑니다.

```text
minigameLeaderboards/{seasonId}/games/{gameId}/entries/{playerId}
```

각 문서는 아래 필드를 가집니다.

- `seasonId`
- `gameId`
- `playerId`
- `nickname`
- `score`
- `source`
- `createdAt`
- `updatedAt`
- `lastSubmittedAt`

`playerId`는 기존 데이터 재이관 시 같은 행이 같은 문서로 들어가도록 해시 기반으로 생성합니다.
