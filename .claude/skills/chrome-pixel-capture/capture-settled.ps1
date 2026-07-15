param([string]$Path, [int]$X = 1920, [int]$W = 1920, [int]$CropY = 0, [int]$CropH = 46, [int]$CropX = 0, [int]$CropW = 0, [int]$MaxTries = 14)
# Beacon-calibrated screen capture. Requires a 2px magenta (#ff00ff) fixed
# beacon at the page's viewport top (inject it via the extension's
# javascript_tool — see SKILL.md). Finds the beacon row, waits until the frame
# is SETTLED (no "Claude started debugging" infobar shadow bleeding below it),
# then crops the page region relative to the beacon. This defeats the two
# things that break fixed-offset capture: DPI virtualization and the infobar
# that slides in per CDP action, shifting the viewport ~40px.
#
# Crop is measured DOWN from the beacon: CropY/CropH are page-relative px.
# CropX/CropW default to the full strip width; set them to crop a sub-region.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DpiFix { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[DpiFix]::SetProcessDPIAware() | Out-Null   # MUST be first, or captures are scaled/blurry/offset
$probeY = 40; $probeH = 700
function IsMagenta($p) { return ($p.R -gt 200 -and $p.G -lt 80 -and $p.B -gt 200) }
for ($try = 1; $try -le $MaxTries; $try++) {
  $bmp = New-Object System.Drawing.Bitmap($W, $probeH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($X, $probeY, 0, 0, (New-Object System.Drawing.Size($W, $probeH)))
  $g.Dispose()
  $beaconRow = -1
  $scanX2 = [Math]::Min(900, $W - 40)   # scan two x-positions so a magenta pixel in page content can't false-positive
  for ($row = 0; $row -lt ($probeH - 60); $row++) {
    if ((IsMagenta $bmp.GetPixel(8, $row)) -and (IsMagenta $bmp.GetPixel($scanX2, $row)) -and (IsMagenta $bmp.GetPixel(8, ($row + 1)))) { $beaconRow = $row; break }
  }
  if ($beaconRow -ge 0) {
    # Settled = the dark chrome (#161616 ≈ RGB 22) sits directly below the beacon.
    # If the infobar is mid-animation its lighter shadow bleeds here and we wait.
    # (Tune these two sample x's / target RGB to your app's under-beacon color.)
    $settleX = [Math]::Min(1500, $W - 40)
    $c1 = $bmp.GetPixel(8, $beaconRow + 8); $c2 = $bmp.GetPixel($settleX, $beaconRow + 8)
    $settled = ([Math]::Abs($c1.R - 22) -le 3 -and [Math]::Abs($c1.G - 22) -le 3 -and [Math]::Abs($c1.B - 22) -le 3 -and [Math]::Abs($c2.R - 22) -le 3)
    if ($settled) {
      $srcX = if ($CropW -gt 0) { $CropX } else { 0 }
      $srcW = if ($CropW -gt 0) { $CropW } else { $W }
      $rect = New-Object System.Drawing.Rectangle($srcX, ($beaconRow + 2 + $CropY), $srcW, $CropH)
      $crop = $bmp.Clone($rect, $bmp.PixelFormat)
      $bmp.Dispose()
      $dir = Split-Path -Parent $Path
      if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
      $crop.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
      $crop.Dispose()
      "saved $Path (beacon row $beaconRow, try $try)"
      return
    }
  }
  $bmp.Dispose()
  Start-Sleep -Milliseconds 1500
}
throw "no settled beacon frame after $MaxTries tries (tab backgrounded? infobar stuck? beacon not injected?)"
