'use client';
import { useState, ChangeEvent, FormEvent } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! Upload a text file and ask me anything about its contents.' }
  ]);
  const [input, setInput] = useState<string>('');
  const [file, setFile] = useState<FileList | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);

  // 📥 UPLOAD HANDLER: Native Fetch multi-part form stream
  const handleFileUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file || file.length === 0) return;

    const formData = new FormData();
    formData.append('file', file[0]); // Explicitly grab the first file item node
    setUploadStatus('Ingesting and vectorizing document...');

    try {
      const res = await fetch('http://127.0.0', {
        method: 'POST',
        body: formData, // Browser automatically handles boundary headers for FormData
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus(`✅ ${data.message} (${data.chunksCreated} chunks stored)`);
      } else {
        setUploadStatus(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      setUploadStatus('❌ Connection to server failed.');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files);
    }
  };

  // 💬 CHAT HANDLER: Native Stream Controller Engine Reader
  const handleSendMessage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('http://127.0.0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.body) throw new Error('Readable stream unsupported.');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Process and consume network data packets as they drop in from the network
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });

        // Instantly append each new chunk word directly to the screen UI state
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0) {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: updated[lastIndex].content + chunk,
            };
          }
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Connection lost or server failed to respond.' }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <main className="flex h-screen bg-slate-900 text-slate-100 font-sans">
      {/* SIDEBAR: Local Knowledge File Pipeline */}
      <section className="w-80 border-r border-slate-800 bg-slate-950 p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white mb-1">Local AI Agent</h2>
          <p className="text-xs text-slate-400">Next.js + TypeScript + Supabase Vector DB</p>
        </div>

        <form onSubmit={handleFileUpload} className="flex flex-col gap-3 border border-dashed border-slate-700 p-4 rounded-xl bg-slate-900/50">
          <label className="text-sm font-semibold text-slate-300">Upload Knowledge Data</label>
          <input 
            type="file" 
            accept=".txt,.csv,.md"
            onChange={handleFileChange}
            className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
          />
          <button 
            type="submit"
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs py-2 px-4 rounded-lg transition-all cursor-pointer"
          >
            Vectorize Data
          </button>
        </form>

        {uploadStatus && (
          <div className="text-xs p-3 rounded-lg bg-slate-900 text-slate-300 border border-slate-800 leading-relaxed break-words">
            {uploadStatus}
          </div>
        )}
      </section>

      {/* MAIN CONTAINER: Dynamic Conversational Stream Frame */}
      <section className="flex-1 flex flex-col h-full bg-slate-900">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-slate-800 text-slate-200 border border-slate-700/50 rounded-tl-none'
              }`}>
                {msg.content || (isTyping && index === messages.length - 1 ? "Thinking..." : "")}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSendMessage} className="p-4 bg-slate-950 border-t border-slate-800 flex gap-3">
          <input 
            type="text"
            value={input}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            placeholder={isTyping ? "Agent is writing..." : "Ask your local documents a question..."}
            disabled={isTyping}
            className="flex-1 bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={isTyping || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-semibold text-sm px-5 py-3 rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
          >
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
