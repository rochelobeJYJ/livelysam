# ScreenPlay Setup

이 프로젝트는 무료 오픈소스 라이브 월페이퍼 앱인 **ScreenPlay**로 가져올 수 있습니다.

근거:

- ScreenPlay Steam 페이지는 Windows에서 `HTML5, video and QML/Javascript` wallpaper를 지원한다고 안내합니다.
- 같은 페이지에서 `free of charge forever`, `open source`라고 명시합니다.
- 공식 사이트 press 페이지도 HTML pages 기반 wallpaper를 지원한다고 설명합니다.

참고 링크:

- https://store.steampowered.com/app/672870/ScreenPlay/
- https://screen-play.app/press/
- https://screen-play.app/blog/screenplay_v0.6/
- https://screen-play.app/blog/screenplay_v0.9/

## 1. 준비

PowerShell에서 아래 명령을 실행해 ScreenPlay import용 clean folder를 만듭니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-screenplay-package.ps1
```

생성 경로:

```text
dist\screenplay\LivelySam\
```

가져올 파일:

```text
dist\screenplay\LivelySam\index.html
```

## 2. 설치 및 가져오기

1. ScreenPlay 설치
2. 앱을 실행
3. 새 wallpaper를 추가하는 메뉴를 열기
4. `dist\screenplay\LivelySam\index.html` 또는 해당 폴더를 선택
5. 가져온 wallpaper를 적용

ScreenPlay는 공식적으로 `HTML5 wallpaper`와 `HTML wallpaper wizard`를 안내하고 있으므로, 이 프로젝트처럼 HTML 메인 파일과 하위 `css/js` 폴더가 함께 있는 구조에 맞습니다.

## 3. 왜 이 경로가 유리한가

- 무료입니다.
- 오픈소스입니다.
- 최신 Chromium 기반 WebEngine을 사용한다고 안내합니다.
- Windows에서 HTML5 wallpaper를 공식 지원합니다.

## 4. 현재 프로젝트에서 주의할 점

- 브라우저에서 정상 동작하는 UI를 그대로 쓰는 구조라서, Lively 전용 API 의존은 필수가 아닙니다.
- 내부 설정은 우측 하단 설정 버튼으로 여는 방식을 계속 사용할 수 있습니다.
- `Pretendard`, `Gridstack`, `SheetJS`는 아직 CDN을 사용합니다. 인터넷이 끊겨도 완전히 안전하게 하려면 다음 단계에서 로컬 파일로 묶는 편이 좋습니다.
