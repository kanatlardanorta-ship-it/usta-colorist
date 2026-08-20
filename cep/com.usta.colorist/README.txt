USTA Colorist — Premiere Pro CEP
================================
S-Log + senin Input LUT'un → TRT-2 Rec.709 legal broadcast grade.

KURULUM (bir kez)
-----------------
1) Unsigned eklenti izni (PowerShell, yönetici gerekmez):

   reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f
   reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
   reg add HKCU\Software\Adobe\CSXS.13 /v PlayerDebugMode /t REG_SZ /d 1 /f
   reg add HKCU\Software\Adobe\CSXS.14 /v PlayerDebugMode /t REG_SZ /d 1 /f

   macOS:
     defaults write com.adobe.CSXS.11 PlayerDebugMode 1
     defaults write com.adobe.CSXS.12 PlayerDebugMode 1
     defaults write com.adobe.CSXS.13 PlayerDebugMode 1
     defaults write com.adobe.CSXS.14 PlayerDebugMode 1

2) Bu klasoru kopyala (icindeki CSXS, js, jsx, css duracak):

   Windows: %APPDATA%\Adobe\CEP\extensions\com.usta.colorist
   macOS:   ~/Library/Application Support/Adobe/CEP/extensions/com.usta.colorist

3) Premiere'i tamamen kapat, ac.
   Window > Extensions > USTA Colorist

KULLANIM
--------
- Duplicate V1 sekansini ac (yalniz kamera klipleri).
- Input LUT duruyor olsun. USTA onu silmez, Basic Correction yazar.
- "V1'i TRT-2 Grade Et"
- Undo: Ctrl/Cmd+Z (tek grup)

CEP calismazsa: scripts/USTA-TRT2-Grade.jsx
File > Scripts > Run Script File

CIKTI
-----
Siyah ~16 IRE, beyaz legal, sicak belgesel ten, Broadcast Colors.
