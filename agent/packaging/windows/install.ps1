$ErrorActionPreference = "Stop"
$InstallPath = "C:\Program Files\HelpDesk First"
New-Item -ItemType Directory -Force -Path $InstallPath | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "..\dist\helpdesk-agent.js") (Join-Path $InstallPath "helpdesk-agent.js")
$Action = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$InstallPath\helpdesk-agent.js`" run" -WorkingDirectory $InstallPath
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "HelpDeskFirstAgent" -Action $Action -Principal $Principal -Trigger $Trigger -Force | Out-Null
