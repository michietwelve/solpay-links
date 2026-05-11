"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Send, Loader2, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}


export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "Hi! I'm your BiePay business assistant. I can help you analyze your merchant data privately on this device. What can I do for you today?" 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) scrollToBottom();
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isOpen, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/qvac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to get response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let assistantMessage = "";

      // Add a placeholder message for the assistant
      setMessages(prev => [...prev, { role: 'assistant', content: "" }]);

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value || new Uint8Array(), { stream: true });
        assistantMessage += chunkValue;
        
        // Update the last message (the assistant's placeholder)
        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages.length > 0) {
            newMessages[newMessages.length - 1].content = assistantMessage;
          }
          return newMessages;
        });
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [
        ...prev, 
        { role: 'assistant', content: "Sorry, I encountered a temporary network error. Please try again." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{ 
      role: 'assistant', 
      content: "Chat cleared. How can I help you with your analytics now?" 
    }]);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-zinc-900 hover:bg-zinc-800 text-white p-4 rounded-full shadow-2xl transition-all hover:scale-110 flex items-center gap-2 group border border-white/10"
        >
          <div className="relative">
            <Bot size={24} className="text-[#c5a36e]" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 border-2 border-zinc-900 rounded-full animate-pulse"></span>
          </div>
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-bold uppercase text-[10px] tracking-widest whitespace-nowrap">
            Institutional AI
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white rounded-[2rem] shadow-[0_30px_100px_rgba(0,0,0,0.3)] w-[360px] max-w-[calc(100vw-2rem)] flex flex-col border border-zinc-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-zinc-950 p-6 text-white flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-zinc-900 p-2 rounded-xl border border-white/10">
                <Bot size={20} className="text-[#c5a36e]" />
              </div>
              <div>
                <h3 className="font-black text-xs uppercase tracking-widest">Business Assistant</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-tighter">Powered by Tether QVAC</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={clearChat}
                className="text-zinc-600 hover:text-white p-1 transition-colors"
                title="Clear Chat"
              >
                <MessageSquare size={16} />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-zinc-600 hover:text-white p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 h-[400px] max-h-[60vh] overflow-y-auto p-6 space-y-6 bg-zinc-50/50 scrollbar-hide">
            {messages.map((m, i) => (
              <div 
                key={i} 
                className={clsx(
                  "flex w-full",
                  m.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div 
                  className={clsx(
                    "max-w-[85%] p-4 rounded-2xl text-[13px] shadow-sm leading-relaxed",
                    m.role === 'user' 
                      ? "bg-zinc-900 text-white rounded-tr-none font-medium" 
                      : "bg-white text-zinc-800 border border-zinc-200 rounded-tl-none font-bold"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-zinc-200 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin text-[#c5a36e]" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Analyzing Locally...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* Input */}
          <div className="p-6 bg-white border-t border-zinc-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about your revenue..."
                className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-zinc-900 transition-all placeholder:text-zinc-300"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="bg-zinc-900 disabled:opacity-50 text-[#c5a36e] p-3 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="text-[9px] text-center text-zinc-400 mt-4 font-bold uppercase tracking-widest">
              Institutional privacy enabled
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
