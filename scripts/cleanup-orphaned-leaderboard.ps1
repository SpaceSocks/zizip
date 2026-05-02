param(
    [switch]$Apply,
    [string]$ProjectId = "zipzip-d8d69",
    [string]$ApiKey = "AIzaSyBNl4-fwt3BoZ-ERO1JUOo8cFwrqndlU_k"
)

$ErrorActionPreference = "Stop"

$authExportPath = Join-Path "C:\tmp" "cosmiczip-auth-users.json"
$leaderboardCollection = "leaderboard"

Write-Host "Exporting Firebase Auth users from $ProjectId..."
firebase auth:export $authExportPath --format=json --project $ProjectId | Out-Host

$authData = Get-Content -LiteralPath $authExportPath -Raw | ConvertFrom-Json
$activeUsers = @{}
foreach ($user in @($authData.users)) {
    if ($user.localId) {
        $activeUsers[$user.localId] = $true
    }
}

Remove-Item -LiteralPath $authExportPath -Force -ErrorAction SilentlyContinue

Write-Host "Found $($activeUsers.Count) active Firebase Auth user(s)."

$queryBody = @{
    structuredQuery = @{
        from = @(@{ collectionId = $leaderboardCollection })
        limit = 1000
    }
} | ConvertTo-Json -Depth 20

$queryUrl = "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents:runQuery?key=$ApiKey"
$rows = Invoke-RestMethod -Method Post -Uri $queryUrl -ContentType "application/json" -Body $queryBody

$orphanedDocs = @()
foreach ($row in @($rows)) {
    if (-not $row.document -or -not $row.document.fields) {
        continue
    }

    $fields = $row.document.fields
    $docName = [string]$row.document.name
    $docId = ($docName -split "/")[-1]
    $leaderboardUserId = [string]$fields.userId.stringValue
    $displayName = [string]$fields.displayName.stringValue

    if ($leaderboardUserId -and -not $activeUsers.ContainsKey($leaderboardUserId)) {
        $orphanedDocs += [pscustomobject]@{
            DocId = $docId
            UserId = $leaderboardUserId
            DisplayName = $displayName
        }
    }
}

if ($orphanedDocs.Count -eq 0) {
    Write-Host "No orphaned leaderboard entries found."
    exit 0
}

Write-Host "Found $($orphanedDocs.Count) orphaned leaderboard entr$(if ($orphanedDocs.Count -eq 1) { 'y' } else { 'ies' }):"
$orphanedDocs | Format-Table -AutoSize | Out-Host

if (-not $Apply) {
    Write-Host "Dry run only. Re-run with -Apply to permanently delete these leaderboard entries and their embedded replays."
    exit 0
}

foreach ($doc in $orphanedDocs) {
    Write-Host "Deleting leaderboard/$($doc.DocId)..."
    firebase firestore:delete "$leaderboardCollection/$($doc.DocId)" --recursive --force --project $ProjectId | Out-Host
}

Write-Host "Deleted $($orphanedDocs.Count) orphaned leaderboard entr$(if ($orphanedDocs.Count -eq 1) { 'y' } else { 'ies' })."
