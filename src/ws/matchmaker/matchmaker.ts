import { WebSocketServer } from 'ws'
import crypto from 'crypto'
import { Log } from '../../utils/logger'


const port = Number(process.env.MATCHMAKER_PORT!)
const wss = new WebSocketServer({ port })

wss.on('listening', () => {
  Log.Matchmaker(`Matchmaker started on port ${port}`)
})

wss.on('connection', (ws, req) => {
  const ticketId = crypto.createHash('md5').update(`1${Date.now()}`).digest('hex')
  const matchId = crypto.createHash('md5').update(`2${Date.now()}`).digest('hex')
  const sessionId = crypto.createHash('md5').update(`3${Date.now()}`).digest('hex')

  setTimeout(Connecting, 200)
  setTimeout(Waiting, 1000)
  setTimeout(Queued, 2000)
  setTimeout(SessionAssignment, 6000)
  setTimeout(Join, 8000)

  function Connecting() {
    ws.send(JSON.stringify({
      payload: { state: 'Connecting' },
      name: 'StatusUpdate'
    }))
  }

  function Waiting() {
    ws.send(JSON.stringify({
      payload: {
        totalPlayers: 1,
        connectedPlayers: 1,
        state: 'Waiting'
      },
      name: 'StatusUpdate'
    }))
  }

  function Queued() {
    ws.send(JSON.stringify({
      payload: {
        ticketId,
        queuedPlayers: 0,
        estimatedWaitSec: 0,
        status: {},
        state: 'Queued'
      },
      name: 'StatusUpdate'
    }))
  }

  function SessionAssignment() {
    ws.send(JSON.stringify({
      payload: {
        matchId,
        state: 'SessionAssignment'
      },
      name: 'StatusUpdate'
    }))
  }

  function Join() {
    ws.send(JSON.stringify({
      payload: {
        matchId,
        sessionId,
        joinDelaySec: 1
      },
      name: 'Play'
    }))
  }
})
