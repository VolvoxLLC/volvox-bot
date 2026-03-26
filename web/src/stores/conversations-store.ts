import { create } from 'zustand';

interface Participant {
  username: string;
  role: string;
}

interface ConversationSummary {
  id: number;
  channelId: string;
  channelName: string;
  participants: Participant[];
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  preview: string;
}

interface ConversationsFetchOpts {
  search: string;
  channel: string;
  page: number;
}

interface ConversationsState {
  conversations: ConversationSummary[];
  total: number;
  loading: boolean;
  error: string | null;
  currentOpts: ConversationsFetchOpts;

  setOpts: (opts: Partial<ConversationsFetchOpts>) => void;
  fetch: (guildId: string, opts: ConversationsFetchOpts) => Promise<'unauthorized' | void>;
  refresh: (guildId: string) => Promise<'unauthorized' | void>;
  reset: () => void;
}

const PAGE_SIZE = 25;

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  conversations: [],
  total: 0,
  loading: false,
  error: null,
  currentOpts: { search: '', channel: '', page: 1 },

  setOpts: (partial) => set((s) => ({ currentOpts: { ...s.currentOpts, ...partial } })),

  fetch: async (guildId, opts) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      params.set('page', String(opts.page));
      params.set('limit', String(PAGE_SIZE));
      if (opts.search) params.set('search', opts.search);
      if (opts.channel) params.set('channel', opts.channel);

      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/conversations?${params.toString()}`,
      );
      if (res.status === 401) return 'unauthorized';
      if (!res.ok) throw new Error(`Failed to fetch conversations (${res.status})`);
      const data = await res.json();
      set({ conversations: data.conversations, total: data.total, currentOpts: opts });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch conversations' });
    } finally {
      set({ loading: false });
    }
  },

  refresh: async (guildId) => {
    const { currentOpts, fetch } = get();
    return fetch(guildId, currentOpts);
  },

  reset: () =>
    set({
      conversations: [],
      total: 0,
      error: null,
      currentOpts: { search: '', channel: '', page: 1 },
    }),
}));
