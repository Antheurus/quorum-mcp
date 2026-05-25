function app() {
  return {
    // ---- State ----
    view: 'overview',           // 'overview' | 'domain' | 'settings'
    domains: [],
    selectedDomain: null,       // domain name string
    domainTab: 'ledger',        // 'ledger' | 'consolidated' | 'quarantine'
    ledger: [],
    consolidated: [],
    quarantine: [],
    config: null,
    toast: null,                // {msg, type} | null
    loading: false,
    consolidating: false,
    consolidateResult: null,
    savingConfig: false,

    engineNames: [
      'hash-only',
      'claude-haiku',
      'claude-sonnet',
      'openai-embed',
      'gemini',
      'deepseek',
      'minimax',
      'local-minilm',
    ],
    needsApiKey: [
      'claude-haiku',
      'claude-sonnet',
      'openai-embed',
      'gemini',
      'deepseek',
      'minimax',
    ],

    // ---- Engine → api_keys field mapping ----
    engineApiKeyField(engine) {
      const map = {
        'claude-haiku':  'anthropic',
        'claude-sonnet': 'anthropic',
        'openai-embed':  'openai',
        'gemini':        'gemini',
        'deepseek':      'deepseek',
        'minimax':       'minimax',
      };
      return map[engine] ?? null;
    },

    get currentApiKeyField() {
      if (!this.config) return null;
      return this.engineApiKeyField(this.config.similarity.engine);
    },

    get currentApiKeyValue() {
      if (!this.config || !this.currentApiKeyField) return '';
      return this.config.similarity.api_keys[this.currentApiKeyField] ?? '';
    },

    set currentApiKeyValue(val) {
      if (!this.config || !this.currentApiKeyField) return;
      this.config.similarity.api_keys[this.currentApiKeyField] = val;
    },

    // ---- Init ----
    async init() {
      await Promise.all([this.loadDomains(), this.loadConfig()]);
    },

    // ---- Data loaders ----
    async loadDomains() {
      try {
        const res = await fetch('/api/domains');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.domains = await res.json();
      } catch (err) {
        this.showToast('Failed to load domains: ' + err.message, 'error');
      }
    },

    async selectDomain(name) {
      this.selectedDomain = name;
      this.domainTab = 'ledger';
      this.ledger = [];
      this.consolidated = [];
      this.quarantine = [];
      this.consolidateResult = null;
      this.view = 'domain';
      await this.loadTab('ledger');
    },

    async loadTab(tab) {
      this.domainTab = tab;
      this.loading = true;
      try {
        const name = encodeURIComponent(this.selectedDomain);
        if (tab === 'ledger') {
          const res = await fetch(`/api/domain/${name}/ledger?since=0&limit=50`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.ledger = await res.json();
        } else if (tab === 'consolidated') {
          const res = await fetch(`/api/domain/${name}/consolidated`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.consolidated = await res.json();
        } else if (tab === 'quarantine') {
          const res = await fetch(`/api/domain/${name}/quarantine`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.quarantine = await res.json();
        }
      } catch (err) {
        this.showToast('Failed to load ' + tab + ': ' + err.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    async loadConfig() {
      try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.config = await res.json();
      } catch (err) {
        this.showToast('Failed to load config: ' + err.message, 'error');
      }
    },

    // ---- Actions ----
    async consolidate() {
      if (!this.selectedDomain || this.consolidating) return;
      this.consolidating = true;
      this.consolidateResult = null;
      try {
        const name = encodeURIComponent(this.selectedDomain);
        const res = await fetch(`/api/domain/${name}/consolidate`, { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        this.consolidateResult = data;
        this.showToast('Consolidation complete', 'success');
        // Refresh current tab data
        await this.loadTab(this.domainTab);
      } catch (err) {
        this.showToast('Consolidation failed: ' + err.message, 'error');
      } finally {
        this.consolidating = false;
      }
    },

    async saveConfig() {
      if (!this.config || this.savingConfig) return;
      this.savingConfig = true;
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.config),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        this.showToast('Settings saved', 'success');
        // Reload config to get masked key values back from server
        await this.loadConfig();
      } catch (err) {
        this.showToast('Save failed: ' + err.message, 'error');
      } finally {
        this.savingConfig = false;
      }
    },

    // ---- Helpers ----
    showToast(msg, type = 'success') {
      this.toast = { msg, type };
      setTimeout(() => { this.toast = null; }, 3000);
    },

    formatTs(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleString();
    },

    formatScore(score) {
      if (score === null || score === undefined) return '—';
      return (score * 100).toFixed(1) + '%';
    },

    backToOverview() {
      this.view = 'overview';
      this.selectedDomain = null;
      this.consolidateResult = null;
      this.loadDomains();
    },
  };
}
