import { proxyWithBackendFallback } from '@/app/lib/backend-proxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getBackendFilePath(request: Request): string {
	const url = new URL(request.url)
	const strippedPath = url.pathname.replace(/^\/files\/?/, '')
	const upstreamPath = strippedPath ? `/files/${strippedPath}` : '/files'
	return `${upstreamPath}${url.search}`
}

async function handle(request: Request): Promise<Response> {
	return proxyWithBackendFallback(request, getBackendFilePath(request))
}

export async function GET(request: Request): Promise<Response> {
	return handle(request)
}

export async function HEAD(request: Request): Promise<Response> {
	return handle(request)
}
