[CmdletBinding()]
param(
  [ValidateSet('preflight', 'reconcile', 'register', 'all')]
  [string]$Mode = 'preflight',

  [string]$Container = 'ai-ad-diagnosis-postgres',
  [string]$DatabaseRole = 'diagnosis',
  [string]$TargetDatabase = 'douyin_subject_diagnosis',
  [string]$DatabaseUrl,
  [string]$InventoryPath,
  [string]$ExpectedSchemaDiffSha256,
  [string]$ExpectedSchemaSha256,
  [string]$RequiredTaskId = 'cms4wmzes000uqs07m0a4q8ze',
  [switch]$AllowRehearsal
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$legacyTables = @(
  'ActionOutcome', 'ActionProposal', 'AiAnalysisTask', 'ApprovalRecord', 'AuditLog',
  'CollectionTask', 'DataSnapshot', 'DecisionRun', 'ExecutionLog', 'NormalizedMetric',
  'Project', 'Recommendation', 'ReviewedMetric', 'StrategyRule', 'User', 'Workspace'
)
$lockedTables = $legacyTables | ForEach-Object { '"' + $_ + '"' }
$repoRoot = Split-Path -Parent $PSScriptRoot
$backupDirectory = Join-Path $repoRoot '.backups'

function Fail([string]$Message) {
  throw "V035 reconciliation refused: $Message"
}

function Invoke-Psql([string]$Sql, [string]$Database = $TargetDatabase) {
  $Sql | & docker exec -i $Container psql -X -q -U $DatabaseRole -d $Database -v ON_ERROR_STOP=1 -XtA
  if ($LASTEXITCODE -ne 0) {
    Fail "psql command failed for database '$Database'."
  }
}

function Get-PsqlScalar([string]$Sql, [string]$Database = $TargetDatabase) {
  $result = Invoke-Psql -Sql $Sql -Database $Database
  return ($result | Where-Object { $_ -ne '' } | Select-Object -Last 1).Trim()
}

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Label) {
  if ($Actual -ne $Expected) {
    Fail "$Label expected '$Expected' but found '$Actual'."
  }
}

function Get-DatabaseUrlFromEnvFile {
  $envPath = Join-Path $repoRoot '.env'
  if (-not (Test-Path -LiteralPath $envPath)) {
    Fail 'DatabaseUrl was not supplied and .env does not exist.'
  }
  $line = Get-Content -LiteralPath $envPath -Encoding utf8 |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
    Select-Object -First 1
  if (-not $line) {
    Fail 'DATABASE_URL is missing from .env.'
  }
  return (($line -split '=', 2)[1].Trim().Trim('"').Trim("'"))
}

function Get-Inventory {
  if (-not $InventoryPath) {
    Fail 'InventoryPath is required. Use the row-count CSV created with the backup.'
  }
  if (-not (Test-Path -LiteralPath $InventoryPath)) {
    Fail "InventoryPath does not exist: $InventoryPath"
  }

  $inventory = @{}
  foreach ($line in Get-Content -LiteralPath $InventoryPath -Encoding utf8) {
    if ($line -match '^public\.([^,]+),([0-9]+)$') {
      $inventory[$Matches[1]] = $Matches[2]
    }
  }
  if ($inventory.Count -eq 0) {
    Fail 'InventoryPath has no public table counts.'
  }
  return $inventory
}

function Assert-Inventory([hashtable]$Inventory) {
  foreach ($tableName in $Inventory.Keys) {
    $actual = Get-PsqlScalar -Sql "SELECT count(*) FROM `"$tableName`";"
    Assert-Equal $actual $Inventory[$tableName] "row count for $tableName"
  }
}

function Assert-HistoricalBaseline([hashtable]$Inventory) {
  if ($TargetDatabase -ne 'douyin_subject_diagnosis' -and -not $AllowRehearsal) {
    Fail 'Only douyin_subject_diagnosis is accepted unless -AllowRehearsal is explicitly set.'
  }

  Assert-Equal (Get-PsqlScalar -Sql 'SELECT current_database();') $TargetDatabase 'connected database'
  Assert-Equal (Get-PsqlScalar -Sql "SELECT to_regclass('public._prisma_migrations') IS NULL;") 't' '_prisma_migrations absence'
  Assert-Equal (Get-PsqlScalar -Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';") '16' 'legacy public table count'
  Assert-Equal (Get-PsqlScalar -Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AccountProfile';") '0' 'AccountProfile absence'
  Assert-Equal (Get-PsqlScalar -Sql "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Project' AND column_name = 'accountProfileId';") '0' 'Project.accountProfileId absence'
  Assert-Equal (Get-PsqlScalar -Sql "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'DataSnapshot' AND column_name = 'updatedAt';") '0' 'DataSnapshot.updatedAt absence'
  Assert-Equal (Get-PsqlScalar -Sql 'SELECT count(*) FROM "Project" p LEFT JOIN "Workspace" w ON w.id = p."workspaceId" WHERE w.id IS NULL;') '0' 'Project workspace references'
  Assert-Equal (Get-PsqlScalar -Sql 'SELECT count(*) FROM "DataSnapshot" WHERE "createdAt" IS NULL;') '0' 'DataSnapshot createdAt values'
  Assert-Equal (Get-PsqlScalar -Sql ('SELECT count(*) FROM "CollectionTask" WHERE id = {0};' -f ("'{0}'" -f $RequiredTaskId.Replace("'", "''")))) '1' 'required acceptance task'
  Assert-Equal (Get-PsqlScalar -Sql "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend';") '0' 'other target database clients'
  Assert-Inventory $Inventory
}

function Get-SchemaDiff([string]$OutputPath) {
  & corepack pnpm exec prisma migrate diff --from-url $DatabaseUrl --to-schema-datamodel prisma/schema.prisma --script |
    Set-Content -LiteralPath $OutputPath -Encoding utf8
  if ($LASTEXITCODE -ne 0) {
    Fail 'Prisma schema diff generation failed.'
  }
  return Get-Content -LiteralPath $OutputPath -Raw -Encoding utf8
}

function Test-EmptySchemaDiff([string]$Diff) {
  $meaningfulSql = $Diff -replace '(?m)^\s*--.*$', ''
  return [string]::IsNullOrWhiteSpace($meaningfulSql)
}

function Require-Replace([string]$Sql, [string]$Old, [string]$New, [string]$Label) {
  $count = [regex]::Matches($Sql, [regex]::Escape($Old)).Count
  if ($count -ne 1) {
    Fail "$Label expected one exact SQL anchor but found $count."
  }
  return $Sql.Replace($Old, $New)
}

function Add-ReconciliationBackfills([string]$Sql) {
  $Sql = Require-Replace $Sql 'ALTER TABLE "Project" ADD COLUMN     "accountProfileId" TEXT NOT NULL;' 'ALTER TABLE "Project" ADD COLUMN     "accountProfileId" TEXT;' 'Project account profile column'

  $snapshotPattern = '(?s)ALTER TABLE "DataSnapshot" ADD COLUMN.*?ADD COLUMN\s+"updatedAt" TIMESTAMP\(3\) NOT NULL;'
  $snapshotMatches = [regex]::Matches($Sql, $snapshotPattern)
  if ($snapshotMatches.Count -ne 1) {
    Fail "DataSnapshot updatedAt anchor expected once but found $($snapshotMatches.Count)."
  }
  $snapshotBlock = $snapshotMatches[0].Value -replace '(ADD COLUMN\s+"updatedAt" TIMESTAMP\(3\)) NOT NULL;', '$1;'
  $snapshotBlock += @'

UPDATE "DataSnapshot"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "DataSnapshot"
ALTER COLUMN "updatedAt" SET NOT NULL;
'@
  $Sql = $Sql.Remove($snapshotMatches[0].Index, $snapshotMatches[0].Length).Insert($snapshotMatches[0].Index, $snapshotBlock)

  $auditPattern = '(?s)ALTER TABLE "AuditLog" ADD COLUMN\s+"actorSnapshotJson" JSONB,\s*ALTER COLUMN "userId" DROP NOT NULL;'
  $auditMatches = [regex]::Matches($Sql, $auditPattern)
  if ($auditMatches.Count -ne 1) {
    Fail "AuditLog actor snapshot anchor expected once but found $($auditMatches.Count)."
  }
  $auditBlock = $auditMatches[0].Value + @'


UPDATE "AuditLog"
SET "actorSnapshotJson" = jsonb_build_object('userId', "userId")
WHERE "actorSnapshotJson" IS NULL;
'@
  $Sql = $Sql.Remove($auditMatches[0].Index, $auditMatches[0].Length).Insert($auditMatches[0].Index, $auditBlock)

  $accountIndexAnchor = 'CREATE UNIQUE INDEX "AccountProfile_workspaceId_platform_identityKey_key" ON "AccountProfile"("workspaceId", "platform", "identityKey");'
  $accountBackfill = @'
INSERT INTO "AccountProfile" (
  "id", "workspaceId", "platform", "platformAccountId", "identityKey", "accountName", "normalizedName", "identityStatus", "status", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || md5(p."id"),
  p."workspaceId",
  'DOUYIN_LOCAL_LIFE',
  NULL,
  'legacy-project:' || p."id",
  p."name",
  lower(trim(p."name")),
  'PENDING_ID'::"AccountIdentityStatus",
  'ACTIVE'::"AccountProfileStatus",
  p."createdAt",
  p."updatedAt"
FROM "Project" p;

UPDATE "Project" p
SET "accountProfileId" = 'legacy_' || md5(p."id");

ALTER TABLE "Project"
ALTER COLUMN "accountProfileId" SET NOT NULL;

'@
  $Sql = Require-Replace $Sql $accountIndexAnchor ($accountBackfill + $accountIndexAnchor) 'AccountProfile deterministic backfill insertion point'

  $routeIndexAnchor = 'CREATE UNIQUE INDEX "CollectionRouteSource_taskId_routeKey_key" ON "CollectionRouteSource"("taskId", "routeKey");'
  $routeBackfill = @'
INSERT INTO "CollectionRouteSource" ("id", "taskId", "routeKey", "label", "sourceUrl", "required", "createdAt", "updatedAt")
SELECT 'route_dashboard_' || md5(t."id"), t."id", 'LOCAL_PROMOTION_DASHBOARD', U&'\5DE8\91CF\672C\5730\63A8\6570\636E\603B\89C8',
       CASE WHEN t."sourceUrl" ILIKE '%local%' OR t."sourceUrl" ILIKE '%promotion%' THEN t."sourceUrl" ELSE NULL END, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CollectionTask" t
UNION ALL
SELECT 'route_live_' || md5(t."id"), t."id", 'LIVE_DATA_SCREEN', U&'\76F4\64AD\6570\636E\5927\5C4F\6982\89C8',
       CASE WHEN t."sourceUrl" ILIKE '%live%' OR t."sourceUrl" ILIKE '%room%' THEN t."sourceUrl" ELSE NULL END, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CollectionTask" t
UNION ALL
SELECT 'route_task_' || md5(t."id"), t."id", 'TASK_TABLE', U&'\5DE8\91CF\672C\5730\63A8\4EFB\52A1\5217\8868', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CollectionTask" t
UNION ALL
SELECT 'route_product_' || md5(t."id"), t."id", 'LIVE_PRODUCT_TAB', U&'\76F4\64AD\5927\5C4F\5546\54C1\9875', NULL, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CollectionTask" t
UNION ALL
SELECT 'route_traffic_' || md5(t."id"), t."id", 'LIVE_TRAFFIC_TAB', U&'\76F4\64AD\5927\5C4F\6D41\91CF\9875', NULL, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CollectionTask" t;

'@
  $Sql = Require-Replace $Sql $routeIndexAnchor ($routeBackfill + $routeIndexAnchor) 'CollectionRouteSource deterministic backfill insertion point'

  $auditConstraintAnchor = 'ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;'
  $safetyStateBackfill = @'

INSERT INTO "ActionProposalGate" ("id", "projectId", "collectionTaskId", "actionType", "nextAllowedAt", "createdAt", "updatedAt")
SELECT 'gate-' || md5("projectId" || ':' || "collectionTaskId" || ':' || "actionType"::text),
       "projectId", "collectionTaskId", "actionType", MAX("createdAt") + INTERVAL '30 minutes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ActionProposal"
WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
  AND "status" <> 'REJECTED'
GROUP BY "projectId", "collectionTaskId", "actionType"
ON CONFLICT ("projectId", "collectionTaskId", "actionType") DO NOTHING;

INSERT INTO "ActionProposalQuota" ("id", "projectId", "windowStart", "strongCount", "version", "createdAt", "updatedAt")
SELECT 'quota-' || md5("projectId" || ':' || date_trunc('hour', "createdAt")::text),
       "projectId", date_trunc('hour', "createdAt"), COUNT(*)::integer, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ActionProposal"
WHERE "createdAt" >= date_trunc('hour', CURRENT_TIMESTAMP)
  AND "actionType" NOT IN ('OBSERVE', 'KEEP_BUDGET', 'CHECK_LIVE_ROOM', 'CHECK_CREATIVE', 'CHECK_AUDIENCE', 'VERIFY_ACTIVITY', 'CALIBRATE_SUBJECT', 'REQUEST_MANUAL_REVIEW')
GROUP BY "projectId", date_trunc('hour', "createdAt")
ON CONFLICT ("projectId", "windowStart") DO NOTHING;
'@
  $Sql = Require-Replace $Sql $auditConstraintAnchor ($auditConstraintAnchor + $safetyStateBackfill) 'ActionProposal safety state backfill insertion point'

  foreach ($forbidden in @('DROP TABLE', 'DROP TYPE', 'DELETE FROM', 'TRUNCATE ')) {
    if ($Sql -match [regex]::Escape($forbidden)) {
      Fail "Generated reconciliation SQL contains forbidden operation: $forbidden"
    }
  }
  return $Sql
}

function Invoke-Reconciliation([hashtable]$Inventory) {
  Assert-HistoricalBaseline $Inventory
  if (-not $ExpectedSchemaSha256 -or -not $ExpectedSchemaDiffSha256) {
    Fail 'ExpectedSchemaSha256 and ExpectedSchemaDiffSha256 are required for reconciliation.'
  }
  New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
  $stamp = Get-Date -Format 'yyyyMMddTHHmmssZ'
  $diffPath = Join-Path $backupDirectory "$TargetDatabase-v035-preflight-$stamp.sql"
  $sourceHash = (Get-FileHash -LiteralPath (Join-Path $repoRoot 'prisma/schema.prisma') -Algorithm SHA256).Hash
  Assert-Equal $sourceHash $ExpectedSchemaSha256 'Prisma schema SHA256'
  $diff = Get-SchemaDiff $diffPath
  $diffHash = (Get-FileHash -LiteralPath $diffPath -Algorithm SHA256).Hash
  Assert-Equal $diffHash $ExpectedSchemaDiffSha256 'preflight schema diff SHA256'
  $reconciliationSql = Add-ReconciliationBackfills $diff
  $applyPath = Join-Path $backupDirectory "$TargetDatabase-v035-reconciliation-$stamp.sql"
  $transactionSql = @"
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE $($lockedTables -join ', ') IN ACCESS EXCLUSIVE MODE;
$reconciliationSql
COMMIT;
"@
  Set-Content -LiteralPath $applyPath -Value $transactionSql -Encoding utf8

  & docker cp $applyPath "${Container}:/tmp/v035-reconciliation.sql"
  if ($LASTEXITCODE -ne 0) {
    Fail 'Copying reconciliation SQL into the database container failed.'
  }
  try {
    & docker exec $Container psql -X -q -U $DatabaseRole -d $TargetDatabase -v ON_ERROR_STOP=1 -f /tmp/v035-reconciliation.sql
    if ($LASTEXITCODE -ne 0) {
      Fail 'Transactional reconciliation failed. PostgreSQL rolled back the transaction.'
    }
  } finally {
    & docker exec $Container rm -f /tmp/v035-reconciliation.sql | Out-Null
  }

  Assert-Inventory $Inventory
  $postDiffPath = Join-Path $backupDirectory "$TargetDatabase-v035-postcheck-$stamp.sql"
  $postDiff = Get-SchemaDiff $postDiffPath
  if (-not (Test-EmptySchemaDiff $postDiff)) {
    Fail "Post-reconciliation Prisma schema diff is not empty. Restore from the verified backup before continuing: $postDiffPath"
  }
  Write-Output "reconcile=passed database=$TargetDatabase source_schema_sha256=$sourceHash preflight_diff_sha256=$diffHash sql=$applyPath"
}

function Assert-Reconciled([hashtable]$Inventory) {
  Assert-Equal (Get-PsqlScalar -Sql 'SELECT current_database();') $TargetDatabase 'connected database'
  Assert-Equal (Get-PsqlScalar -Sql "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend';") '0' 'other target database clients'
  Assert-Inventory $Inventory
  Assert-Equal (Get-PsqlScalar -Sql ('SELECT count(*) FROM "CollectionTask" WHERE id = {0};' -f ("'{0}'" -f $RequiredTaskId.Replace("'", "''")))) '1' 'required acceptance task'
  $stamp = Get-Date -Format 'yyyyMMddTHHmmssZ'
  $postDiffPath = Join-Path $backupDirectory "$TargetDatabase-v035-registration-precheck-$stamp.sql"
  $postDiff = Get-SchemaDiff $postDiffPath
  if (-not (Test-EmptySchemaDiff $postDiff)) {
    Fail "Cannot register migrations while the Prisma schema diff is non-empty: $postDiffPath"
  }
}

function Register-Migrations([hashtable]$Inventory) {
  Assert-Reconciled $Inventory
  $migrationNames = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'prisma/migrations') -Directory |
    Sort-Object Name |
    ForEach-Object { $_.Name }
  if ($migrationNames.Count -ne 16) {
    Fail "Expected 16 migrations but found $($migrationNames.Count)."
  }
  foreach ($migrationName in $migrationNames) {
    & corepack pnpm exec prisma migrate resolve --schema prisma/schema.prisma --applied $migrationName
    if ($LASTEXITCODE -ne 0) {
      Fail "Prisma migration registration failed at $migrationName. No further migrations were registered."
    }
  }
  & corepack pnpm exec prisma migrate status --schema prisma/schema.prisma
  if ($LASTEXITCODE -ne 0) {
    Fail 'Prisma migrate status failed after registration.'
  }
  Assert-Inventory $Inventory
  Write-Output "register=passed database=$TargetDatabase migrations=$($migrationNames.Count)"
}

if (-not $DatabaseUrl) {
  $DatabaseUrl = Get-DatabaseUrlFromEnvFile
}
try {
  $uri = [System.Uri]$DatabaseUrl
} catch {
  Fail 'DatabaseUrl is not a valid absolute PostgreSQL URL.'
}
if ($uri.Scheme -notin @('postgresql', 'postgres')) {
  Fail 'DatabaseUrl must use a PostgreSQL scheme.'
}
Assert-Equal $uri.AbsolutePath.Trim('/') $TargetDatabase 'DatabaseUrl database name'

$originalDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = $DatabaseUrl
try {
  $inventory = Get-Inventory
  switch ($Mode) {
    'preflight' { Assert-HistoricalBaseline $inventory; Write-Output "preflight=passed database=$TargetDatabase" }
    'reconcile' { Invoke-Reconciliation $inventory }
    'register' { Register-Migrations $inventory }
    'all' { Invoke-Reconciliation $inventory; Register-Migrations $inventory }
  }
} finally {
  $env:DATABASE_URL = $originalDatabaseUrl
}
