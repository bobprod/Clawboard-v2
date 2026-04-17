import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { TaskChatDrawer } from '../components/TaskChatDrawer';
import type { TaskChatContext } from '../components/TaskChatDrawer';

interface GlobalChatStore {
  openChat: (ctx: TaskChatContext) => void;
  closeChat: () => void;
}

const GlobalChatCtx = createContext<GlobalChatStore | null>(null);

export function GlobalChatProvider({ children }: { children: ReactNode }) {
  const [chatCtx, setChatCtx] = useState<TaskChatContext | null>(null);

  const openChat = useCallback((ctx: TaskChatContext) => setChatCtx(ctx), []);
  const closeChat = useCallback(() => setChatCtx(null), []);

  return (
    <GlobalChatCtx.Provider value={{ openChat, closeChat }}>
      {children}
      {chatCtx && <TaskChatDrawer ctx={chatCtx} onClose={closeChat} />}
    </GlobalChatCtx.Provider>
  );
}

export function useGlobalChat() {
  const ctx = useContext(GlobalChatCtx);
  if (!ctx) throw new Error('useGlobalChat must be used within GlobalChatProvider');
  return ctx;
}
