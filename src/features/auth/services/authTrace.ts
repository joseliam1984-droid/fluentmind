/**
 * AUTH-005 — Instrumentación de observabilidad del flujo de autenticación.
 *
 * REGLA: este módulo NO altera la lógica de autenticación. Solo observa.
 * Ninguna función de aquí modifica el store, ni consume errores, ni cambia
 * el control de flujo. Si algo falla dentro de la traza, se descarta en
 * silencio para no introducir un fallo nuevo en el flujo real.
 *
 * Transporte: localStorage (sobrevive recarga, redirect y cierre/reapertura
 * del navegador). sessionStorage NO se usa. Buffer circular acotado.
 */

const KEY = 'fm_auth_trace'
const MAX_ENTRIES = 200
const BOOT_T = Date.now()
const BOOT_ID = `${BOOT_T.toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export interface AuthTraceEntry {
  /** Marca absoluta ISO — permite ordenar entre recargas/redirects. */
  ts: string
  /** ms transcurridos desde la carga del bundle en esta pestaña. */
  t: number
  /** Identificador de la carga de página. Cambia tras redirect/recarga. */
  boot: string
  /** Código de evento: '00 boot', '10 branch', '20 click', ... */
  evt: string
  data?: Record<string, unknown>
}

/** Respaldo en memoria si localStorage no está disponible (modo privado). */
let memoryBuffer: AuthTraceEntry[] = []
let storageAvailable: boolean | null = null

function canUseStorage(): boolean {
  if (storageAvailable !== null) return storageAvailable
  try {
    const probe = '__fm_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    storageAvailable = true
  } catch {
    storageAvailable = false
  }
  return storageAvailable
}

function read(): AuthTraceEntry[] {
  if (!canUseStorage()) return memoryBuffer
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AuthTraceEntry[]) : []
  } catch {
    return memoryBuffer
  }
}

function write(entries: AuthTraceEntry[]): void {
  memoryBuffer = entries
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Cuota llena o storage bloqueado — la traza queda solo en memoria.
    storageAvailable = false
  }
}

/**
 * Sonda de IndexedDB. Firebase persiste la sesión en `firebaseLocalStorageDb`;
 * si el navegador particiona o bloquea el almacenamiento, esta sonda lo delata.
 * Es asíncrona y NO bloquea: escribe su propio evento al resolverse.
 */
function probeIndexedDb(): void {
  try {
    if (typeof indexedDB === 'undefined') {
      authTrace('01 idb-probe', { idb: 'unsupported' })
      return
    }
    let settled = false
    const req = indexedDB.open('firebaseLocalStorageDb')
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        authTrace('01 idb-probe', { idb: 'blocked' })
      }
    }, 3000)
    req.onsuccess = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        req.result.close()
      } catch {
        /* noop */
      }
      authTrace('01 idb-probe', { idb: 'ok' })
    }
    req.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      authTrace('01 idb-probe', { idb: 'error', reason: String(req.error?.name ?? 'unknown') })
    }
    req.onblocked = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      authTrace('01 idb-probe', { idb: 'blocked' })
    }
  } catch (e) {
    authTrace('01 idb-probe', { idb: 'error', reason: String(e) })
  }
}

/** Entorno del dispositivo. Se captura una sola vez, en el evento '00 boot'. */
function snapshotEnv(): Record<string, unknown> {
  try {
    const nav = window.navigator as Navigator & { standalone?: boolean }
    return {
      origin: window.location.origin,
      href: window.location.href.split('#')[0],
      standalone: nav.standalone ?? null,
      displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
      cookieEnabled: nav.cookieEnabled,
      onLine: nav.onLine,
      userAgent: nav.userAgent,
      lang: nav.language,
    }
  } catch {
    return {}
  }
}

/**
 * Normaliza cualquier error a campos comparables entre categorías.
 * `hasTokenResponse` distingue fallo OAuth (Google ya respondió) de fallo
 * de SDK/navegador (nunca hubo respuesta del proveedor).
 */
export function describeError(err: unknown): Record<string, unknown> {
  const e = err as {
    code?: string
    message?: string
    name?: string
    stack?: string
    customData?: { _tokenResponse?: unknown; email?: string }
  }
  return {
    code: e?.code ?? null,
    name: e?.name ?? null,
    message: e?.message ?? String(err),
    hasTokenResponse: !!e?.customData?._tokenResponse,
    stackHead: typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 3).join(' | ') : null,
  }
}

/** Registra un evento de la traza. Nunca lanza. */
export function authTrace(evt: string, data?: Record<string, unknown>): void {
  try {
    const entry: AuthTraceEntry = {
      ts: new Date().toISOString(),
      t: Date.now() - BOOT_T,
      boot: BOOT_ID,
      evt,
      ...(data && Object.keys(data).length ? { data } : {}),
    }
    const entries = read()
    entries.push(entry)
    write(entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries)
    // eslint-disable-next-line no-console
    console.info(`[AUTH:${evt}]`, entry.t + 'ms', data ?? '')
  } catch {
    /* la observabilidad nunca rompe el flujo */
  }
}

export function getAuthTrace(): AuthTraceEntry[] {
  return read()
}

export function clearAuthTrace(): void {
  memoryBuffer = []
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}

/**
 * Vista de extracción para dispositivos sin consola (móvil / PWA instalada).
 * Se activa SOLO con `?fmtrace=1` en la URL. Sustituye el contenido de la
 * página por un textarea seleccionable con la traza completa en JSON.
 * No interviene en ninguna ruta normal de la aplicación.
 */
export function mountTraceViewer(): boolean {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('fmtrace') !== '1') return false

    const json = JSON.stringify(getAuthTrace(), null, 2)
    document.title = 'FluentMind — auth trace'
    document.body.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.setAttribute(
      'style',
      'font-family:system-ui;background:#0a0a0a;color:#e5e5e5;min-height:100vh;padding:12px;box-sizing:border-box',
    )
    const bar = document.createElement('div')
    bar.setAttribute('style', 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap')

    const ta = document.createElement('textarea')
    ta.readOnly = true
    ta.value = json
    ta.setAttribute(
      'style',
      'width:100%;height:70vh;background:#171717;color:#e5e5e5;border:1px solid #404040;border-radius:8px;padding:8px;font:12px/1.4 ui-monospace,monospace;box-sizing:border-box',
    )

    const mkBtn = (label: string, fn: () => void) => {
      const b = document.createElement('button')
      b.textContent = label
      b.setAttribute(
        'style',
        'padding:10px 14px;border-radius:8px;border:0;background:#fff;color:#0a0a0a;font-weight:600',
      )
      b.onclick = fn
      return b
    }

    bar.appendChild(
      mkBtn('Seleccionar todo', () => {
        ta.focus()
        ta.select()
        ta.setSelectionRange(0, ta.value.length)
      }),
    )
    bar.appendChild(
      mkBtn('Copiar', () => {
        ta.focus()
        ta.select()
        ta.setSelectionRange(0, ta.value.length)
        try {
          navigator.clipboard?.writeText(ta.value)
        } catch {
          /* el usuario copia manualmente */
        }
      }),
    )
    bar.appendChild(
      mkBtn('Borrar traza', () => {
        clearAuthTrace()
        ta.value = '[]'
      }),
    )

    const info = document.createElement('p')
    info.textContent = `${getAuthTrace().length} eventos · fm_auth_trace`
    info.setAttribute('style', 'color:#737373;font-size:12px;margin:8px 0 0')

    wrap.appendChild(bar)
    wrap.appendChild(ta)
    wrap.appendChild(info)
    document.body.appendChild(wrap)
    return true
  } catch {
    return false
  }
}

/** Punto cero: entorno + sonda de almacenamiento. Idempotente por carga. */
let booted = false
export function authTraceBoot(): void {
  if (booted) return
  booted = true
  authTrace('00 boot', snapshotEnv())
  probeIndexedDb()
}

/**
 * Captura global de lo que hoy se pierde: rechazos de promesa sin manejar
 * y errores no capturados. Solo escucha; no llama a preventDefault().
 */
let globalHooked = false
export function installGlobalAuthTraceHooks(): void {
  if (globalHooked) return
  globalHooked = true
  window.addEventListener('unhandledrejection', (ev) => {
    authTrace('99 unhandled', describeError((ev as PromiseRejectionEvent).reason))
  })
  window.addEventListener('error', (ev) => {
    authTrace('98 window-error', describeError((ev as ErrorEvent).error ?? ev))
  })
}

declare global {
  interface Window {
    fmAuthTrace?: {
      dump: () => AuthTraceEntry[]
      json: () => string
      clear: () => void
    }
  }
}

try {
  window.fmAuthTrace = {
    dump: () => {
      const t = getAuthTrace()
      // eslint-disable-next-line no-console
      console.table(t.map((e) => ({ t: e.t, evt: e.evt, ...(e.data ?? {}) })))
      return t
    },
    json: () => JSON.stringify(getAuthTrace(), null, 2),
    clear: clearAuthTrace,
  }
} catch {
  /* noop */
}
