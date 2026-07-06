const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const chatBox = document.getElementById('chat-box');
const submitBtn = form.querySelector('button');

const newChatBtn = document.getElementById('new-chat-btn');
const searchInput = document.getElementById('search-threads');
const threadsList = document.getElementById('threads-list');
const showMoreBtn = document.getElementById('show-more-threads');

// Elemen-elemen Sidebar Toggle
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const expandSidebarBtn = document.getElementById('expand-sidebar-btn');

// Kelola state threads dan riwayat chat dari LocalStorage
let threads = JSON.parse(localStorage.getItem('chat_threads')) || [];
let currentThreadId = localStorage.getItem('current_thread_id') || null;
let conversationHistory = [];
let displayLimit = 8; // Batasan tampilan awal daftar "Terbaru"
let draggedThreadId = null; // Menyimpan id thread yang sedang di-drag

// Helper: Auto-collapse sidebar di mobile
function autoCollapseMobileSidebar() {
  if (window.innerWidth <= 768) {
    sidebar.classList.add('collapsed');
    expandSidebarBtn.style.display = 'flex';
  }
}

// Event: Expand/Collapse Sidebar
toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.add('collapsed');
  expandSidebarBtn.style.display = 'flex';
});

expandSidebarBtn.addEventListener('click', () => {
  sidebar.classList.remove('collapsed');
  expandSidebarBtn.style.display = 'none';
});

// Tutup sidebar di mobile saat klik area main-content
document.querySelector('.main-content').addEventListener('click', () => {
  autoCollapseMobileSidebar();
});

// Tutup dropdown di mana saja saat diklik di luar dropdown
document.addEventListener('click', (e) => {
  if (!e.target.closest('.thread-options-btn') && !e.target.closest('.thread-dropdown')) {
    document.querySelectorAll('.thread-dropdown.show').forEach(dropdown => {
      dropdown.classList.remove('show');
    });
    document.querySelectorAll('.thread-options-btn.active').forEach(btn => {
      btn.classList.remove('active');
    });
  }
});

// Deteksi shared conversation dari URL Hash di awal
checkSharedChat();

// Render UI sidebar di awal
renderThreads();
loadCurrentThread();

// Event: Mulai Rangkaian Pesan Baru
newChatBtn.addEventListener('click', () => {
  currentThreadId = null;
  conversationHistory = [];
  localStorage.removeItem('current_thread_id');
  chatBox.innerHTML = '';
  // Bersihkan URL hash jika sedang melihat chat yang dibagikan
  if (window.location.hash.startsWith('#share=')) {
    history.replaceState(null, "", window.location.pathname);
  }
  renderThreads();
  autoCollapseMobileSidebar();
  input.focus();
});

// Event: Pencarian Rangkaian Pesan
searchInput.addEventListener('input', () => {
  renderThreads(searchInput.value.trim());
});

// Event: Tampilkan Lebih Banyak Thread
showMoreBtn.addEventListener('click', () => {
  displayLimit += 8;
  renderThreads(searchInput.value.trim());
});

// Event: Submit Chat Form
form.addEventListener('submit', async function (e) {
  e.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;

  // Inisialisasi Thread Baru jika belum aktif
  if (!currentThreadId) {
    currentThreadId = 'thread-' + Date.now();
    const newThread = {
      id: currentThreadId,
      title: userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : ''),
      conversation: []
    };
    threads.unshift(newThread);
    localStorage.setItem('current_thread_id', currentThreadId);
  }

  // Tampilkan pesan pengguna di UI
  appendMessage('user', userMessage);
  input.value = '';

  // Simpan ke riwayat percakapan
  conversationHistory.push({ role: 'user', text: userMessage });
  updateThreadConversation();

  // Ubah status ke loading
  setLoadingState(true);

  // Buat pesan berpikir sementara
  const thinkingWrapper = appendMessage('bot', 'Gemini is thinking...');

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
    thinkingWrapper.remove();

    if (data.error) {
      appendMessage('bot', `ERROR: ${data.error}`);
    } else {
      // Tampilkan respons AI di UI
      appendMessage('bot', data.result);
      // Simpan respons ke riwayat
      conversationHistory.push({ role: 'model', text: data.result });
      updateThreadConversation();
    }
  } catch (error) {
    thinkingWrapper.remove();
    appendMessage('bot', `Gagal terhubung ke server. Detail: ${error.message}`);
  } finally {
    setLoadingState(false);
    renderThreads(searchInput.value.trim());
  }
});

// Helper: Tampilkan/buat elemen pesan
function appendMessage(sender, text) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('message-wrapper', sender);

  const msg = document.createElement('div');
  msg.classList.add('message', sender);
  
  if (sender === 'bot') {
    if (window.marked && typeof window.marked.parse === 'function') {
      msg.innerHTML = window.marked.parse(text);
    } else {
      msg.innerHTML = text.replace(/\n/g, '<br>');
    }
  } else {
    msg.textContent = text;
  }
  
  wrapper.appendChild(msg);
  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
  return wrapper;
}

// Helper: Atur Status Loading
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

// Helper: Update percakapan di dalam list thread & simpan ke LocalStorage
function updateThreadConversation() {
  const thread = threads.find(t => t.id === currentThreadId);
  if (thread) {
    thread.conversation = conversationHistory;
    localStorage.setItem('chat_threads', JSON.stringify(threads));
  }
}

// Helper: Render daftar rangkaian pesan di Sidebar
function renderThreads(filterText = '') {
  threadsList.innerHTML = '';
  
  let filtered = threads;
  if (filterText) {
    filtered = threads.filter(t => t.title.toLowerCase().includes(filterText.toLowerCase()));
  }

  const visibleThreads = filtered.slice(0, displayLimit);
  
  visibleThreads.forEach((t, index) => {
    const li = document.createElement('li');
    li.classList.add('thread-item-wrapper');
    li.setAttribute('draggable', 'true');
    li.dataset.id = t.id;

    // --- RENDER ELEMENT BUTTON TITLE ---
    const button = document.createElement('button');
    button.classList.add('thread-item');
    if (t.id === currentThreadId) {
      button.classList.add('active');
    }
    button.textContent = t.title;
    button.title = t.title;
    
    button.addEventListener('click', () => {
      currentThreadId = t.id;
      localStorage.setItem('current_thread_id', currentThreadId);
      loadCurrentThread();
      renderThreads(filterText);
      autoCollapseMobileSidebar();
    });
    
    li.appendChild(button);

    // --- RENDER KOTAK PILIHAN / DROPDOWN MENU ---
    const optionsBtn = document.createElement('button');
    optionsBtn.classList.add('thread-options-btn');
    optionsBtn.innerHTML = '&#8942;'; // Ikon tiga titik vertikal (⋮)
    
    const dropdown = document.createElement('div');
    dropdown.classList.add('thread-dropdown');

    // Menu Item: Edit Judul
    const renameItem = document.createElement('button');
    renameItem.classList.add('dropdown-item');
    renameItem.innerHTML = '✏️ Edit Judul';
    renameItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      optionsBtn.classList.remove('active');
      enableRenameMode(li, t);
    });

    // Menu Item: Bagikan (Share)
    const shareItem = document.createElement('button');
    shareItem.classList.add('dropdown-item');
    shareItem.innerHTML = '🔗 Bagikan';
    shareItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      optionsBtn.classList.remove('active');
      shareThread(t);
    });

    // Menu Item: Hapus (Delete)
    const deleteItem = document.createElement('button');
    deleteItem.classList.add('dropdown-item', 'delete');
    deleteItem.innerHTML = '🗑️ Hapus';
    deleteItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('show');
      optionsBtn.classList.remove('active');
      deleteThread(t.id);
    });

    dropdown.appendChild(renameItem);
    dropdown.appendChild(shareItem);
    dropdown.appendChild(deleteItem);

    optionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Tutup dropdown lain yang terbuka
      document.querySelectorAll('.thread-dropdown.show').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
      });
      document.querySelectorAll('.thread-options-btn.active').forEach(b => {
        if (b !== optionsBtn) b.classList.remove('active');
      });

      dropdown.classList.toggle('show');
      optionsBtn.classList.toggle('active');
    });

    li.appendChild(optionsBtn);
    li.appendChild(dropdown);

    // --- BIND DRAG AND DROP HANDLERS ---
    li.addEventListener('dragstart', (e) => {
      draggedThreadId = t.id;
      e.dataTransfer.effectAllowed = 'move';
      li.style.opacity = '0.5';
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      li.classList.add('drag-over');
    });

    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over');
    });

    li.addEventListener('dragend', () => {
      li.style.opacity = '1';
      document.querySelectorAll('.thread-item-wrapper').forEach(el => {
        el.classList.remove('drag-over');
      });
    });

    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const targetThreadId = li.dataset.id;
      
      if (draggedThreadId && draggedThreadId !== targetThreadId) {
        // Swap urutan di array threads
        const fromIndex = threads.findIndex(item => item.id === draggedThreadId);
        const toIndex = threads.findIndex(item => item.id === targetThreadId);
        
        if (fromIndex !== -1 && toIndex !== -1) {
          const [removed] = threads.splice(fromIndex, 1);
          threads.splice(toIndex, 0, removed);
          localStorage.setItem('chat_threads', JSON.stringify(threads));
          renderThreads(filterText);
        }
      }
    });

    threadsList.appendChild(li);
  });

  // Tampilkan/sembunyikan tombol "Tampilkan lebih banyak"
  if (filtered.length > displayLimit) {
    showMoreBtn.style.display = 'block';
  } else {
    showMoreBtn.style.display = 'none';
  }
}

// Helper: Ubah item judul menjadi input rename
function enableRenameMode(liElement, threadObj) {
  const originalButton = liElement.querySelector('.thread-item');
  const optionsBtn = liElement.querySelector('.thread-options-btn');
  
  originalButton.style.display = 'none';
  optionsBtn.style.display = 'none';

  const inputRename = document.createElement('input');
  inputRename.type = 'text';
  inputRename.classList.add('rename-input');
  inputRename.value = threadObj.title;
  
  liElement.prepend(inputRename);
  inputRename.focus();
  inputRename.select();

  const saveRename = () => {
    const newTitle = inputRename.value.trim();
    if (newTitle) {
      threadObj.title = newTitle;
      localStorage.setItem('chat_threads', JSON.stringify(threads));
    }
    renderThreads(searchInput.value.trim());
  };

  inputRename.addEventListener('blur', saveRename);
  inputRename.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveRename();
    if (e.key === 'Escape') renderThreads(searchInput.value.trim());
  });
}

// Helper: Hapus Rangkaian Pesan (Delete)
function deleteThread(id) {
  threads = threads.filter(t => t.id !== id);
  localStorage.setItem('chat_threads', JSON.stringify(threads));
  
  if (currentThreadId === id) {
    currentThreadId = null;
    localStorage.removeItem('current_thread_id');
    chatBox.innerHTML = '';
  }
  
  renderThreads(searchInput.value.trim());
  showToast("Rangkaian pesan berhasil dihapus!");
}

// Helper: Bagikan Rangkaian Pesan (Share)
function shareThread(threadObj) {
  try {
    const chatDataStr = JSON.stringify(threadObj.conversation);
    // Encode data percakapan menjadi Base64
    const base64Chat = btoa(encodeURIComponent(chatDataStr));
    const shareUrl = `${window.location.origin}${window.location.pathname}#share=${base64Chat}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast("Link percakapan berhasil disalin ke clipboard!");
    }).catch(err => {
      console.error("Gagal menyalin link:", err);
      showToast("Gagal menyalin link otomatis.");
    });
  } catch (err) {
    console.error("Gagal enkoding chat:", err);
    showToast("Gagal memproses link bagikan.");
  }
}

// Helper: Deteksi dan Muat Chat yang Dibagikan
function checkSharedChat() {
  if (window.location.hash.startsWith('#share=')) {
    try {
      const base64Data = window.location.hash.substring(7);
      const decodedJson = decodeURIComponent(atob(base64Data));
      const sharedConversation = JSON.parse(decodedJson);

      if (Array.isArray(sharedConversation)) {
        // Buat thread temp untuk dibaca
        currentThreadId = 'shared-temp';
        conversationHistory = sharedConversation;
        
        showToast("Memuat percakapan yang dibagikan!");
      }
    } catch (e) {
      console.error("Error memuat shared chat:", e);
      showToast("Link percakapan yang dibagikan tidak valid.");
    }
  }
}

// Helper: Memuat percakapan thread aktif ke Chat Box
function loadCurrentThread() {
  chatBox.innerHTML = '';
  
  // Jika sedang melihat share chat temp
  if (currentThreadId === 'shared-temp') {
    conversationHistory.forEach(msg => {
      const sender = msg.role === 'user' ? 'user' : 'bot';
      appendMessage(sender, msg.text);
    });
    return;
  }

  if (!currentThreadId) {
    conversationHistory = [];
    return;
  }

  const thread = threads.find(t => t.id === currentThreadId);
  if (thread) {
    conversationHistory = thread.conversation;
    conversationHistory.forEach(msg => {
      const sender = msg.role === 'user' ? 'user' : 'bot';
      appendMessage(sender, msg.text);
    });
  } else {
    conversationHistory = [];
    currentThreadId = null;
    localStorage.removeItem('current_thread_id');
  }
}

// Helper: Tampilkan Toast Notification
function showToast(message) {
  // Hapus toast lama jika ada
  const oldToast = document.querySelector('.toast-msg');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.classList.add('toast-msg');
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 2500);
}
