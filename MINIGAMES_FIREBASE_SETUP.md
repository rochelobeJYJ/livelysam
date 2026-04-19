# 미니게임 Firebase 이관 메모

## 현재 구조

- 닉네임은 미니게임 허브에서 한 번만 입력합니다.
- 실제 플레이어 식별은 Firebase Anonymous Auth의 `uid`를 씁니다.
- 점수 문서 경로는 아래처럼 시즌별, 게임별로 분리됩니다.

```text
minigameLeaderboards/{seasonId}/games/{gameId}/entries/{playerId}
```

## 문서 필드

- `seasonId`
- `gameId`
- `playerId`
- `nickname`
- `score`
- `source`
- `createdAt`
- `updatedAt`
- `lastSubmittedAt`

한 플레이어는 게임당 1문서만 유지합니다. 새 점수가 이전 최고점보다 높을 때만 `score`를 갱신합니다.

## Firebase Console 설정 순서

1. Firebase 프로젝트에서 `Cloud Firestore`를 생성합니다.
2. `Authentication > Sign-in method`에서 `Anonymous`를 활성화합니다.
3. `프로젝트 설정 > 일반 > 내 앱`에서 웹 앱을 등록하고 `firebaseConfig` 값을 확인합니다.
4. LivelySam 설정의 `API/연동 > 명예의 전당`에서 아래 값을 입력합니다.
   - 저장소: `Firebase Firestore로 이관`
   - 시즌 ID: 예) `2026-spring`
   - Project ID
   - API Key
   - Auth Domain
   - App ID
   - 필요하면 Storage Bucket, Messaging Sender ID, Measurement ID
5. Firestore 규칙은 루트의 [firestore.rules](/C:/Users/user/Desktop/LivelySam/firestore.rules) 내용을 콘솔에 반영합니다.

## 운영 메모

- 시즌을 갈아엎고 싶으면 `시즌 ID`만 바꾸면 됩니다.
- Firebase 설정이 비어 있거나 조회/쓰기 실패 시 기존 Google Sheets로 자동 폴백하도록 코드를 넣어 두었습니다.
- 허브의 명예의 전당 탭도 같은 저장소를 읽습니다.
- 현재 6개 게임 ID는 아래와 같습니다.
  - `dino-run-1`
  - `dino-run-2`
  - `dino-run-hard`
  - `wing-tap-1`
  - `wing-tap-2`
  - `wing-boss`
