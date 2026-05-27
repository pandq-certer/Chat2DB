import { create } from 'zustand';
import { IChatMessage, ISelectedDataSource } from '@/typings/aichat';

export interface IPendingConfirmation {
  sql: string;
  sqlType: string;
  sessionId: string;
  traceId: string;
}

interface IAIChatStore {
  messages: IChatMessage[];
  isStreaming: boolean;
  selectedDataSource: ISelectedDataSource;
  streamingContent: string;
  closeEventSource: (() => void) | null;
  currentSessionId: string | null;
  currentTraceId: string | null;
  pendingConfirmation: IPendingConfirmation | null;

  addMessage: (message: IChatMessage) => void;
  updateStreamingContent: (content: string) => void;
  finalizeStreaming: () => void;
  setStreaming: (streaming: boolean) => void;
  setCloseEventSource: (fn: (() => void) | null) => void;
  setDataSource: (ds: ISelectedDataSource) => void;
  clearChat: () => void;
  setPendingConfirmation: (pending: IPendingConfirmation | null) => void;
  updateLastMessage: (updates: Partial<IChatMessage>) => void;
}

export const useAIChatStore = create<IAIChatStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  selectedDataSource: {},
  streamingContent: '',
  closeEventSource: null,
  currentSessionId: null,
  currentTraceId: null,
  pendingConfirmation: null,

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateStreamingContent: (content) => set({ streamingContent: content }),

  finalizeStreaming: () => {
    const { streamingContent, messages } = get();
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.isStreaming) {
      const updated = [...messages];
      updated[updated.length - 1] = {
        ...lastMsg,
        content: streamingContent,
        isStreaming: false,
      };
      set({ messages: updated, streamingContent: '', isStreaming: false });
    } else {
      set({ streamingContent: '', isStreaming: false });
    }
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setCloseEventSource: (fn) => set({ closeEventSource: fn }),

  setDataSource: (ds) => set({ selectedDataSource: ds }),

  clearChat: () => {
    const { closeEventSource } = get();
    closeEventSource?.();
    set({
      messages: [],
      isStreaming: false,
      streamingContent: '',
      closeEventSource: null,
      pendingConfirmation: null,
      currentSessionId: null,
      currentTraceId: null,
    });
  },

  setPendingConfirmation: (pending) =>
    set({ pendingConfirmation: pending }),

  updateLastMessage: (updates) => {
    const { messages } = get();
    if (messages.length === 0) return;
    const updated = [...messages];
    updated[updated.length - 1] = { ...updated[updated.length - 1], ...updates };
    set({ messages: updated });
  },
}));
