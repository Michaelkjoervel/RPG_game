// Persisted user settings, independent of save slots.
import { bus } from './events.js';

const KEY = 'lumenfall_settings';
const DEFAULTS = {
  musicVol: 0.7, sfxVol: 0.8, quality: 'high', textSpeed: 'normal',
  camShake: true, invertY: false, showDamageNumbers: true,
};

export const settings = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) Object.assign(settings, JSON.parse(raw));
} catch (e) { /* private mode etc. — keep defaults */ }

export function updateSetting(key, value) {
  settings[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  bus.emit('settings:changed', { key, value });
}
