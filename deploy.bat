@echo off
echo ==============================================
echo  AUTOMATIC DEPLOY TO GITHUB & NETLIFY
echo ==============================================
echo.

:: Menambahkan semua perubahan
echo [+] Menambahkan perubahan ke Git...
git add .

:: Meminta pesan commit jika ingin custom, atau gunakan default
set commit_msg="auto: update and sync chatbot features"

echo [+] Melakukan commit dengan pesan: %commit_msg%
git commit -m %commit_msg%

:: Push ke remote repository (GitHub)
echo [+] Mengunggah kode ke GitHub (branch main)...
git push origin main

echo.
echo ==============================================
echo  SUKSES! Perubahan telah terunggah ke GitHub.
echo  Netlify akan mendeteksi dan melakukan deploy 
echo  secara otomatis dalam beberapa saat.
echo ==============================================
pause
