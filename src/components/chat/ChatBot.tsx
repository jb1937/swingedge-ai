// src/components/chat/ChatBot.tsx

'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat, ChatMessage } from '@/hooks/useChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🤖</span>
            <span className="text-xs font-semibold text-muted-foreground">SwingEdge AI</span>
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <p className="text-xs opacity-60 mt-2">
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

interface ChatBotProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatBot({ isOpen, onClose }: ChatBotProps) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, isLoading, error, clearMessages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const message = input;
    setInput('');
    await sendMessage(message);
  };
  
  const suggestedQuestions = [
    "What's a good RSI entry strategy?",
    "How do I set stop losses?",
    "Explain MACD crossovers",
    "Best position sizing rules?",
  ];
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[600px] flex flex-col shadow-2xl">
      <Card className="flex flex-col h-full">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <div>
              <CardTitle className="text-base">Trading Assistant</CardTitle>
              <p className="text-xs text-muted-foreground">Powered by Claude AI</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clearMessages}>
              Clear
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col p-4 pt-0 min-h-0">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto mb-4 min-h-[300px] max-h-[400px]">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  👋 Hi! I&apos;m your AI trading assistant. Ask me anything about:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 mb-6">
                  <li>• Technical analysis & indicators</li>
                  <li>• Swing trading strategies</li>
                  <li>• Risk management</li>
                  <li>• Position sizing</li>
                </ul>
                <div className="flex flex-wrap gap-2 justify-center">
                  {suggestedQuestions.map((q, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => setInput(q)}
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {isLoading && (
                  <div className="flex justify-start mb-4">
                    <div className="bg-muted rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🤖</span>
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {error && (
            <p className="text-xs text-red-500 mb-2">{error}</p>
          )}
          
          {/* Input Area */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about trading strategies..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Floating chat button to toggle the chatbot
export function ChatToggleButton({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-all flex items-center justify-center text-2xl ${
        isOpen ? 'hidden' : ''
      }`}
      aria-label="Open chat"
    >
      💬
    </button>
  );
}
