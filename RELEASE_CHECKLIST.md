# LivelySam Release Checklist

## 1. 기본 감사

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_release_audit.ps1
```

확인 항목:

- 필수 배포 파일 존재
- `LivelyInfo.json`, `LivelyProperties.json`, `version.json`, `release\updates\latest-stable.json`, `release\updates\latest-beta.json` JSON 파싱
- 전체 `js` 문법 검사
- `tools` 파이썬 스크립트 컴파일 검사
- 설치기, 업데이트 매니페스트, 릴리즈 워크플로, 코드서명 훅 연결 상태 검사

## 2. 브라우저 검증

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_review_fix_validation.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_headless_validation.ps1
```

확인 항목:

- 리뷰 수정 검증 페이지 통과
- 일정, 위젯, 메인 화면 로드 통과
- 로컬 스토리지 브리지와 미리보기 경로 기본 동작 통과

주의:

- 회사 PC, 원격 세션, 샌드박스 환경에서는 Chrome 또는 Edge headless 권한 문제로 실패할 수 있습니다.
- 그 경우 일반 Windows PowerShell에서 다시 실행합니다.

## 3. 수동 실행 확인

- `start_livelysam_launcher.vbs` 실행
- 런처에서 배경화면 시작 및 중지 동작 확인
- 브라우저 미리보기 열기 확인
- 보조 모니터 선택 동작 확인
- 설정 저장과 상태 메시지 갱신 확인
- 미리보기와 배경화면 보기 사이 데이터 공유 확인

## 4. 설치기 및 자동 업데이트 확인

- `powershell -NoProfile -ExecutionPolicy Bypass -File tools\sync_release_metadata.ps1` 실행 후 `release\updates\latest-stable.json`, `release\updates\latest-beta.json` 갱신 확인
- Inno Setup 6이 없다면 `winget install --id JRSoftware.InnoSetup -e --accept-package-agreements --accept-source-agreements --scope user`
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_installer.ps1` 실행
- `dist\installer\LivelySamSetup-<version>.exe` 생성 확인
- 런처에서 `업데이트 확인`과 채널 전환 동작 확인
- `%LocalAppData%\LivelySam\updates` 아래에 설치 파일이 내려받아지고 실행되는지 확인
- `version.json`의 `releaseTag`와 Git 태그가 일치하는지 확인

## 5. 설치 후 최종 확인

- `%LocalAppData%\LivelySam\user-data\shared-storage.json` 경로가 생성되는지 확인
- 저장소 루트가 아니라 로컬 앱데이터 아래에 사용자 데이터가 저장되는지 확인
- `.gitignore`에 `dist/`, `runtime/`, `venv/`가 포함되어 있는지 확인
- `dist\launcher\LivelySamLauncher.exe`, `dist\launcher\BrowserPreviewHost.exe`, `dist\launcher\LocalStorageBridge.exe`가 최신 빌드인지 확인

## 6. Code Signing

- `tools\sign_windows_artifacts.ps1` is the single signing hook for launcher EXEs and the installer.
- Local unsigned builds are allowed by default. Configure `LIVELYSAM_SIGN_CERT_FILE` and `LIVELYSAM_SIGN_CERT_PASSWORD` when a certificate is ready.
- If `signtool.exe` is not on `PATH`, set `LIVELYSAM_SIGNTOOL_PATH`. Override timestamping with `LIVELYSAM_SIGN_TIMESTAMP_URL` only when needed.
- For strict local release validation, set `LIVELYSAM_REQUIRE_SIGNING=1` before running `tools\build_livelysam_launcher_exe.ps1` and `tools\build_installer.ps1`.
- GitHub Actions signing is enabled only when repository secrets `WINDOWS_SIGN_PFX_BASE64` and `WINDOWS_SIGN_PFX_PASSWORD` are configured.
