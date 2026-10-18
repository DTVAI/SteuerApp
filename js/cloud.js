// Storage adapters shared by the page and service worker. Credentials never enter
// document records, localStorage, UI status objects or diagnostic messages.
import * as store from './store.js';
import { buildFilename, buildPath } from './analyze.js';

const KEYS = {
  destination: 'storage.destination',
  auth: 'storage.dropbox.auth',
  pending: 'storage.dropbox.pending',
  folder: 'storage.folder.handle',
};
const DROPBOX_LIMIT = 150_000_000; // Safely below Dropbox's single-request limit.
const FLOW_TTL = 10 * 60 * 1000;
const EXPIRY_MARGIN = 60 * 1000;
let folderCache = null;
let folderCacheId = null;
let uploadTail = Promise.resolve();
let oauthTail = Promise.resolve();
let activeUpload = null;

function failure(code, message, nonretryable = false) {
  return Object.assign(new Error(message), { code, nonretryable });
}

async function persistentStore() {
  const state = await store.openStore();
  if (state?.memoryOnly || store.isMemoryOnly) {
    throw failure('STORAGE_REQUIRED', 'Dauerhafter Browserspeicher ist für die Ablage erforderlich.', true);
  }
}

function safeSegment(value, fallback = 'Beleg') {
  let text = String(value ?? '').normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 180);
  if (!text) text = fallback;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(text)) text = `_${text}`;
  return text;
}

function basePath(value, provider) {
  const input = String(value ?? (provider === 'dropbox' ? '/Belegwerk' : '')).trim();
  const parts = input.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length > 10 || parts.some(part => part === '.' || part === '..' || safeSegment(part) !== part)) {
    throw failure('INVALID_DESTINATION', 'Der Zielordner enthält ungültige Zeichen.', true);
  }
  const path = parts.join('/');
  return provider === 'dropbox' ? (path ? `/${path}` : '') : path;
}

function configuration(value) {
  if (value?.provider === 'dropbox') {
    return { provider: 'dropbox', clientId: String(value.clientId ?? '').trim(),
      basePath: basePath(value.basePath, 'dropbox'), id: String(value.id || 'dropbox-v1') };
  }
  if (value?.provider === 'folder') {
    return { provider: 'folder', basePath: basePath(value.basePath, 'folder'),
      label: safeSegment(value.label || 'Ausgewählter Ordner'), id: String(value.id || 'folder-v1') };
  }
  return { provider: 'none' };
}

function randomString(bytes = 32) {
  if (!globalThis.crypto?.getRandomValues) {
    throw failure('CRYPTO_REQUIRED', 'Diese Funktion benötigt einen sicheren Browserkontext.', true);
  }
  return base64url(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function digest(value) {
  if (!globalThis.crypto?.subtle) {
    throw failure('CRYPTO_REQUIRED', 'Diese Funktion benötigt HTTPS oder localhost.', true);
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function getDestination() {
  try { return configuration(await store.getSetting(KEYS.destination, null)); }
  catch (error) { if (error.code === 'INVALID_DESTINATION') return { provider: 'none' }; throw error; }
}

/** Serialize page/worker uploads and destination changes under the same lock. */
function serializedStorage(operation) {
  const locked = () => typeof globalThis.navigator?.locks?.request === 'function' ?
    globalThis.navigator.locks.request('belegwerk-storage-upload', { mode: 'exclusive' }, operation) : operation();
  const result = uploadTail.then(locked, locked);
  uploadTail = result.catch(() => {});
  return result;
}

/** Changes configuration only. The caller explicitly decides which jobs to enqueue. */
export function setDestination(value) {
  activeUpload?.abort();
  return serializedStorage(() => changeDestination(value));
}

async function changeDestination(value) {
  await persistentStore();
  const previous = await getDestination();
  const next = configuration(value);
  if (next.provider !== 'none') {
    const unchanged = previous.provider === next.provider && previous.basePath === next.basePath &&
      (next.provider !== 'dropbox' || previous.clientId === next.clientId);
    next.id = unchanged ? previous.id : randomString(16);
  }
  if (next.provider !== 'dropbox' || previous.clientId !== next.clientId) {
    await store.setSetting(KEYS.auth, null);
    await store.setSetting(KEYS.pending, null);
  }
  if (next.provider !== 'folder') {
    folderCache = null;
    folderCacheId = null;
    await store.setSetting(KEYS.folder, null);
  }
  await store.setSetting(KEYS.destination, next);
  return next;
}

function pageLocation() {
  const location = globalThis.location;
  if (!location || typeof location.assign !== 'function') {
    throw failure('AUTH_REQUIRED', 'Dropbox bitte in der geöffneten App verbinden.', true);
  }
  const url = new URL(location.href);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))) {
    throw failure('INSECURE_CONTEXT', 'Dropbox benötigt HTTPS oder localhost.', true);
  }
  return url;
}

/** Public Dropbox app key only; no app secret or refresh token is used. */
export async function connectDropbox(clientId) {
  const client = String(clientId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{6,100}$/.test(client)) {
    throw failure('INVALID_DESTINATION', 'Bitte einen gültigen öffentlichen Dropbox-App-Key eingeben.', true);
  }
  const page = pageLocation();
  const redirectUri = `${page.origin}${page.pathname}`;
  const verifier = randomString(64);
  const state = randomString();
  const challenge = base64url(await digest(verifier));
  const previous = await getDestination();
  await setDestination({ provider: 'dropbox', clientId: client,
    basePath: previous.provider === 'dropbox' ? previous.basePath : '/Belegwerk' });
  await store.setSetting(KEYS.auth, null);
  await store.setSetting(KEYS.pending, { verifier, state, clientId: client, redirectUri,
    createdAt: Date.now(), exchanging: false });
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: client, response_type: 'code', redirect_uri: redirectUri,
    state, code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'online',
    scope: 'files.content.write' }).toString();
  globalThis.location.assign(url.href);
}

function removeOAuthParameters(url) {
  for (const key of ['code', 'state', 'error', 'error_description']) url.searchParams.delete(key);
  globalThis.history?.replaceState(globalThis.history.state, '', url.href);
}

export function completeDropboxAuth() {
  const task = () => finishDropboxAuth();
  const result = oauthTail.then(task, task);
  oauthTail = result.catch(() => {});
  return result;
}

async function finishDropboxAuth() {
  if (!globalThis.location?.href || !globalThis.history?.replaceState) return false;
  const url = new URL(globalThis.location.href);
  const pending = await store.getSetting(KEYS.pending, null);
  const callback = url.searchParams.has('code') || url.searchParams.has('error');
  if (!callback) {
    if (pending && Date.now() - pending.createdAt > FLOW_TTL) {
      await store.setSetting(KEYS.pending, null);
      await store.setSetting(KEYS.auth, null);
    }
    return false;
  }
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.has('error');
  removeOAuthParameters(url);
  const valid = pending && !pending.exchanging && state && state === pending.state &&
    Number.isFinite(pending.createdAt) && Date.now() - pending.createdAt >= 0 &&
    Date.now() - pending.createdAt <= FLOW_TTL && `${url.origin}${url.pathname}` === pending.redirectUri;
  if (!valid || denied || !code) {
    await store.setSetting(KEYS.auth, null);
    await store.setSetting(KEYS.pending, null);
    throw failure('AUTH_REQUIRED', 'Dropbox-Anmeldung ungültig, abgelaufen oder abgebrochen. Bitte erneut verbinden.', true);
  }
  await persistentStore();
  await store.setSetting(KEYS.auth, null);
  await store.setSetting(KEYS.pending, { ...pending, exchanging: true });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: pending.clientId,
        code_verifier: pending.verifier, redirect_uri: pending.redirectUri }),
    });
    if (!response.ok) throw failure('AUTH_REQUIRED', 'Dropbox-Anmeldung fehlgeschlagen. Bitte erneut verbinden.', true);
    const data = await response.json();
    const lifetime = Number(data.expires_in);
    if (typeof data.access_token !== 'string' || !data.access_token || data.token_type?.toLowerCase() !== 'bearer' ||
        !Number.isFinite(lifetime) || lifetime <= 60) {
      throw failure('AUTH_REQUIRED', 'Dropbox hat keine gültige kurzlebige Sitzung geliefert.', true);
    }
    const current = await store.getSetting(KEYS.pending, null);
    const destination = await getDestination();
    if (current?.state !== pending.state || destination.provider !== 'dropbox' || destination.clientId !== pending.clientId) {
      throw failure('AUTH_REQUIRED', 'Dropbox-Anmeldung wurde zwischenzeitlich beendet.', true);
    }
    await store.setSetting(KEYS.auth, { accessToken: data.access_token, clientId: pending.clientId,
      expiresAt: Date.now() + Math.min(lifetime, 4 * 60 * 60) * 1000 });
    await store.setSetting(KEYS.pending, null);
    return true;
  } catch (error) {
    const current = await store.getSetting(KEYS.pending, null);
    if (current?.state === pending.state) {
      await store.setSetting(KEYS.pending, null);
      await store.setSetting(KEYS.auth, null);
    }
    if (error.code === 'AUTH_REQUIRED') throw error;
    throw failure('AUTH_REQUIRED', 'Dropbox-Anmeldung konnte nicht abgeschlossen werden. Bitte erneut verbinden.', true);
  } finally { clearTimeout(timeout); }
}

async function validAuth(config) {
  const auth = await store.getSetting(KEYS.auth, null);
  if (!auth?.accessToken || auth.clientId !== config.clientId ||
      !Number.isFinite(auth.expiresAt) || auth.expiresAt <= Date.now() + EXPIRY_MARGIN) {
    await store.setSetting(KEYS.auth, null);
    throw failure('AUTH_REQUIRED', 'Dropbox bitte erneut verbinden; die Sitzung ist abgelaufen.', true);
  }
  return auth;
}

export async function disconnectDropbox() {
  const auth = await store.getSetting(KEYS.auth, null);
  activeUpload?.abort();
  await store.setSetting(KEYS.auth, null);
  await store.setSetting(KEYS.pending, null);
  if ((await getDestination()).provider === 'dropbox') await setDestination({ provider: 'none' });
  // Local disconnection succeeds offline too. Best-effort server revocation uses
  // the former short-lived token, without retaining it for a retry.
  if (auth?.accessToken && globalThis.navigator?.onLine !== false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch('https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST',
        credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${auth.accessToken}` } });
    } catch { /* No credentials or network details in logs. */ }
    finally { clearTimeout(timeout); }
  }
}

/** Must be called directly from a user gesture. No worker permission prompts. */
export async function chooseFolder() {
  if (typeof globalThis.showDirectoryPicker !== 'function') {
    throw failure('NOT_SUPPORTED', 'Ordnerablage wird von diesem Browser nicht unterstützt. Bitte Dropbox oder Export verwenden.', true);
  }
  let handle;
  try { handle = await globalThis.showDirectoryPicker({ mode: 'readwrite', id: 'belegwerk-storage' }); }
  catch (error) { if (error.name === 'AbortError') return null; throw failure('PERMISSION_REQUIRED', 'Der Ordner konnte nicht geöffnet werden.', true); }
  // Drop the former handle before publishing a new destination. A concurrent
  // worker must never write into the previously selected folder during a switch.
  await setDestination({ provider: 'none' });
  const config = await setDestination({ provider: 'folder', label: handle.name, basePath: '' });
  await store.setSetting(KEYS.folder, { destinationId: config.id, handle });
  folderCache = handle;
  folderCacheId = config.id;
  return config;
}

async function folderHandle(config) {
  if (folderCache && folderCacheId === config.id) return folderCache;
  const record = await store.getSetting(KEYS.folder, null);
  if (record?.destinationId !== config.id) return null;
  folderCacheId = config.id;
  return (folderCache = record.handle);
}

async function hasFolderPermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return false;
  try { return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'; }
  catch { return false; }
}

export async function requestFolderPermission() {
  const config = await getDestination();
  if (config.provider !== 'folder') {
    throw failure('NOT_CONFIGURED', 'Bitte zuerst einen Zielordner auswählen.', true);
  }
  const handle = await folderHandle(config);
  if (!handle || typeof handle.requestPermission !== 'function') {
    throw failure('PERMISSION_REQUIRED', 'Bitte den Zielordner in der geöffneten App erneut auswählen.', true);
  }
  try { return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'; }
  catch { throw failure('PERMISSION_REQUIRED', 'Ordnerzugriff bitte durch einen Klick in der App erlauben.', true); }
}

/** Safe for rendering: never returns credentials, OAuth verifier or folder handle. */
export async function getConnectionStatus() {
  const config = await getDestination();
  const status = { provider: config.provider, configured: config.provider !== 'none', connected: false,
    label: 'Nur auf diesem Gerät', message: 'Noch kein Ablageziel verbunden.', requiresGesture: false,
    supportsFolder: typeof globalThis.showDirectoryPicker === 'function' };
  if (config.provider === 'dropbox') {
    status.label = `Dropbox · ${config.basePath || '/'}`;
    try {
      const auth = await validAuth(config);
      Object.assign(status, { connected: true, expiresAt: auth.expiresAt,
        message: 'Verbunden. Wartende Belege können hochgeladen werden.' });
    } catch (error) {
      if (error.code !== 'AUTH_REQUIRED') throw error;
      Object.assign(status, { requiresGesture: true, message: 'Dropbox erneut verbinden, um die Ablage fortzusetzen.' });
    }
  } else if (config.provider === 'folder') {
    status.label = config.label;
    status.connected = await hasFolderPermission(await folderHandle(config));
    status.requiresGesture = !status.connected;
    status.message = status.connected ? 'Ordnerzugriff erlaubt. Die Synchronisierung übernimmt gegebenenfalls deine Speicher-App.' :
      'Ordnerzugriff in der geöffneten App erneut erlauben.';
  }
  return status;
}

async function documentPath(config, doc) {
  const key = `storage.path.${config.id}.${doc.id}`;
  const existing = await store.getSetting(key, null);
  if (typeof existing === 'string' && existing && !existing.split('/').some(part => part === '.' || part === '..')) return existing;
  const hash = String(doc.file?.hash || '');
  const suffix = /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase().slice(0, 24) :
    [...await digest(`belegwerk:${doc.id}:${hash}`)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const filename = safeSegment(buildFilename(doc));
  const dot = filename.lastIndexOf('.');
  const name = dot > 0 ? `${filename.slice(0, dot)}__${suffix}${filename.slice(dot)}` : `${filename}__${suffix}`;
  const parts = [...config.basePath.split('/').filter(Boolean), ...buildPath(doc).split('/').map(part => safeSegment(part)), name];
  const path = `${config.provider === 'dropbox' ? '/' : ''}${parts.join('/')}`;
  if (path.length > 1750) throw failure('INVALID_DESTINATION', 'Der Ablagepfad ist zu lang.', true);
  // Persist before the request: metadata edits or a crash after remote ACK do not
  // turn a retry into a second copy with a different name.
  await store.setSetting(key, path);
  return path;
}

function asciiJSON(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

async function uploadDropbox(config, path, blob) {
  if (blob.size > DROPBOX_LIMIT) throw failure('FILE_TOO_LARGE', 'Dropbox-Ablage unterstützt Dateien bis 150 MB. Bitte die Datei exportieren oder einen Ordner verwenden.', true);
  if (globalThis.navigator?.onLine === false) throw failure('OFFLINE', 'Upload wartet auf eine Internetverbindung.');
  const auth = await validAuth(config);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 10 * 60 * 1000);
  activeUpload = controller;
  let response;
  try {
    response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST', body: blob, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': asciiJSON({ path, mode: 'overwrite', autorename: false, mute: true, strict_conflict: false }) },
    });
  } catch (error) {
    if (timedOut) throw failure('UPLOAD_FAILED', 'Dropbox hat den Upload nicht rechtzeitig bestätigt. Er wird erneut versucht.');
    if (error.name === 'AbortError') throw failure('NOT_CONFIGURED', 'Das Ablageziel wurde geändert. Bitte erneut versuchen.', true);
    throw failure('OFFLINE', 'Dropbox ist gerade nicht erreichbar. Der Upload bleibt vorgemerkt.');
  } finally { clearTimeout(timeout); if (activeUpload === controller) activeUpload = null; }
  if (response.status === 401 || response.status === 403) {
    if ((await store.getSetting(KEYS.auth, null))?.accessToken === auth.accessToken) await store.setSetting(KEYS.auth, null);
    throw failure('AUTH_REQUIRED', 'Dropbox-Sitzung oder Schreibberechtigung fehlt. Bitte erneut verbinden.', true);
  }
  if (response.status === 409) throw failure('DESTINATION_CONFLICT', 'Dropbox kann den Ablagepfad nicht anlegen. Bitte den Zielordner prüfen.', true);
  if (response.status === 507) throw failure('CLOUD_STORAGE_FULL', 'Dropbox-Speicher ist voll.', true);
  if (!response.ok) {
    const error = failure('UPLOAD_FAILED', 'Dropbox hat den Upload nicht bestätigt. Er wird erneut versucht.', response.status >= 400 && response.status < 500 && response.status !== 429);
    const retryAfter = Number(response.headers?.get('Retry-After'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = Math.min(retryAfter, 3600);
    throw error;
  }
  let result;
  try { result = await response.json(); }
  catch { throw failure('UPLOAD_FAILED', 'Dropbox hat keine gültige Upload-Bestätigung geliefert.'); }
  if (!result?.id || (!result.path_lower && !result.path_display)) {
    throw failure('UPLOAD_FAILED', 'Dropbox hat keine vollständige Upload-Bestätigung geliefert.');
  }
  return { destination: 'dropbox', path, remoteId: result.id, uploadedAt: new Date().toISOString() };
}

async function uploadFolder(config, path, blob) {
  let directory = await folderHandle(config);
  if (!await hasFolderPermission(directory)) {
    throw failure('PERMISSION_REQUIRED', 'Ordnerzugriff bitte in der geöffneten App erlauben.', true);
  }
  let writable;
  try {
    const parts = path.split('/');
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true });
    const handle = await directory.getFileHandle(parts.at(-1), { create: true });
    writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    try { await writable?.abort(); } catch { /* Original failure is reported below. */ }
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      throw failure('PERMISSION_REQUIRED', 'Ordnerzugriff bitte in der geöffneten App erneut erlauben.', true);
    }
    throw failure('UPLOAD_FAILED', 'Die Datei konnte nicht im Zielordner abgelegt werden. Bitte Speicherplatz und Zugriff prüfen.');
  }
  return { destination: 'folder', path, uploadedAt: new Date().toISOString() };
}

/** Serial uploads, including independent page/worker calls where Web Locks exist. */
export function uploadDocument(doc, blob) {
  const task = async () => {
    await persistentStore();
    if (!doc?.id || typeof doc.id !== 'string') throw failure('INVALID_DOCUMENT', 'Der Beleg hat keine gültige Kennung.', true);
    const config = await getDestination();
    if (config.provider === 'none') throw failure('NOT_CONFIGURED', 'Bitte zuerst ein Ablageziel verbinden.', true);
    const original = blob ?? await store.getBlob(doc.id);
    if (!original || typeof original.size !== 'number') throw failure('INVALID_DOCUMENT', 'Die Originaldatei ist nicht verfügbar.', true);
    const path = await documentPath(config, doc);
    if ((await getDestination()).id !== config.id) {
      throw failure('NOT_CONFIGURED', 'Das Ablageziel wurde geändert. Bitte erneut versuchen.', true);
    }
    const result = await (config.provider === 'dropbox' ? uploadDropbox(config, path, original) : uploadFolder(config, path, original));
    return { ...result, destinationId: config.id };
  };
  return serializedStorage(task);
}
