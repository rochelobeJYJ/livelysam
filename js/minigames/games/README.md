# Mini Games

미니게임 카탈로그의 단일 기준은 `js/minigames/games/*.html` 안의 메타데이터입니다.
`js/minigames/games-catalog.js`는 생성 파일이므로 직접 수정하지 않습니다.

신규 게임을 추가할 때는 게임 HTML의 `<head>` 안에 아래 메타를 넣어 주세요.

```html
<meta name="livelysam:minigame:id" content="your-game">
<meta name="livelysam:minigame:title" content="Your Game">
<meta name="livelysam:minigame:icon" content="YG">
<meta name="livelysam:minigame:series-id" content="your-series">
<meta name="livelysam:minigame:series-title" content="Your Series">
<meta name="livelysam:minigame:description" content="게임 설명">
<meta name="livelysam:minigame:score-label" content="점수">
<meta name="livelysam:minigame:leaderboard-mode" content="personal-best">
<meta name="livelysam:minigame:sort-order" content="100">
```

지원하는 주요 키는 아래와 같습니다.

- `id`
- `title`
- `icon`
- `series-id`
- `series-title`
- `series-description`
- `series-icon`
- `description`
- `score-label`
- `ranking-label`
- `leaderboard-mode`
- `hall-notice`
- `tags`
- `sort-order`
- `preview-disabled`
- `disabled`

보조 HTML처럼 카탈로그에 나오면 안 되는 파일은 아래처럼 제외합니다.

```html
<meta name="livelysam:minigame:disabled" content="true">
```

변경 후에는 아래 명령으로 카탈로그를 재생성합니다.

```powershell
python .\tools\generate_minigame_catalog.py
```

실행 중인 브라우저 프리뷰/월페이퍼 호스트는 가능하면 카탈로그를 자동 재생성하고, 라이브 카탈로그 API로 다시 동기화합니다. 그래도 배포 전에는 위 생성 명령을 한 번 직접 돌려 두는 편이 안전합니다.
