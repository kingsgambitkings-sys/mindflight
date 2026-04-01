// ===== Settings Store =====
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '..', 'data', 'settings.json');

// Ensure data directory exists
mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

const defaults = {
  name: 'Rovin',
  jarvisEmail: '',
  voiceLang: 'en-US',
  briefTime: '08:00',
  theme: 'dark',
};

function load() {
  if (existsSync(SETTINGS_PATH)) {
    try {
      return { ...defaults, ...JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) };
    } catch {
      return { ...defaults };
    }
  }
  return { ...defaults };
}

function save(settings) {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export const settingsStore = {
  get() {
    return load();
  },

  update(partial) {
    const current = load();
    const updated = { ...current, ...partial };
    save(updated);
    return updated;
  },

  set(key, value) {
    const current = load();
    current[key] = value;
    save(current);
  }
};
