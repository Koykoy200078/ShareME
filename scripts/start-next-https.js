const http = require('http')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev, dir: process.cwd() })
const handle = app.getRequestHandler()

app
	.prepare()
	.then(() => {
		const requestHandler = (req, res) => {
			if (req.url && req.url.startsWith('/api')) {
				console.log(`[Next.js Proxy] ${req.method} ${req.url}`)
			}
			handle(req, res)
		}

		const server = http.createServer(requestHandler)

		server.listen(port, '0.0.0.0', (err) => {
			if (err) throw err
			console.log(`> Next.js (HTTP) ready on port ${port}`)
		})
	})
	.catch((err) => {
		console.error('Next.js failed to start:', err)
		process.exit(1)
	})
