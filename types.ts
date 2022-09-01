import EventEmitter from 'events'
import type { Payload } from './payload'

export type Response = {
  id: number,
  jsonrpc: '2.0',
  result: any
}

export type EventHandler = (eventPayload: any) => void

export type Callback<T> = (err: Error | null, result?: T) => void

export type PendingPromise = {
  resolve: (result: any) => void
  reject: (err: Error) => void
  method: string
}

export interface Connection extends EventEmitter {
  send: (payload: Payload) => Promise<void>
  close: () => void
}
