Add-Type -AssemblyName System.Drawing

$gameRoot = Split-Path $PSScriptRoot -Parent
$srcDir = Split-Path $gameRoot -Parent
$outRoot = Join-Path $gameRoot "images\sprites"

function Test-EmptyPixel([System.Drawing.Color]$c) {
    if ($c.A -lt 8) { return $true }
    if ($c.R -lt 12 -and $c.G -lt 12 -and $c.B -lt 12) { return $true }
    return $false
}

function Get-ContentBounds([System.Drawing.Bitmap]$bmp) {
    $w = $bmp.Width
    $h = $bmp.Height
    $bounds = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $data = $bmp.LockBits($bounds, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $data.Stride
    $len = $stride * $h
    $buf = New-Object byte[] $len
    [Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $len)
    $bmp.UnlockBits($data)

    $minX = $w
    $minY = $h
    $maxX = -1
    $maxY = -1
    for ($y = 0; $y -lt $h; $y++) {
        $row = $y * $stride
        for ($x = 0; $x -lt $w; $x++) {
            $o = $row + $x * 4
            $a = $buf[$o + 3]
            if ($a -lt 8) { continue }
            $r = $buf[$o + 2]
            $g = $buf[$o + 1]
            $b = $buf[$o]
            if ($r -lt 12 -and $g -lt 12 -and $b -lt 12) { continue }
            if ($x -lt $minX) { $minX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
    if ($maxX -lt $minX) { return $null }
    return @{ X = $minX; Y = $minY; W = ($maxX - $minX + 1); H = ($maxY - $minY + 1) }
}

function Export-Cell([System.Drawing.Bitmap]$src, [int]$sx, [int]$sy, [int]$sw, [int]$sh) {
    $rect = New-Object System.Drawing.Rectangle $sx, $sy, $sw, $sh
    $cell = $src.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bounds = Get-ContentBounds $cell
    if (-not $bounds) {
        $cell.Dispose()
        return $null
    }
    $trim = $cell.Clone(
        (New-Object System.Drawing.Rectangle $bounds.X, $bounds.Y, $bounds.W, $bounds.H),
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $cell.Dispose()
    return $trim
}

function Normalize-Frames([System.Drawing.Bitmap[]]$frames, [int]$pad) {
    $maxW = 0
    $maxH = 0
    foreach ($f in $frames) {
        if ($null -eq $f) { continue }
        if ($f.Width -gt $maxW) { $maxW = $f.Width }
        if ($f.Height -gt $maxH) { $maxH = $f.Height }
    }
    if ($maxW -le 0 -or $maxH -le 0) {
        throw "No visible sprite content found while normalizing frames."
    }
    $maxW += $pad * 2
    $maxH += $pad * 2
    $normalized = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
    foreach ($f in $frames) {
        if ($null -eq $f) { continue }
        $canvas = New-Object System.Drawing.Bitmap $maxW, $maxH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($canvas)
        $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $x = [int][Math]::Round(($maxW - $f.Width) / 2)
        $y = $maxH - $pad - $f.Height
        $g.DrawImage($f, $x, $y)
        $g.Dispose()
        $f.Dispose()
        [void]$normalized.Add($canvas)
    }
    return ,$normalized.ToArray()
}

function Save-Frames([System.Drawing.Bitmap[]]$frames, [string]$folder, [string]$prefix) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    for ($i = 0; $i -lt $frames.Length; $i++) {
        $name = if ($frames.Length -eq 1) { "$prefix.png" } else { ("{0}-{1:D2}.png" -f $prefix, $i) }
        $path = Join-Path $folder $name
        $frames[$i].Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
        $frames[$i].Dispose()
    }
}

function Get-SheetPath([long]$sizeHint) {
    $match = Get-ChildItem -LiteralPath $srcDir -File -Filter *.png |
        Where-Object { $_.Name -notmatch '^[0-9a-f-]{36}\.png$' -and $_.Length -eq $sizeHint } |
        Select-Object -First 1
    if (-not $match) {
        throw "Could not find sprite sheet with size hint $sizeHint in $srcDir"
    }
    return $match.FullName
}

$sheets = @(
    @{
        File = Get-SheetPath 1043368
        Rows = 1
        Cols = 2
        ColBounds = @(0, 887, 1774)
        RowBounds = @(0, 887)
        Sets = @(
            @{ Row = 0; Cols = @(0); Char = "white"; Name = "front"; Count = 1 }
            @{ Row = 0; Cols = @(1); Char = "yellow"; Name = "front"; Count = 1 }
        )
    }
    @{
        File = Get-SheetPath 950216
        Rows = 2
        Cols = 5
        ColBounds = @(0, 355, 710, 1064, 1419, 1774)
        RowBounds = @(0, 444, 887)
        Sets = @(
            @{ Row = 0; Cols = @(0, 1, 2, 3, 4); Char = "white"; Name = "run"; Count = 5 }
            @{ Row = 1; Cols = @(0, 1, 2, 3, 4); Char = "yellow"; Name = "run"; Count = 5 }
        )
    }
    @{
        File = Get-SheetPath 1652807
        Rows = 2
        Cols = 4
        ColBounds = @(0, 384, 768, 1152, 1536)
        RowBounds = @(0, 512, 1024)
        Sets = @(
            @{ Row = 0; Cols = @(0, 1, 2, 3); Char = "white"; Name = "recover"; Count = 4 }
            @{ Row = 1; Cols = @(0, 1, 2, 3); Char = "yellow"; Name = "recover"; Count = 4 }
        )
    }
    @{
        File = Get-SheetPath 1606645
        Rows = 2
        Cols = 4
        ColBounds = @(0, 384, 768, 1152, 1536)
        RowBounds = @(0, 512, 1024)
        Sets = @(
            @{ Row = 0; Cols = @(0, 1, 2, 3); Char = "white"; Name = "hurt"; Count = 4 }
            @{ Row = 1; Cols = @(0, 1, 2, 3); Char = "yellow"; Name = "hurt"; Count = 4 }
        )
    }
)

$manifest = @{
    white = @{ front = 1; run = 5; recover = 4; hurt = 4 }
    yellow = @{ front = 1; run = 5; recover = 4; hurt = 4 }
}

Remove-Item -LiteralPath $outRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

foreach ($sheet in $sheets) {
    $src = New-Object System.Drawing.Bitmap $sheet.File
    foreach ($set in $sheet.Sets) {
        $raw = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
        foreach ($colIndex in $set.Cols) {
            $sx = $sheet.ColBounds[$colIndex]
            $ex = $sheet.ColBounds[$colIndex + 1]
            $sy = $sheet.RowBounds[$set.Row]
            $ey = $sheet.RowBounds[$set.Row + 1]
            $cell = Export-Cell $src $sx $sy ($ex - $sx) ($ey - $sy)
            if ($null -ne $cell) { [void]$raw.Add($cell) }
        }
        if ($raw.Count -ne $set.Count) {
            throw ("Expected {0} frames for {1}/{2}, got {3}." -f $set.Count, $set.Char, $set.Name, $raw.Count)
        }
        $frames = Normalize-Frames $raw.ToArray() 8
        $folder = Join-Path $outRoot $set.Char
        Save-Frames $frames $folder $set.Name
    }
    $src.Dispose()
}

$manifestPath = Join-Path $outRoot "manifest.json"
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-Output "Saved sprites to $outRoot"
Get-ChildItem -LiteralPath $outRoot -Recurse -File | ForEach-Object { $_.FullName.Replace($outRoot, "") }
