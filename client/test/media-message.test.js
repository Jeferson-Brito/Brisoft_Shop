import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanMediaDisplayText,
  getDocumentDisplayName,
  getMediaSource,
  getProtectedMediaPath,
  isLargeMedia,
  formatFileSize,
  isAudioMedia,
  isVisualMedia,
  LARGE_MEDIA_THRESHOLD_BYTES
} from '../src/utils/media-message.js'

test('encontra URLs de mídia novas e legadas', () => {
  assert.equal(getMediaSource({ media_url: '/api/media/a.jpg' }), '/api/media/a.jpg')
  assert.equal(getMediaSource({ text: '📷 [Imagem]||/api/media/a.jpg' }), '/api/media/a.jpg')
  assert.equal(getMediaSource({ text: '📷 [Imagem]||/media/a.jpg' }), '/media/a.jpg')
})

test('remove o endereço técnico e o marcador automático, preservando legendas', () => {
  assert.equal(cleanMediaDisplayText('🎙️ [Mensagem de Voz]||/api/media/a.ogg', true), '')
  assert.equal(cleanMediaDisplayText('Foto do equipamento||/api/media/a.jpg', true), 'Foto do equipamento')
})

test('mostra o nome original de documentos', () => {
  assert.equal(getDocumentDisplayName({ text: '📄 [Documento: proposta.pdf]' }, '/api/media/doc_1_proposta.pdf'), 'proposta.pdf')
})

test('normaliza mídias do domínio próprio, Render e caminhos legados para a API autenticada', () => {
  assert.equal(getProtectedMediaPath('/api/media/img_1.jpg'), '/media/img_1.jpg')
  assert.equal(getProtectedMediaPath('/media/audio_1.ogg'), '/media/audio_1.ogg')
  assert.equal(getProtectedMediaPath('https://brisoft-shop.onrender.com/api/media/video_1.mp4'), '/media/video_1.mp4')
  assert.equal(getProtectedMediaPath('https://desk.brisoft.com.br/api/media/doc_1.pdf'), '/media/doc_1.pdf')
  assert.equal(getProtectedMediaPath('https://site-malicioso.invalid/arquivo.jpg'), null)
})

test('identifica corretamente mídias acima de 5MB para imagens e vídeos', () => {
  // Imagem de 6MB
  const largeImgMsg = { media_url: '/media/large.jpg', media_size: 6 * 1024 * 1024 }
  assert.equal(isLargeMedia(largeImgMsg, '/media/large.jpg'), true)

  // Imagem de 4MB
  const smallImgMsg = { media_url: '/media/small.jpg', media_size: 4 * 1024 * 1024 }
  assert.equal(isLargeMedia(smallImgMsg, '/media/small.jpg'), false)

  // Vídeo de 8MB
  const largeVideoMsg = { media_url: '/media/video.mp4', file_size: 8 * 1024 * 1024 }
  assert.equal(isLargeMedia(largeVideoMsg, '/media/video.mp4'), true)
})

test('áudios NUNCA são considerados mídias com limite de tamanho (sem restrição)', () => {
  // Áudio de 20MB
  const largeAudioMsg = { media_url: '/media/audio_long.ogg', media_size: 20 * 1024 * 1024 }
  assert.equal(isAudioMedia(largeAudioMsg, '/media/audio_long.ogg'), true)
  assert.equal(isLargeMedia(largeAudioMsg, '/media/audio_long.ogg'), false)
})

test('formata tamanho de arquivo legível em KB e MB', () => {
  assert.equal(formatFileSize(1024 * 500), '500 KB')
  assert.equal(formatFileSize(6 * 1024 * 1024), '6.0 MB')
})

