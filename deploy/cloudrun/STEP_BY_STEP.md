# LivelySam Cloud Run 따라하기

이 문서는 `Windows 기준`으로, 일반적인 개인 운영자가 `한 단계씩 그대로 따라` 배포할 수 있게 적었습니다.

중요 원칙은 아래와 같습니다.

- 사용자 PC에는 `NEIS 키`, `기본 날씨 서버 키`를 넣지 않습니다.
- 그 두 키는 `Cloud Run + Secret Manager` 쪽에만 둡니다.
- 사용자는 설치 후 바로 `기본 서버`를 쓸 수 있어야 합니다.
- 더 빠르고 안정적인 사용을 원하는 사용자만 `개인 날씨 키`를 이 PC에 저장해 직접 연결합니다.

---

## 0. 먼저 결정할 값

아래 4개는 먼저 정해 두십시오.

1. Google Cloud 프로젝트 ID
   - 예: `livelysam`
2. 리전
   - 권장: `asia-northeast3` (서울)
3. Cloud Run 서비스 이름
   - 권장: `livelysam-data-proxy`
4. Artifact Registry 저장소 이름
   - 권장: `livelysam-images`

이 문서에서는 아래 예시 값으로 설명합니다.

```text
PROJECT_ID=livelysam
REGION=asia-northeast3
SERVICE_NAME=livelysam-data-proxy
REPOSITORY=livelysam-images
```

---

## 1. Google Cloud 프로젝트 만들기

1. 브라우저에서 Google Cloud Console에 로그인합니다.
2. 상단 프로젝트 선택기에서 `새 프로젝트`를 누릅니다.
3. 프로젝트 이름을 입력합니다.
4. 프로젝트 ID를 확인합니다.
   - 이 값이 이후 명령어의 `PROJECT_ID`입니다.
5. 프로젝트를 생성합니다.

메모:

- 프로젝트 ID는 나중에 바꾸기 어렵습니다.
- 너무 긴 이름보다 짧고 구분 쉬운 이름이 낫습니다.

---

## 2. 결제 연결 확인

Cloud Run, Cloud Build, Artifact Registry는 보통 결제 계정 연결이 필요합니다.

1. 좌측 메뉴에서 `결제`로 들어갑니다.
2. 현재 프로젝트가 결제 계정에 연결되어 있는지 확인합니다.
3. 안 되어 있으면 결제 계정을 연결합니다.

주의:

- 무료 구간이 있어도 `결제 연결 자체`는 필요한 경우가 많습니다.
- 이 단계가 빠지면 뒤에서 배포가 막힐 수 있습니다.

---

## 3. 필요한 API 켜기

Google Cloud Console 상단 검색창에서 아래 API를 각각 검색해서 `사용`으로 켭니다.

1. `Cloud Run Admin API`
2. `Cloud Build API`
3. `Artifact Registry API`
4. `Secret Manager API`

실수 방지:

- 4개 모두 켜졌는지 꼭 다시 확인하십시오.
- 하나라도 빠지면 뒤 명령에서 에러가 납니다.

---

## 4. Secret Manager에 키 넣기

이 단계는 `콘솔에서 클릭 방식`으로 진행하는 것을 권장합니다. 가장 실수가 적습니다.

### 4-1. NEIS 키 저장

1. 좌측 메뉴에서 `보안 > Secret Manager`로 들어갑니다.
2. `Create Secret` 또는 `비밀 만들기`를 누릅니다.
3. 이름에 아래 값을 넣습니다.

```text
LIVELYSAM_NEIS_API_KEY
```

4. 비밀 값에 실제 NEIS 키를 붙여 넣습니다.
5. 생성합니다.

### 4-2. 날씨 키 저장

같은 방식으로 하나 더 만듭니다.

```text
LIVELYSAM_WEATHER_API_KEY
```

여기에 `기본 공용 서버`가 사용할 OpenWeather 키를 넣습니다.

중요:

- 이 두 값은 앱 코드, `js/public-runtime-config.js`, GitHub 어디에도 넣지 마십시오.
- 이 값은 `Secret Manager 안에만` 있어야 합니다.

---

## 5. Cloud Shell 열기

이제부터는 Google Cloud Console 오른쪽 상단의 `>_ Cloud Shell` 버튼을 눌러 진행하는 것을 권장합니다.

이유:

- `gcloud`가 이미 설치되어 있습니다.
- 로그인 상태가 바로 연결됩니다.
- 로컬 PC에 별도 설치 없이 진행 가능합니다.

Cloud Shell이 열리면 아래 명령으로 현재 프로젝트를 맞춥니다.

```bash
gcloud config set project PROJECT_ID
```

예시:

```bash
gcloud config set project livelysam
```

---

## 6. 소스 업로드 준비

Cloud Build는 현재 저장소 전체를 기준으로 이미지를 빌드합니다.  
따라서 이 저장소가 Google Cloud Shell 쪽에도 있어야 합니다.

지금 상태에서는 `GitHub 경로보다 zip 업로드 경로`를 권장합니다.

이유:

- 현재 로컬 작업본이 GitHub와 완전히 정리되지 않았을 수 있습니다.
- GitHub를 먼저 정리하려고 하면 단계가 오히려 늘어납니다.
- Cloud Run 배포만 놓고 보면 `로컬 zip -> Cloud Shell 업로드`가 가장 단순합니다.

### 권장: 로컬에서 zip 만들기

로컬 PowerShell에서 아래 명령을 먼저 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\cloudrun\create-cloudrun-upload-zip.ps1
```

정상이라면 아래 경로에 zip이 만들어집니다.

```text
dist\cloudrun\livelysam-cloudrun-source-날짜시간.zip
```

이 zip은 아래 항목을 자동으로 제외합니다.

- `.git`
- `node_modules`
- `venv`, `.venv`
- `dist`, `runtime`
- 로컬 비밀 파일

그다음 Cloud Shell 창으로 돌아가서 업로드만 하시면 됩니다.

가장 쉬운 방법은 아래 둘 중 하나입니다.

### 방법 A. Git으로 가져오기

1. Cloud Shell에서 작업 폴더로 이동합니다.
2. 저장소를 clone 합니다.

```bash
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

### 방법 B. zip 업로드

1. 위 PowerShell 스크립트로 만든 zip 파일을 확인합니다.
2. Cloud Shell 우측 상단 점 3개 메뉴에서 `Upload`를 누릅니다.
3. `dist\cloudrun\...zip` 파일을 선택합니다.
4. Cloud Shell에서 압축을 풉니다.

```bash
mkdir -p ~/livelysam-build
cd ~/livelysam-build
unzip ~/livelysam-cloudrun-source-YYYYMMDD-HHMMSS.zip -d src
cd src
```

주의:

- `node_modules`, `venv`, `dist`, `runtime` 같은 큰 폴더는 올리지 않는 편이 좋습니다.
- 현재 저장소는 `.gitignore` 기준으로 Cloud Build 업로드가 정리되도록 맞춰 두었습니다.
- zip 파일 이름은 실제 생성된 이름으로 바꿔 입력하시면 됩니다.

---

## 7. Artifact Registry 저장소 만들기

Cloud Shell에서 아래 명령을 실행합니다.

```bash
gcloud artifacts repositories create REPOSITORY \
  --repository-format=docker \
  --location=REGION \
  --description="LivelySam container images"
```

예시:

```bash
gcloud artifacts repositories create livelysam-images \
  --repository-format=docker \
  --location=asia-northeast3 \
  --description="LivelySam container images"
```

이미 있다고 나오면:

- 실패가 아니라 `이미 만들어진 상태`일 수 있습니다.
- 그 경우 다음 단계로 넘어가시면 됩니다.

---

## 8. Cloud Build로 이미지 만들기

이 저장소에는 이미 배포용 빌드 설정 파일이 들어 있습니다.

- 설정 파일: `deploy/cloudrun/cloudbuild.yaml`
- Dockerfile: `deploy/cloudrun/Dockerfile`

먼저 이미지 URI를 머릿속으로 정합니다.

형식은 아래와 같습니다.

```text
REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/SERVICE_NAME
```

예시:

```text
asia-northeast3-docker.pkg.dev/livelysam/livelysam-images/livelysam-data-proxy
```

이제 빌드를 실행합니다.

```bash
gcloud builds submit . \
  --config=deploy/cloudrun/cloudbuild.yaml \
  --substitutions=_IMAGE_URI=REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/SERVICE_NAME
```

예시:

```bash
gcloud builds submit . \
  --config=deploy/cloudrun/cloudbuild.yaml \
  --substitutions=_IMAGE_URI=asia-northeast3-docker.pkg.dev/livelysam/livelysam-images/livelysam-data-proxy
```

이 단계가 끝나면:

- Docker 이미지가 Artifact Registry에 올라갑니다.

---

## 9. Cloud Run 서비스 배포

이제 이미지를 Cloud Run에 올립니다.

아래 명령을 그대로 기준으로 쓰시면 됩니다.

```bash
gcloud run deploy SERVICE_NAME \
  --image=REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/SERVICE_NAME \
  --region=REGION \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=15s \
  --set-env-vars=LIVELYSAM_DATA_PROXY_HOST=0.0.0.0,LIVELYSAM_DATA_PROXY_DATA_ROOT=/tmp/livelysam-data-proxy \
  --set-secrets=LIVELYSAM_NEIS_API_KEY=LIVELYSAM_NEIS_API_KEY:1,LIVELYSAM_WEATHER_API_KEY=LIVELYSAM_WEATHER_API_KEY:1
```

예시:

```bash
gcloud run deploy livelysam-data-proxy \
  --image=asia-northeast3-docker.pkg.dev/livelysam/livelysam-images/livelysam-data-proxy \
  --region=asia-northeast3 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=15s \
  --set-env-vars=LIVELYSAM_DATA_PROXY_HOST=0.0.0.0,LIVELYSAM_DATA_PROXY_DATA_ROOT=/tmp/livelysam-data-proxy \
  --set-secrets=LIVELYSAM_NEIS_API_KEY=LIVELYSAM_NEIS_API_KEY:1,LIVELYSAM_WEATHER_API_KEY=LIVELYSAM_WEATHER_API_KEY:1
```

중요:

- `:1`은 Secret Manager의 `1번 버전`을 의미합니다.
- 나중에 키를 교체하면 `:2` 같은 새 버전으로 다시 배포하면 됩니다.
- 처음에는 `run.app` 기본 URL을 그대로 써도 충분합니다.

---

## 10. 배포 URL 확인

아래 명령으로 서비스 URL을 확인합니다.

```bash
gcloud run services describe SERVICE_NAME \
  --region=REGION \
  --format="value(status.url)"
```

예시:

```bash
gcloud run services describe livelysam-data-proxy \
  --region=asia-northeast3 \
  --format="value(status.url)"
```

결과 예시:

```text
https://livelysam-data-proxy-xxxxx-an.a.run.app
```

이 URL을 복사해 두십시오.

---

## 11. 헬스 체크

브라우저 또는 Cloud Shell에서 아래 주소를 확인합니다.

```text
https://YOUR_CLOUD_RUN_URL/health
```

정상이라면 대략 아래처럼 나와야 합니다.

```json
{
  "ok": true,
  "configured": {
    "neis": true,
    "weather": true
  }
}
```

만약 `false`가 나오면:

- Secret 이름을 잘못 넣었거나
- 배포 명령의 `--set-secrets`가 틀렸거나
- Secret 버전 번호가 틀렸을 가능성이 큽니다.

---

## 12. 앱에 Cloud Run URL 연결

이제 로컬 프로젝트에서 아래 파일을 엽니다.

- `js/public-runtime-config.js`

아래 부분에 Cloud Run URL을 넣습니다.

```javascript
window.LivelySamPublicConfig.dataServices = window.LivelySamPublicConfig.dataServices || {
  proxyBaseUrl: 'https://YOUR_CLOUD_RUN_URL'
};
```

예시:

```javascript
window.LivelySamPublicConfig.dataServices = window.LivelySamPublicConfig.dataServices || {
  proxyBaseUrl: 'https://livelysam-data-proxy-xxxxx-an.a.run.app'
};
```

중요:

- 여기에는 `비밀키`를 넣는 것이 아닙니다.
- 오직 `공개 가능한 프록시 URL`만 넣습니다.

---

## 13. 앱 다시 빌드/배포

이제 LivelySam 쪽 배포 파일을 다시 만들고 배포합니다.

이 단계는 현재 사용 중인 배포 방식에 맞춰 진행하시면 됩니다.

예:

- 설치 프로그램 재빌드
- 정적 파일 재배포
- 런처 재배포

핵심은 아래 한 가지입니다.

- 최종 사용자에게 배포되는 앱 안에 `js/public-runtime-config.js`의 새 URL이 포함되어 있어야 합니다.

---

## 14. 최종 확인 순서

배포 후 아래 순서로 테스트하십시오.

1. 앱 첫 실행
2. 학교 검색이 되는지 확인
3. 급식이 보이는지 확인
4. 학사일정이 보이는지 확인
5. 날씨를 `기본 서버`로 두고 날씨가 보이는지 확인
6. 사용자 설정에서 `내 API 키 사용 (성능 추천)`으로 바꿨을 때도 잘 보이는지 확인

정상 기준:

- 기본 서버: 별도 키 없이 동작
- 개인 키: 더 빠르고 안정적으로 동작

---

## 15. 운영 중 키 교체 방법

예를 들어 날씨 키를 바꾸려면 아래 순서로 하면 됩니다.

1. Secret Manager에서 `LIVELYSAM_WEATHER_API_KEY`에 새 버전 추가
2. Cloud Run 배포 명령에서 `LIVELYSAM_WEATHER_API_KEY:2`처럼 버전 번호를 바꿔 재배포
3. `/health` 확인

이 방식의 장점:

- 앱 재배포 없이 서버 쪽 키만 교체 가능
- 사용자 PC에는 새 키를 다시 배포할 필요 없음

---

## 16. Windows PowerShell로 한 번에 실행하고 싶을 때

샘플 파일이 들어 있습니다.

- `deploy/cloudrun/deploy-cloudrun.sample.ps1`

사용 방법:

1. 이 파일을 복사합니다.
2. 복사본 이름을 아래처럼 바꿉니다.

```text
deploy/cloudrun/deploy-cloudrun.local.ps1
```

3. 파일 맨 위 변수만 본인 값으로 바꿉니다.
4. PowerShell에서 실행합니다.

이 파일은 `.gitignore`에 넣어 두었으니 실수로 올릴 가능성을 줄여 두었습니다.

---

## 17. 처음에는 커스텀 도메인 없이 가는 것을 권장

처음부터 도메인까지 한 번에 붙이면 일이 늘어납니다.

권장 순서는 아래입니다.

1. 먼저 `run.app` 기본 URL로 정상 동작 확인
2. 그다음 필요하면 커스텀 도메인 연결

이 순서가 유지보수상 가장 안전합니다.

---

## 18. 문제 생겼을 때 가장 먼저 볼 것

1. `https://YOUR_URL/health`가 열리는지
2. `configured.neis`, `configured.weather`가 둘 다 `true`인지
3. Cloud Run 로그에 4xx/5xx가 있는지
4. `js/public-runtime-config.js`의 URL이 실제 서비스 URL과 같은지
5. 앱 캐시 때문에 이전 JS를 보는 건 아닌지

---

## 19. 이 구조에서 최종적으로 기억할 것

- `NEIS 키`, `기본 날씨 키`는 서버에만 둡니다.
- 사용자 앱에는 `공개 프록시 URL`만 둡니다.
- 기본 서버는 `설치 후 바로 사용`
- 개인 날씨 키는 `성능상 권장`
- 명예의 전당 Firebase는 지금처럼 클라이언트 직결 유지
