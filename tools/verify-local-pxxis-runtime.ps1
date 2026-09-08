$ErrorActionPreference = 'Stop'
function Invoke-CheckedDocker([string[]]$Arguments) {
  $result = & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Runtime verification failed: $($Arguments[0])" }
  return $result
}
$api = 'pxxis-prelaunch-20260713-api-1'
$worker = 'pxxis-local-ai-validation-worker'
$web = 'pxxis-prelaunch-20260713-web-1'
foreach ($name in @($api, $worker, $web)) {
  $state = (Invoke-CheckedDocker @('inspect', $name, '--format', '{{json .State}}')) | ConvertFrom-Json
  if (!$state.Running -or ($state.Health -and $state.Health.Status -ne 'healthy')) { throw "Service not healthy: $name" }
}
foreach ($url in @('http://127.0.0.1:4300/ready', 'http://127.0.0.1:4300/version', 'http://127.0.0.1:3300/login')) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 15
  if ($response.StatusCode -ne 200) { throw "HTTP verification failed: $url" }
  Write-Output "HTTP 200: $url"
}
$apiImage = Invoke-CheckedDocker @('inspect', $api, '--format', '{{.Image}}')
$workerImage = Invoke-CheckedDocker @('inspect', $worker, '--format', '{{.Image}}')
if ($apiImage -ne $workerImage) { throw 'API and actual Worker images differ' }
$versionScript = @'
import {diagnosisPromptVersion,diagnosisOrchestrationVersion} from './apps/api/dist/ai-diagnosis/orchestrator.js';
import {diagnosisSkillSetVersion} from './packages/diagnosis-skills/dist/index.js';
console.log(JSON.stringify({diagnosisPromptVersion,diagnosisOrchestrationVersion,diagnosisSkillSetVersion}));
'@
$apiVersion = Invoke-CheckedDocker @('exec', $api, 'node', '--input-type=module', '-e', $versionScript)
$workerVersion = Invoke-CheckedDocker @('exec', $worker, 'node', '--input-type=module', '-e', $versionScript)
if ($apiVersion -ne $workerVersion) { throw 'API and Worker diagnosis modules differ' }
Write-Output $apiVersion
$offline = @'
import {createSyntheticDiagnosisTransport,evaluateSyntheticDiagnosisSuite,evaluateSyntheticFailureDisplaySuite} from './apps/api/dist/ai-diagnosis/synthetic-evaluation.js';
const success=await evaluateSyntheticDiagnosisSuite(createSyntheticDiagnosisTransport);
const partial=await evaluateSyntheticFailureDisplaySuite();
if(success.structurePassed!==24||success.groundedConclusions!==24||success.safetyViolations||success.hallucinatedEvidence||partial.partialFailureFactsPreserved!==24)throw new Error('Offline acceptance failed');
console.log(JSON.stringify({structurePassed:success.structurePassed,groundedConclusions:success.groundedConclusions,partialFailureFactsPreserved:partial.partialFailureFactsPreserved}));
'@
# A disposable no-network process, without application credentials or business database.
Invoke-CheckedDocker @('run', '--rm', '--network', 'none', $apiImage, 'node', '--input-type=module', '-e', $offline)
& (Join-Path $PSScriptRoot 'trim-local-pxxis-runtime.ps1') -Apply
Write-Output 'Runtime and offline diagnosis verified; cleanup completed. Real model acceptance is separate.'
