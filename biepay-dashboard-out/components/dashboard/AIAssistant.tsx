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
      content: "Hi! I'm your BiePay business assistant, powered by Tether's QVAC. I can help you analyze your merchant data privately on this device. What can I do for you today?" 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

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
        const chunkValue = decoder.decode(value, { stream: true });
        assistantMessage += chunkValue;
        
        // Update the last message (the assistant's placeholder)
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1].content = assistantMessage;
          return newMessages;
        });
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => {
        // If the last message was our placeholder, update it with an error. 
        // Otherwise, append an error message.
        if (prev[prev.length - 1].role === 'assistant' && prev[prev.length - 1].content === "") {
           const newMessages = [...prev];
           newMessages[newMessages.length - 1].content = "Sorry, I encountered an error. Please try again.";
           return newMessages;
        } else {
          return [...prev, { role: 'assistant', content: "Sorry, I encountered an error. Please try again." }];
        }
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-[#c5a36e] hover:bg-[#b08d5a] text-white p-4 rounded-full shadow-2xl transition-all hover:scale-110 flex items-center gap-2 group"
        >
          <div className="relative">
            <Bot size={24} />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
          </div>
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-medium whitespace-nowrap">
            Ask Business Assistant
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white rounded-2xl shadow-2xl w-80 sm:w-96 flex flex-col border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-[#1a1a1a] p-4 text-white flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-[#c5a36e]/20 p-2 rounded-lg">
                <Bot size={20} className="text-[#c5a36e]" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">BiePay Business Assistant</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  <p className="text-[10px] text-gray-400">Powered by Tether QVAC (Local Inference)</p>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 h-96 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
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
                    "max-w-[85%] p-3 rounded-2xl text-sm shadow-sm",
                    m.role === 'user' 
                      ? "bg-[#c5a36e] text-white rounded-tr-none" 
                      : "bg-white text-gray-800 border border-gray-100 rounded-tl-none"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-[#c5a36e]" />
                  <span className="text-xs text-gray-500">Processing locally...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-gray-100">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about your revenue..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c5a36e]/50 focus:border-[#c5a36e] transition-all"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="bg-[#c5a36e] disabled:opacity-50 text-white p-2 rounded-xl transition-all hover:scale-105 active:scale-95"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="text-[10px] text-center text-gray-400 mt-3 flex items-center justify-center gap-1">
              <MessageSquare size={10} />
              Your data never leaves this device. 
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
