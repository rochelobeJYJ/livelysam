# Local Wallpaper Host

이 실행기는 외부 월페이퍼 앱 없이 현재 웹 프로젝트를 Windows 바탕화면 뒤에 직접 붙이는 전용 로컬 실행기입니다.

구성:

- 로컬 HTTP 서버로 현재 프로젝트를 서빙
- Chromium 계열 브라우저를 `app window` 모드로 실행
- Win32 `WorkerW` 데스크톱 레이어에 창을 붙여 바탕화면처럼 보이게 처리

현재 구현은 추가 패키지 없이 표준 Python만 사용합니다.

## 요구사항

- Windows
- Python 설치
- `venv\Scripts\python.exe`, `venv\Scripts\pythonw.exe`
- Chrome 또는 Edge 같은 Chromium 계열 브라우저

현재 이 PC에서는 Chrome 경로가 감지됩니다.

브라우저 경로를 직접 지정하고 싶으면 실행 전에 환경변수 `LIVELYSAM_BROWSER_PATH`를 설정할 수 있습니다.

## 실행

시작:

```bat
start_local_wallpaper.cmd
```

중지:

```bat
stop_local_wallpaper.cmd
```

상태 확인:

```powershell
venv\Scripts\python.exe .\tools\desktop_wallpaper_host.py status
```

## 내부 동작

- 진입 스크립트: `tools/desktop_wallpaper_host.py`
- 상태 파일: `runtime\desktop-host\state.json`
- 로그 파일: `runtime\desktop-host\host.log`
- 브라우저 프로필: `runtime\desktop-host\chrome-profile`

## 주의사항

- 브라우저 창을 데스크톱 레이어에 재부모화하는 방식이라, 브라우저 업데이트에 따라 동작이 달라질 수 있습니다.
- 현재는 기본적으로 **주 모니터 작업 영역** 기준으로 붙습니다.
- 완전한 설치형 exe 패키징은 아직 하지 않았습니다.

## 다음 개선 후보

- 다중 모니터 선택
- 시작프로그램 등록
- 브라우저 경로 자동 선택 UI
- 단일 exe 패키징
