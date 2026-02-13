class KaniAssistant {
  constructor() {
    this.openclawUrl = '';
    this.isConnected = false;
    this.isRecording = false;
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    
    this.initElements();
    this.initSpeechRecognition();
    this.initEventListeners();
  }

  initElements() {
    this.chatContainer = document.getElementById('chatContainer');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.openclawUrlInput = document.getElementById('openclawUrl');
    this.connectBtn = document.getElementById('connectBtn');
    this.micBtn = document.getElementById('micBtn');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'ja-JP';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.micBtn.classList.add('recording');
    };

    this.recognition.onend = () => {
      this.isRecording = false;
      this.micBtn.classList.remove('recording');
    };

    this.recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      
      if (event.results[0].isFinal) {
        this.handleUserMessage(transcript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isRecording = false;
      this.micBtn.classList.remove('recording');
    };
  }

  initEventListeners() {
    this.connectBtn.addEventListener('click', () => this.connect());
    
    this.micBtn.addEventListener('mousedown', () => this.startRecording());
    this.micBtn.addEventListener('mouseup', () => this.stopRecording());
    this.micBtn.addEventListener('mouseleave', () => this.stopRecording());
    
    this.micBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startRecording();
    });
    this.micBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopRecording();
    });

    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
  }

  startRecording() {
    if (!this.isConnected || !this.recognition) return;
    try {
      this.recognition.start();
    } catch (e) {
      console.error('Recognition start error:', e);
    }
  }

  stopRecording() {
    if (this.recognition && this.isRecording) {
      this.recognition.stop();
    }
  }

  async connect() {
    const url = this.openclawUrlInput.value.trim();
    if (!url) {
      this.addBotMessage('URLを入力してください');
      return;
    }

    this.openclawUrl = url;
    this.connectBtn.textContent = '接続中...';
    this.connectBtn.disabled = true;

    try {
      const response = await fetch(`${url}/api/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok || response.status === 404) {
        this.isConnected = true;
        this.connectionStatus.classList.add('connected');
        this.connectionStatus.querySelector('.status-text').textContent = '接続済み';
        this.micBtn.disabled = false;
        this.messageInput.disabled = false;
        this.sendBtn.disabled = false;
        this.connectBtn.textContent = '接続済み';
        this.openclawUrlInput.disabled = true;
        this.addBotMessage(`OpenClaw (${url})に接続しました！`);
      } else {
        throw new Error('Connection failed');
      }
    } catch (error) {
      this.addBotMessage(`接続に失敗しました: ${error.message}`);
      this.connectBtn.textContent = '接続';
      this.connectBtn.disabled = false;
    }
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message || !this.isConnected) return;
    
    this.messageInput.value = '';
    this.addUserMessage(message);
    this.showTypingIndicator();
    
    try {
      const response = await this.sendToOpenClaw(message);
      this.removeTypingIndicator();
      this.addBotMessage(response);
      this.speak(response);
    } catch (error) {
      this.removeTypingIndicator();
      this.addBotMessage(`エラー: ${error.message}`);
    }
  }

  async sendToOpenClaw(message) {
    try {
      const response = await fetch(`${this.openclawUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          stream: false
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 404) {
          return this.fallbackChat(message);
        }
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.response || data.message || data.content || JSON.stringify(data);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('タイムアウト');
      }
      return this.fallbackChat(message);
    }
  }

  async fallbackChat(message) {
    try {
      const response = await fetch(`${this.openclawUrl}/api/converse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(30000)
      });

      if (response.ok) {
        const data = await response.json();
        return data.response || data.text || JSON.stringify(data);
      }
    } catch (e) {
      console.error('Fallback chat error:', e);
    }

    return 'OpenClawに接続しましたが、応答の取得に失敗しました。OpenClawダッシュボードが起動しているか確認してください。';
  }

  handleUserMessage(message) {
    this.addUserMessage(message);
    this.showTypingIndicator();
    
    this.sendToOpenClaw(message)
      .then(response => {
        this.removeTypingIndicator();
        this.addBotMessage(response);
        this.speak(response);
      })
      .catch(error => {
        this.removeTypingIndicator();
        this.addBotMessage(`エラー: ${error.message}`);
      });
  }

  addUserMessage(text) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message user-message';
    messageEl.innerHTML = `
      <div class="avatar">😊</div>
      <div class="message-content">${this.escapeHtml(text)}</div>
    `;
    this.chatContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  addBotMessage(text) {
    const messageEl = document.createElement('div');
    messageEl.className = 'message bot-message';
    messageEl.innerHTML = `
      <div class="avatar">🦞</div>
      <div class="message-content">${this.escapeHtml(text)}</div>
    `;
    this.chatContainer.appendChild(messageEl);
    this.scrollToBottom();
  }

  showTypingIndicator() {
    const typingEl = document.createElement('div');
    typingEl.className = 'message bot-message typing';
    typingEl.id = 'typingIndicator';
    typingEl.innerHTML = `
      <div class="avatar">🦞</div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    this.chatContainer.appendChild(typingEl);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
  }

  speak(text) {
    if (!this.synthesis) return;
    
    this.synthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    const voices = this.synthesis.getVoices();
    const japaneseVoice = voices.find(v => v.lang.includes('ja'));
    if (japaneseVoice) {
      utterance.voice = japaneseVoice;
    }
    
    this.synthesis.speak(utterance);
  }

  scrollToBottom() {
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new KaniAssistant();
});
