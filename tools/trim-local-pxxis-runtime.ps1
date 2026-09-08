[CmdletBinding(SupportsShouldProcess)]
param(
  [switch]$Apply,
  [string[]]$KeepContainer = @()
)

$ErrorActionPreference = "Stop"

# This tool only manages the local PXXIS Web/API/Worker runtime. It never
# touches databases, volumes, networks, or containers from another project.
$servicePattern = "^(?:pxxis-prelaunch-20260713-(?:api|web)-1|pxxis-local-ai-validation-worker)(?:-(?:before|candidate|next)-.+)?$"
$currentServiceNames = @(
  "pxxis-prelaunch-20260713-api-1",
  "pxxis-prelaunch-20260713-web-1",
  "pxxis-local-ai-validation-worker"
)
$protectedNames = @($currentServiceNames + $KeepContainer | Select-Object -Unique)
$managedRepositories = @(
  "pxxis-local-ai-validation",
  "pxxis-prelaunch-20260713-web",
  "pxxis-prelaunch-20260713-api",
  "pxxis-api",
  "pxxis-web"
)

function Read-DockerLines([string[]]$Arguments) {
  $output = & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed: docker $($Arguments -join ' ')"
  }
  return @($output | Where-Object { $_ -and $_.Trim() })
}

function Get-RuntimeContainers {
  $ids = @(Read-DockerLines @('ps', '-aq', '--no-trunc'))
  if (!$ids.Count) { return @() }
  # Inspect stays in memory; only cleanup metadata leaves this function.
  $raw = (Read-DockerLines (@('inspect') + $ids)) -join "`n" | ConvertFrom-Json
  return @($raw | ForEach-Object {
    [pscustomobject]@{ Id = $_.Id; Name = $_.Name.TrimStart('/'); Image = $_.Image;
      Status = $_.State.Status; Health = $_.State.Health.Status; MountCount = @($_.Mounts).Count; Created = $_.Created }
  })
}

$containers = @(Get-RuntimeContainers)
foreach ($name in $currentServiceNames) {
  $service = @($containers | Where-Object Name -eq $name)
  if ($service.Count -ne 1 -or $service[0].Status -ne 'running' -or ($service[0].Health -and $service[0].Health -ne 'healthy')) {
    throw "Current service unavailable; preserve rollback resources: $name"
  }
}
$removedContainers = 0
$removedImages = 0
$plannedImages = 0
$protectedImageIds = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
$rollbackTags = @('pxxis-api:local-rollback', 'pxxis-web:local-rollback', 'pxxis-api:local-worker-rollback')
# Retain previous images without accumulating duplicate stopped containers.
for ($index = 0; $index -lt $currentServiceNames.Count; $index++) {
  $previous = $containers | Where-Object { $_.Name.StartsWith($currentServiceNames[$index] + '-before-') -and $_.Status -eq 'exited' -and $_.MountCount -eq 0 } |
    Sort-Object Created -Descending | Select-Object -First 1
  if (!$previous) { continue }
  [void]$protectedImageIds.Add($previous.Image)
  if ($Apply -and $PSCmdlet.ShouldProcess($rollbackTags[$index], 'Retain latest rollback image')) {
    Read-DockerLines @('image', 'tag', $previous.Image, $rollbackTags[$index]) | Out-Null
  }
}
$removableContainers = @($containers | Where-Object {
  $_.Name -match $servicePattern -and $_.Name -notin $protectedNames -and $_.Status -in @('created', 'exited') -and $_.MountCount -eq 0
})
foreach ($container in $removableContainers) {
  if (!$Apply -or !$PSCmdlet.ShouldProcess($container.Name, 'Remove stopped application container without volumes')) { continue }
  $fresh = @(Get-RuntimeContainers | Where-Object Id -eq $container.Id)
  if ($fresh.Count -ne 1 -or $fresh[0].Status -notin @('created', 'exited') -or $fresh[0].MountCount -ne 0) { throw 'Container changed during cleanup; stopped safely' }
  # No force: Docker refuses a container started after this state check.
  Read-DockerLines @('rm', $container.Id) | Out-Null
  $removedContainers++
}

# Protect every remaining container reference, even if owned by another project.
foreach ($container in @(Get-RuntimeContainers)) { [void]$protectedImageIds.Add($container.Image) }

$images = @(Read-DockerLines @("image", "ls", "--no-trunc", "--format", "{{.Repository}}|{{.Tag}}|{{.ID}}") |
  ForEach-Object {
    $parts = $_.Split("|", 3)
    [PSCustomObject]@{ Repository = $parts[0]; Tag = $parts[1]; Id = $parts[2] }
  } |
  Where-Object { $_.Repository -in $managedRepositories })

foreach ($image in $images) {
  if ("$($image.Repository):$($image.Tag)" -in $rollbackTags) { [void]$protectedImageIds.Add($image.Id) }
}

foreach ($image in $images) {
  if ($protectedImageIds.Contains($image.Id)) { continue }
  $reference = "$($image.Repository):$($image.Tag)"
  $plannedImages++
  if (!$Apply -or !$PSCmdlet.ShouldProcess($reference, 'Remove unreferenced project image tag')) { continue }
  if (@(Get-RuntimeContainers | Where-Object Image -eq $image.Id).Count) { throw 'Image acquired a container reference; stopped safely' }
  Read-DockerLines @('image', 'rm', $reference) | Out-Null
  $removedImages++
}

[pscustomobject]@{ Mode = $(if ($Apply -and !$WhatIfPreference) { 'apply' } else { 'preview' });
  PlannedContainers = $removableContainers.Count; RemovedContainers = $removedContainers;
  PlannedImageTags = $plannedImages; RemovedImageTags = $removedImages; ProtectedImageIds = $protectedImageIds.Count } | ConvertTo-Json -Compress
