param(
  [string]$ApiImage = 'pxxis-api:diagnosis-scenario-candidate-v24-20260906',
  [string]$WebImage = 'pxxis-web:diagnosis-scenario-candidate-v24-20260906'
)
$ErrorActionPreference = 'Stop'
$candidateNetwork = 'pxxis-diagnosis-closure-candidate-20260906'
$candidateDb = 'pxxis-diagnosis-closure-db-20260906'
$candidateApi = 'pxxis-diagnosis-closure-api-20260906'
$candidateWeb = 'pxxis-diagnosis-closure-web-20260906'
$createdContainers = [System.Collections.Generic.List[string]]::new()
$networkCreated = $false
function Invoke-CandidateDocker {
  param([string[]]$Arguments)
  $result = & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Candidate Docker operation failed: $($Arguments[0])" }
  return $result
}
try {
  foreach ($candidateName in @($candidateDb, $candidateApi, $candidateWeb)) {
    $existing = docker ps -a --filter "name=^/$candidateName`$" --format '{{.Names}}'
    if ($existing) { throw "Candidate name already exists: $candidateName" }
  }
  $existingNetwork = docker network ls --filter "name=^$candidateNetwork`$" --format '{{.Name}}'
  if ($existingNetwork) { throw 'Candidate network already exists' }
  Invoke-CandidateDocker @('network', 'create', '--internal', $candidateNetwork) | Out-Null
  $networkCreated = $true
  # A fresh database on an internal network with no host port or existing volume.
  Invoke-CandidateDocker @('run', '-d', '--name', $candidateDb, '--network', $candidateNetwork,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=pxxis_candidate', '-e', 'POSTGRES_DB=pxxis_candidate', 'postgres:16-alpine') | Out-Null
  $createdContainers.Add($candidateDb)
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $candidateDb pg_isready -U pxxis_candidate -d pxxis_candidate *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (!$ready) { throw 'Candidate database did not become ready' }
  $candidateDatabaseUrl = "postgresql://pxxis_candidate@$candidateDb`:5432/pxxis_candidate"
  Invoke-CandidateDocker @('run', '--rm', '--network', $candidateNetwork, '-e', "DATABASE_URL=$candidateDatabaseUrl",
    $ApiImage, 'node', 'node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate') | Out-Null
  # Importing only createServer avoids the Worker and history lifecycle scheduler.
  Invoke-CandidateDocker @('run', '-d', '--name', $candidateApi, '--network', $candidateNetwork,
    '-e', "DATABASE_URL=$candidateDatabaseUrl", '-e', 'SESSION_COOKIE_SECURE=true', '-e', 'WEB_ORIGIN=https://candidate.invalid', $ApiImage, 'node', '--input-type=module', '-e',
    "import {randomBytes} from 'node:crypto'; process.env.SECURITY_SECRET=randomBytes(32).toString('hex'); const {createServer}=await import('./apps/api/dist/server.js'); createServer().listen(4000,'0.0.0.0');") | Out-Null
  $createdContainers.Add($candidateApi)
  Invoke-CandidateDocker @('run', '-d', '--name', $candidateWeb, '--network', 'none', $WebImage) | Out-Null
  $createdContainers.Add($candidateWeb)
  $probe = @'
const port = process.argv[1]; const paths = process.argv.slice(2);
for (const path of paths) {
  let response; let lastError;
  for (let attempt=0; attempt<30; attempt++) {
    try { response=await fetch(`http://127.0.0.1:${port}${path}`); if(response.ok) break; } catch(error) { lastError=error; }
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!response?.ok) throw new Error(`Candidate ${path} unavailable`, {cause:lastError});
  console.log(JSON.stringify({path,status:response.status}));
}
'@
  Invoke-CandidateDocker @('exec', $candidateApi, 'node', '--input-type=module', '-e', $probe, '4000', '/ready', '/version')
  Invoke-CandidateDocker @('exec', $candidateWeb, 'node', '--input-type=module', '-e', $probe, '3000', '/login')
  $webMarkers = @'
import {readdirSync,readFileSync} from 'node:fs'; import {join} from 'node:path';
const markers=['\u4e8b\u5b9e\u5df2\u786e\u8ba4\uff0cAI \u5efa\u8bae\u672a\u5b8c\u6210','\u76ee\u6807\u662f\u5426\u8fbe\u6210','\u8d8b\u52bf\u80fd\u5426\u5224\u65ad','\u539f\u56e0\u662f\u5426\u786e\u8ba4','\u6700\u8fd1\u4e24\u4e2a\u5b8c\u6574 15 \u5206\u949f\u7a97\u53e3','\u672c\u6b21\u76f4\u64ad\u590d\u76d8\u5206\u6790','\u5f53\u524d\u76f4\u64ad\u5206\u6790'];
const found=new Set();
function visit(directory) {
  for(const entry of readdirSync(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if(entry.isDirectory()) visit(path);
    else if(path.endsWith('.js')) { const text=readFileSync(path,'utf8'); for(const marker of markers) if(text.includes(marker)) found.add(marker); }
  }
}
visit('/app/apps/web/.next');
if(found.size!==markers.length) throw new Error('Candidate Web diagnosis content missing');
console.log(JSON.stringify({compiledWebDiagnosisMarkers:found.size}));
'@
  Invoke-CandidateDocker @('exec', $candidateWeb, 'node', '--input-type=module', '-e', $webMarkers)
  $offline = @'
import {createSyntheticDiagnosisTransport,evaluateSyntheticDiagnosisSuite,evaluateSyntheticFailureDisplaySuite} from './apps/api/dist/ai-diagnosis/synthetic-evaluation.js';
import {diagnosisPromptVersion,diagnosisOrchestrationVersion} from './apps/api/dist/ai-diagnosis/orchestrator.js';
const success=await evaluateSyntheticDiagnosisSuite(createSyntheticDiagnosisTransport);
const partial=await evaluateSyntheticFailureDisplaySuite();
if(success.structurePassed!==24 || success.groundedConclusions!==24 || success.safetyViolations || success.hallucinatedEvidence || partial.partialFailureFactsPreserved!==24) throw new Error('Candidate offline acceptance failed');
console.log(JSON.stringify({diagnosisPromptVersion,diagnosisOrchestrationVersion,structurePassed:success.structurePassed,groundedConclusions:success.groundedConclusions,policyAccepted:success.policyAccepted,policyRejected:success.policyRejected,partialFailureFactsPreserved:partial.partialFailureFactsPreserved}));
'@
  Invoke-CandidateDocker @('run', '--rm', '--network', 'none', $ApiImage, 'node', '--input-type=module', '-e', $offline)
  $artifactPaths = @('apps/api/dist/ai-diagnosis/orchestrator.js', 'apps/api/dist/ai-diagnosis/worker.js',
    'apps/api/dist/ai-diagnosis/validation-diagnostic.js',
    'apps/api/dist/ai-diagnosis/comparison-language.js',
    'apps/api/dist/ai-diagnosis/decision-view.js', 'apps/api/dist/project-history.js', 'apps/api/dist/routes/decision-runs.js',
    'packages/shared/dist/diagnosis.js', 'packages/shared/dist/diagnosis-context.js', 'packages/diagnosis-skills/dist/index.js',
    'packages/diagnosis-skills/dist/scenario-strategy.js', 'prisma/schema.prisma')
  foreach ($artifact in $artifactPaths) {
    $localHash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
    $imageHash = Invoke-CandidateDocker @('exec', $candidateApi, 'node', '--input-type=module', '-e',
      "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; console.log(createHash('sha256').update(readFileSync(process.argv[1])).digest('hex'));", "/app/$artifact")
    if ($localHash -ne $imageHash) { throw "Candidate artifact mismatch: $artifact" }
  }
  Write-Output "Verified $($artifactPaths.Count) candidate artifact hashes; no running service was switched."
} catch {
  foreach ($candidateName in $createdContainers) { docker logs --tail 15 $candidateName }
  throw
} finally {
  for ($index = $createdContainers.Count - 1; $index -ge 0; $index--) {
    Invoke-CandidateDocker @('rm', '-f', '-v', $createdContainers[$index]) | Out-Null
  }
  if ($networkCreated) { Invoke-CandidateDocker @('network', 'rm', $candidateNetwork) | Out-Null }
}
