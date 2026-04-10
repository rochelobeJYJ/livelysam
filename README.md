# 🎓 LivelySam (라이블리쌤)

> **한국 교사를 위한 올인원 데스크톱 대시보드 배경화면**
>
> Wallpaper Engine 기준으로 정리 중인 실시간 교사 컨트롤센터

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| ⏰ **시계** | 디지털+아날로그 시계, 날짜, 요일, 학기 표시 |
| 📋 **시간표** | NEIS 연동 주간 시간표, 현재 교시 하이라이트 |
| 🍱 **급식** | 오늘/내일/이번주 급식, 알레르기 아이콘, 칼로리 |
| 🌤️ **날씨** | 현재 날씨, 3시간 예보, 미세먼지 컬러 배지 |
| 📅 **학사일정** | 월간 캘린더, NEIS 학사일정, 공휴일 |
| 📝 **메모** | 무제한 스티키노트, 색상 변경, 고정 |
| ✅ **할 일** | 우선순위·마감일, 체크리스트 |
| ⏱️ **타이머** | 수업 타이머, 포모도로 모드 |
| 📌 **D-Day** | 수능, 시험 등 D-Day 카운터 |
| 🔗 **즐겨찾기** | 자주 방문하는 웹사이트 바로가기 |

---

## 🚀 Wallpaper Engine 설치 방법

### 1단계: Wallpaper Engine 설치
- [Wallpaper Engine 공식 사이트](https://www.wallpaperengine.io/en)
- 또는 Steam에서 `Wallpaper Engine` 설치

### 2단계: import용 폴더 만들기
PowerShell에서 아래 명령을 실행하면 불필요한 파일을 뺀 import 폴더가 생성됩니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-wallpaper-engine-package.ps1
```

생성 경로:

```text
dist\wallpaper-engine\LivelySam\
```

### 3단계: Wallpaper Engine Editor로 가져오기
1. Wallpaper Engine 실행
2. `Create Wallpaper` 클릭
3. `dist\wallpaper-engine\LivelySam\index.html` 파일을 드래그 앤 드롭
4. Editor가 프로젝트를 복사하고 `project.json`을 자동 생성

### 4단계: 설정 연결
- 기본적으로는 월페이퍼 안의 우측 하단 설정 버튼을 써도 됩니다.
- Wallpaper Engine의 `User Properties`도 연결할 수 있습니다.
- 자세한 키 목록과 추천 범위는 [WALLPAPER_ENGINE_SETUP.md](./WALLPAPER_ENGINE_SETUP.md)를 보세요.

### 5단계: 디버깅
- Wallpaper Engine `Settings > General > CEF devtools port` 활성화
- 브라우저에서 `localhost:설정한포트` 접속
- 자세한 내용: [Wallpaper Engine Web Wallpaper Debugging](https://docs.wallpaperengine.io/en/web/debug/debug.html)

---

## 🧪 기존 Lively 방식

기존 Lively 가져오기 파일도 남아 있지만, 현재는 Wallpaper Engine 경로를 우선 추천합니다.

---

## 🚀 기존 설치 방법 (Lively)

### 1단계: Lively Wallpaper 설치
- [Lively Wallpaper](https://www.rocksdanister.com/lively/) 다운로드 및 설치
- 또는 Microsoft Store에서 "Lively Wallpaper" 검색

### 2단계: LivelySam 설치
1. 이 폴더(`LivelySam`)를 원하는 위치에 복사
2. Lively Wallpaper 실행
3. **+ 버튼** → **로컬 파일 추가**
4. `LivelySam` 폴더 안의 `index.html` 선택
5. 배경화면으로 설정!

### 3단계: 초기 설정 ⚠️ 중요!
> **처음 실행하면 자동으로 설정 창이 열립니다.**

1. **NEIS API 키 입력**
   - [open.neis.go.kr](https://open.neis.go.kr) 접속 → 회원가입
   - **마이페이지** → **인증키 신청** → 키 복사
   - 설정 창에 붙여넣기

2. **학교 검색**
   - 학교명 입력 후 🔍 검색 버튼 클릭
   - 검색 결과에서 학교 선택 → 끝!

3. **날씨 API 키 입력** (선택)
   - [openweathermap.org](https://openweathermap.org/api) 무료 계정 생성
   - API Keys에서 키 복사 → 설정 창에 입력

4. **저장** 버튼 클릭 → 모든 데이터가 자동으로 불러와집니다!

---

## 🎨 테마

8가지 테마 중 선택:
- 🌸 벚꽃 파스텔
- 🌊 오션 브리즈 (기본)
- 🌿 민트 가든
- 🍑 피치 코랄
- 💜 라벤더 드림
- 🌻 선샤인
- 🧊 아이스 그레이
- 🌅 선셋

투명도도 자유롭게 조절 가능합니다.

---

## 🔒 개인정보 보호

- ✅ 모든 데이터는 **사용자 PC에만 저장** (localStorage + IndexedDB)
- ❌ 클라우드 업로드 **절대 없음**
- ❌ 외부 서버 전송 **절대 없음**
- ✅ API 호출은 NEIS, OpenWeatherMap **공식 서버**에 직접 요청
- ✅ 배포 파일에 개인정보 **포함하지 않음**

---

## 📂 폴더 구조

```
LivelySam/
├── index.html              # 메인 페이지
├── css/style.css           # 스타일시트
├── js/
│   ├── app.js              # 메인 앱
│   ├── config.js           # 설정 관리
│   ├── lively.js           # Lively 연동
│   ├── api/                # API 모듈
│   ├── widgets/            # 위젯 모듈
│   └── utils/              # 유틸리티
├── LivelyProperties.json   # Lively 설정
├── LivelyInfo.json         # Lively 메타정보
└── README.md               # 이 파일
```

---

## ❓ FAQ

**Q: 인터넷 없이 사용할 수 있나요?**
- 시계, 메모, 할일, 타이머, D-Day 등은 오프라인에서도 작동합니다.
- 급식, 날씨, 시간표 등 API 연동 기능은 인터넷이 필요합니다.

**Q: 위젯 배치를 바꿀 수 있나요?**
- 네! 위젯 상단을 드래그하여 이동, 우하단 모서리를 잡아 크기를 조절할 수 있습니다.

**Q: 데이터 백업은 어떻게 하나요?**
- 설정 → 데이터 → 데이터 내보내기(JSON) 클릭
- 자동 백업: 매일 1회 (최근 7일분 보관)

---

## 📜 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능합니다.

---

## 🙏 감사

이 프로젝트는 한국의 모든 선생님들을 위해 만들어졌습니다.
학교명만 입력하면 끝! 🎉

---

# 🎓 LivelySam - English Guide

## Quick Setup
1. Install [Lively Wallpaper](https://www.rocksdanister.com/lively/)
2. Add `index.html` as wallpaper via Lively
3. Enter your NEIS API key (from [open.neis.go.kr](https://open.neis.go.kr))
4. Search your school → Done!

## Privacy
- All data stored locally only (no cloud, no external servers)
- APIs called directly to official servers (NEIS, OpenWeatherMap)

## License
MIT
