// Shared client-side image helper.
//
// Downscale a picked image to <= `max` px on its longest side and return a JPEG
// data URL at the given `quality`. Dependency-free — uses an offscreen <canvas>.
// The resulting data: URL is small enough to send inline in a JSON body.
//
// Defaults (1024px / 0.7) suit CONTENT photos such as stay-review images. The
// account avatar uploader uses its own smaller settings (256px) inline.
export async function downscaleToDataUrl(
  file: File,
  max = 1024,
  quality = 0.7
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('decode failed'))
    el.src = dataUrl
  })

  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unsupported')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}
