import { requestUrl } from 'obsidian';
import type { App } from 'obsidian';
import type { StellavaultSettings, SearchResultItem, DecayItem } from './types';

/**
 * HTTP-based bridge to Stellavault API server.
 * Connects to `stellavault graph` or `stellavault serve --api` running locally.
 * This avoids native module (better-sqlite3, sqlite-vec) issues in Obsidian's Electron.
 */
export class StellavaultEngine {
  private app: App;
  private settings: StellavaultSettings;
  private baseUrl: string;
  private initialized = false;

  constructor(app: App, settings: StellavaultSettings) {
    this.app = app;
    this.settings = settings;
    this.baseUrl = `http://127.0.0.1:${settings.apiPort ?? 3333}`;
  }

  /** Check if the API server is running */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const resp = await requestUrl({ url: `${this.baseUrl}/api/stats` });
      if (resp.status === 200) {
        this.initialized = true;
        return;
      }
    } catch {
      // Server not running — try common ports
      for (const port of [3333, 3334, 13333]) {
        try {
          const resp = await requestUrl({ url: `http://127.0.0.1:${port}/api/stats` });
          if (resp.status === 200) {
            this.baseUrl = `http://127.0.0.1:${port}`;
            this.initialized = true;
            return;
          }
        } catch { /* try next */ }
      }
    }

    throw new Error(
      'Stellavault API server not found. Run `stellavault graph` or `stellavault serve` in terminal first.'
    );
  }

  get isReady(): boolean {
    return this.initialized;
  }

  get isIndexing(): boolean {
    return false; // Indexing is handled by the CLI
  }

  /** Semantic + keyword hybrid search via API */
  async search(query: string): Promise<SearchResultItem[]> {
    if (!this.initialized) return [];

    try {
      const resp = await requestUrl({
        url: `${this.baseUrl}/api/search?q=${encodeURIComponent(query)}&limit=${this.settings.maxResults}`,
      });
      const data = resp.json;

      return (data.results ?? []).map((r: any) => ({
        filePath: r.document?.filePath ?? '',
        title: r.document?.title ?? 'Untitled',
        score: r.score ?? 0,
        snippet: r.chunk?.content?.substring(0, 200) ?? '',
        tags: r.document?.tags ?? [],
      }));
    } catch (err) {
      console.error('[Stellavault] Search failed:', err);
      return [];
    }
  }

  /** Get documents sorted by decay via API */
  async getDecayingDocs(limit = 20): Promise<DecayItem[]> {
    if (!this.initialized) return [];

    try {
      const resp = await requestUrl({ url: `${this.baseUrl}/api/decay` });
      const data = resp.json;

      return (data.topDecaying ?? []).slice(0, limit).map((item: any) => ({
        filePath: item.filePath ?? '',
        title: item.title ?? item.documentId ?? 'Untitled',
        retrievability: item.retrievability ?? 0,
        lastAccessed: item.lastAccess ?? '',
        daysSinceAccess: item.daysSinceAccess ?? 0,
      }));
    } catch {
      return [];
    }
  }

  /** Generate a learning path via API */
  async getLearningPath(): Promise<any[]> {
    if (!this.initialized) return [];

    try {
      const resp = await requestUrl({ url: `${this.baseUrl}/api/gaps` });
      const data = resp.json;

      // Combine gaps + isolated nodes as learning suggestions
      const items: any[] = [];
      for (const gap of data.gaps ?? []) {
        items.push({
          type: 'bridge',
          title: gap.suggestedTopic,
          reason: `${gap.clusterA} ↔ ${gap.clusterB} 간 연결 부족`,
          priority: gap.severity === 'high' ? 1 : gap.severity === 'medium' ? 2 : 3,
        });
      }
      for (const node of (data.isolatedNodes ?? []).slice(0, 5)) {
        items.push({
          type: 'explore',
          title: node.title,
          reason: `고립된 노트 (${node.connections}개 연결)`,
          priority: 2,
        });
      }
      return items.sort((a, b) => a.priority - b.priority);
    } catch {
      return [];
    }
  }

  /** Record document access via API */
  async recordAccess(filePath: string): Promise<void> {
    if (!this.initialized) return;
    try {
      // Find doc ID by file path, then hit the access endpoint
      const resp = await requestUrl({
        url: `${this.baseUrl}/api/search?q=${encodeURIComponent(filePath)}&limit=1`,
      });
      const data = resp.json;
      const docId = data.results?.[0]?.document?.id;
      if (docId) {
        await requestUrl({ url: `${this.baseUrl}/api/document/${docId}` });
      }
    } catch {
      // Silently fail — access tracking is non-critical
    }
  }

  /** Index vault via API (trigger re-index) */
  async indexVault(onProgress?: (current: number, total: number) => void): Promise<number> {
    if (!this.initialized) return 0;

    try {
      const resp = await requestUrl({ url: `${this.baseUrl}/api/graph/refresh` });
      const data = resp.json;
      return data.nodes?.length ?? 0;
    } catch {
      return 0;
    }
  }

  /** Index single file — not directly supported via API, use refresh */
  async indexFile(_filePath: string): Promise<void> {
    // Individual file indexing requires CLI. Skip in HTTP mode.
  }

  async destroy(): Promise<void> {
    this.initialized = false;
  }

  updateSettings(settings: StellavaultSettings): void {
    this.settings = settings;
    this.baseUrl = `http://127.0.0.1:${settings.apiPort ?? 3333}`;
  }
}
