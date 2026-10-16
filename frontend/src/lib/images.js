/**
 * Turns a chosen photo into a small square image ready to upload: centre-cropped,
 * resized to `size` px and compressed, so uploads stay tiny even from phone cameras.
 */
export async function squareImage(file, size = 256) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose an image file (JPG, PNG or WebP).')
  if (file.size > 15 * 1024 * 1024) throw new Error('That photo is over 15 MB. Choose a smaller one.')
  const bitmap = await loadBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close?.()
  // WebP where the browser can encode it (smaller), JPEG otherwise (older iPhones).
  let url = canvas.toDataURL('image/webp', 0.85)
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85)
  return url
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fall through to <img> decoding */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      resolve(img)
    }
    img.onerror = () => reject(new Error('That image couldn’t be read. Try a different file.'))
    img.src = URL.createObjectURL(file)
  })
}
