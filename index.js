import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();

// Inisialisasi client Gemini AI menggunakan API key dari .env
console.log("[DIAGNOSTIC] GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
console.log("[DIAGNOSTIC] ASTRA_DB_APPLICATION_TOKEN exists:", !!process.env.ASTRA_DB_APPLICATION_TOKEN);
console.log("[DIAGNOSTIC] ASTRA_DB_API_ENDPOINT exists:", !!process.env.ASTRA_DB_API_ENDPOINT);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const GEMINI_MODEL = "gemini-2.5-flash";

// Middleware
app.use(cors());
app.use(express.json());

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
  try {
    await mcpClient.connect(transport);
    mcpConnected = true;
    console.log("Successfully connected to Astra DB MCP Server.");
  } catch (error) {
    console.warn("WARN: Failed to connect to Astra DB MCP Server. Fallback active.");
  }
}
connectMCP();

// Helper untuk menghasilkan embedding vector menggunakan Gemini API
async function getQueryVector(text) {
  try {
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: text
    });
    // Menghandle response structure dari SDK @google/genai terbaru
    if (response && response.embedding && response.embedding.values) {
      return response.embedding.values;
    }
    return null;
  } catch (e) {
    console.warn("WARN: Failed to generate embedding vector:", e.message);
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

    // Lakukan pencarian dokumen jika terkoneksi ke MCP Server
    if (mcpConnected && lastUserMessage) {
      try {
        const queryVector = await getQueryVector(lastUserMessage);
        if (queryVector) {
          const searchResponse = await mcpClient.callTool({
            name: "VectorSearch",
            arguments: {
              collectionName: "data",
              queryVector: queryVector,
              limit: 3
            }
          });
          
          if (searchResponse && searchResponse.content) {
            retrievedContext = searchResponse.content.map(c => c.text).join("\n\n");
          }
        }
      } catch (searchError) {
        console.warn("WARN: Error performing VectorSearch in Astra DB:", searchError.message);
      }
    }

    // Ubah riwayat percakapan menjadi format yang didukung oleh Gemini
    const contents = conversation.map(({ role, text }) => ({
      role,
      parts: [{ text }]
    }));

    // Menyusun systemInstruction khusus beserta konteks referensi ISO 27001
    const systemInstruction = `Jawab hanya menggunakan bahasa Indonesia. Anda adalah asisten pakar sertifikasi keamanan informasi. Gunakan referensi dokumen ISO 27001-2022 rm.pdf berikut jika relevan untuk menjawab pertanyaan user:
    
    [REFERENSI DOKUMEN ISO 27001]
    ${retrievedContext || "Tidak ditemukan dokumen referensi yang relevan di database. Jawab berdasarkan pengetahuan internal Anda mengenai ISO 27001:2022."}`;

    // Memanggil API Gemini generateContent
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        temperature: 0.9,
        systemInstruction: systemInstruction
      }
    });

    res.status(200).json({ result: response.text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ready on http://localhost:${PORT}`);
});
