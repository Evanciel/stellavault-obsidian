import type { App } from 'obsidian';
import type { StellavaultSettings, SearchResultItem, DecayItem } from './types';

/**
 * Bridge between Obsidian vault and @stellavault/core.
 * Manages the SQLite vector store, embedder, and search engine lifecycle.
 */
export class StellavaultEngine {
	private app: App;
	private settings: StellavaultSettings;
	private store: any = null;
	private embedder: any = null;
	private searchEngine: any = null;
	private decayEngine: any = null;
	private initialized = false;
	private indexing = false;

	constructor(app: App, settings: StellavaultSettings) {
		this.app = app;
		this.settings = settings;
	}

	/** Initialize stellavault core components */
	async init(): Promise<void> {
		if (this.initialized) return;

		try {
			// Dynamic import to handle missing dependency gracefully
			const core = await import('stellavault');

			const vaultPath = (this.app.vault.adapter as any).basePath;
			const dbPath = `${vaultPath}/.stellavault.db`;

			this.store = await core.createSqliteVecStore(dbPath);
			this.embedder = await core.createLocalEmbedder();
			this.searchEngine = core.createSearchEngine(this.store, this.embedder);

			// Initialize decay engine for memory tracking
			this.decayEngine = new core.DecayEngine(this.store);

			this.initialized = true;
		} catch (err) {
			console.error('[Stellavault] Failed to initialize engine:', err);
			throw new Error(
				'Could not initialize Stellavault. Make sure @stellavault/core is installed.'
			);
		}
	}

	get isReady(): boolean {
		return this.initialized;
	}

	get isIndexing(): boolean {
		return this.indexing;
	}

	/** Index or re-index the entire vault */
	async indexVault(onProgress?: (current: number, total: number) => void): Promise<number> {
		if (!this.initialized) throw new Error('Engine not initialized');
		if (this.indexing) return 0;

		this.indexing = true;
		try {
			const core = await import('stellavault');
			const vaultPath = (this.app.vault.adapter as any).basePath;

			const docs = await core.scanVault(vaultPath);
			let indexed = 0;

			for (const doc of docs) {
				const chunks = await core.chunkDocument(doc);
				for (const chunk of chunks) {
					const embedding = await this.embedder.embed(chunk.text);
					await this.store.upsert({
						id: chunk.id,
						text: chunk.text,
						embedding,
						metadata: {
							filePath: doc.filePath,
							title: doc.title,
							tags: doc.tags,
						},
					});
				}
				indexed++;
				onProgress?.(indexed, docs.length);
			}

			return indexed;
		} finally {
			this.indexing = false;
		}
	}

	/** Index a single file (for incremental updates) */
	async indexFile(filePath: string): Promise<void> {
		if (!this.initialized) return;

		try {
			const core = await import('stellavault');
			const vaultPath = (this.app.vault.adapter as any).basePath;
			const fullPath = `${vaultPath}/${filePath}`;

			const docs = await core.scanVault(vaultPath, { files: [fullPath] });
			if (docs.length === 0) return;

			const doc = docs[0];
			const chunks = await core.chunkDocument(doc);

			for (const chunk of chunks) {
				const embedding = await this.embedder.embed(chunk.text);
				await this.store.upsert({
					id: chunk.id,
					text: chunk.text,
					embedding,
					metadata: {
						filePath: doc.filePath,
						title: doc.title,
						tags: doc.tags,
					},
				});
			}
		} catch (err) {
			console.error(`[Stellavault] Failed to index ${filePath}:`, err);
		}
	}

	/** Semantic + keyword hybrid search */
	async search(query: string): Promise<SearchResultItem[]> {
		if (!this.initialized) return [];

		const results = await this.searchEngine.search(query, {
			limit: this.settings.maxResults,
		});

		return results.map((r: any) => ({
			filePath: r.metadata?.filePath ?? '',
			title: r.metadata?.title ?? r.metadata?.filePath ?? 'Untitled',
			score: r.score ?? 0,
			snippet: r.text?.substring(0, 200) ?? '',
			tags: r.metadata?.tags ?? [],
		}));
	}

	/** Get documents sorted by decay (most forgotten first) */
	async getDecayingDocs(limit = 20): Promise<DecayItem[]> {
		if (!this.initialized || !this.decayEngine) return [];

		try {
			const items = await this.decayEngine.getDecayingItems(limit);
			return items.map((item: any) => ({
				filePath: item.filePath,
				title: item.title ?? item.filePath,
				retrievability: item.retrievability ?? 0,
				lastAccessed: item.lastAccessed ?? '',
				daysSinceAccess: item.daysSinceAccess ?? 0,
			}));
		} catch {
			return [];
		}
	}

	/** Generate a learning path based on decay and gaps */
	async getLearningPath(): Promise<any[]> {
		if (!this.initialized) return [];

		try {
			const core = await import('stellavault');
			const path = await core.generateLearningPath(this.store, this.embedder);
			return path?.items ?? [];
		} catch {
			return [];
		}
	}

	/** Record that a document was accessed (for decay tracking) */
	async recordAccess(filePath: string): Promise<void> {
		if (!this.initialized || !this.decayEngine) return;
		try {
			await this.decayEngine.recordAccess(filePath);
		} catch {
			// Silently fail — decay is non-critical
		}
	}

	/** Cleanup resources */
	async destroy(): Promise<void> {
		if (this.store?.close) {
			await this.store.close();
		}
		this.initialized = false;
	}

	updateSettings(settings: StellavaultSettings): void {
		this.settings = settings;
	}
}
