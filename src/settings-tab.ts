import { App, PluginSettingTab, Setting } from 'obsidian';
import type StellavaultPlugin from './main';

export class StellavaultSettingTab extends PluginSettingTab {
	plugin: StellavaultPlugin;

	constructor(app: App, plugin: StellavaultPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('General').setHeading();

		new Setting(containerEl)
			.setName('Auto-index on file changes')
			.setDesc('Automatically re-index documents when they are modified.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoIndex)
					.onChange(async (value) => {
						this.plugin.settings.autoIndex = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Max search results')
			.setDesc('Maximum number of results to show in semantic search.')
			.addSlider((slider) =>
				slider
					.setLimits(5, 50, 5)
					.setValue(this.plugin.settings.maxResults)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxResults = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Show decay badges')
			.setDesc('Display memory decay indicators in the file explorer.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showDecayBadges)
					.onChange(async (value) => {
						this.plugin.settings.showDecayBadges = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Decay warning threshold')
			.setDesc(
				'Retrievability below this value triggers a decay warning (0.0 = forgotten, 1.0 = fresh).'
			)
			.addSlider((slider) =>
				slider
					.setLimits(0.1, 0.9, 0.1)
					.setValue(this.plugin.settings.decayThreshold)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.decayThreshold = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Language')
			.setDesc('UI language for the plugin.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('en', 'English')
					.addOption('ko', 'Korean')
					.addOption('ja', 'Japanese')
					.setValue(this.plugin.settings.locale)
					.onChange(async (value) => {
						this.plugin.settings.locale = value as 'en' | 'ko' | 'ja';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('API server port')
			.setDesc('Port of the Stellavault API server (run `stellavault graph` in terminal).')
			.addText((text) =>
				text
					.setPlaceholder('3333')
					.setValue(String(this.plugin.settings.apiPort))
					.onChange(async (value) => {
						const port = parseInt(value, 10);
						if (port > 0 && port < 65536) {
							this.plugin.settings.apiPort = port;
							await this.plugin.saveSettings();
						}
					})
			);

		// Status section
		new Setting(containerEl).setName('Status').setHeading();

		const statusEl = containerEl.createDiv({ cls: 'sv-settings-status' });

		const engine = this.plugin.engine;
		if (engine.isReady) {
			statusEl.createDiv({ text: 'Engine: Ready', cls: 'sv-status-ok' });
		} else {
			statusEl.createDiv({ text: 'Engine: Not initialized', cls: 'sv-status-warn' });
		}

		// Manual reindex button
		new Setting(containerEl)
			.setName('Reindex vault')
			.setDesc('Rebuild the entire search index. This may take a while for large vaults.')
			.addButton((btn) =>
				btn
					.setButtonText('Reindex')
					.setCta()
					.onClick(async () => {
						btn.setButtonText('Indexing...');
						btn.setDisabled(true);
						try {
							const count = await engine.indexVault();
							btn.setButtonText(`Done (${count} files)`);
						} catch {
							btn.setButtonText('Failed');
						} finally {
							setTimeout(() => {
								btn.setButtonText('Reindex');
								btn.setDisabled(false);
							}, 3000);
						}
					})
			);
	}
}
