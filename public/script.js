const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');
const submitBtn = form.querySelector('button');

// Array untuk menyimpan riwayat percakapan agar Gemini memahami konteks
let conversationHistory = [];

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  // Tampilkan pesan pengguna di UI
  appendMessage('user', userMessage);
  input.value = '';

  // Simpan ke riwayat percakapan (role 'user' sesuai API Gemini)
  conversationHistory.push({ role: 'user', text: userMessage });

  // Ubah status ke loading
  setLoadingState(true);

  // Buat pesan berpikir sementara
  const thinkingMessage = appendMessage('bot', 'Gemini is thinking...');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ conversation: conversationHistory })
    });

    if (!response.ok) {
      throw new Error(`Server returned status: ${response.status}`);
    }

    const data = await response.json();
    
    // Hapus pesan berpikir sementara
    thinkingMessage.remove();

    if (data.error) {
      appendMessage('bot', `ERROR: ${data.error}`);
    } else {
      // Tampilkan respons AI di UI
      appendMessage('bot', data.result);
      // Simpan respons ke riwayat (role 'model' sesuai API Gemini)
      conversationHistory.push({ role: 'model', text: data.result });
    }
  } catch (error) {
    thinkingMessage.remove();
    appendMessage('bot', `Gagal terhubung ke server. Detail: ${error.message}`);
  } finally {
    setLoadingState(false);
  }
});

function appendMessage(sender, text) {
  const msg = document.createElement('div');
  msg.classList.add('message', sender);
  
  if (sender === 'bot') {
    // Parse markdown jika marked.js dimuat, jika tidak gunakan fallback mengganti newline
    if (window.marked && typeof window.marked.parse === 'function') {
      msg.innerHTML = window.marked.parse(text);
    } else {
      msg.innerHTML = text.replace(/\n/g, '<br>');
    }
  } else {
    msg.textContent = text;
  }
  
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msg;
}

function setLoadingState(isLoading) {
  if (isLoading) {
    input.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '...';
  } else {
    input.disabled = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send';
    input.focus();
  }
}
