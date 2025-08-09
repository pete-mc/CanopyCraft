$repoRoot = "C:\Users\peter\sources\repos\CanopyCraft"
$devRoot = "$env:LOCALAPPDATA\Packages\Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe\LocalState\games\com.mojang"

$bpSource = Join-Path $repoRoot "BP"
$rpSource = Join-Path $repoRoot "RP"
$bpDest = Join-Path $devRoot "development_behavior_packs\CanopyCraftBP"
$rpDest = Join-Path $devRoot "development_resource_packs\CanopyCraftRP"

Write-Host "Syncing Behavior Pack..."
Remove-Item $bpDest -Recurse -Force -ErrorAction Ignore
Copy-Item $bpSource $bpDest -Recurse -Force

Write-Host "Syncing Resource Pack..."
Remove-Item $rpDest -Recurse -Force -ErrorAction Ignore
Copy-Item $rpSource $rpDest -Recurse -Force

Write-Host "Packs synced successfully."
