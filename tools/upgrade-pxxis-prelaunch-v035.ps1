[CmdletBinding()]
param(
  [ValidateSet('backup', 'rehearse', 'upgrade', 'verify')]
  [string]$Mode,

  [string]$BackupPath,

  [string]$RehearsalRecordPath,

  [switch]$ApproveGeneratedDdl,

  [switch]$ConfirmLiveUpgrade
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

# This is deliberately scoped to the active local acceptance stack. It must not
# be repurposed for an arbitrary database or used against a deployed service.
$Container = 'pxxis-prelaunch-20260713-postgres-1'
$ApiContainer = 'pxxis-prelaunch-20260713-api-1'
$WorkerContainer = 'pxxis-prelaunch-20260713-diagnosis-worker-1'
$CliImage = 'pxxis-prelaunch-20260713-api'
$Network = 'pxxis-prelaunch-20260713_backend'
$TargetDatabase = 'pxxis_prelaunch'
$DatabaseRole = 'pxxis_prelaunch'
$RequiredTaskId = 'cms4wmzes000uqs07m0a4q8ze'
$ExpectedAppliedMigrations = @(
  '20260712190000_baseline_v021',
  '20260712191000_v021_realtime_safety',
  '20260714170000_v022_account_profiles',
  '20260715120000_v023_extension_pairing',
  '20260715170000_v024_task_scoped_extension_pairing',
  '20260716110000_v025_sessions',
  '20260716120000_v026_rate_limit_buckets',
  '20260716130000_v027_decision_evidence_fingerprint',
  '20260716140000_v028_route_verification',
  '20260717100000_v029_email_verification',
  '20260718110000_v030_security_metrics',
  '20260719180000_v031_collection_diagnostics',
  '20260720110000_v032_audit_actor_snapshot',
  '20260722090000_v033_table_cell_reviews'
)
$PendingMigrations = @(
  '20260729120000_metric_binding_calibration',
  '20260731120000_v035_ai_skill_diagnosis'
)
$LockedTables = @(
  '"AccountProfile"',
  '"CollectionRouteSource"',
  '"DataSnapshot"',
  '"DecisionRun"',
  '"User"',
  '"Workspace"'
)
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackupsRoot = Join-Path $RepoRoot '.backups\pxxis-v035'

function Fail([string]$Message) {
  throw "V035 pxxis upgrade refused: $Message"
}

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "docker command failed: $($Arguments[0])"
  }
}

function Invoke-Psql([string]$Sql, [string]$Database = $TargetDatabase) {
  # Passing SQL with quoted Prisma identifiers through `psql -c` on Windows
  # rewrites embedded double quotes. Stdin preserves the SQL byte-for-byte.
  $output = $Sql | & docker exec -i $Container psql -X -q -v ON_ERROR_STOP=1 -U $DatabaseRole -d $Database -At
  if ($LASTEXITCODE -ne 0) {
    Fail "psql command failed for database '$Database'."
  }
  return @($output | Where-Object { $_ -ne $null })
}

function Get-PsqlScalar([string]$Sql, [string]$Database = $TargetDatabase) {
  $values = @(Invoke-Psql -Sql $Sql -Database $Database)
  if ($values.Count -ne 1) {
    Fail "Expected one scalar result but received $($values.Count)."
  }
  return $values[0].Trim()
}

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Label) {
  if ($Actual -ne $Expected) {
    Fail "$Label expected '$Expected' but found '$Actual'."
  }
}

function Get-DatabaseUrl {
  $environment = (& docker inspect $ApiContainer --format '{{json .Config.Env}}' | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0) {
    Fail "Cannot inspect API container '$ApiContainer' for its internal database URL."
  }
  $entry = $environment | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
  if (-not $entry) {
    Fail "API container '$ApiContainer' has no DATABASE_URL."
  }
  $databaseUrl = $entry.Substring('DATABASE_URL='.Length)
  $uri = [uri]$databaseUrl
  Assert-Equal $uri.Host 'postgres' 'DATABASE_URL host'
  Assert-Equal $uri.AbsolutePath.Trim('/') $TargetDatabase 'DATABASE_URL database'
  return $databaseUrl
}

function Get-DatabaseUrlForDatabase([string]$DatabaseUrl, [string]$Database) {
  $builder = [System.UriBuilder]::new($DatabaseUrl)
  $builder.Path = "/$Database"
  $result = $builder.Uri.AbsoluteUri
  $check = [uri]$result
  Assert-Equal $check.UserInfo.Split(':')[0] $DatabaseRole 'derived DATABASE_URL user'
  Assert-Equal $check.AbsolutePath.Trim('/') $Database 'derived DATABASE_URL database'
  return $result
}

function Assert-ApiStopped {
  $running = (& docker inspect $ApiContainer --format '{{.State.Running}}').Trim()
  if ($LASTEXITCODE -ne 0) {
    Fail "Cannot inspect API container '$ApiContainer'."
  }
  Assert-Equal $running 'false' 'API container stopped state'
}

function Assert-WorkerStopped {
  $workerId = & docker ps -aq --filter "name=^/$WorkerContainer`$"
  if ($LASTEXITCODE -ne 0) {
    Fail "Cannot inspect diagnosis worker '$WorkerContainer'."
  }
  if ($null -eq $workerId) {
    return
  }
  $workerId = [string]$workerId
  $workerId = $workerId.Trim()
  if (-not $workerId) {
    return
  }
  $running = (& docker inspect $WorkerContainer --format '{{.State.Running}}').Trim()
  Assert-Equal $running 'false' 'diagnosis worker stopped state'
}

function Get-DatabaseExists([string]$Database) {
  return (Get-PsqlScalar -Database 'postgres' -Sql "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '$($Database.Replace("'", "''"))');") -eq 't'
}

function Get-ActiveClientCount([string]$Database = $TargetDatabase) {
  return [int](Get-PsqlScalar -Database $Database -Sql "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend';")
}

function Get-MigrationNames([string]$Database = $TargetDatabase) {
  return @(Invoke-Psql -Database $Database -Sql 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;')
}

function Assert-ExactStringArray([string[]]$Actual, [string[]]$Expected, [string]$Label) {
  if ($Actual.Count -ne $Expected.Count -or (Compare-Object -ReferenceObject $Expected -DifferenceObject $Actual)) {
    $actualText = $Actual -join ', '
    $expectedText = $Expected -join ', '
    Fail "$Label mismatch. Expected [$expectedText], found [$actualText]."
  }
}

function Assert-V033Baseline([string]$Database = $TargetDatabase) {
  Assert-Equal (Get-PsqlScalar -Database $Database -Sql 'SELECT current_database();') $Database 'connected database'
  Assert-ExactStringArray -Actual (Get-MigrationNames -Database $Database) -Expected $ExpectedAppliedMigrations -Label 'applied v033 migrations'
  Assert-Equal (Get-PsqlScalar -Database $Database -Sql "SELECT count(*) FROM `"CollectionTask`" WHERE id = '$RequiredTaskId';") '1' 'required acceptance task'
  if ((Get-ActiveClientCount -Database $Database) -ne 0) {
    Fail "Database '$Database' has another client connection. Stop local writers and retry."
  }
}

function Get-TableNames([string]$Database = $TargetDatabase) {
  return @(Invoke-Psql -Database $Database -Sql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name;")
}

function Get-RowCount([string]$TableName, [string]$Database = $TargetDatabase) {
  $quoted = $TableName.Replace('"', '""')
  return Get-PsqlScalar -Database $Database -Sql "SELECT count(*) FROM public.`"$quoted`";"
}

function Write-Inventory([string]$Database, [string]$Path) {
  $records = foreach ($tableName in Get-TableNames -Database $Database) {
    [pscustomobject]@{
      table = $tableName
      row_count = Get-RowCount -TableName $tableName -Database $Database
    }
  }
  $records | Export-Csv -LiteralPath $Path -NoTypeInformation -Encoding utf8
}

function Read-Inventory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "Inventory does not exist: $Path"
  }
  $records = @(Import-Csv -LiteralPath $Path -Encoding utf8)
  if ($records.Count -eq 0) {
    Fail "Inventory is empty: $Path"
  }
  return $records
}

function Assert-Inventory([string]$Database, [object[]]$Inventory) {
  foreach ($record in $Inventory) {
    $actual = Get-RowCount -TableName $record.table -Database $Database
    Assert-Equal $actual ([string]$record.row_count) "row count for $($record.table)"
  }
}

function Get-TaskSnapshotCount([string]$Database = $TargetDatabase) {
  return Get-PsqlScalar -Database $Database -Sql "SELECT count(*) FROM `"DataSnapshot`" WHERE `"taskId`" = '$RequiredTaskId';"
}

function Get-PrismaSchemaHash {
  return (Get-FileHash -LiteralPath (Join-Path $RepoRoot 'prisma\schema.prisma') -Algorithm SHA256).Hash
}

function Get-MigrationFileHash([string]$MigrationName) {
  $path = Join-Path $RepoRoot "prisma\migrations\$MigrationName\migration.sql"
  if (-not (Test-Path -LiteralPath $path)) {
    Fail "Migration SQL is missing: $MigrationName"
  }
  return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-BackupManifest([string]$Directory) {
  $manifest = [ordered]@{
    format = 'pxxis-v035-upgrade-backup-v1'
    createdAtUtc = [DateTime]::UtcNow.ToString('o')
    container = $Container
    database = $TargetDatabase
    requiredTaskId = $RequiredTaskId
    taskSnapshotCount = Get-TaskSnapshotCount
    schemaSha256 = Get-PrismaSchemaHash
    appliedMigrations = @(Get-MigrationNames)
    migrationSqlSha256 = [ordered]@{}
    files = [ordered]@{}
  }
  foreach ($migrationName in $PendingMigrations) {
    $manifest.migrationSqlSha256[$migrationName] = Get-MigrationFileHash -MigrationName $migrationName
  }
  foreach ($item in Get-ChildItem -LiteralPath $Directory -File) {
    $manifest.files[$item.Name] = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
  }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Directory 'manifest.json') -Encoding utf8
}

function Read-BackupManifest([string]$Directory) {
  $path = Join-Path $Directory 'manifest.json'
  if (-not (Test-Path -LiteralPath $path)) {
    Fail "Backup manifest does not exist: $path"
  }
  $manifest = Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json
  Assert-Equal $manifest.format 'pxxis-v035-upgrade-backup-v1' 'backup manifest format'
  Assert-Equal $manifest.database $TargetDatabase 'backup manifest database'
  Assert-Equal $manifest.requiredTaskId $RequiredTaskId 'backup manifest task'
  Assert-ExactStringArray -Actual @($manifest.appliedMigrations) -Expected $ExpectedAppliedMigrations -Label 'backup manifest migrations'
  foreach ($migrationName in $PendingMigrations) {
    $recordedHash = [string]$manifest.migrationSqlSha256.psobject.Properties[$migrationName].Value
    if ([string]::IsNullOrWhiteSpace($recordedHash)) {
      Fail "Backup manifest has no SHA256 for migration '$migrationName'."
    }
    Assert-Equal (Get-MigrationFileHash -MigrationName $migrationName) $recordedHash.ToLowerInvariant() "backup migration SHA256 for $migrationName"
  }
  return $manifest
}

function Assert-BackupFiles([string]$Directory, [object]$Manifest) {
  foreach ($property in $Manifest.files.psobject.Properties) {
    $path = Join-Path $Directory $property.Name
    if (-not (Test-Path -LiteralPath $path)) {
      Fail "Backup file is missing: $path"
    }
    Assert-Equal (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash ([string]$property.Value) "SHA256 for $($property.Name)"
  }
}

function New-Backup {
  Assert-ApiStopped
  Assert-WorkerStopped
  Assert-V033Baseline
  New-Item -ItemType Directory -Force -Path $BackupsRoot | Out-Null
  $timestamp = Get-Date -Format 'yyyyMMddTHHmmssZ'
  $directory = Join-Path $BackupsRoot "$TargetDatabase-$timestamp"
  New-Item -ItemType Directory -Path $directory | Out-Null
  $dumpName = 'database.dump'
  $schemaName = 'schema.sql'
  $containerDump = "/tmp/$TargetDatabase-$timestamp.dump"
  $containerSchema = "/tmp/$TargetDatabase-$timestamp-schema.sql"
  try {
    Invoke-Docker @('exec', $Container, 'sh', '-lc', "umask 077; pg_dump -U `"`$POSTGRES_USER`" --format=custom --no-owner --no-privileges -f '$containerDump' '$TargetDatabase'")
    Invoke-Docker @('exec', $Container, 'sh', '-lc', "umask 077; pg_dump -U `"`$POSTGRES_USER`" --schema-only --no-owner --no-privileges -f '$containerSchema' '$TargetDatabase'")
    Invoke-Docker @('exec', $Container, 'sh', '-lc', "pg_restore --list '$containerDump' >/dev/null")
    Invoke-Docker @('cp', "${Container}:$containerDump", (Join-Path $directory $dumpName))
    Invoke-Docker @('cp', "${Container}:$containerSchema", (Join-Path $directory $schemaName))
  } finally {
    & docker exec $Container rm -f $containerDump $containerSchema | Out-Null
  }
  Write-Inventory -Database $TargetDatabase -Path (Join-Path $directory 'row-counts.csv')
  Write-BackupManifest -Directory $directory
  $manifest = Read-BackupManifest -Directory $directory
  Assert-BackupFiles -Directory $directory -Manifest $manifest
  Write-Output "backup=passed path=$directory taskSnapshots=$($manifest.taskSnapshotCount) schemaSha256=$($manifest.schemaSha256)"
}

function Get-PrismaArgs([string]$DatabaseUrl) {
  $prismaDirectory = Join-Path $RepoRoot 'prisma'
  return @('run', '--rm', '--network', $Network, '-e', "DATABASE_URL=$DatabaseUrl", '-v', "${prismaDirectory}:/tmp/prisma:ro", '--entrypoint', '/app/node_modules/.bin/prisma', $CliImage)
}

function Get-SchemaDiff([string]$DatabaseUrl, [string]$OutputPath) {
  $arguments = @(Get-PrismaArgs -DatabaseUrl $DatabaseUrl) + @('migrate', 'diff', '--from-url', $DatabaseUrl, '--to-schema-datamodel', '/tmp/prisma/schema.prisma', '--script')
  $sql = & docker @arguments
  if ($LASTEXITCODE -ne 0) {
    Fail 'Prisma schema diff generation failed.'
  }
  $sql | Set-Content -LiteralPath $OutputPath -Encoding utf8
  return Get-Content -LiteralPath $OutputPath -Raw -Encoding utf8
}

function Test-EmptySchemaDiff([string]$Sql) {
  $meaningful = $Sql -replace '(?m)^\s*--.*$', ''
  return [string]::IsNullOrWhiteSpace($meaningful)
}

function Assert-ExpectedV033ToV035Diff([string]$Sql) {
  Assert-AllowedGeneratedDdl -Sql $Sql
  foreach ($requiredFragment in @(
    'CREATE TYPE "CollectionBindingKind"',
    'CREATE TABLE "CollectionBindingCalibration"',
    'CREATE TYPE "DecisionRunMode"',
    'CREATE TYPE "DecisionRunStatus"',
    'CREATE TABLE "DiagnosisSkillExecution"',
    'CREATE TABLE "DiagnosisCase"',
    'CREATE TABLE "DiagnosisFeedback"',
    'DROP INDEX "DecisionRun_evidenceFingerprint_idx"',
    'ALTER TABLE "AccountProfile" ALTER COLUMN "updatedAt" DROP DEFAULT',
    'ALTER TABLE "CollectionRouteSource" ALTER COLUMN "updatedAt" DROP DEFAULT',
    'ALTER TABLE "DataSnapshot" ALTER COLUMN "updatedAt" DROP DEFAULT'
  )) {
    if ($Sql -notlike "*$requiredFragment*") {
      Fail "Prisma v033-to-v035 schema diff is missing the expected change: $requiredFragment"
    }
  }
}

function Get-ReconciliationSql {
  $v034Path = Join-Path $RepoRoot "prisma\migrations\$($PendingMigrations[0])\migration.sql"
  $v035Path = Join-Path $RepoRoot "prisma\migrations\$($PendingMigrations[1])\migration.sql"
  $v034 = Get-Content -LiteralPath $v034Path -Raw -Encoding utf8
  $v035 = Get-Content -LiteralPath $v035Path -Raw -Encoding utf8
  $schemaAlignment = @'

-- Existing v033 schema drift reconciled to the current Prisma datamodel.
-- No rows, tables, columns, or enum values are removed.
DROP INDEX "DecisionRun_evidenceFingerprint_idx";
ALTER TABLE "AccountProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CollectionRouteSource" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "DataSnapshot" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Preserve the v035 migration's objects but align its explicit short index
-- names with Prisma's current datamodel names, so post-upgrade diff is empty.
DROP INDEX "DecisionRun_mode_status_lease_idx";
DROP INDEX "DiagnosisSkillExecution_run_sequence_key";
DROP INDEX "DiagnosisSkillExecution_run_status_idx";
DROP INDEX "DiagnosisSkillExecution_skill_version_idx";
DROP INDEX "DiagnosisCase_workspace_status_mode_idx";
DROP INDEX "DiagnosisCase_workspace_problem_idx";
DROP INDEX "DiagnosisFeedback_run_user_key";
DROP INDEX "DiagnosisFeedback_workspace_created_idx";
CREATE INDEX "DecisionRun_mode_status_leaseExpiresAt_idx" ON "DecisionRun"("mode", "status", "leaseExpiresAt");
CREATE UNIQUE INDEX "DiagnosisSkillExecution_decisionRunId_sequence_key" ON "DiagnosisSkillExecution"("decisionRunId", "sequence");
CREATE INDEX "DiagnosisSkillExecution_decisionRunId_status_idx" ON "DiagnosisSkillExecution"("decisionRunId", "status");
CREATE INDEX "DiagnosisSkillExecution_skillId_skillVersion_idx" ON "DiagnosisSkillExecution"("skillId", "skillVersion");
CREATE INDEX "DiagnosisCase_workspaceId_status_businessMode_idx" ON "DiagnosisCase"("workspaceId", "status", "businessMode");
CREATE INDEX "DiagnosisCase_workspaceId_mainProblemTag_idx" ON "DiagnosisCase"("workspaceId", "mainProblemTag");
CREATE UNIQUE INDEX "DiagnosisFeedback_decisionRunId_userId_key" ON "DiagnosisFeedback"("decisionRunId", "userId");
CREATE INDEX "DiagnosisFeedback_workspaceId_createdAt_idx" ON "DiagnosisFeedback"("workspaceId", "createdAt");
'@
  return ($v034.TrimEnd() + "`n`n" + $v035.TrimEnd() + "`n" + $schemaAlignment)
}

function Assert-AllowedGeneratedDdl([string]$Sql) {
  foreach ($forbidden in @('DROP TABLE', 'DROP TYPE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE ', 'INSERT INTO')) {
    if ($Sql -match [regex]::Escape($forbidden)) {
      Fail "Generated DDL contains forbidden operation: $forbidden"
    }
  }
  if ($Sql -match '(?mi)^\s*UPDATE\s+') {
    Fail 'Generated DDL contains forbidden data update statement.'
  }
  $allowedIndexDrops = @(
    'DecisionRun_evidenceFingerprint_idx',
    'DecisionRun_mode_status_lease_idx',
    'DiagnosisSkillExecution_run_sequence_key',
    'DiagnosisSkillExecution_run_status_idx',
    'DiagnosisSkillExecution_skill_version_idx',
    'DiagnosisCase_workspace_status_mode_idx',
    'DiagnosisCase_workspace_problem_idx',
    'DiagnosisFeedback_run_user_key',
    'DiagnosisFeedback_workspace_created_idx'
  )
  $dropIndexes = [regex]::Matches($Sql, '(?mi)^DROP INDEX\s+"([^"]+)";')
  foreach ($dropIndex in $dropIndexes) {
    if ($dropIndex.Groups[1].Value -notin $allowedIndexDrops) {
      Fail "Generated DDL drops an unapproved index: $($dropIndex.Groups[1].Value)"
    }
  }
}

function Apply-ReconciliationSql([string]$Database, [string]$DdlPath, [string]$Sql) {
  if (-not $ApproveGeneratedDdl) {
    Fail "Reviewed reconciliation DDL requires -ApproveGeneratedDdl: $DdlPath"
  }
  Assert-AllowedGeneratedDdl -Sql $Sql
  $transactionPath = "$DdlPath.apply.sql"
  $transaction = @"
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE $($LockedTables -join ', ') IN ACCESS EXCLUSIVE MODE;
$Sql
COMMIT;
"@
  Set-Content -LiteralPath $transactionPath -Value $transaction -Encoding utf8
  $containerPath = '/tmp/pxxis-v035-generated-ddl.sql'
  try {
    Invoke-Docker @('cp', $transactionPath, "${Container}:$containerPath")
    Invoke-Docker @('exec', $Container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', $DatabaseRole, '-d', $Database, '-f', $containerPath)
  } finally {
    & docker exec $Container rm -f $containerPath | Out-Null
  }
}

function Register-PendingMigrations([string]$DatabaseUrl) {
  foreach ($migrationName in $PendingMigrations) {
    $arguments = @(Get-PrismaArgs -DatabaseUrl $DatabaseUrl) + @('migrate', 'resolve', '--schema', '/tmp/prisma/schema.prisma', '--applied', $migrationName)
    & docker @arguments | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Fail "Prisma migration registration failed at '$migrationName'. Restore the live database from its fresh backup before continuing."
    }
  }
}

function Assert-PrismaStatus([string]$DatabaseUrl) {
  $arguments = @(Get-PrismaArgs -DatabaseUrl $DatabaseUrl) + @('migrate', 'status', '--schema', '/tmp/prisma/schema.prisma')
  & docker @arguments | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Fail 'Prisma migration status is not consistent.'
  }
}

function Assert-V035State([string]$Database, [string]$DatabaseUrl, [object]$Manifest, [switch]$RequireExclusiveAccess) {
  Assert-Equal (Get-PsqlScalar -Database $Database -Sql 'SELECT current_database();') $Database 'connected database'
  Assert-ExactStringArray -Actual (Get-MigrationNames -Database $Database) -Expected ($ExpectedAppliedMigrations + $PendingMigrations) -Label 'applied v035 migrations'
  Assert-Equal (Get-PsqlScalar -Database $Database -Sql "SELECT count(*) FROM `"CollectionTask`" WHERE id = '$RequiredTaskId';") '1' 'required acceptance task'
  Assert-Equal (Get-TaskSnapshotCount -Database $Database) ([string]$Manifest.taskSnapshotCount) 'acceptance task snapshot count'
  Assert-Inventory -Database $Database -Inventory (Read-Inventory -Path (Join-Path $BackupPath 'row-counts.csv'))
  if ($RequireExclusiveAccess -and (Get-ActiveClientCount -Database $Database) -ne 0) {
    Fail "Database '$Database' has another client connection during verification."
  }
  $checkPath = Join-Path $BackupPath "$Database-v035-postcheck.sql"
  $diff = Get-SchemaDiff -DatabaseUrl $DatabaseUrl -OutputPath $checkPath
  if (-not (Test-EmptySchemaDiff -Sql $diff)) {
    Fail "Prisma schema diff is non-empty after registration: $checkPath"
  }
  Assert-PrismaStatus -DatabaseUrl $DatabaseUrl
}

function New-RehearsalDatabaseName {
  return "pxxis_v035_rehearsal_$(Get-Date -Format 'yyyyMMddHHmmss')"
}

function Write-RehearsalRecord([string]$DdlPath, [string]$RehearsalDatabase, [string]$BackupDirectory) {
  $record = [ordered]@{
    format = 'pxxis-v035-rehearsal-v1'
    completedAtUtc = [DateTime]::UtcNow.ToString('o')
    backupPath = $BackupDirectory
    rehearsalDatabase = $RehearsalDatabase
    ddlSha256 = (Get-FileHash -LiteralPath $DdlPath -Algorithm SHA256).Hash
    prismaSchemaSha256 = Get-PrismaSchemaHash
    pendingMigrations = $PendingMigrations
  }
  $recordPath = Join-Path $BackupDirectory 'rehearsal-result.json'
  $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $recordPath -Encoding utf8
  return $recordPath
}

function Read-RehearsalRecord([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "Rehearsal record does not exist: $Path"
  }
  $record = Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json
  Assert-Equal $record.format 'pxxis-v035-rehearsal-v1' 'rehearsal record format'
  Assert-Equal $record.prismaSchemaSha256 (Get-PrismaSchemaHash) 'rehearsal Prisma schema SHA256'
  Assert-ExactStringArray -Actual @($record.pendingMigrations) -Expected $PendingMigrations -Label 'rehearsal pending migrations'
  return $record
}

function Invoke-Rehearsal {
  Assert-ApiStopped
  Assert-WorkerStopped
  $manifest = Read-BackupManifest -Directory $BackupPath
  Assert-BackupFiles -Directory $BackupPath -Manifest $manifest
  $rehearsal = New-RehearsalDatabaseName
  if (Get-DatabaseExists -Database $rehearsal) {
    Fail "Refusing to reuse existing rehearsal database '$rehearsal'."
  }
  $dumpPath = Join-Path $BackupPath 'database.dump'
  $containerDump = "/tmp/$rehearsal.dump"
  $databaseUrl = Get-DatabaseUrl
  $rehearsalUrl = Get-DatabaseUrlForDatabase -DatabaseUrl $databaseUrl -Database $rehearsal
  try {
    Invoke-Docker @('cp', $dumpPath, "${Container}:$containerDump")
    Invoke-Docker @('exec', $Container, 'createdb', '-U', $DatabaseRole, $rehearsal)
    Invoke-Docker @('exec', $Container, 'pg_restore', '-U', $DatabaseRole, '-d', $rehearsal, '--no-owner', '--no-privileges', $containerDump)
    Assert-V033Baseline -Database $rehearsal
    Assert-Equal (Get-TaskSnapshotCount -Database $rehearsal) ([string]$manifest.taskSnapshotCount) 'rehearsal task snapshot count'
    Assert-Inventory -Database $rehearsal -Inventory (Read-Inventory -Path (Join-Path $BackupPath 'row-counts.csv'))
    $preflightPath = Join-Path $BackupPath "$rehearsal-prisma-diff.sql"
    $diff = Get-SchemaDiff -DatabaseUrl $rehearsalUrl -OutputPath $preflightPath
    if (Test-EmptySchemaDiff -Sql $diff) {
      Fail "Rehearsal '$rehearsal' unexpectedly already matches v035 schema."
    }
    Assert-ExpectedV033ToV035Diff -Sql $diff
    $reconciliationPath = Join-Path $BackupPath "$rehearsal-reconciliation.sql"
    $reconciliationSql = Get-ReconciliationSql
    Set-Content -LiteralPath $reconciliationPath -Value $reconciliationSql -Encoding utf8
    Apply-ReconciliationSql -Database $rehearsal -DdlPath $reconciliationPath -Sql $reconciliationSql
    Register-PendingMigrations -DatabaseUrl $rehearsalUrl
    Assert-V035State -Database $rehearsal -DatabaseUrl $rehearsalUrl -Manifest $manifest -RequireExclusiveAccess
    $recordPath = Write-RehearsalRecord -DdlPath $reconciliationPath -RehearsalDatabase $rehearsal -BackupDirectory $BackupPath
    Write-Output "rehearse=passed database=$rehearsal backup=$BackupPath prismaDiff=$preflightPath ddl=$reconciliationPath record=$recordPath"
  } finally {
    & docker exec $Container rm -f $containerDump | Out-Null
  }
}

function Invoke-LiveUpgrade {
  if (-not $ConfirmLiveUpgrade) {
    Fail 'Live upgrade requires -ConfirmLiveUpgrade after a passed rehearsal.'
  }
  Assert-ApiStopped
  Assert-WorkerStopped
  $manifest = Read-BackupManifest -Directory $BackupPath
  Assert-BackupFiles -Directory $BackupPath -Manifest $manifest
  if (-not $RehearsalRecordPath) {
    Fail 'RehearsalRecordPath is required for a live upgrade.'
  }
  $rehearsal = Read-RehearsalRecord -Path (Resolve-Path -LiteralPath $RehearsalRecordPath).Path
  Assert-V033Baseline
  $databaseUrl = Get-DatabaseUrl
  $preflightPath = Join-Path $BackupPath "$TargetDatabase-live-prisma-diff.sql"
  $diff = Get-SchemaDiff -DatabaseUrl $databaseUrl -OutputPath $preflightPath
  if (Test-EmptySchemaDiff -Sql $diff) {
    Fail 'Live database already matches v035 schema; refusing to register migrations through this v033 upgrade path.'
  }
  Assert-ExpectedV033ToV035Diff -Sql $diff
  $reconciliationPath = Join-Path $BackupPath "$TargetDatabase-live-reconciliation.sql"
  $reconciliationSql = Get-ReconciliationSql
  Set-Content -LiteralPath $reconciliationPath -Value $reconciliationSql -Encoding utf8
  Assert-Equal (Get-FileHash -LiteralPath $reconciliationPath -Algorithm SHA256).Hash $rehearsal.ddlSha256 'live reconciliation DDL SHA256 compared with rehearsal'
  Apply-ReconciliationSql -Database $TargetDatabase -DdlPath $reconciliationPath -Sql $reconciliationSql
  Register-PendingMigrations -DatabaseUrl $databaseUrl
  Assert-V035State -Database $TargetDatabase -DatabaseUrl $databaseUrl -Manifest $manifest -RequireExclusiveAccess
  Write-Output "upgrade=passed database=$TargetDatabase backup=$BackupPath prismaDiff=$preflightPath ddl=$reconciliationPath"
}

if (-not $Mode) {
  Fail 'Mode is required.'
}

if ($Mode -in @('rehearse', 'upgrade', 'verify')) {
  if (-not $BackupPath) {
    Fail 'BackupPath is required for rehearse, upgrade, and verify.'
  }
  $BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
}

switch ($Mode) {
  'backup' { New-Backup }
  'rehearse' { Invoke-Rehearsal }
  'upgrade' { Invoke-LiveUpgrade }
  'verify' {
    $manifest = Read-BackupManifest -Directory $BackupPath
    Assert-V035State -Database $TargetDatabase -DatabaseUrl (Get-DatabaseUrl) -Manifest $manifest
    Write-Output "verify=passed database=$TargetDatabase backup=$BackupPath"
  }
}
