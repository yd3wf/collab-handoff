$ErrorActionPreference = 'Stop'

$pluginRoot = Join-Path $PSScriptRoot '..\plugins\collab-handoff'
$marketplacePath = Join-Path $PSScriptRoot '..\.agents\plugins\marketplace.json'
$manifestPath = Join-Path $pluginRoot '.codex-plugin\plugin.json'

$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$marketplace = Get-Content -Raw $marketplacePath | ConvertFrom-Json
$skillFiles = Get-ChildItem (Join-Path $pluginRoot 'skills') -Directory |
    ForEach-Object { Join-Path $_.FullName 'SKILL.md' }

if ($manifest.name -ne 'collab-handoff') { throw 'Plugin name must be collab-handoff.' }
if ($manifest.version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$') { throw 'Plugin version must be semver.' }
if ($manifest.skills -ne './skills/') { throw 'Plugin skills path must be ./skills/.' }
if ($marketplace.name -ne 'collab-handoff-community') { throw 'Unexpected marketplace name.' }
if ($marketplace.plugins[0].source.path -ne './plugins/collab-handoff') { throw 'Unexpected marketplace plugin path.' }
if (@($skillFiles | Where-Object { -not (Test-Path $_) -or -not ((Get-Content -Raw $_).StartsWith("---`n")) }).Count -gt 0) {
    throw 'Every skill must have SKILL.md with YAML frontmatter.'
}

Write-Output 'Structural plugin validation passed.'
