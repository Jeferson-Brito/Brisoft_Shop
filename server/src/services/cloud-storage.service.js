const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { supabase, isSupabaseConfigured } = require('../config/supabase');

const MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'chat-media';
const SESSION_BUCKET = process.env.SUPABASE_SESSION_BUCKET || 'whatsapp-sessions';
const SESSION_SNAPSHOT_FILE = '_session_snapshot.json.gz';
const SESSION_BACKUP_SKIP = new Set(['message-retry-cache.json', 'lid-map.json']);
const SESSION_CONCURRENCY = Math.max(2, Math.min(32, Number.parseInt(process.env.WHATSAPP_SESSION_STORAGE_CONCURRENCY, 10) || 12));

async function mapWithConcurrency(items, concurrency, task) {
  let cursor = 0;
  const results = new Array(items.length);
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const { promisify } = require('util');
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

function createSessionSnapshot(files) {
  const normalized = files.map(file => ({ name: path.basename(file.name), data: file.buffer.toString('base64') }));
  const serializedFiles = JSON.stringify(normalized);
  return zlib.gzipSync(Buffer.from(JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    checksum: crypto.createHash('sha256').update(serializedFiles).digest('hex'),
    files: normalized
  })), { level: zlib.constants.Z_BEST_SPEED });
}

async function createSessionSnapshotAsync(files) {
  const normalized = files.map(file => ({ name: path.basename(file.name), data: file.buffer.toString('base64') }));
  const serializedFiles = JSON.stringify(normalized);
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    checksum: crypto.createHash('sha256').update(serializedFiles).digest('hex'),
    files: normalized
  }));
  return gzipAsync(payload, { level: zlib.constants.Z_BEST_SPEED });
}

function parseSessionSnapshot(buffer) {
  const snapshot = JSON.parse(zlib.gunzipSync(buffer).toString('utf8'));
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.files)) throw new Error('Formato de pacote de sessão inválido.');
  const serializedFiles = JSON.stringify(snapshot.files);
  const checksum = crypto.createHash('sha256').update(serializedFiles).digest('hex');
  if (checksum !== snapshot.checksum) throw new Error('Pacote de sessão corrompido.');
  return snapshot.files
    .filter(file => file?.name && path.basename(file.name) === file.name && /\.json$/i.test(file.name) && typeof file.data === 'string')
    .map(file => ({ name: file.name, buffer: Buffer.from(file.data, 'base64') }));
}

async function parseSessionSnapshotAsync(buffer) {
  const decompressed = await gunzipAsync(buffer);
  const snapshot = JSON.parse(decompressed.toString('utf8'));
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.files)) throw new Error('Formato de pacote de sessão inválido.');
  const serializedFiles = JSON.stringify(snapshot.files);
  const checksum = crypto.createHash('sha256').update(serializedFiles).digest('hex');
  if (checksum !== snapshot.checksum) throw new Error('Pacote de sessão corrompido.');
  return snapshot.files
    .filter(file => file?.name && path.basename(file.name) === file.name && /\.json$/i.test(file.name) && typeof file.data === 'string')
    .map(file => ({ name: file.name, buffer: Buffer.from(file.data, 'base64') }));
}

function storageEnabled() {
  return isSupabaseConfigured() && process.env.CLOUD_STORAGE_ENABLED !== 'false';
}

async function uploadMedia(filename, buffer, contentType = 'application/octet-stream') {
  if (!storageEnabled()) return false;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(filename, buffer, { contentType, upsert: true, cacheControl: '86400' });
  if (error) throw error;
  return true;
}

async function downloadMedia(filename) {
  if (!storageEnabled()) return null;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(filename);
  if (error || !data) return null;
  return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
}

async function restoreSession(accountId, targetDir) {
  if (!storageEnabled()) return 0;
  const prefix = String(accountId);
  const { data, error } = await supabase.storage.from(SESSION_BUCKET).list(prefix, { limit: 1000 });
  if (error) {
    if (/not found|bucket/i.test(error.message || '')) return 0;
    throw error;
  }
  await fs.promises.mkdir(targetDir, { recursive: true });
  const snapshotItem = (data || []).find(item => item.name === SESSION_SNAPSHOT_FILE);
  if (snapshotItem?.id) {
    try {
      const { data: snapshotFile, error: snapshotError } = await supabase.storage.from(SESSION_BUCKET).download(`${prefix}/${SESSION_SNAPSHOT_FILE}`);
      if (snapshotError || !snapshotFile) throw snapshotError || new Error('Pacote de sessão vazio.');
      const files = await parseSessionSnapshotAsync(Buffer.from(await snapshotFile.arrayBuffer()));
      await mapWithConcurrency(files, SESSION_CONCURRENCY, file =>
        fs.promises.writeFile(path.join(targetDir, file.name), file.buffer)
      );
      return files.length;
    } catch (error) {
      console.warn(`Pacote rápido da sessão ${prefix} indisponível; usando restauração compatível: ${error.message}`);
    }
  }

  const legacyItems = (data || []).filter(item => item.name && item.id && item.name !== SESSION_SNAPSHOT_FILE && /\.json$/i.test(item.name));
  const restored = await mapWithConcurrency(legacyItems, SESSION_CONCURRENCY, async item => {
    const { data: file, error: fileError } = await supabase.storage.from(SESSION_BUCKET).download(`${prefix}/${item.name}`);
    if (fileError || !file) return 0;
    await fs.promises.writeFile(path.join(targetDir, path.basename(item.name)), Buffer.from(await file.arrayBuffer()));
    return 1;
  });
  return restored.reduce((total, value) => total + value, 0);
}

async function backupSession(accountId, sourceDir) {
  if (!storageEnabled() || !fs.existsSync(sourceDir)) return 0;
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
  const snapshots = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name) || SESSION_BACKUP_SKIP.has(entry.name)) continue;
    try {
      snapshots.push({ name: entry.name, buffer: await fs.promises.readFile(path.join(sourceDir, entry.name)) });
    } catch (error) {
      // As pre-keys do Signal são descartadas logo após o uso. Isso é normal e
      // não deve cancelar o backup completo da sessão.
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  if (!snapshots.some(snapshot => snapshot.name === 'creds.json')) return 0;
  const packageBuffer = await createSessionSnapshotAsync(snapshots);
  const { error } = await supabase.storage.from(SESSION_BUCKET).upload(`${accountId}/${SESSION_SNAPSHOT_FILE}`, packageBuffer, {
    contentType: 'application/gzip', upsert: true, cacheControl: '0'
  });
  if (error) throw error;
  return snapshots.length;
}

async function deleteSession(accountId) {
  if (!storageEnabled()) return false;
  const { data, error } = await supabase.storage.from(SESSION_BUCKET).list(String(accountId), { limit: 1000 });
  if (error) return false;
  const paths = (data || []).filter(item => item.name).map(item => `${accountId}/${item.name}`);
  if (!paths.length) return true;
  const { error: removeError } = await supabase.storage.from(SESSION_BUCKET).remove(paths);
  if (removeError) throw removeError;
  return true;
}

async function cleanupMediaOlderThan(cutoffTimestamp) {
  if (!storageEnabled()) return 0;
  let removed = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list('', { limit: 1000, offset: 0, sortBy: { column: 'created_at', order: 'asc' } });
    if (error) throw error;
    const expired = (data || []).filter(item => item.name && new Date(item.created_at || item.updated_at || 0).getTime() < cutoffTimestamp).map(item => item.name);
    if (expired.length) {
      const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove(expired);
      if (removeError) throw removeError;
      removed += expired.length;
    }
    if (!expired.length || !data || data.length < 1000) break;
  }
  return removed;
}

module.exports = {
  MEDIA_BUCKET,
  SESSION_BUCKET,
  storageEnabled,
  uploadMedia,
  downloadMedia,
  restoreSession,
  backupSession,
  deleteSession,
  cleanupMediaOlderThan,
  _test: { createSessionSnapshot, parseSessionSnapshot, mapWithConcurrency, SESSION_SNAPSHOT_FILE }
};
