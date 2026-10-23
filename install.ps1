# SPDX-License-Identifier: MIT
# Copyright (c) 2026 cain19811028

# voltdex One-Click Installer for Windows
# Copies skill into Claude Code, Cursor, and Antigravity user directories and displays MCP configuration.

param(
    [string]$TargetHome = $HOME,
    [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"
$SkillName = "voltdex"
$RepoRoot = $PSScriptRoot

Write-Host "Installing $SkillName..." -ForegroundColor Cyan

# Target directories
$ClaudeSkills = Join-Path $TargetHome ".claude\skills\$SkillName"
$CursorSkills = Join-Path $TargetHome ".cursor\skills\$SkillName"
$GeminiSkills = Join-Path $TargetHome ".gemini\antigravity-ide\skills\$SkillName"

function Copy-SkillDir ($Destination) {
    if (-not $Destination -or -not $Destination.EndsWith($SkillName)) {
        throw "Safety error: Invalid destination path $Destination"
    }
    if (Test-Path -LiteralPath $Destination) {
        $Existing = Get-Item -LiteralPath $Destination -Force
        # A symlink or junction points at someone's working copy; a recursive remove could delete that copy.
        if ($Existing.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            Write-Warning "Skipped ${Destination}: it is a link, left untouched."
            return
        }
        if ($Existing.FullName.TrimEnd('\') -eq (Get-Item -LiteralPath $RepoRoot).FullName.TrimEnd('\')) {
            Write-Host "Already installed in place: $Destination" -ForegroundColor Green
            return
        }
        # Only clear a directory that positively holds an earlier install of this skill.
        $Marker = Join-Path $Destination "SKILL.md"
        $IsPreviousInstall = (Test-Path -LiteralPath $Marker) -and
            (Select-String -LiteralPath $Marker -Pattern "^name:\s*$SkillName\s*$" -Quiet)
        $IsEmpty = -not (Get-ChildItem -LiteralPath $Destination -Force | Select-Object -First 1)
        if (-not $IsPreviousInstall -and -not $IsEmpty) {
            throw "Refusing to replace ${Destination}: it is not a $SkillName install."
        }
        Remove-Item -LiteralPath $Destination -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $Payload = @(
        "index.mjs",
        "package.json",
        "SKILL.md",
        "LICENSE",
        "NOTICE.md",
        "THIRD_PARTY_NOTICES.md",
        "README.zh-TW.md",
        "src",
        "data"
    )
    foreach ($Item in $Payload) {
        $SourcePath = Join-Path $RepoRoot $Item
        if (Test-Path -LiteralPath $SourcePath) {
            Copy-Item -LiteralPath $SourcePath -Destination $Destination -Recurse -Force
        }
    }
    Write-Host "Installed skill to: $Destination" -ForegroundColor Green
}

if ($TargetDir) {
    Copy-SkillDir $TargetDir
    $ExampleSkillDir = $TargetDir
} else {
    Copy-SkillDir $ClaudeSkills
    Copy-SkillDir $CursorSkills
    Copy-SkillDir $GeminiSkills
    $ExampleSkillDir = $ClaudeSkills
}

Write-Host "`nSkill installation complete!" -ForegroundColor Cyan
Write-Host "Try querying with:" -ForegroundColor Yellow
Write-Host "  node `"$ExampleSkillDir\index.mjs`" Charizard --brief"

Write-Host "`nMCP Server Configuration snippet:" -ForegroundColor Cyan
$McpPath = "$RepoRoot\index.mjs".Replace('\', '/')
$Config = [ordered]@{
    mcpServers = [ordered]@{
        voltdex = [ordered]@{
            command = "node"
            args = @($McpPath, "--mcp")
        }
    }
}
Write-Host ($Config | ConvertTo-Json -Depth 5) -ForegroundColor Gray
