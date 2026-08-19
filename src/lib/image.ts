'use client'

// Client-side image helpers for uploading listing/ID photos as base64 data URLs
// (the local stack stores images inline — no blob service). We downscale + JPEG-
// compress in a <canvas> so a 12MP phone photo doesn't become a multi-MB DB row.

import { isPdfDataUrl, OWNERSHIP_DOC_MAX_CHARS } from './local/ownership-doc-core'

/**
 * Cap on an inline proof-of-ownership document, mirroring the server-side limit
 * in lib/local/db.ts (and quickin-backend's setListingOwnershipDoc), so the
 * uploader can reject an oversized document before the request goes out.
 */
export const MAX_OWNERSHIP_DOC_CHARS = OWNERSHIP_DOC_MAX_CHARS

/** Read a File as a `data:<mime>;base64,…` URL, unaltered. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** True for a file the host picked as a PDF, by name or by declared type. Some
 *  browsers hand over `application/octet-stream` for a .pdf, so both count —
 *  what is actually stored is still decided by the PDF magic number below. */
function looksLikePdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/**
 * Encode a proof-of-ownership document the host picked: a PDF is stored exactly
 * as uploaded (there is nothing to downscale, and re-encoding a deed would only
 * degrade the text an operator has to read), anything else goes through the
 * usual photo compression.
 *
 * Throws when the file claims to be a PDF but isn't one — better here, with
 * "try another file", than as a 400 from the server after a 2 MB upload.
 */
export async function fileToOwnershipDocDataUrl(file: File): Promise<string> {
  if (!looksLikePdf(file)) return fileToCompressedDataUrl(file)
  const raw = await fileToDataUrl(file)
  // Rewrite the mime a browser guessed wrong, then let the magic number decide.
  const dataUrl = raw.replace(/^data:[^;,]*;base64,/i, 'data:application/pdf;base64,')
  if (!isPdfDataUrl(dataUrl)) throw new Error('not a pdf')
  return dataUrl
}

/** Convert a File to a compressed JPEG data URL. HEIC/HEIF is converted first. */
export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1600,
  quality = 0.72
): Promise<string> {
  let src = file
  // iPhones often hand us HEIC — convert to JPEG so <img>/canvas can read it.
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    try {
      const heic2any = (await import('heic2any')).default as (opts: {
        blob: Blob
        toType?: string
        quality?: number
      }) => Promise<Blob | Blob[]>
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality })
      const blob = Array.isArray(out) ? out[0] : out
      src = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
    } catch {
      /* fall through — some browsers can decode HEIC natively */
    }
  }

  const dataUrl = await fileToDataUrl(src)

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('decode failed'))
    el.src = dataUrl
  })

  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl // canvas unavailable — fall back to the raw data URL
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}
