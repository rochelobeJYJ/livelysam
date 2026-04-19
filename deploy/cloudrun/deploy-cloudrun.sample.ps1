$ProjectId = "YOUR_PROJECT_ID"
$Region = "asia-northeast3"
$ServiceName = "livelysam-data-proxy"
$ArtifactRepository = "livelysam-images"
$ImageUri = "$Region-docker.pkg.dev/$ProjectId/$ArtifactRepository/$ServiceName"
$NeisSecretName = "LIVELYSAM_NEIS_API_KEY"
$WeatherSecretName = "LIVELYSAM_WEATHER_API_KEY"

Write-Host ""
Write-Host "[1/4] Artifact Registry 저장소 생성" -ForegroundColor Cyan
gcloud artifacts repositories create $ArtifactRepository `
  --repository-format=docker `
  --location=$Region `
  --description="LivelySam container images"

Write-Host ""
Write-Host "[2/4] Cloud Build로 이미지 빌드" -ForegroundColor Cyan
gcloud builds submit . `
  --config=deploy/cloudrun/cloudbuild.yaml `
  --substitutions="_IMAGE_URI=$ImageUri"

Write-Host ""
Write-Host "[3/4] Cloud Run 서비스 배포" -ForegroundColor Cyan
gcloud run deploy $ServiceName `
  --image=$ImageUri `
  --region=$Region `
  --allow-unauthenticated `
  --min-instances=0 `
  --max-instances=3 `
  --cpu=1 `
  --memory=512Mi `
  --timeout=15s `
  --set-env-vars="LIVELYSAM_DATA_PROXY_HOST=0.0.0.0,LIVELYSAM_DATA_PROXY_DATA_ROOT=/tmp/livelysam-data-proxy" `
  --set-secrets="LIVELYSAM_NEIS_API_KEY=$($NeisSecretName):1,LIVELYSAM_WEATHER_API_KEY=$($WeatherSecretName):1"

Write-Host ""
Write-Host "[4/4] 배포 URL / 헬스 체크" -ForegroundColor Cyan
$ServiceUrl = gcloud run services describe $ServiceName `
  --region=$Region `
  --format="value(status.url)"

Write-Host "Service URL: $ServiceUrl" -ForegroundColor Green
Invoke-RestMethod "$ServiceUrl/health" | ConvertTo-Json -Depth 5

Write-Host ""
Write-Host "이제 js/public-runtime-config.js 의 proxyBaseUrl에 아래 URL을 넣으시면 됩니다." -ForegroundColor Yellow
Write-Host $ServiceUrl -ForegroundColor Yellow
