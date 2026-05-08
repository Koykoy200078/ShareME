import { useState, useEffect, useRef, useCallback } from 'react'

const WS_PATH = '/ws'
const MAX_ATTEMPTS = 10
const RECONNECT_DELAY = 3000

function parsePort(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value || '', 10)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function buildSocketCandidates(pathname: string): string[] {
	const host = window.location.hostname
	const isSecurePage = window.location.protocol === 'https:'
	const backendPort = parsePort(process.env.NEXT_PUBLIC_BACKEND_PORT, 3007)
	const backendHttpPort = parsePort(process.env.NEXT_PUBLIC_BACKEND_HTTP_PORT, backendPort)

	const candidates: string[] = []
	const pushUnique = (url: string) => {
		if (!candidates.includes(url)) candidates.push(url)
	}

	if (isSecurePage) {
		pushUnique(`wss://${host}:${backendPort}${pathname}`)
		return candidates
	}

	const portCandidates = Array.from(new Set([backendHttpPort, backendPort]))

	// On HTTP pages, prefer the backend's plain HTTP listener first.
	for (const port of portCandidates) {
		pushUnique(`ws://${host}:${port}${pathname}`)
	}

	return candidates
}

export type WsStatus = 'connected' | 'disconnected' | 'reconnecting'

export interface ActiveUploader {
	clientId: string
	filename: string
	progress: number
	duration?: number
}

interface Options {
	onFileUpdate?: (action: string, files: unknown[]) => void
	onUploadActivity?: (uploaders: ActiveUploader[]) => void
}

export function useWebSocket({ onFileUpdate, onUploadActivity }: Options = {}) {
	const [status, setStatus] = useState<WsStatus>('disconnected')
	const wsRef = useRef<WebSocket | null>(null)
	const attemptsRef = useRef(0)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Keep callbacks in refs so connect() closure stays stable
	const onFileUpdateRef = useRef(onFileUpdate)
	const onUploadRef = useRef(onUploadActivity)
	useEffect(() => {
		onFileUpdateRef.current = onFileUpdate
	}, [onFileUpdate])
	useEffect(() => {
		onUploadRef.current = onUploadActivity
	}, [onUploadActivity])

	const scheduleReconnect = useCallback(() => {
		const delay = attemptsRef.current < MAX_ATTEMPTS ? RECONNECT_DELAY : 30000
		attemptsRef.current = attemptsRef.current < MAX_ATTEMPTS ? attemptsRef.current + 1 : 0
		timerRef.current = setTimeout(() => connect(), delay) // eslint-disable-line
	}, []) // eslint-disable-line

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return

		const candidates = buildSocketCandidates(WS_PATH)
		setStatus('reconnecting')

		const tryConnect = (index: number) => {
			if (index >= candidates.length) {
				setStatus('disconnected')
				scheduleReconnect()
				return
			}

			const url = candidates[index]
			let opened = false
			let advanced = false

			const advance = () => {
				if (advanced) return
				advanced = true
				tryConnect(index + 1)
			}

			try {
				const ws = new WebSocket(url)
				wsRef.current = ws

				ws.onopen = () => {
					opened = true
					attemptsRef.current = 0
					setStatus('connected')
				}

				ws.onmessage = (e) => {
					try {
						const data = JSON.parse(e.data as string)
						if (data.type === 'fileUpdate') onFileUpdateRef.current?.(data.action, data.files)
						else if (data.type === 'uploadActivity') onUploadRef.current?.(data.uploaders)
						else if (data.type === 'connected' && data.activeUploaders?.length > 0) onUploadRef.current?.(data.activeUploaders)
					} catch {
						/* ignore parse errors */
					}
				}

				ws.onclose = () => {
					if (wsRef.current === ws) wsRef.current = null

					if (!opened) {
						advance()
						return
					}

					setStatus('disconnected')
					scheduleReconnect()
				}

				ws.onerror = () => {
					if (!opened) {
						try {
							ws.close()
						} catch {
							/* ignore */
						}
						advance()
						return
					}

					setStatus('disconnected')
				}
			} catch {
				advance()
			}
		}

		tryConnect(0)
	}, [scheduleReconnect])

	useEffect(() => {
		connect()
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current)
			wsRef.current?.close()
		}
	}, [connect])

	return { status }
}
