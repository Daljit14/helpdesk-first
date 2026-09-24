$ErrorActionPreference = "Stop"
Unregister-ScheduledTask -TaskName "HelpDeskFirstAgent" -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "C:\Program Files\HelpDesk First" -ErrorAction SilentlyContinue
