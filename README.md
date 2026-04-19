# LivelySam

한국 교사를 위한 로컬 대시보드형 배경화면/브라우저 보드입니다.  
시계, 시간표, 일정, 급식, 날씨, 메모, 할 일, D-Day, 즐겨찾기를 한 화면에서 관리할 수 있습니다.

## 권장 실행 방법

일반 사용자는 아래 실행기부터 사용하는 것을 권장합니다.

```bat
start_livelysam_launcher.vbs
```

빌드된 실행 파일이 있으면 아래 경로의 GUI 실행기가 바로 열립니다.

```text
dist\launcher\LivelySamLauncher.exe
```

## 제공 방식

- 전용 로컬 실행기로 배경화면 모드 실행
- 보조 모니터 우선 배치
- 바탕화면 모드가 맞지 않으면 브라우저 미리보기로 대체 실행
- 브라우저 보기와 배경화면 보기 사이에서 설정과 데이터를 공유
- Lively Wallpaper용 HTML 패키지 지원

## 포함 파일

```text
index.html
css/
js/
tools/
start_livelysam_launcher.cmd
start_livelysam_launcher.vbs
start_local_wallpaper.cmd
stop_local_wallpaper.cmd
build_livelysam_launcher_exe.cmd
LivelyInfo.json
LivelyProperties.json
```

## 데이터 저장과 개인정보

모든 사용자 데이터는 로컬 PC에만 저장됩니다. 기본적으로 Git 저장소 내부가 아니라 사용자 로컬 앱데이터 경로를 사용합니다.

공유 저장소 경로:

```text
%LocalAppData%\LivelySam\user-data\shared-storage.json
```

저장되는 예시는 아래와 같습니다.

- API 키
- 학교명, 학교 코드, 주소
- 프로필 설정
- 위젯 배치와 테마
- 메모, 일정, 할 일, D-Day, 즐겨찾기

GitHub 업로드 시 위 로컬 저장소 파일은 저장소 바깥에 있으므로 기본적으로 함께 올라가지 않습니다.

## Lively Wallpaper에서 사용할 때

1. Lively Wallpaper에 현재 폴더를 가져오거나 `index.html` 기반 패키지를 등록합니다.
2. `LivelyInfo.json`, `LivelyProperties.json`을 함께 둡니다.
3. 입력이 필요하면 Lively 설정에서 `Wallpaper Input > Keyboard`를 켭니다.

권장 방식은 Lively HTML 직접 실행보다 로컬 실행기 사용입니다. 로컬 실행기가 데이터 유지와 실행 제어에 더 안정적입니다.

## 로컬 배경화면 직접 실행

```bat
start_local_wallpaper.cmd
stop_local_wallpaper.cmd
```

이 방식은 테스트와 개발용으로 두고, 일반 사용자 배포는 GUI 실행기 사용을 권장합니다.

## 실행기 EXE 다시 빌드

```bat
build_livelysam_launcher_exe.cmd
```

필수 조건:

- `venv\Scripts\python.exe`
- PyInstaller 설치

## 릴리스 점검

브라우저 없이 정적 릴리스 점검만 먼저 돌리려면 아래 스크립트를 사용합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_release_audit.ps1
```

헤드리스 브라우저 검증까지 포함한 확인은 아래 스크립트를 사용합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_review_fix_validation.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_headless_validation.ps1
```

Codex 샌드박스처럼 브라우저 권한이 제한된 환경에서는 헤드리스 검증이 실패할 수 있습니다. 그 경우 일반 로컬 PowerShell에서 다시 실행합니다.

## 문제 해결

- 실행기가 열리지 않으면: `venv`와 `dist\launcher\LivelySamLauncher.exe` 존재 여부를 확인합니다.
- 배경화면이 안 붙으면: 실행기에서 상태 확인 후 브라우저 미리보기로 먼저 테스트합니다.
- 데이터가 안 보이면: `%LocalAppData%\LivelySam\user-data\shared-storage.json` 경로와 권한을 확인합니다.
- Lively 입력이 안 되면: Lively의 키보드 입력 허용 설정을 켭니다.

## 라이선스

MIT
