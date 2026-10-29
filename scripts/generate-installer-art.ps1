param([string]$Root = (Join-Path $PSScriptRoot '..'))

Add-Type -AssemblyName System.Drawing

$markPath = Join-Path $Root 'src-tauri/icons/installer/mark.png'
$outDir = Join-Path $Root 'src-tauri/icons/installer'
$mark = [System.Drawing.Image]::FromFile($markPath)
$bg = [System.Drawing.Color]::FromArgb(32, 32, 32)
$fg = [System.Drawing.Color]::FromArgb(240, 240, 237)
$muted = [System.Drawing.Color]::FromArgb(163, 163, 160)

function New-Bitmap([int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear($bg)
  return @($bitmap, $graphics)
}

function Draw-Text($graphics, [string]$text, [float]$size, [System.Drawing.FontStyle]$style, $color, [float]$x, [float]$y) {
  $font = New-Object System.Drawing.Font('Segoe UI', $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush($color)
  $graphics.DrawString($text, $font, $brush, $x, $y)
  $brush.Dispose()
  $font.Dispose()
}

function Save-Art($bitmap, $graphics, [string]$name) {
  $graphics.Dispose()
  $path = Join-Path $outDir $name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bitmap.Dispose()
  Write-Output $path
}

# NSIS header (150 x 57)
$pair = New-Bitmap 150 57
$bmp = $pair[0]; $g = $pair[1]
$g.DrawImage($mark, [System.Drawing.Rectangle]::new(12, 12, 33, 33))
Draw-Text $g 'ArcaX' 18 ([System.Drawing.FontStyle]::Bold) $fg 52 13
Draw-Text $g 'S3 Explorer' 9 ([System.Drawing.FontStyle]::Regular) $muted 53 34
Save-Art $bmp $g 'nsis-header.bmp'

# NSIS sidebar (164 x 314)
$pair = New-Bitmap 164 314
$bmp = $pair[0]; $g = $pair[1]
$g.DrawImage($mark, [System.Drawing.Rectangle]::new(50, 54, 64, 64))
Draw-Text $g 'ArcaX' 24 ([System.Drawing.FontStyle]::Bold) $fg 48 132
Draw-Text $g 'S3 EXPLORER' 9 ([System.Drawing.FontStyle]::Regular) $muted 42 164
$pen = New-Object System.Drawing.Pen($muted, 1)
$g.DrawLine($pen, 24, 196, 140, 196)
$pen.Dispose()
Draw-Text $g 'TAURI · REACT · RUST' 7 ([System.Drawing.FontStyle]::Regular) $muted 28 276
Save-Art $bmp $g 'nsis-sidebar.bmp'

# WiX banner (493 x 58)
$pair = New-Bitmap 493 58
$bmp = $pair[0]; $g = $pair[1]
$g.DrawImage($mark, [System.Drawing.Rectangle]::new(18, 13, 32, 32))
Draw-Text $g 'ArcaX' 20 ([System.Drawing.FontStyle]::Bold) $fg 60 14
Draw-Text $g 'S3 Explorer' 10 ([System.Drawing.FontStyle]::Regular) $muted 410 20
Save-Art $bmp $g 'wix-banner.bmp'

# WiX dialog image (493 x 312)
$pair = New-Bitmap 493 312
$bmp = $pair[0]; $g = $pair[1]
$g.DrawImage($mark, [System.Drawing.Rectangle]::new(198, 58, 96, 96))
$font = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush($fg)
$size = $g.MeasureString('ArcaX', $font)
$g.DrawString('ArcaX', $font, $brush, [float]((493 - $size.Width) / 2), 180)
$font.Dispose(); $brush.Dispose()
$font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush($muted)
$text = 'S3-compatible object storage'
$size = $g.MeasureString($text, $font)
$g.DrawString($text, $font, $brush, [float]((493 - $size.Width) / 2), 226)
$font.Dispose(); $brush.Dispose()
Save-Art $bmp $g 'wix-dialog.bmp'

$mark.Dispose()
