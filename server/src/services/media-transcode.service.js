const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
let ffmpegPath = 'ffmpeg';
try {
  const staticPath = require('ffmpeg-static');
  if (staticPath && fs.existsSync(staticPath)) {
    ffmpegPath = staticPath;
  }
} catch {
  ffmpegPath = 'ffmpeg';
}

const MAX_CONCURRENT_TRANSCODES = 2;
const MAX_PENDING_TRANSCODES = 50;
let activeTranscodes = 0;
const pendingTranscodes = [];

function acquireTranscodeSlot() {
  if (activeTranscodes < MAX_CONCURRENT_TRANSCODES) {
    activeTranscodes += 1;
    return Promise.resolve();
  }
  if (pendingTranscodes.length >= MAX_PENDING_TRANSCODES) {
    return Promise.reject(new Error('Conversor de mídia ocupado. Aguarde alguns segundos e tente novamente.'));
  }
  return new Promise(resolve => pendingTranscodes.push(resolve));
}

function releaseTranscodeSlot() {
  const next = pendingTranscodes.shift();
  if (next) next();
  else activeTranscodes = Math.max(0, activeTranscodes - 1);
}

function extensionForMime(mimeType, fallback = '.bin') {
  const mime = String(mimeType || '').split(';')[0].toLowerCase();
  return ({
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'audio/mp4': '.m4a', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/webm': '.webm',
    'audio/wav': '.wav', 'audio/x-wav': '.wav'
  })[mime] || fallback;
}

function runFfmpeg(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-12000); });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Tempo limite excedido ao converter a mídia.'));
    }, timeoutMs);
    timeout.unref?.();
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Falha ao converter a mídia${stderr ? `: ${stderr.split(/\r?\n/).filter(Boolean).slice(-2).join(' ')}` : '.'}`));
    });
  });
}

async function transcodeBuffer(fileBuffer, inputExtension, outputExtension, ffmpegArgs) {
  await acquireTranscodeSlot();
  const id = crypto.randomUUID().replace(/-/g, '');
  const inputPath = path.join(os.tmpdir(), `brisoft_media_${id}_input${inputExtension}`);
  const outputPath = path.join(os.tmpdir(), `brisoft_media_${id}_output${outputExtension}`);
  try {
    await fs.promises.writeFile(inputPath, fileBuffer);
    await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, ...ffmpegArgs, outputPath]);
    return await fs.promises.readFile(outputPath);
  } finally {
    await Promise.allSettled([fs.promises.unlink(inputPath), fs.promises.unlink(outputPath)]);
    releaseTranscodeSlot();
  }
}

async function normalizeOutgoingMedia(fileBuffer, { mediaType, mimeType, voiceNote = false } = {}) {
  const normalizedMime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (mediaType === 'video') {
    const buffer = await transcodeBuffer(fileBuffer, extensionForMime(normalizedMime), '.mp4', [
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'
    ]);
    return { buffer, mimeType: 'video/mp4', fileExtension: '.mp4', voiceNote: false, transcoded: true };
  }

  if (mediaType === 'audio' && voiceNote) {
    // Mensagens de voz do WhatsApp precisam de OGG/Opus em modo PTT. Removemos
    // metadados e normalizamos os timestamps para evitar notas que aparecem no
    // aparelho, mas falham ao baixar ou reproduzir.
    const buffer = await transcodeBuffer(fileBuffer, extensionForMime(normalizedMime), '.ogg', [
      '-map', '0:a:0', '-map_metadata', '-1', '-vn',
      '-af', 'asetpts=N/SR/TB', '-ac', '1', '-ar', '48000',
      '-c:a', 'libopus', '-application', 'voip', '-frame_duration', '20',
      '-b:a', '48k', '-vbr', 'on', '-compression_level', '10',
      '-avoid_negative_ts', 'make_zero', '-f', 'ogg'
    ]);
    return { buffer, mimeType: 'audio/ogg', fileExtension: '.ogg', voiceNote: true, transcoded: true };
  }

  return {
    buffer: fileBuffer,
    mimeType: normalizedMime || mimeType || 'application/octet-stream',
    fileExtension: null,
    voiceNote,
    transcoded: false
  };
}

module.exports = { normalizeOutgoingMedia, extensionForMime };
