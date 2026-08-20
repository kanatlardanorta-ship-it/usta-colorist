# USTA Colorist — TRT-2 yayın grade

Premiere Pro’da kurgu bitmiş, sekans duplicate, yalnız **V1**, klipler **S-Log + Input LUT**. USTA tek tıkla her klibe uzman colorist Basic Correction yazar, klipleri birbirine oturtur, **Broadcast Colors** ile TRT-2 legal Rec.709 teslim eder.

Input LUT silinmez. İkinci bir Lumetri yığılmaz. Beğenmezsen **Ctrl+Z** (tek undo grubu).

---

## Paket

| Yol | Ne işe yarar |
|---|---|
| `cep/com.usta.colorist/` | Premiere panel — **Window → Extensions → USTA Colorist** |
| `scripts/USTA-TRT2-Grade.jsx` | CEP istemez. **File → Scripts → Run Script File** |
| `scripts/USTA-Export-Frames.jsx` | V1’deki her klibin orta karesini PNG basar (tezgâh için) |
| `luts/USTA-TRT2-Belgesel.cube` | İsteğe bağlı Creative LUT (Input LUT’un **üstüne**, look) |

Önerilen yol: CEP panel **veya** JSX. İkisi aynı motor.

---

## 1. CEP kurulumu (bir kez)

### Unsigned eklenti izni

Windows PowerShell (yönetici gerekmez):

```bat
reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.13 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.14 /v PlayerDebugMode /t REG_SZ /d 1 /f
```

macOS Terminal:

```sh
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.13 PlayerDebugMode 1
defaults write com.adobe.CSXS.14 PlayerDebugMode 1
```

Premiere 2022–2026 / CSXS 11–14 kapsanır.

### Klasör

`cep/com.usta.colorist` klasörünün **içini değil, kendisini** kopyala:

```
Windows:  %APPDATA%\Adobe\CEP\extensions\com.usta.colorist
macOS:    ~/Library/Application Support/Adobe/CEP/extensions/com.usta.colorist
```

Hedefte `CSXS/manifest.xml`, `jsx/host.jsx`, `index.html` görünmeli.

Premiere’i **tamamen kapat, aç.** Window → Extensions → **USTA Colorist**.

---

## 2. Sekansta ne yapılır

1. Orijinal kurguyu elleme. Duplicate sekansı aç.
2. V1 dışında her şeyi sil (grafik, M1, adjustment — hepsi).
3. V1’de yalnız ham kamera klipleri, **Input LUT uygulanmış**, başka Lumetri ayarı yok.
4. Panoda **V1’i TRT-2 Grade Et**.

USTA her klibe:

- Lumetri yoksa ekler; varsa **mevcut** Lumetri’nin Basic Correction’ına yazar (Input LUT slot’u durur)
- Temperature / Tint / Exposure / Contrast / Highlights / Shadows / Whites / Blacks / Saturation / Vibrance
- Broadcast Colors (veya Video Limiter) — luma 16–235 legal

Varsayılan look **Belgesel / TRT-2 kültür**: hafif ılık ten, kontrollü highlight, siyahlar ezilmeden oturur, doygunluk abartılmaz.

---

## 3. CEP yoksa: JSX

1. Duplicate V1 sekansı aktif.
2. **File → Scripts → Run Script File**
3. `scripts/USTA-TRT2-Grade.jsx`

Aynı grade, aynı undo.

---

## 4. Klip-klip eşleme (isteğe bağlı, daha doğru)

Tek tık teknik grade tüm V1’e aynı Lumetri setini basar — LUT zaten eşitlemişse yeter.

Güneş / çarşı / gece / ten karışıyorsa:

1. `USTA-Export-Frames.jsx` ile her klibin orta karesini PNG al
2. USTA tezgâhına bırak, look seç, **shot match**
3. Üretilen JSX’i Run Script File — her klip kendi değerini alır

---

## 5. Creative LUT (opsiyonel)

`luts/USTA-TRT2-Belgesel.cube` → Lumetri **Creative** slot. Input LUT’a dokunma.

Broadcast Colors zaten legalizer; cube’u Input’a koyma.

---

## Ne yapmaz

- Input LUT’u silmez / değiştirmez
- V2+ / audio / graphics’e dokunmaz
- Orijinal sekanı yazmaz (duplicate’da çalış)
- İkinci boş Lumetri yığmaz

Sorun olursa Ctrl+Z, panel log’una bak, gerekirse JSX yoluna geç.
