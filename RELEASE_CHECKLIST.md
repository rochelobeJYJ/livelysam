# LivelySam Release Checklist

## 1. 정적 점검

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_release_audit.ps1
```

확인 항목:

- 필수 배포 파일 존재
- `LivelyInfo.json`, `LivelyProperties.json` JSON 파싱
- 전체 `js` 문법 검사
- `tools` 파이썬 스크립트 문법 검사
- README 핵심 안내 포함 여부
- 버전 표기 연결 상태 확인

## 2. 브라우저 검증

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_review_fix_validation.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_headless_validation.ps1
```

확인 항목:

- 리뷰 수정 검증 페이지 통과
- 월간/주간/목록 일정 뷰 렌더링 통과
- 학교/집 프리셋 날씨 렌더링 통과

주의:

- 회사 PC, 샌드박스, 원격 세션에서는 Chrome/Edge Headless가 권한 문제로 실패할 수 있습니다.
- 이 경우 일반 Windows PowerShell에서 다시 실행합니다.

## 3. 수동 실행 확인

- `start_livelysam_launcher.vbs` 실행
- 실행기에서 배경화면 시작/중지 동작 확인
- 브라우저 미리보기 열기 확인
- 보조 모니터 선택 동작 확인
- 설정 저장 후 재실행 시 데이터 유지 확인
- 브라우저 보기와 배경화면 보기 사이 데이터 공유 확인

## 4. 배포 전 최종 확인

- `%LocalAppData%\LivelySam\user-data\shared-storage.json` 이 저장소 바깥 경로에 생성되는지 확인
- 저장소 안에 개인정보 파일이 생성되지 않았는지 확인
- `.gitignore`에 `dist/`, `runtime/`, `venv/`가 포함되어 있는지 확인
- `dist\launcher\LivelySamLauncher.exe`가 최신 빌드인지 확인

## 5. 설치기 및 업데이트 확인

- `powershell -NoProfile -ExecutionPolicy Bypass -File tools\sync_release_metadata.ps1` 실행 후 `release\updates\latest-stable.json`, `release\updates\latest-beta.json`이 최신 버전으로 갱신되었는지 확인
- Inno Setup 6이 없다면 `winget install --id JRSoftware.InnoSetup -e --accept-package-agreements --accept-source-agreements --scope user`로 먼저 설치
- Inno Setup 6의 `ISCC.exe`가 설치되어 있는지 확인하고 `powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_installer.ps1`로 설치기를 빌드
- `dist\installer\LivelySamSetup-<version>.exe`가 생성되는지 확인
- 런처에서 `업데이트 확인`, `채널 전환`이 동작하는지 확인
- 안정 채널과 테스트 채널 각각에서 새 버전 감지 문구가 올바르게 바뀌는지 확인
- 업데이트 설치 시 `%LocalAppData%\LivelySam\updates`에 설치 파일이 내려받아지고 설치 마법사가 실행되는지 확인
- GitHub Actions `Release` 워크플로를 수동 실행할 때는 `release_tag` 입력값을 `version.json`의 `releaseTag`와 정확히 맞춰서 넣기
