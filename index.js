import 'dotenv/config'; // Trigger rebuild for new netlify domain
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import multer from 'multer';
import { createRequire } from 'module';
import crypto from 'crypto';

const require = createRequire(process.cwd() + '/index.js');
const pdfParseModule = require('pdf-parse');
const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default || pdfParseModule);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function parsePdfText(buffer) {
  try {
    // Dukungan untuk pdf-parse versi baru (Class-based, e.g., v2.x)
    if (pdfParseModule && pdfParseModule.PDFParse) {
      const parser = new pdfParseModule.PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text || result;
    }
    // Dukungan untuk pdf-parse versi lama (Function-based, e.g., v1.x)
    if (typeof pdfParse === 'function') {
      const data = await pdfParse(buffer);
      return data.text;
    }
    if (pdfParse && typeof pdfParse.default === 'function') {
      const data = await pdfParse.default(buffer);
      return data.text;
    }
    // Fallback default
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    throw new Error("Gagal mengurai dokumen PDF: " + err.message);
  }
}

const app = express();

// Inisialisasi client Gemini AI menggunakan API key dari .env
console.log("[DIAGNOSTIC] GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
console.log("[DIAGNOSTIC] ASTRA_DB_APPLICATION_TOKEN exists:", !!process.env.ASTRA_DB_APPLICATION_TOKEN);
console.log("[DIAGNOSTIC] ASTRA_DB_API_ENDPOINT exists:", !!process.env.ASTRA_DB_API_ENDPOINT);

let ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const GEMINI_MODEL = "gemini-2.5-flash";

// Middleware
app.use(cors());
app.use(express.json());

// Konfigurasi Memori Chatbot (Default & Fallback)
let activeConfig = {
  temperature: 0.9,
  system_instruction: `Anda adalah asisten pakar internal perusahaan. Tugas Anda adalah membantu menjawab pertanyaan pengguna dengan ramah, akurat, dan profesional berdasarkan dokumen referensi yang disediakan.
  
  ATURAN SAPAAN (GREETINGS):
  Jika pesan terakhir dari pengguna berupa sapaan sederhana (seperti "hello", "hi", "halo", "pagi", "siang", dll.), sambutlah mereka dengan ramah dan singkat. Perkenalkan diri Anda sebagai asisten internal perusahaan dan tanyakan apa yang bisa Anda bantu hari ini. JANGAN langsung memberikan penjelasan panjang lebar atau penjelasan dokumen sebelum ditanya.

  ATURAN PENCARIAN REFERENSI (RAG):
  Gunakan referensi dokumen internal perusahaan berikut untuk menjawab pertanyaan pengguna secara akurat:
  
  [REFERENSI DOKUMEN INTERNAL]
  {{CONTEXT}}
  
  Gunakan informasi di atas sebagai acuan utama Anda dalam menjawab. Jika informasi tidak terdapat dalam referensi dokumen di atas, katakan dengan sopan bahwa Anda tidak memiliki informasi internal tersebut dan sarankan untuk menghubungi departemen terkait.`
};

const ADMIN_TOKEN = 'admin-session-secure-token-2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ')[1];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden: Invalid token' });
  }
  next();
};

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // Limit 10MB

// Menyajikan aset statis dari folder 'public' menggunakan express.static
app.use(express.static('public'));

// Inisialisasi MCP Client untuk terhubung ke MCP Server astra-db
const transport = new StdioClientTransport({
  command: process.execPath, // Menggunakan node runtime yang sama
  args: [
    "C:/Users/Donnyusmar/Downloads/rain/V7LA-SOLO-OpenFang/bin/mcp_registry/node_modules/@datastax/astra-db-mcp/build/index.js"
  ],
  env: {
    ASTRA_DB_APPLICATION_TOKEN: process.env.ASTRA_DB_APPLICATION_TOKEN,
    ASTRA_DB_API_ENDPOINT: process.env.ASTRA_DB_API_ENDPOINT,
    PATH: process.env.PATH
  }
});

const mcpClient = new Client({
  name: "ExpressChatbotClient",
  version: "1.0.0"
}, {
  capabilities: {}
});

let mcpConnected = false;
async function connectMCP() {
  if (process.env.NETLIFY) {
    console.log("[INIT] Running on Netlify serverless. Skipping local MCP connection.");
    return;
  }
  try {
    await mcpClient.connect(transport);
    mcpConnected = true;
    console.log("Successfully connected to Astra DB MCP Server.");
  } catch (error) {
    console.warn("WARN: Failed to connect to Astra DB MCP Server. Fallback active:", error.message);
  }
}
connectMCP();

// === Astra DB Data API Direct Helper ===
// Digunakan untuk semua operasi CRUD langsung ke Astra DB tanpa MCP child process
const ASTRA_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT;
const ASTRA_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN;
const ASTRA_KEYSPACE = 'default_keyspace';

async function astraRequest(collection, method, body) {
  const url = `${ASTRA_ENDPOINT}/api/json/v1/${ASTRA_KEYSPACE}/${collection}`;
  const res = await fetch(url, {
    method: method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Token': ASTRA_TOKEN
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message || 'Astra DB API error');
  }
  return json;
}


// Model: models/gemini-embedding-001 dengan 3072 dimensi (sesuai skema Langflow di Astra DB)
async function getQueryVector(text) {
  try {
    const response = await ai.models.embedContent({
      model: "models/gemini-embedding-001",
      contents: text,
      config: { outputDimensionality: 3072 }
    });
    // Menghandle response structure dari SDK @google/genai terbaru
    if (response && response.embedding && response.embedding.values) {
      return response.embedding.values;
    }
    if (response && response.embeddings && response.embeddings[0]) {
      return response.embeddings[0].values;
    }
    return null;
  } catch (e) {
    console.warn("WARN: Failed to generate embedding vector:", JSON.stringify(e.message || e));
    return null;
  }
}

// Endpoint POST /api/chat - Mendukung percakapan multi-turn dengan Context Retrieval ISO 27001
app.post('/api/chat', async (req, res) => {
  const { conversation } = req.body;

  try {
    if (!Array.isArray(conversation)) {
      throw new Error('Messages must be an array!');
    }

    // Ambil pesan terakhir dari pengguna untuk digunakan sebagai query pencarian dokumen
    const lastUserMessage = conversation[conversation.length - 1]?.text || "";
    let retrievedContext = "";

    // Cek apakah pesan user adalah sapaan sederhana
    const cleanedMessage = lastUserMessage.toLowerCase().trim().replace(/[^a-zA-Z]/g, '');
    const greetings = ['hello', 'hi', 'halo', 'hei', 'hey', 'p', 'siang', 'pagi', 'malam', 'sore', 'assalamualaikum', 'welcome'];
    const isGreeting = greetings.includes(cleanedMessage) || cleanedMessage.length <= 3;

    // Lakukan pencarian dokumen via Astra DB Data API langsung (tidak bergantung MCP child process)
    if (lastUserMessage && !isGreeting) {
      try {
        const queryVector = await getQueryVector(lastUserMessage);
        if (queryVector) {
          // Gunakan find dengan sort vector untuk vector search
          const findResult = await astraRequest('data', 'POST', {
            find: {
              filter: {},
              sort: { $vector: queryVector },
              options: { limit: 5, includeSimilarity: true }
            }
          });

          if (findResult && findResult.data && findResult.data.documents) {
            const validDocs = findResult.data.documents.filter(doc => doc.page_content);
            console.log(`[RAG Search] Berhasil menarik ${validDocs.length} chunk referensi.`);
            validDocs.forEach((doc, idx) => {
              const filename = doc.metadata?.filename || 'Tidak diketahui';
              console.log(`   - Chunk #${idx + 1} dari File: ${filename} (Snippet: "${doc.page_content.substring(0, 80).replace(/\n/g, ' ')}...")`);
            });
            // Langflow menyimpan teks di field 'page_content'
            retrievedContext = validDocs
              .map(doc => `[Sumber: ${doc.metadata?.filename || 'Dokumen Perusahaan'}]\n${doc.page_content}`)
              .join("\n\n");
          } else {
            console.log('[RAG Search] Tidak ada dokumen yang cocok di database.');
          }
        }
      } catch (searchError) {
        console.warn("WARN: Error performing VectorSearch:", searchError.message);
      }
    }

    // Ubah riwayat percakapan menjadi format yang didukung oleh Gemini
    const contents = conversation.map(({ role, text }) => ({
      role,
      parts: [{ text }]
    }));

    // Menyusun systemInstruction khusus secara dinamis
    const sysInstructionTemplate = activeConfig.system_instruction;
    const systemInstruction = sysInstructionTemplate.replace('{{CONTEXT}}', retrievedContext || "Tidak ditemukan dokumen referensi yang relevan di database. Jawab berdasarkan pengetahuan internal Anda mengenai ISO 27001:2022.");

    // Memanggil API Gemini generateContent
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        temperature: activeConfig.temperature,
        systemInstruction: systemInstruction
      }
    });

    res.status(200).json({ result: response.text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- API PANEL ADMIN (FASE 12) ---

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;

  let storedPasswordHash = hashPassword(ADMIN_PASSWORD);
  try {
    // Gunakan astraRequest langsung (tidak bergantung mcpConnected)
    const result = await astraRequest('config', 'POST', {
      findOne: { filter: { _id: "admin-auth" } }
    });
    if (result && result.data && result.data.document && result.data.document.passwordHash) {
      storedPasswordHash = result.data.document.passwordHash;
    }
  } catch (err) {
    console.log("[Login] Belum ada custom password di database (menggunakan default password).");
  }

  if (hashPassword(password) === storedPasswordHash) {
    res.json({ token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ error: 'Password salah!' });
  }
});

// Admin Change Password
app.post('/api/admin/change-password', authenticateAdmin, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  let storedPasswordHash = hashPassword(ADMIN_PASSWORD);
  try {
    const result = await astraRequest('config', 'POST', {
      findOne: { filter: { _id: "admin-auth" } }
    });
    if (result && result.data && result.data.document && result.data.document.passwordHash) {
      storedPasswordHash = result.data.document.passwordHash;
    }
  } catch (err) {
    // Abaikan jika belum ada custom password
  }

  if (hashPassword(oldPassword) !== storedPasswordHash) {
    return res.status(400).json({ error: 'Password lama tidak cocok!' });
  }

  const newHash = hashPassword(newPassword);

  try {
    // Hapus data lama terlebih dahulu untuk menghindari bentrok primary key Astra DB
    try {
      await astraRequest('config', 'POST', {
        deleteOne: { filter: { _id: "admin-auth" } }
      });
    } catch (delErr) {
      // Abaikan jika tidak ditemukan
    }

    // Simpan password baru
    await astraRequest('config', 'POST', {
      insertOne: {
        document: {
          _id: "admin-auth",
          passwordHash: newHash,
          updatedAt: new Date().toISOString()
        }
      }
    });

    // Perbarui variabel di memori env
    process.env.ADMIN_PASSWORD = newPassword;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui kata sandi di database: ' + err.message });
  }
});

// Admin Get Config
app.get('/api/admin/config', authenticateAdmin, (req, res) => {
  res.json({ config: activeConfig });
});

// Admin Update Config
app.post('/api/admin/config', authenticateAdmin, (req, res) => {
  const { temperature, system_instruction, gemini_api_key } = req.body;
  if (temperature !== undefined) activeConfig.temperature = parseFloat(temperature);
  if (system_instruction !== undefined) activeConfig.system_instruction = system_instruction;

  if (gemini_api_key) {
    // Re-inisialisasi Gemini client secara dinamis dengan kunci API baru
    ai = new GoogleGenAI({ apiKey: gemini_api_key });
    process.env.GEMINI_API_KEY = gemini_api_key;
  }
  res.json({ success: true, config: activeConfig });
});

// Admin List Documents — ambil SEMUA halaman dari koleksi 'data' via pagination
app.get('/api/admin/documents', authenticateAdmin, async (req, res) => {
  try {
    let allChunks = [];
    let pageState = undefined;

    // Loop melalui semua halaman sampai nextPageState = null/undefined
    do {
      const options = pageState ? { pageState } : {};
      const body = {
        find: {
          filter: {},
          projection: { 'metadata.filename': 1, 'metadata.source': 1, 'metadata.file_path': 1, 'metadata.file_size': 1, 'metadata.timestamp': 1, '_id': 0 },
          options
        }
      };
      const result = await astraRequest('data', 'POST', body);
      const docs = result.data?.documents || [];
      allChunks = allChunks.concat(docs);
      pageState = result.data?.nextPageState || null;
    } while (pageState);

    // Grupkan chunk per dokumen berdasarkan metadata.filename
    const docMap = new Map();
    for (const chunk of allChunks) {
      const meta = chunk.metadata || {};
      const filename = meta.filename || meta.source ||
                       (meta.file_path || '').split(/[\\/]/).pop() || 'Unknown';

      if (!docMap.has(filename)) {
        docMap.set(filename, {
          _id: filename,
          filename: filename,
          sizeBytes: meta.file_size || 0,
          uploadDate: meta.timestamp || new Date().toISOString(),
          chunkCount: 0
        });
      }
      docMap.get(filename).chunkCount++;
    }

    res.json({ documents: Array.from(docMap.values()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Upload & Ingest PDF ke Astra DB
app.post('/api/admin/documents', authenticateAdmin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada berkas PDF diunggah.' });
    }

    const text = await parsePdfText(req.file.buffer);

    // Chunking text
    const chunkSize = 1000;
    const overlap = 150;
    const chunks = [];
    for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
      const chunk = text.substring(i, i + chunkSize).trim();
      if (chunk.length > 50) {
        chunks.push(chunk);
      }
    }

    const docId = 'doc-' + Date.now();
    const filename = req.file.originalname;

    // Ingest chunks ke koleksi 'data' dengan skema yang sama persis dengan Langflow
    // Field: page_content (teks), $vector (embedding 3072 dim), metadata (objek dengan source)
    let vectorCount = 0;
    for (const chunk of chunks) {
      const vector = await getQueryVector(chunk);
      if (vector) {
        await astraRequest('data', 'POST', {
          insertOne: {
            document: {
              page_content: chunk,           // Sesuai skema Langflow/Langchain
              $vector: vector,               // 3072 dimensi (models/gemini-embedding-001)
              metadata: {
                filename: filename,            // Field utama untuk list & delete
                source: filename,              // Kompatibel dengan skema Langflow
                file_path: filename,           // Kompatibel dengan format Langflow lama
                file_size: req.file.size,      // Ukuran file dalam bytes
                document_id: docId,
                chunk_index: vectorCount
              }
            }
          }
        });
        vectorCount++;
      } else {
        console.warn(`WARN: Embedding gagal untuk chunk ${vectorCount}, chunk diskip.`);
      }
    } // end for chunks
    console.log(`[UPLOAD] File: ${filename} | Chunks: ${chunks.length} | Vectors tersimpan: ${vectorCount}`);
    if (vectorCount === 0 && chunks.length > 0) {
      console.error('[UPLOAD ERROR] Semua embedding gagal! File tidak tersimpan ke Astra DB.');
      return res.status(500).json({ 
        error: 'Gagal menyimpan ke database: embedding vector tidak berhasil dibuat. Cek GEMINI_API_KEY.' 
      });
    }
    res.json({ success: true, docId, chunks: vectorCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Delete Document
app.delete('/api/admin/documents/:id', authenticateAdmin, async (req, res) => {
  const filename = decodeURIComponent(req.params.id);
  try {
    // Hapus semua chunk dari koleksi 'data' berdasarkan metadata.filename (skema Langflow)
    await astraRequest('data', 'POST', {
      deleteMany: { filter: { 'metadata.filename': filename } }
    });

    // Fallback: hapus juga berdasarkan metadata.source (format upload baru kita)
    await astraRequest('data', 'POST', {
      deleteMany: { filter: { 'metadata.source': filename } }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default app;

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production' && !process.env.NETLIFY) {
  app.listen(PORT, () => {
    console.log(`Server ready on http://localhost:${PORT}`);
  });
}
