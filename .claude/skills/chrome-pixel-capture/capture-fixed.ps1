param([string]$Path, [int]$X, [int]$Y, [int]$W, [int]$H)
# Simple fixed-offset screen capture — use ONLY once you have calibrated the
# viewport origin (X,Y in absolute screen px) with a beacon and confirmed the
# infobar is gone. Faster than capture-settled.ps1 for a burst of same-origin
# crops, but blind: it captures whatever is at (X,Y) right now. If the tab
# backgrounds or the infobar reappears you get the wrong pixels silently.
# When in doubt, use capture-settled.ps1 instead.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DpiFix { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[DpiFix]::SetProcessDPIAware() | Out-Null   # MUST be first
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size($W, $H)))
$g.Dispose()
$dir = Split-Path -Parent $Path
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved $Path ($W x $H at screen $X,$Y)"
