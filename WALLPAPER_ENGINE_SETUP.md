# Wallpaper Engine Setup

이 프로젝트는 `HTML/CSS/JS` 기반 Web Wallpaper로 Wallpaper Engine에 가져올 수 있습니다.

## 1. 추천 가져오기 방식

Wallpaper Engine 공식 문서 기준으로, 메인 HTML 파일과 필요한 모든 파일을 **전용 폴더**에 모아 둔 뒤 그 폴더의 `index.html`을 Editor의 `Create Wallpaper`로 드래그하면 됩니다.

- 공식 가이드: https://docs.wallpaperengine.io/en/web/first/gettingstarted.html
- Web wallpaper 개요: https://docs.wallpaperengine.io/en/web/overview.html
- Property listener API: https://docs.wallpaperengine.io/en/web/api/propertylistener.html
- 디버깅 가이드: https://docs.wallpaperengine.io/en/web/debug/debug.html

이 저장소에서는 import용 clean folder를 자동으로 만들 수 있도록 `tools/build-wallpaper-engine-package.ps1`를 함께 제공합니다.

## 2. 권장 순서

1. PowerShell에서 `tools/build-wallpaper-engine-package.ps1` 실행
2. 생성된 폴더 `dist/wallpaper-engine/LivelySam/index.html` 확인
3. Wallpaper Engine 실행
4. `Create Wallpaper` 버튼에 `dist/wallpaper-engine/LivelySam/index.html` 드래그
5. Editor가 프로젝트를 복사하고 `project.json`을 자동 생성

## 3. User Properties 추천 키

현재 코드에서 바로 읽도록 맞춰둔 key는 아래와 같습니다.

### Text

- `schoolName`
- `neisApiKey`
- `weatherApiKey`
- `classNum`
- `startTime`
- `afterSchoolDays`

### Bool

- `showAnalogClock`
- `showSeconds`
- `afterSchoolEnabled`

### Slider / Numeric

- `theme`
- `widgetOpacity`
- `fontSize`
- `clockFormat`
- `timetableMode`
- `grade`
- `morningMinutes`
- `classMinutes`
- `breakMinutes`
- `lunchMinutes`
- `lunchAfterPeriod`
- `totalPeriods`
- `afterSchoolMinutes`

## 4. 추천 값 범위

- `theme`: `0`~`7`
- `widgetOpacity`: `10`~`100`
- `fontSize`: `10`~`24`
- `clockFormat`: `0`=12시간, `1`=24시간
- `timetableMode`: `0`=학급 시간표, `1`=내 시간표
- `grade`: `0`=1학년, `1`=2학년, `2`=3학년
- `morningMinutes`: `5`~`30`
- `classMinutes`: `40`~`60`
- `breakMinutes`: `5`~`20`
- `lunchMinutes`: `40`~`80`
- `lunchAfterPeriod`: `0`=3교시 후, `1`=4교시 후, `2`=5교시 후
- `totalPeriods`: `0`=6교시, `1`=7교시
- `afterSchoolMinutes`: `60`~`90`

## 5. 디버깅

Wallpaper Engine 공식 문서 기준으로, `Settings > General > CEF devtools port`를 켠 뒤 브라우저에서 `localhost:포트번호`로 접속하면 Web Wallpaper 디버깅이 가능합니다.

## 6. 현재 주의사항

이 프로젝트는 이제 Wallpaper Engine user property 업데이트를 받을 수 있도록 맞춰져 있습니다. 다만 `Pretendard`, `Gridstack`, `SheetJS`는 아직 CDN에서 읽고 있습니다. 공식 문서상 중요한 파일은 로컬로 번들하는 편이 더 안전하므로, 완전 오프라인 배포가 목표라면 다음 단계에서 이 의존성도 로컬 파일로 옮기는 것을 권장합니다.
