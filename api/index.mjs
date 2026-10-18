import app from '../backend/cloud/index.mjs'

export default function handler(request, response) {
  app.server.emit('request', request, response)
}
