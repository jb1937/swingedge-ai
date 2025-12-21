// src/hooks/useChat.ts

import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clearMessages: () => void;
}

// Simple ID generator that works in all browsers
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageIdRef = useRef(0);
  
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;
    
    const userMessage: ChatMessage = {
      id: `user-${generateId()}-${++messageIdRef.current}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);
    
    try {
      // Prepare message history (excluding IDs and timestamps)
      const messageHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content.trim(),
          messages: messageHistory,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to get response');
      }
      
      const data = await response.json();
      
      const assistantMessage: ChatMessage = {
        id: `assistant-${generateId()}-${++messageIdRef.current}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [messages]);
  
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);
  
  return {
    messages,
    sendMessage,
    isLoading,
    error,
    clearMessages,
  };
}
