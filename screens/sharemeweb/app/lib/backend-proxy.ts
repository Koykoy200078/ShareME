const DEFAULT_BACKEND_PORT = 3007

function parseBackendPort(value: string | undefined): number {
	const parsed = Number.parseInt(value || '', 10)
	if (Number.isFinite(parsed) && parsed > 0) return parsed
	return DEFAULT_BACKEND_PORT
}

function normalizeOrigin(rawOrigin: string): string | null {
	if (!rawOrigin) return null

	try {
		const url = new URL(rawOrigin)
		if (url.hostname === 'localhost') url.hostname = '127.0.0.1'

		if (!url.port) {
			url.port = String(parseBackendPort(process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.PORT))
		}

		return `${url.protocol}//${url.hostname}:${url.port}`
	} catch {
		return null
	}
}

function pushUnique(target: string[], rawOrigin: string | null): void {
	if (!rawOrigin) return
	if (!target.includes(rawOrigin)) target.push(rawOrigin)
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown upstream error'
}

export function resolveBackendOrigins(_requestUrl: string): string[] {
	const backendPort = parseBackendPort(process.env.NEXT_PUBLIC_BACKEND_PORT || process.env.PORT)
	const backendHttpPort = parseBackendPort(process.env.NEXT_PUBLIC_BACKEND_HTTP_PORT || process.env.BACKEND_HTTP_PORT || String(backendPort))

	const origins: string[] = []
	pushUnique(origins, normalizeOrigin(process.env.NEXT_PROXY_API_ORIGIN || ''))
	pushUnique(origins, normalizeOrigin(process.env.UNIFIED_API_ORIGIN || ''))
	pushUnique(origins, `http://127.0.0.1:${backendHttpPort}`)
	pushUnique(origins, `http://127.0.0.1:${backendPort}`)
	return origins
}

function buildForwardHeaders(request: Request): Headers {
	const headers = new Headers(request.headers)
	headers.delete('host')
	headers.delete('connection')
	// Avoid compressed upstream payload/header mismatches through the route handler proxy.
	headers.set('accept-encoding', 'identity')
	return headers
}

function buildResponseHeaders(upstreamHeaders: Headers): Headers {
	const headers = new Headers(upstreamHeaders)
	// Strip hop-by-hop and encoding-length headers that can become invalid when
	// the runtime re-streams the upstream body.
	headers.delete('content-encoding')
	headers.delete('content-length')
	headers.delete('transfer-encoding')
	headers.delete('connection')
	headers.delete('keep-alive')
	return headers
}

export async function proxyWithBackendFallback(request: Request, targetPath: string): Promise<Response> {
	const method = request.method.toUpperCase()
	const headers = buildForwardHeaders(request)
	const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`
	const payload = method === 'GET' || method === 'HEAD' ? null : await request.arrayBuffer()
	const body = payload && payload.byteLength > 0 ? payload : undefined

	let lastError: unknown = null

	for (const origin of resolveBackendOrigins(request.url)) {
		const targetUrl = `${origin}${normalizedPath}`

		try {
			const upstream = await fetch(targetUrl, {
				method,
				headers,
				body,
				redirect: 'manual',
				cache: 'no-store',
			})

			return new Response(upstream.body, {
				status: upstream.status,
				statusText: upstream.statusText,
				headers: buildResponseHeaders(upstream.headers),
			})
		} catch (error) {
			lastError = error
			console.warn(`[sharemeweb proxy] ${method} ${targetUrl} failed: ${describeError(error)}`)
		}
	}

	return Response.json({ error: 'Backend unavailable', detail: describeError(lastError) }, { status: 502 })
}
