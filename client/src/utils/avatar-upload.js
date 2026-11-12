const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function prepareAvatar(file) {
  if (!file || !ALLOWED.has(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WEBP.')
  if (file.size > 5 * 1024 * 1024) throw new Error('A foto original deve ter no máximo 5 MB.')

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      img.src = objectUrl
    })
    const size = Math.min(256, Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    canvas.getContext('2d').drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84)
    if (dataUrl.length > 700000) throw new Error('Não foi possível reduzir a foto para o tamanho permitido.')
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
