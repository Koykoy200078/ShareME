import { proxyWithBackendFallback } from '@/app/lib/backend-proxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getBackendPath(request: Request): string {
	const url = new URL(request.url)
	const strippedPath = url.pathname.replace(/^\/api\/?/, '')
	const upstreamPath = strippedPath ? `/${strippedPath}` : '/'
	return `${upstreamPath}${url.search}`
}

async function handle(request: Request): Promise<Response> {
	return proxyWithBackendFallback(request, getBackendPath(request))
}

export async function GET(request: Request): Promise<Response> {
	return handle(request)
}

export async function HEAD(request: Request): Promise<Response> {
	return handle(request)
}

export async function POST(request: Request): Promise<Response> {
	return handle(request)
}

export async function PUT(request: Request): Promise<Response> {
	return handle(request)
}

export async function PATCH(request: Request): Promise<Response> {
	return handle(request)
}

export async function DELETE(request: Request): Promise<Response> {
	return handle(request)
}

export async function OPTIONS(request: Request): Promise<Response> {
	return handle(request)
}
