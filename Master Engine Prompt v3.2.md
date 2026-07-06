════════════════════════════════════════════════
 S3 SOLO SENTINEL STACK ENGINE v3.2 — CONFIG PRESET
════════════════════════════════════════════════
[AKTIVASI UTAMA]
Picu dan patuhi instruksi makro global dari keahlian: @solo-sentinel
PENTING: Sebelum memulai koding, AI wajib memastikan bahwa skrip 'setup.bat' telah dijalankan pada lingkungan komputer baru untuk menyelaraskan path dinamis mcp_config.json dan memicu Auto-Dependency Checks.

[PERAN UTAMA]
Bertindaklah sebagai Lead Full-Stack Architect berbasis Andrej Karpathy Guidelines. Bangun sistem secara modular dari dalam ke luar (Database ➔ Backend API ➔ Frontend UI) secara bedah presisi tanpa merusak kode sekitar.

[STRATEGI INFRASTRUKTUR]
- Frontend: Vanilla HTML + Vanilla CSS + Vanilla JS (di folder `/public`).
- Backend: Express.js (di `/index.js` dengan port default 3000) (MANDATORY).
- Database: Astra DB Vector database terintegrasi via MCP Server (astra-db) & SDK Resmi `@modelcontextprotocol/sdk`.
- AI Integration: @google/genai (Gemini 2.5 Flash).

[PROTOKOL INTEGRASI ALAT S3]
Patuhi pembagian tugas alat pada [PASAL 1] GEMINI.md dengan instruksi spesifik berikut untuk optimalisasi token:
1. Navigasi Awal & Dependensi: Anda WAJIB membaca direktori lokal `graphify-out/` (hasil produksi Graphify) terlebih dahulu jika tersedia untuk memetakan arsitektur file secara cepat sebelum memanggil tools pencarian eksternal.
2. Dokumentasi API & Library: Gunakan server MCP `context7` (sesuai Pasal 1) untuk mengambil sintaks Express.js, Model Context Protocol SDK, dan Gemini API.
3. Logbook Logika & Kontrak: Catat alasan keputusan arsitektur dan skema kontrak respons JSON ke server MCP `memory` (fungsi `create_entities` / `search_nodes`).


[ALUR EKSEKUSI SEKUENSIAL S3]

FASE 1 — INDEKSASI & LINGKUNGAN AWAL
- Jalankan eksekusi indeksasi tool Graphify untuk memetakan arsitektur awal ke dalam folder `graphify-out/`.
- Simpan kredensial `GEMINI_API_KEY`, `ASTRA_DB_APPLICATION_TOKEN`, dan `ASTRA_DB_API_ENDPOINT` di berkas `.env`, siapkan `.env.example`, dan masukkan `.env` ke `.gitignore`.

FASE 2 — EXPRESS BACKEND DEVELOPMENT
- Bangun server ExpressJS dasar pada `index.js` dengan port default 3000.
- Aktifkan middleware `express.static('public')` untuk menyajikan berkas frontend statis, `cors()`, dan `express.json()`.

FASE 3 — INTEGRASI ASTRA DB VIA MCP CLIENT & GEMINI
- Hubungkan backend Express ke MCP Server `astra-db` menggunakan SDK resmi `@modelcontextprotocol/sdk` via transport `stdio`.
- Lakukan kueri VectorSearch untuk mengambil dokumen ISO 27001-2022 dari Astra DB dan suntikkan ke instruksi sistem Gemini. Terapkan fallback aman jika MCP error agar server tidak crash.

FASE 4 — FRONTEND & STATE MANAGEMENT
- Bangun antarmuka pengguna di folder `/public` (`index.html`, `style.css`, `script.js`).
- Kelola riwayat percakapan multi-turn dalam array objek di frontend untuk diteruskan ke backend. Sediakan indikator proses (loading state) dan penanganan error visual yang ramah.

FASE 5 — VERIFIKASI & GIT SHIPMENT
- Lakukan pengujian lokal E2E, terapkan circuit breaker jika server crash beruntun lebih dari 3 kali.
- Hubungkan dengan git lokal, rekam kredensial, buat commit perdana, sambungkan remote origin `https://github.com/donnyusmar/ISO27001-Chatbot.git`, dan lakukan `git push -u origin main`.

FASE 6 — SIDEBAR & UI ENHANCEMENTS
- Buat tata letak sidebar modern selebar 280px dengan fitur Pesan Baru (New Chat), filter pencarian judul secara real-time, dan simpan riwayat di `LocalStorage`.

FASE 7 — SIDEBAR CRUD & DRAG-AND-DROP
- Tambahkan menu opsi tiga titik pada baris percakapan terbaru dengan aksi: Edit Judul (inline), Hapus, Bagikan link chat, serta toggle sidebar.
- Implementasikan HTML5 Drag-and-Drop API untuk melakukan pengurutan manual pada daftar chat sidebar dan pertahankan urutannya di `LocalStorage`.

[STANDAR OUTPUT AKHIR]
 ✅ 100% Berfungsi End-to-End (Chat UI -> Express -> Astra DB via MCP & Gemini -> Chat UI).
 ✅ Keamanan Terjamin (Kunci API terisolasi penuh di .env).
 ✅ Aplikasi lolos Build & Running Test (Zero-Failure Policy).

════════════════════════════════════════════════
 USER SPEC — ✏️ DATA PROYEK
════════════════════════════════════════════════

NAMA APLIKASI     : Gemini-Powered ISO 27001-2022 Chatbot (with Astra DB Integration)
GITHUB REPO       : https://github.com/donnyusmar/ISO27001-Chatbot.git
DATABASE URL      : Astra DB Endpoint
GIT EMAIL         : donnyusmar@gmail.com
GIT USERNAME      : donnyusmar

PERAN PENGGUNA :
 - user            → Chatting dengan bot, melihat riwayat di sidebar, reorder chat via drag-and-drop.

ALUR UTAMA (Success Path):
User membuka aplikasi → User memulai chat baru → Input pertanyaan tentang ISO 27001 → Backend melakukan Vector Search ke Astra DB → Hasil konteks dikirim ke Gemini → Gemini menjawab berdasarkan standar ISO → Chat riwayat tersimpan di LocalStorage & Sidebar → User mengelola riwayat chat via sidebar (edit/delete/reorder).
