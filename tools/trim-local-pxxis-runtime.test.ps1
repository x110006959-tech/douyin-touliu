$ErrorActionPreference = 'Stop'
$cleanupScript = Join-Path $PSScriptRoot 'trim-local-pxxis-runtime.ps1'
$global:cleanupTestCalls = [System.Collections.Generic.List[string]]::new()
function New-FakeContainer($id, $name, $image, $status, $mounts = @()) {
  return @{ Id = $id; Name = "/$name"; Image = $image; Created = '2026-09-06T00:00:00Z'; State = @{ Status = $status; Health = @{ Status = 'healthy' } }; Mounts = $mounts }
}
function Reset-Fixture {
  $global:cleanupTestCalls.Clear()
  $global:cleanupTestContainers = @(
    (New-FakeContainer 'api' 'pxxis-prelaunch-20260713-api-1' 'sha256:current-api' 'running'),
    (New-FakeContainer 'web' 'pxxis-prelaunch-20260713-web-1' 'sha256:current-web' 'running'),
    (New-FakeContainer 'worker' 'pxxis-local-ai-validation-worker' 'sha256:current-api' 'running'),
    (New-FakeContainer 'old' 'pxxis-prelaunch-20260713-api-1-before-v22' 'sha256:previous' 'exited'),
    (New-FakeContainer 'active' 'pxxis-prelaunch-20260713-api-1-candidate-active' 'sha256:active' 'running'),
    (New-FakeContainer 'mounted' 'pxxis-prelaunch-20260713-api-1-candidate-data' 'sha256:mounted' 'exited' @(@{ Type = 'volume' })),
    (New-FakeContainer 'other' 'another-project' 'sha256:shared' 'exited'),
    (New-FakeContainer 'candidate' 'pxxis-prelaunch-20260713-web-1-candidate-done' 'sha256:unused' 'exited')
  )
  $global:cleanupTestImages = @('pxxis-api|current|sha256:current-api', 'pxxis-web|current|sha256:current-web',
    'pxxis-api|previous|sha256:previous', 'pxxis-api|active|sha256:active', 'pxxis-api|mounted|sha256:mounted',
    'pxxis-api|shared|sha256:shared', 'pxxis-web|unused|sha256:unused', 'unrelated|old|sha256:unrelated')
}
function docker {
  $global:cleanupTestCalls.Add(($args -join ' '))
  $global:LASTEXITCODE = 0
  if ($args[0] -eq 'ps') { return $global:cleanupTestContainers.Id }
  if ($args[0] -eq 'inspect') { $requested = $args[1..($args.Count - 1)]; return ConvertTo-Json -InputObject @($global:cleanupTestContainers | Where-Object Id -in $requested) -Depth 8 }
  if ($args[0] -eq 'rm') {
    if ($args -contains '-f' -or $args -contains '-v') { throw 'Unsafe container deletion' }
    $global:cleanupTestContainers = @($global:cleanupTestContainers | Where-Object Id -ne $args[1]); return $args[1]
  }
  if ($args[0] -eq 'image' -and $args[1] -eq 'ls') { return $global:cleanupTestImages }
  if ($args[0] -eq 'image' -and $args[1] -eq 'tag') {
    $tag = $args[3].Split(':', 2); $global:cleanupTestImages += "$($tag[0])|$($tag[1])|$($args[2])"; return
  }
  if ($args[0] -eq 'image' -and $args[1] -eq 'rm') {
    if ($args -contains '-f') { throw 'Unsafe image deletion' }
    $reference = $args[2]; $global:cleanupTestImages = @($global:cleanupTestImages | Where-Object { $parts = $_.Split('|'); "$($parts[0]):$($parts[1])" -ne $reference }); return $reference
  }
  throw 'Unexpected Docker operation'
}
function Assert-True($condition, $message) { if (!$condition) { throw $message } }

Reset-Fixture
$preview = & $cleanupScript | ConvertFrom-Json
Assert-True ($preview.RemovedContainers -eq 0 -and !@($global:cleanupTestCalls | Where-Object { $_ -match '^(rm|image (rm|tag)) ' }).Count) 'Preview mutated Docker'
$result = & $cleanupScript -Apply | ConvertFrom-Json
Assert-True ($result.RemovedContainers -eq 2 -and $result.RemovedImageTags -eq 1) 'Unexpected cleanup totals'
Assert-True (($global:cleanupTestContainers.Id -join ',') -eq 'api,web,worker,active,mounted,other') 'Protected container removed'
Assert-True (@($global:cleanupTestImages | Where-Object { $_ -match 'sha256:(current-api|current-web|previous|active|mounted|shared|unrelated)$' }).Count -eq 8) 'Protected image removed'
$again = & $cleanupScript -Apply | ConvertFrom-Json
Assert-True ($again.RemovedContainers -eq 0 -and $again.RemovedImageTags -eq 0) 'Cleanup is not idempotent'
Reset-Fixture
($global:cleanupTestContainers | Where-Object Id -eq 'api').State.Status = 'exited'
$blocked = $false
try { & $cleanupScript -Apply | Out-Null } catch { $blocked = $_.Exception.Message -like '*Current service unavailable*' }
Assert-True $blocked 'Unavailable current service did not protect rollback'
Assert-True (!@($global:cleanupTestCalls | Where-Object { $_ -match '^(rm|image (rm|tag)) ' }).Count) 'Failure path mutated Docker'
Write-Output 'Cleanup regression passed: preview, active/mounted/foreign/current protection, full image IDs, rollback retention, idempotency and unavailable-service guard.'
