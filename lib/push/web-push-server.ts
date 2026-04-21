import webpush from 'web-push'

let configured = false

/**
 * Configura VAPID una vez por proceso Node (Route Handlers).
 */
export function configureWebPush(): void {
  if (configured) return
  const publicKey =
    process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject =
    process.env.VAPID_SUBJECT?.trim() || 'mailto:hola@sportmatch.cl'
  if (!publicKey || !privateKey) {
    throw new Error(
      'Faltan VAPID_PUBLIC_KEY (o NEXT_PUBLIC_VAPID_PUBLIC_KEY) y VAPID_PRIVATE_KEY'
    )
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export { webpush }
