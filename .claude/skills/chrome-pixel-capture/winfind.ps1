param(
  [string]$TitleMatch = "Office Seat Planner",
  [ValidateSet("restore", "move", "maximize", "minimize", "rect")]
  [string]$Action = "restore",
  [int]$X = 1920, [int]$Y = 0, [int]$W = 1920, [int]$H = 1032
)
# Find the real Chrome TOP-LEVEL window by title substring and act on it.
#
# WHY EnumWindows and not Get-Process: when several Chrome windows share one
# process, Get-Process .MainWindowHandle returns the WRONG handle. Enumerating
# visible top-level windows and matching the title is the only reliable pick.
# The claude-in-chrome `resize_window` MCP tool is a SILENT NO-OP on a
# maximized window (reports success, innerWidth unchanged) — use this instead.
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int ht, bool repaint);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static string Match;
  public static IntPtr Target = IntPtr.Zero;
  public static bool Cb(IntPtr h, IntPtr lp) {
    if (!IsWindowVisible(h)) return true;
    var sb = new StringBuilder(300); GetWindowText(h, sb, 300);
    if (sb.ToString().Contains(Match)) Target = h;
    return true;
  }
}
"@
[W]::Match = $TitleMatch
[W]::EnumWindows([W+EnumWindowsProc][W]::Cb, [IntPtr]::Zero) | Out-Null
if ([W]::Target -eq [IntPtr]::Zero) { throw "no visible window matching '$TitleMatch'" }
# NOTE: not $h — PowerShell variables are case-insensitive, so $h would clobber
# the -H height parameter (both resolve to the same variable).
$hwnd = [W]::Target
switch ($Action) {
  # SW_RESTORE (9) un-minimizes/un-maximizes so MoveWindow behaves; then foreground.
  "restore"  { [W]::ShowWindow($hwnd, 9) | Out-Null; [W]::SetForegroundWindow($hwnd) | Out-Null; "restored+foreground" }
  "move"     { [W]::ShowWindow($hwnd, 9) | Out-Null; [W]::MoveWindow($hwnd, $X, $Y, $W, $H, $true) | Out-Null; [W]::SetForegroundWindow($hwnd) | Out-Null; "moved to $X,$Y ${W}x${H}" }
  "maximize" { [W]::ShowWindow($hwnd, 3) | Out-Null; "maximized" }     # SW_MAXIMIZE
  "minimize" { [W]::ShowWindow($hwnd, 6) | Out-Null; "minimized" }     # SW_MINIMIZE
  "rect"     { $r = New-Object W+RECT; [W]::GetWindowRect($hwnd, [ref]$r) | Out-Null; "$($r.Left),$($r.Top),$($r.Right),$($r.Bottom)" }
}
