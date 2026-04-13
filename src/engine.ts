import { requestUrl } from 'obsidian';
import type { App } from 'obsidian';
import type { StellavaultSettings, SearchResultItem, DecayItem } from './types';

/** Shape of a single result from the search API. */
interface ApiSearchResult {
  filePath?: string;
  title?: string;
  score?: number;
  snippet?: string;
  tags?: string[];
  document?: { id?: string };
}

/** Shape of a single item from the decay API. */
interface ApiDecayResult {
  filePath?: string;
  title?: string;
  documentId?: string;
  retrievability?: number;
  lastAccess?: string;
  daysSinceAccess?: number;
}

/** Shape of a gap item from the gaps API. */
interface ApiGapItem {
  suggestedTopic?: string;
  clusterA?: string;
  clusterB?: string;
  severity?: string;
}

/** Shape of an isolated node from the gaps API. */
interface ApiIsolatedNode {
  title?: string;
  connections?: number;
}

/** A single item in the learning path. */
export interface LearningPathItem {
  type: string;
  title?: string;
  filePath?: string;
  reason?: string;
  priority: number;
}

/** Default timeout for API requests (10s). Long enough for cold-start embedder. */
const API_TIMEOUT = 10000;

/** Retry count for transient failures. */
const MAX_RETRIES = 2;

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
  private _isIndexing = false;
  private _stats: { documentCount: number; chunkCount: number } | null = null;

  constructor(app: App, settings: StellavaultSettings) {
    this.app = app;
    this.settings = settings;
    this.baseUrl = `http://127.0.0.1:${settings.apiPort ?? 3333}`;
  }

  /** Fetch with timeout + retry. Returns parsed JSON or throws. */
  private async apiFetch(path: string, retries = MAX_RETRIES): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), API_TIMEOUT);
        const resp = await requestUrl({ url });
        clearTimeout(timer);
        if (resp.status >= 200 && resp.status < 300) return resp.json;
        throw new Error(`HTTP ${resp.status}`);
      } catch (err: unknown) {
        if (attempt === retries) throw err;
        // Brief pause before retry
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  /** Check if the API server is running */
  async init(): Promise<void> {
    if (this.initialized) return;

    const ports = [
      this.settings.apiPort ?? 3333,
      3333, 3334, 13333,
    ];
    // Deduplicate
    const uniquePorts = [...new Set(ports)];

    for (const port of uniquePorts) {
      try {
        const url = `http://127.0.0.1:${port}/api/stats`;
        const resp = await requestUrl({ url });
        if (resp.status === 200) {
          this.baseUrl = `http://127.0.0.1:${port}`;
          this._stats = resp.json as { documentCount: number; chunkCount: number };
          this.initialized = true;
          return;
        }
      } catch { /* try next */ }
    }

    throw new Error(
      `Stellavault API server not found.\n\n` +
      'Start the server in a terminal:\n' +
      '  npx stellavault graph\n\n' +
      `Tried ports: ${uniquePorts.join(', ')}\n` +
      'Change the port in Settings → Stellavault → API server port.'
    );
  }

  /** Cached stats from last init/refresh. */
  get stats() { return this._stats; }

  get isReady(): boolean {
    return this.initialized;
  }

  get isIndexing(): boolean {
    return this._isIndexing;
  }

  /** Semantic + keyword hybrid search via API */
  async search(query: string): Promise<SearchResultItem[]> {
    if (!this.initialized) return [];

    try {
      const data = await this.apiFetch(
        `/api/search?q=${encodeURIComponent(query)}&limit=${this.settings.maxResults}`
      ) as { results?: ApiSearchResult[] };
      return (data.results ?? []).map((r) => ({
        filePath: r.filePath ?? '',
        title: r.title ?? 'Untitled',
        score: r.score ?? 0,
        snippet: r.snippet ?? '',
        tags: r.tags ?? [],
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
      const data = await this.apiFetch('/api/decay') as { topDecaying?: ApiDecayResult[] };
      return (data.topDecaying ?? []).slice(0, limit).map((item) => ({
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
  async getLearningPath(): Promise<LearningPathItem[]> {
    if (!this.initialized) return [];

    try {
      const data = await this.apiFetch('/api/gaps') as {
        gaps?: ApiGapItem[];
        isolatedNodes?: ApiIsolatedNode[];
      };
      const items: LearningPathItem[] = [];
      for (const gap of data.gaps ?? []) {
        items.push({
          type: 'bridge',
          title: gap.suggestedTopic,
          reason: `Weak link between "${gap.clusterA}" and "${gap.clusterB}"`,
          priority: gap.severity === 'high' ? 1 : gap.severity === 'medium' ? 2 : 3,
        });
      }
      for (const node of (data.isolatedNodes ?? []).slice(0, 5)) {
        items.push({
          type: 'explore',
          title: node.title,
          reason: `Isolated note (${node.connections} connections)`,
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
      const data = await this.apiFetch(
        `/api/search?q=${encodeURIComponent(filePath)}&limit=1`, 0
      ) as { results?: ApiSearchResult[] };
      const docId = data.results?.[0]?.document?.id;
      if (docId) {
        await this.apiFetch(`/api/document/${docId}`, 0);
      }
    } catch {
      // Non-critical — silently fail
    }
  }

  /** Trigger vault re-index via API */
  async indexVault(): Promise<number> {
    if (!this.initialized) return 0;
    this._isIndexing = true;

    try {
      const data = await this.apiFetch('/api/reindex', 0) as {
        indexed?: number;
        nodes?: unknown[];
      };
      return data.indexed ?? data.nodes?.length ?? 0;
    } catch {
      return 0;
    } finally {
      this._isIndexing = false;
    }
  }

  /** Index single file — not directly supported via API */
  async indexFile(_filePath: string): Promise<void> {
    // Individual file indexing requires CLI. Skip in HTTP mode.
  }

  destroy(): void {
    this.initialized = false;
  }

  updateSettings(settings: StellavaultSettings): void {
    this.settings = settings;
    this.baseUrl = `http://127.0.0.1:${settings.apiPort ?? 3333}`;
  }
}
