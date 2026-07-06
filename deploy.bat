@echo off
echo ==============================================
echo  AUTOMATIC DEPLOY TO GITHUB ^& RAILWAY
echo ==============================================
echo.

:: Menambahkan semua perubahan
echo [+] Menambahkan perubahan ke Git...
git add .

:: Memancing perubahan unik agar Railway PASTI mere-deploy
set commit_msg="auto: trigger railway redeploy %random%"

echo [+] Melakukan commit dengan pesan: %commit_msg%
git commit -m %commit_msg%

:: Push ke remote repository (GitHub)
echo [+] Mengunggah kode ke GitHub (branch main)...
git push origin main

echo.
echo ==============================================
echo  SUKSES! Perubahan telah terunggah ke GitHub.
echo  Railway akan mendeteksi dan melakukan deploy 
echo  secara otomatis dalam hitungan detik!
echo ==============================================
pause
