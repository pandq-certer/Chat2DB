export interface IChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  error?: boolean;
  // SSE-driven fields (new copilot mode)
  sqlContent?: string;
  sqlType?: string;
  schema?: string[];
  thinkingSteps?: string[];
  confirmationState?: 'pending' | 'confirmed' | 'cancelled';
  resultSummary?: string;
  // Legacy fields (old pipeline, kept for backward compat)
  pendingSql?: string;
  pendingSqlCategory?: string;
}

export interface ISelectedDataSource {
  dataSourceId?: number;
  databaseName?: string;
  schemaName?: string;
  dataSourceName?: string;
}
