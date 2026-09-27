# GitHub 웹에서 빈 public 저장소 "ai-run"을 만든 뒤 실행하세요.
# 로그인 창이 뜨면 브라우저로 GitHub 승인 (기기 코드 페이지와 다름)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$remote = "https://github.com/nov1802-svg/ai-run.git"

$hasOrigin = git remote | Select-String -Pattern '^origin$' -Quiet
if ($hasOrigin) {
  git remote set-url origin $remote
} else {
  git remote add origin $remote
}

Write-Host "Pushing to $remote ..."
git push -u origin main
Write-Host "Done: https://github.com/nov1802-svg/ai-run"
