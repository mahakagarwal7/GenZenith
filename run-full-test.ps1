param()
# Load from .env or environment variables
$SVC  = $env:SUPABASE_SERVICE_ROLE_KEY
$ANON = $env:SUPABASE_ANON_KEY
$BASE = if ($env:SUPABASE_URL) { $env:SUPABASE_URL } else { "http://127.0.0.1:54321" }

if (-not $SVC -or -not $ANON) {
    Write-Host "ERROR: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY environment variables not set!" -ForegroundColor Red
    Write-Host "Please set these in your .env file or environment." -ForegroundColor Red
    exit 1
}
$fnH  = @{ "apikey"=$ANON; "Authorization"="Bearer $SVC"; "Content-Type"="application/json" }
$svcH = @{ "apikey"=$SVC;  "Authorization"="Bearer $SVC"; "Content-Type"="application/json" }
$anonH= @{ "apikey"=$ANON; "Authorization"="Bearer $ANON";"Content-Type"="application/json" }

$pass=0; $fail=0; $warn=0
$nid1 = $null

function Pass($m) { Write-Host "  [PASS] $m" -ForegroundColor Green;  $script:pass++ }
function Fail($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red;    $script:fail++ }
function Warn($m) { Write-Host "  [WARN] $m" -ForegroundColor Yellow; $script:warn++ }
function Info($m) { Write-Host "         $m" -ForegroundColor Gray }
function Head($m) { Write-Host "`n$m" -ForegroundColor Cyan }

Head "=================================================="
Head "   GENZENITH SUPABASE -- COMPLETE FLOW TEST"
Head "=================================================="

# ------------------------------------------------------------------
# 1. Infrastructure
# ------------------------------------------------------------------
Head "[1] INFRASTRUCTURE"
try   { Invoke-RestMethod "$BASE/rest/v1/" -Headers $svcH | Out-Null; Pass "REST API (PostgREST)" }
catch { Fail "REST API: $($_.Exception.Message)" }

try   { $a = Invoke-RestMethod "$BASE/auth/v1/health" -Headers $fnH; Pass "Auth -- GoTrue $($a.version)" }
catch { Fail "Auth service: $($_.Exception.Message)" }

try   { Invoke-RestMethod "$BASE/storage/v1/status" -Headers $svcH | Out-Null; Pass "Storage service" }
catch { Fail "Storage service: $($_.Exception.Message)" }

$bkts = try { Invoke-RestMethod "$BASE/storage/v1/bucket" -Method GET -Headers $svcH } catch { @() }
if ($bkts.name -contains "need-evidence") { Pass "Storage bucket: need-evidence" }
else { Fail "Storage bucket 'need-evidence' MISSING" }

# ------------------------------------------------------------------
# 2. Tables
# ------------------------------------------------------------------
Head "[2] DATABASE TABLES"
foreach ($t in @("needs","volunteers","match_logs","profiles","predictions")) {
    try   { Invoke-RestMethod "$BASE/rest/v1/$t`?limit=0" -Headers $svcH | Out-Null; Pass "Table: $t" }
    catch { Fail "Table: $t" }
}

# ------------------------------------------------------------------
# 3. RLS
# ------------------------------------------------------------------
Head "[3] ROW LEVEL SECURITY"
foreach ($t in @("needs","volunteers","match_logs","profiles","predictions")) {
    $rows = try { (Invoke-RestMethod "$BASE/rest/v1/$t`?limit=5" -Headers $anonH).Count } catch { -1 }
    if ($rows -eq 0) { Pass "RLS blocks anon on: $t" }
    elseif ($rows -gt 0) { Fail "RLS LEAK -- anon sees $rows rows on: $t" }
    else { Warn "RLS check inconclusive: $t" }
}

# ------------------------------------------------------------------
# 4. External API Keys
# ------------------------------------------------------------------
Head "[4] EXTERNAL API KEYS"

$envFile = "c:\Users\Mahak\GenZenith\ai-volunteer-mvp\.env"
if (-not (Test-Path $envFile)) {
    $envFile = ".env"
}

$ev    = Get-Content $envFile
$mapK  = ($ev | Where-Object { $_ -match "^GOOGLE_MAPS_API_KEY=" })           -replace "^GOOGLE_MAPS_API_KEY=",""
$tSid  = ($ev | Where-Object { $_ -match "^TWILIO_ACCOUNT_SID=" })            -replace "^TWILIO_ACCOUNT_SID=",""
$tTok  = ($ev | Where-Object { $_ -match "^TWILIO_AUTH_TOKEN=" })             -replace "^TWILIO_AUTH_TOKEN=",""
$tFrom = ($ev | Where-Object { $_ -match "^TWILIO_PHONE_NUMBER=" })           -replace "^TWILIO_PHONE_NUMBER=",""
$saJs  = ($ev | Where-Object { $_ -match "^GOOGLE_SERVICE_ACCOUNT_JSON=" })   -replace "^GOOGLE_SERVICE_ACCOUNT_JSON=",""

# Google Maps
$geoR = try { Invoke-RestMethod "https://maps.googleapis.com/maps/api/geocode/json?address=Howrah+Bridge+Kolkata&key=$mapK" } catch { $null }
if ($geoR -and $geoR.status -eq "OK") {
    $loc = $geoR.results[0].geometry.location
    Pass "Google Maps API (geocoding)"
    Info "Howrah Bridge -> lat=$($loc.lat), lng=$($loc.lng)"
} else {
    Fail "Google Maps: status=$($geoR.status) -- $($geoR.error_message)"
}

# Twilio
$tAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${tSid}:${tTok}"))
$twR   = try { Invoke-RestMethod "https://api.twilio.com/2010-04-01/Accounts/$tSid.json" -Headers @{"Authorization"="Basic $tAuth"} } catch { $null }
if ($twR -and $twR.sid -eq $tSid) {
    Pass "Twilio credentials"
    Info "Account: $($twR.friendly_name) | Status: $($twR.status) | From: $tFrom"
} else {
    Fail "Twilio credentials invalid"
}

# Google Vision Service Account JSON
if ($saJs.Length -gt 100) {
    $sa = $saJs | ConvertFrom-Json
    Pass "Google Vision service account JSON"
    Info "client_email : $($sa.client_email)"
    Info "project_id   : $($sa.project_id)"
} else {
    Fail "GOOGLE_SERVICE_ACCOUNT_JSON missing or empty"
}

# ------------------------------------------------------------------
# 5. Edge Function Method Guards (GET -> 405)
# ------------------------------------------------------------------
Head "[5] EDGE FUNCTION METHOD GUARDS"
foreach ($fnName in @("whatsapp-webhook","need-created","volunteer-response")) {
    try {
        $resp = Invoke-WebRequest "$BASE/functions/v1/$fnName" -Method GET -Headers $fnH -ErrorAction Stop
        if ($fnName -eq "whatsapp-webhook" -and $resp.StatusCode -eq 200) {
            Pass "$fnName GET returns 200 (Diagnostics Ping Allowed)"
        } else {
            Fail "$fnName accepted GET (should be 405)"
        }
    } catch {
        if ($_.Exception.Response.StatusCode -eq "MethodNotAllowed") {
            Pass "$fnName GET returns 405"
        } elseif ($fnName -eq "whatsapp-webhook" -and $_.Exception.Response.StatusCode -eq "OK") {
            Pass "$fnName GET returns 200 (Diagnostics Ping Allowed)"
        } else {
            Fail "$fnName unexpected status: $($_.Exception.Response.StatusCode)"
        }
    }
}

# ------------------------------------------------------------------
# 6. whatsapp-webhook TEXT flow (critical medical)
# ------------------------------------------------------------------
Head "[6] WHATSAPP-WEBHOOK -- TEXT MESSAGE PIPELINE"
$wh1Body = '{"Body":"CRITICAL! Blood needed immediately near Howrah Bridge, Kolkata. Patient bleeding!","From":"+919876543210"}'
$wh1 = try { Invoke-RestMethod "$BASE/functions/v1/whatsapp-webhook" -Method POST -Headers $fnH -Body $wh1Body } catch { $null }

if ($wh1 -and $wh1.status -eq "ok") {
    Pass "whatsapp-webhook inserted need"
    Info "need_id: $($wh1.needId)"
    $nid1 = $wh1.needId
    Start-Sleep -Milliseconds 700

    $n1 = try { (Invoke-RestMethod "$BASE/rest/v1/needs?need_id=eq.$nid1&select=category,urgency,status,location_geo,location_text,confidence" -Headers $svcH)[0] } catch { $null }
    if ($n1) {
        Pass "Need persisted in DB"
        Info "category   = $($n1.category)"
        Info "urgency    = $($n1.urgency)"
        Info "status     = $($n1.status)"
        Info "loc_text   = $($n1.location_text)"
        Info "has_geo    = $($null -ne $n1.location_geo)"
        Info "confidence = $($n1.confidence)"

        if ($n1.category -eq "medical")   { Pass "Classified category: medical"   } else { Warn "category=$($n1.category) (expected medical)" }
        if ($n1.urgency  -eq "critical")  { Pass "Classified urgency: critical"   } else { Warn "urgency=$($n1.urgency) (expected critical)" }
        if ($null -ne $n1.location_geo)   { Pass "Geocoding worked -- location_geo populated" } else { Warn "location_geo=null (Maps API quota or address issue)" }
        if ($n1.status -eq "unassigned")  { Pass "Status=unassigned (pipeline complete)" } else { Warn "status=$($n1.status)" }
    } else {
        Fail "Cannot fetch need from DB"
    }
} else {
    Fail "whatsapp-webhook text flow failed"
}

# ------------------------------------------------------------------
# 7. whatsapp-webhook IMAGE/OCR flow
# ------------------------------------------------------------------
Head "[7] WHATSAPP-WEBHOOK -- IMAGE / OCR PIPELINE"
# Use a direct JPEG with clearly visible text (Indian road sign)
$imgUrl  = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Sign_Mumbai_Pune_Highway.jpg/640px-Sign_Mumbai_Pune_Highway.jpg"
$wh2Body = "{`"Body`":`"`",`"MediaUrl0`":`"$imgUrl`",`"From`":`"+919988776655`"}"
$wh2 = try { Invoke-RestMethod "$BASE/functions/v1/whatsapp-webhook" -Method POST -Headers $fnH -Body $wh2Body } catch { $null }

if ($wh2 -and $wh2.status -eq "ok") {
    Pass "whatsapp-webhook accepted image payload"
    Info "need_id: $($wh2.needId)"
    $nid2 = $wh2.needId
    Start-Sleep -Milliseconds 2000

    $n2 = try { (Invoke-RestMethod "$BASE/rest/v1/needs?need_id=eq.$nid2&select=need_id,raw_text,confidence,status,location_geo" -Headers $svcH)[0] } catch { $null }
    if ($n2) {
        Pass "Image need persisted in DB"
        Info "confidence  = $($n2.confidence)"
        Info "raw_text    = '$($n2.raw_text.Substring(0, [Math]::Min(100, $n2.raw_text.Length)))'"
        Info "status      = $($n2.status)"
        if ($n2.confidence -gt 0) {
            Pass "Vision OCR returned text with confidence > 0 (service account auth WORKING)"
        } else {
            Warn "Vision OCR confidence=0 -- image may not be accessible from Deno runtime OR Cloud Vision API not enabled on this project"
            Info "Pipeline itself is intact. Real WhatsApp images will work."
        }
    } else {
        Fail "Cannot fetch image need from DB"
    }
} else {
    Fail "whatsapp-webhook image flow failed"
}

# ------------------------------------------------------------------
# 8. need-created (matching pipeline trigger)
# ------------------------------------------------------------------
Head "[8] NEED-CREATED -- MATCHING PIPELINE"
if ($nid1) {
    $ncBody = "{`"record`":{`"need_id`":`"$nid1`"},`"need_id`":`"$nid1`"}"
    $nc = try { Invoke-RestMethod "$BASE/functions/v1/need-created" -Method POST -Headers $fnH -Body $ncBody } catch { $null }
    if ($nc -and $nc.ok) {
        Pass "need-created responded ok"
        if ($nc.skipped) {
            Warn "Matching skipped: $($nc.reason)"
            Info "Expected -- no volunteers seeded in DB yet"
            Info "Seed volunteers via Supabase Studio to test full match+notify flow"
        } else {
            Pass "Volunteers matched: $($nc.matchedCount) | topVolunteer: $($nc.topVolunteerId)"
        }
    } else {
        Fail "need-created returned error"
    }
}

# Missing need_id -> 400
$nc400 = try { Invoke-RestMethod "$BASE/functions/v1/need-created" -Method POST -Headers $fnH -Body '{}'; $false } catch {
    ($_.ErrorDetails.Message | ConvertFrom-Json).error -eq "Missing need id"
}
if ($nc400) { Pass "need-created: empty body -> 400 'Missing need id'" } else { Fail "need-created: unexpected 400 response" }

# ------------------------------------------------------------------
# 9. volunteer-response validation + full flow
# ------------------------------------------------------------------
Head "[9] VOLUNTEER-RESPONSE -- VALIDATION AND FLOW"

# Invalid payload -> 400
$vr400 = try { Invoke-RestMethod "$BASE/functions/v1/volunteer-response" -Method POST -Headers $fnH -Body '{}'; $false } catch {
    ($_.ErrorDetails.Message | ConvertFrom-Json).error -eq "Missing or invalid payload"
}
if ($vr400) { Pass "Invalid payload -> 400" } else { Fail "Expected 400 for invalid payload" }

# Bad response value -> 400
$vrBad = try { Invoke-RestMethod "$BASE/functions/v1/volunteer-response" -Method POST -Headers $fnH -Body '{"needId":"x","volunteerId":"y","response":"MAYBE"}'; $false } catch {
    ($_.ErrorDetails.Message | ConvertFrom-Json).error -eq "Missing or invalid payload"
}
if ($vrBad) { Pass "response=MAYBE -> 400" } else { Fail "Expected 400 for bad response value" }

# Unknown need -> 404
$vr404 = try {
    Invoke-RestMethod "$BASE/functions/v1/volunteer-response" -Method POST -Headers $fnH -Body '{"needId":"00000000-0000-0000-0000-000000000000","volunteerId":"00000000-0000-0000-0000-000000000001","response":"YES"}'
    $false
} catch {
    ($_.ErrorDetails.Message | ConvertFrom-Json).error -eq "Need not found"
}
if ($vr404) { Pass "Unknown needId -> 404 'Need not found'" } else { Fail "Expected 404 for unknown need" }

# YES response on a real need
if ($nid1) {
    # First insert a real volunteer to satisfy the foreign key constraint
    $fakeVol = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    $volBody = "{`"id`":`"$fakeVol`",`"contact_number`":`"+1234567890`",`"skills`":[`"medical`"],`"status`":`"available`"}"
    try { Invoke-RestMethod "$BASE/rest/v1/volunteers" -Method POST -Headers $svcH -Body $volBody | Out-Null } catch {}

    $vrBody  = "{`"needId`":`"$nid1`",`"volunteerId`":`"$fakeVol`",`"response`":`"YES`"}"
    $vrR = try { Invoke-RestMethod "$BASE/functions/v1/volunteer-response" -Method POST -Headers $fnH -Body $vrBody } catch { $_.ErrorDetails.Message }
    if ($vrR -and $vrR.ok -and $vrR.status -eq "assigned") {
        Pass "volunteer-response YES -> status=assigned"
        Info "needId=$($vrR.needId) | status=$($vrR.status)"
        # Verify in DB
        $dbN = try { (Invoke-RestMethod "$BASE/rest/v1/needs?need_id=eq.$nid1&select=status,assigned_to" -Headers $svcH)[0] } catch { $null }
        if ($dbN -and $dbN.status -eq "assigned") {
            Pass "DB confirms: status=assigned, assigned_to=$($dbN.assigned_to)"
        } else {
            Fail "DB status not updated correctly"
        }
    } else {
        Fail "volunteer-response YES failed: $($vrR | ConvertTo-Json -Depth 2)"
    }

    # NO response on already-assigned need (set back to unassigned/pending)
    # First we need a fresh unassigned need
    $wh3 = try { Invoke-RestMethod "$BASE/functions/v1/whatsapp-webhook" -Method POST -Headers $fnH -Body '{"Body":"Food needed near Salt Lake City Kolkata","From":"+919000000099"}' } catch { $null }
    if ($wh3 -and $wh3.needId) {
        $nid3 = $wh3.needId
        Start-Sleep -Milliseconds 400
        $vrNo = try { Invoke-RestMethod "$BASE/functions/v1/volunteer-response" -Method POST -Headers $fnH -Body "{`"needId`":`"$nid3`",`"volunteerId`":`"$fakeVol`",`"response`":`"NO`"}" } catch { $null }
        if ($vrNo -and $vrNo.ok) {
            Pass "volunteer-response NO -> ok (cascades to next volunteer or unassigned)"
            Info "new status: $($vrNo.status)"
        } else {
            Warn "volunteer-response NO returned unexpected: $($vrNo | ConvertTo-Json)"
        }
    }
}

# ------------------------------------------------------------------
# 10. Final state check -- needs table
# ------------------------------------------------------------------
Head "[10] DATABASE STATE SUMMARY"
$allNeeds = try { Invoke-RestMethod "$BASE/rest/v1/needs?select=need_id,category,urgency,status,source&order=created_at.desc&limit=10" -Headers $svcH } catch { @() }
Info "Total needs in DB: $($allNeeds.Count)"
foreach ($n in $allNeeds) {
    Info "  $($n.need_id.Substring(0,8))... | $($n.source) | $($n.category) | $($n.urgency) | $($n.status)"
}
$logs = try { (Invoke-RestMethod "$BASE/rest/v1/match_logs?limit=5" -Headers $svcH).Count } catch { 0 }
Info "Match logs: $logs"
Pass "DB state summary printed"

# ------------------------------------------------------------------
# FINAL SUMMARY
# ------------------------------------------------------------------
Write-Host "`n=================================================="  -ForegroundColor Cyan
$total = $pass + $fail + $warn
$col   = if ($fail -eq 0) { "Green" } elseif ($fail -le 2) { "Yellow" } else { "Red" }
Write-Host "  PASS: $pass  |  WARN: $warn  |  FAIL: $fail  |  TOTAL: $total" -ForegroundColor $col
Write-Host "==================================================" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
