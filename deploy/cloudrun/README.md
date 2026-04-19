# LivelySam 중앙 데이터 프록시 배포 안내

이 폴더는 `NEIS + 날씨` 공용 프록시를 Cloud Run에 올릴 때 쓰는 최소 배포 자료입니다.

처음부터 끝까지 따라가실 문서는 아래 파일을 보시면 됩니다.

- 상세 따라하기: `deploy/cloudrun/STEP_BY_STEP.md`
- PowerShell 예시: `deploy/cloudrun/deploy-cloudrun.sample.ps1`
- Cloud Build 설정: `deploy/cloudrun/cloudbuild.yaml`

## 왜 Cloud Run을 권장하나

- HTTPS 주소가 바로 생겨서 설치형 사용자에게 붙이기 쉽습니다.
- 요청이 들어올 때만 과금되는 구조라 초기 운영 부담이 낮습니다.
- Secret Manager와 같이 쓰기 좋습니다.
- Python 단일 프로세스 프록시를 그대로 올리기 쉽습니다.

## 이 구조에서 역할 분리

- 로컬 유지:
  - 사용자 설정/메모/일정 저장
  - Google 로그인과 Google Calendar/Tasks 동기화
- 중앙 서버로 이동:
  - NEIS 조회
  - 기본 날씨 서버 조회
- Firebase 명예의 전당:
  - 프록시로 빼지 않고 지금처럼 클라이언트 직접 연결 권장

## 배포에 쓰는 실제 코드

- 프록시 서버: `tools/livelysam_data_proxy.py`
- 조회/캐시 로직: `tools/data_proxy_core.py`
- 공개 런타임 설정: `js/public-runtime-config.js`

## Cloud Run 배포 순서

1. Google Cloud 프로젝트를 하나 만듭니다.
2. Secret Manager에 아래 두 값을 넣습니다.
   - `LIVELYSAM_NEIS_API_KEY`
   - `LIVELYSAM_WEATHER_API_KEY`
3. `deploy/cloudrun/Dockerfile`로 이미지를 빌드해 Cloud Run 서비스로 배포합니다.
4. 서비스 공개 URL을 확인합니다.
5. `js/public-runtime-config.js`의 `proxyBaseUrl`에 그 URL을 넣습니다.
6. 앱을 다시 빌드/배포합니다.

## 공개 런타임 설정

`js/public-runtime-config.js`

```javascript
window.LivelySamPublicConfig.dataServices = {
  proxyBaseUrl: 'https://YOUR-CLOUD-RUN-URL'
};
```

- 루트 URL만 넣어도 됩니다.
- 앱이 자동으로 `/api`를 붙입니다.
- 이 값은 공개되어도 괜찮습니다.
- 비밀키는 절대 이 파일에 넣지 마십시오.

## 권장 운영값

- 리전: `asia-northeast3`(서울) 우선 검토
- 최소 인스턴스: `0`
- 최대 인스턴스: `3`부터 시작
- 캐시 경로: `/tmp/livelysam-data-proxy`
- 헬스 체크: `/health`

## 보안/운영 원칙

- 비밀키는 Cloud Run 환경변수보다 Secret Manager 사용을 권장합니다.
- 이 프록시는 공용 엔드포인트이므로 현재 코드에 기본 호출 제한이 들어 있습니다.
- 공용 기본 날씨 서버는 운영자가 사용량 보호 정책을 둘 수 있습니다.
- 그래서 실사용자에게는 `기본은 공용 서버`, `권장은 개인 날씨 키` 흐름으로 안내하는 것이 맞습니다.

## 사용자 안내 기준

- 기본 서버:
  - 설치 직후 바로 사용 가능
  - 별도 키 입력 없음
  - 공용 사용량 보호나 응답 지연 영향 가능
- 개인 날씨 키:
  - 이 PC에만 저장
  - 직접 OpenWeather 연결
  - 가장 빠르고 안정적
  - 공용 서버 제한 영향 없음

## 참고

- 개인 키를 안 넣어도 앱은 동작해야 합니다. 그 역할을 Cloud Run 공용 프록시가 맡습니다.
- 개인 키를 넣은 사용자는 공용 프록시를 거치지 않고 직접 조회합니다.
