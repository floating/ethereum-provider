import type { RequestArguments } from './types'

export type JsonRpcPayload = RequestArguments & {
  readonly params: readonly unknown[]
  readonly jsonrpc: '2.0'
  readonly id: number
  chainId?: string
}

type Transaction = {
  chainId?: string
}

export function create (method: string, params: readonly unknown[] = [], id: number, targetChain?: string): JsonRpcPayload {
  const payload: JsonRpcPayload = {
    id, method, params, jsonrpc: '2.0'
  }

  if (targetChain) {
    payload.chainId = targetChain
  }

  if (payload.method === 'eth_sendTransaction') {
    const mismatchedChain = isChainMismatch(payload)
    if (mismatchedChain) {
      throw new Error(`Payload chainId (${mismatchedChain}) inconsistent with specified target chainId: ${targetChain}`)
    }

    return updatePayloadChain(payload)
  }

  return payload
}

function isChainMismatch (payload: JsonRpcPayload) {
  if (payload.method !== 'eth_sendTransaction') return false

  const tx: Transaction = payload.params[0] || {}
  const chainId = tx.chainId as string

  return ('chainId' in tx) && parseInt(chainId) !== parseInt(payload.chainId || chainId)
}

function updatePayloadChain (payload: JsonRpcPayload) {
  const tx: Transaction = payload.params[0] || {}

  return { ...payload, params: [{ ...tx, chainId: tx.chainId || payload.chainId }, ...payload.params.slice(1)]}
}
