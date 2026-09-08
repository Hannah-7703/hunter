param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('preview', 'production')]
  [string]$Target,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$projects = @{
  preview = 'uexltlhwawgeywrcqrjf'
  production = 'zyjhyhreiimelhcogbdi'
}
$projectRef = $projects[$Target]

Write-Host "Target environment: $Target" -ForegroundColor Cyan
Write-Host "Supabase project: $projectRef" -ForegroundColor Cyan

supabase link --project-ref $projectRef
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Dry run only. No database changes have been made." -ForegroundColor Yellow
supabase db push --dry-run
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not $Apply) {
  Write-Host "Preview complete. Use the matching :apply command to make changes." -ForegroundColor Green
  exit 0
}

$expectedConfirmation = "APPLY-$Target"
$confirmation = Read-Host "Type $expectedConfirmation to apply migrations"
if ($confirmation -cne $expectedConfirmation) {
  Write-Host "Confirmation did not match. No database changes have been made." -ForegroundColor Yellow
  exit 1
}

supabase db push
exit $LASTEXITCODE
