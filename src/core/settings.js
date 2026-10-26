// Persisted user settings, independent of save slots (kept by core/storage.js).
import { bus } from './events.js';
import { storage } from './storage.js';

const KEY = 'lumenfall_settings';
const DEFAULTS = {
  musicVol: 0.7, sfxVol: 0.8, quality: 'high', textSpeed: 'normal',
  camShake: true, invertY: false, showDamageNumbers: true,
};

export const settings = { ...DEFAULTS };
reloadSettings();

/** Re-read the stored settings (main.js calls it once cloud storage has
 *  connected, before the renderer starts). */
export function reloadSettings() {
  try {
    const raw = storage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* unreadable — keep what we have */ }
}

export function updateSetting(key, value) {
  settings[key] = value;
  try { storage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  bus.emit('settings:changed', { key, value });
}
