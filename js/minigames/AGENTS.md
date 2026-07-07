답변은 존댓말로 한다. 다만 군더더기 없이 실용적인 어투로 하면 된다.

미니게임 카탈로그의 단일 기준은 `js/minigames/games/*.html` 안의 `livelysam:minigame:*` 메타데이터다.
`js/minigames/games-catalog.js`는 생성 파일이므로 직접 수정하지 않는다.

신규 게임을 추가하거나 기존 게임을 제거할 때 규칙은 아래와 같다.
- 신규 게임 HTML에는 최소한 `id`, `title`, `icon`, `series-id`, `series-title`, `description`, `score-label`, `leaderboard-mode`, `sort-order` 메타를 넣는다.
- 리더보드를 여러 기록 보관 방식으로 바꿀 수 있으므로, `leaderboard-mode`를 명시하지 못하면 기본값은 `personal-best`로 본다.
- 게임이 아닌 보조 HTML은 `livelysam:minigame:disabled=true` 메타를 넣어 자동 카탈로그에서 제외한다.
- 변경 후에는 `python tools/generate_minigame_catalog.py`로 카탈로그를 재생성하고 검증한다.

브라우저 프리뷰/월페이퍼 런타임은 가능한 한 최신 파이썬 소스를 우선 사용한다. 생성된 exe가 있더라도, 소스 워크스페이스에서는 자동 생성 로직이 반영되는 경로를 우선 유지한다.
