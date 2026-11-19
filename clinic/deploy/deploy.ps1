# آپلود و نصب کلینیک مهر (clinic.bathmanai.ir) از ویندوز
# اجرا:
#   $env:CD_PASS = '<رمز سرور>'
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\deploy.ps1
param(
  [string]$HostName = '185.243.48.12',
  [string]$User = 'root',
  [string]$Password = $env:CD_PASS,
  [string]$HostKey = 'SHA256:C8cymfyid4u4oOyshH7E5OQHw+Fg8IKQXiNON0gGXHw',
  [string]$PuttyDir = 'C:\Program Files\PuTTY',
  [string]$RemoteRoot = '/opt/clinic'
)

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$plink = Join-Path $PuttyDir 'plink.exe'
$pscp = Join-Path $PuttyDir 'pscp.exe'

if (-not $Password) { throw 'رمز عبور را در متغیر محیطی CD_PASS قرار دهید.' }
if (-not (Test-Path $plink)) { throw "plink پیدا نشد: $plink" }
if (-not (Test-Path $pscp)) { throw "pscp پیدا نشد: $pscp" }

Write-Host "== ساخت پوشه‌ها =="
& $plink -ssh -batch -hostkey $HostKey -pw $Password "$User@$HostName" "mkdir -p $RemoteRoot/public $RemoteRoot/deploy $RemoteRoot/data"
if ($LASTEXITCODE -ne 0) { throw 'اتصال SSH برقرار نشد.' }

Write-Host "== آپلود کد سرور =="
& $pscp -pw $Password -batch -hostkey $HostKey "$base\server.js" "$base\package.json" "$User@$HostName`:$RemoteRoot/"
if ($LASTEXITCODE -ne 0) { throw 'آپلود فایل‌های سرور ناموفق بود.' }

Write-Host "== آپلود فایل‌های رابط کاربری =="
& $pscp -pw $Password -batch -hostkey $HostKey "$base\public\index.html" "$base\public\styles.css" "$base\public\app.js" "$User@$HostName`:$RemoteRoot/public/"
if ($LASTEXITCODE -ne 0) { throw 'آپلود فایل‌های public ناموفق بود.' }

Write-Host "== آپلود فایل‌های نصب =="
& $pscp -pw $Password -batch -hostkey $HostKey "$base\deploy\install.sh" "$base\deploy\nginx-clinic.conf" "$User@$HostName`:$RemoteRoot/deploy/"
if ($LASTEXITCODE -ne 0) { throw 'آپلود فایل‌های نصب ناموفق بود.' }

Write-Host "== نصب سرویس و ری‌لود nginx =="
& $plink -ssh -batch -hostkey $HostKey -pw $Password "$User@$HostName" "sed -i 's/\r$//' $RemoteRoot/deploy/install.sh && bash $RemoteRoot/deploy/install.sh"
if ($LASTEXITCODE -ne 0) { throw 'نصب کلینیک روی سرور ناموفق بود.' }

Write-Host ""
Write-Host "تمام شد:"
Write-Host "  http://$HostName:8788/          (کلینیک، تا وقتی DNS تنظیم شود)"
Write-Host "  http://clinic.bathmanai.ir/     (پس از تنظیم رکورد A)"
Write-Host "  کد ورود آزمایشی: 11111 | شماره مدیر: 09120000000"
