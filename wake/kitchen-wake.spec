from pathlib import Path

from PyInstaller.utils.hooks import collect_all


wake_dir = Path(SPECPATH)
sherpa_datas, sherpa_binaries, sherpa_hiddenimports = collect_all("sherpa_onnx")
sentencepiece_datas, sentencepiece_binaries, sentencepiece_hiddenimports = collect_all("sentencepiece")

a = Analysis(
    [str(wake_dir / "listener.py")],
    pathex=[str(wake_dir)],
    binaries=sherpa_binaries + sentencepiece_binaries,
    datas=sherpa_datas + sentencepiece_datas,
    hiddenimports=sherpa_hiddenimports + sentencepiece_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="kitchen-wake",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="kitchen-wake",
)
