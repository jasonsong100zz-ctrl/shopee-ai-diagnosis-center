param(
  [string]$SupabaseUrl = $env:SUPABASE_URL,
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$WorkspaceId = $env:COMPETITOR_WORKSPACE_ID
)

if (-not $SupabaseUrl -or -not $ServiceRoleKey -or -not $WorkspaceId) {
  throw "请先设置 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、COMPETITOR_WORKSPACE_ID 环境变量"
}

$env:SUPABASE_URL = $SupabaseUrl
$env:SUPABASE_SERVICE_ROLE_KEY = $ServiceRoleKey
$env:COMPETITOR_WORKSPACE_ID = $WorkspaceId
npm run competitor:bridge
