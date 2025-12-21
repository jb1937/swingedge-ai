// src/components/chat/ChatWrapper.tsx

'use client';

import { useState } from 'react';
import { ChatBot, ChatToggleButton } from './ChatBot';

export function ChatWrapper() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      <ChatToggleButton onClick={() => setIsOpen(true)} isOpen={isOpen} />
      <ChatBot isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
