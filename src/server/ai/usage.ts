export interface AITelemetryRecord {
  id: string;
  operation: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  timestamp: string;
  success: boolean;
  error?: string;
}

class AITelemetryTracker {
  private records: AITelemetryRecord[] = [];
  private readonly maxRecords = 200;

  record(entry: Omit<AITelemetryRecord, 'id' | 'timestamp'>): AITelemetryRecord {
    const fullEntry: AITelemetryRecord = {
      id: `tel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.records.unshift(fullEntry);
    if (this.records.length > this.maxRecords) {
      this.records.pop();
    }

    return fullEntry;
  }

  getRecent(limit = 20): AITelemetryRecord[] {
    return this.records.slice(0, limit);
  }

  getSummary() {
    const totalRequests = this.records.length;
    const successful = this.records.filter((r) => r.success).length;
    const failed = totalRequests - successful;
    const totalPromptTokens = this.records.reduce((acc, r) => acc + r.promptTokens, 0);
    const totalCompletionTokens = this.records.reduce((acc, r) => acc + r.completionTokens, 0);
    const avgLatencyMs =
      totalRequests > 0
        ? Math.round(this.records.reduce((acc, r) => acc + r.durationMs, 0) / totalRequests)
        : 0;

    return {
      totalRequests,
      successful,
      failed,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      avgLatencyMs,
    };
  }

  clear(): void {
    this.records = [];
  }
}

export const aiTelemetry = new AITelemetryTracker();

