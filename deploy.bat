@echo off
echo ==============================================
echo  AUTOMATIC DEPLOY TO GITHUB ^& NETLIFY
echo ==============================================
echo.

:: Menambahkan semua perubahan
echo [+] Menambahkan perubahan ke Git...
git add .

:: Membuat pesan commit otomatis dengan timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set commit_msg="auto: update chatbot and style %datetime:~0,8%_%datetime:~8,6%"

echo [+] Melakukan commit dengan pesan: %commit_msg%
git commit -m %commit_msg%

:: Push ke remote repository (GitHub)
echo [+] Mengunggah kode ke GitHub (branch main)...
git push origin main

echo.
echo ==============================================
echo  MELAKUKAN DEPLOY DIREK KE NETLIFY
echo ==============================================
echo [+] Menjalankan Netlify Production Deploy...
:: Menjalankan deployment menggunakan Netlify CLI dengan Site ID yang sesuai
npx netlify deploy --prod --site=1b63904c-c953-4fb8-b36f-e00a4b832a1c

echo.
echo ==============================================
echo  SUKSES! Perubahan telah terunggah ke GitHub
echo  dan dideploy ke Netlify:
echo  https://iso27001-chatbot.netlify.app/
echo ==============================================
pause
