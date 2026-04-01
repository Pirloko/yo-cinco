import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refresca la sesión JWT y sincroniza cookies en request + response.
 * Solo `response.cookies` no basta en App Router: hay que reflejar los valores
 * nuevos en `request.cookies` y volver a crear `NextResponse.next({ request })`
 * para que el documento y el cliente de Supabase en el navegador vean el mismo
 * estado que el proxy (evita “sesión perdida” al refrescar).
 */
export async function proxy(request: NextRequest) {
  // SEO / enlaces desde páginas estáticas: ?matchId= → ?joinMatch= (lo consume la SPA en app-context)
  if (request.nextUrl.pathname === '/') {
    const matchId = request.nextUrl.searchParams.get('matchId')?.trim()
    if (matchId) {
      const u = request.nextUrl.clone()
      u.searchParams.delete('matchId')
      u.searchParams.set('joinMatch', matchId)
      return NextResponse.redirect(u)
    }
  }

  let response = NextResponse.next({ request })

  // En desarrollo, o si Supabase está intermitente, el proxy no debe bloquear la app.
  // Si el refresh de sesión falla, seguimos sin romper navegación/login.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return response
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          try {
            if (value) {
              request.cookies.set(name, value)
            } else {
              request.cookies.delete(name)
            }
          } catch {
            // En algunos runtimes la request es de solo lectura; la respuesta igual envía Set-Cookie.
          }
        })
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // Evitar que un timeout/red caída deje la app inusable.
  // Nota: `getUser()` refresca cookies si corresponde; si falla, ignoramos.
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 3000)
    // @supabase/ssr acepta `global.fetch`; `signal` se respeta por fetch runtime.
    // Si el runtime no soporta AbortController, el catch igualmente protege.
    await supabase.auth.getUser({ signal: ac.signal } as never)
    clearTimeout(t)
  } catch {
    // ignore
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
