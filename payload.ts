import type { Payload } from './types'

export type JsonRpcPayload = Payload & {
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
    checkForChainMismatch(payload)

    return updatePayloadChain(payload)
  }

  return payload
}

function checkForChainMismatch (payload: JsonRpcPayload) {
  const tx: Transaction = payload.params[0] || {}

  if (payload.method !== 'eth_sendTransaction' || !('chainId' in tx)) return false

  const txChain = tx.chainId as string
  const txChainId = parseInt(txChain)
  const targetChainId = parseInt(payload.chainId || txChain)

  if (txChainId !== targetChainId) {
    throw new Error(`Transaction chain id (${txChainId}) inconsistent with specified target chain id (${targetChainId})`)
  }
}

function updatePayloadChain (payload: JsonRpcPayload) {
  const tx: Transaction = payload.params[0] || {}

  return { ...payload, params: [{ ...tx, chainId: tx.chainId || payload.chainId }, ...payload.params.slice(1)]}
}
