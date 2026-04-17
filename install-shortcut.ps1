# ClawBoard - Cree l'icone + le raccourci Bureau
# Usage : clic droit -> "Executer avec PowerShell"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Add-Type -AssemblyName System.Drawing

# -- 1. Genere launcher.ico --------------------------------------------------

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Fond sombre
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 22, 22, 42))
$g.FillRectangle($bgBrush, 0, 0, $size, $size)

# Cercle violet
$circleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 139, 92, 246))
$g.FillEllipse($circleBrush, 18, 18, 220, 220)

# Eclair blanc
$pts = New-Object 'System.Drawing.Point[]' 6
$pts[0] = [System.Drawing.Point]::new(162, 30)
$pts[1] = [System.Drawing.Point]::new(96,  138)
$pts[2] = [System.Drawing.Point]::new(138, 138)
$pts[3] = [System.Drawing.Point]::new(86,  226)
$pts[4] = [System.Drawing.Point]::new(172, 112)
$pts[5] = [System.Drawing.Point]::new(126, 112)
$wBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillPolygon($wBrush, $pts)
$g.Dispose()

# Encode PNG puis encapsule dans ICO
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngData = $ms.ToArray()

$iconStream = New-Object System.IO.MemoryStream
$writer     = New-Object System.IO.BinaryWriter($iconStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$pngData.Length)
$writer.Write([uint32]22)
$writer.Write($pngData)
$writer.Flush()

$icoPath = Join-Path $ProjectDir "launcher.ico"
[System.IO.File]::WriteAllBytes($icoPath, $iconStream.ToArray())
Write-Host "OK - Icone creee : $icoPath"

# -- 2. Cree le raccourci sur le Bureau --------------------------------------

$batPath = Join-Path $ProjectDir "start-launcher.vbs"
$lnkPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "ClawBoard.lnk"

$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut($lnkPath)
$lnk.TargetPath       = "wscript.exe"
$lnk.Arguments         = "`"$batPath`""
$lnk.WorkingDirectory = $ProjectDir
$lnk.IconLocation     = "$icoPath,0"
$lnk.Description      = "Demarrer ClawBoard (sans fenetre console)"
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "OK - Raccourci cree : $lnkPath"
Write-Host ""
Write-Host "Double-clique sur ClawBoard sur ton Bureau pour lancer."
Write-Host ""
