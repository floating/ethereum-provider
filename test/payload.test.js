import assert from 'assert'
import { isChainMismatch, updatePayloadChain } from '../payload'

describe('#isChainMismatch', function () {
  it('returns true if the chain in the payload does not match the chain in the transaction', function () {
    const tx = { chainId: '0x4' }
    const payload = {
      method: 'eth_sendTransaction',
      chainId: '0x1',
      params: [tx]
    }

    assert(isChainMismatch(payload) === true)
  })

  it('returns false if a chain is specified in the payload but not in the transaction', function () {
    const payload = {
      method: 'eth_sendTransaction',
      chainId: '0x1',
      params: [{}]
    }

    assert(isChainMismatch(payload) === false)
  })

  it('returns true if a chain is specified in the transaction but not in the payload', function () {
    const tx = { chainId: '0x4' }
    const payload = {
      method: 'eth_sendTransaction',
      params: [tx]
    }

    assert(isChainMismatch(payload) === true)
  })
})

describe('#updatePayloadChain', function () {
  it('sets a missing transaction chain id to the one specified in the payload', function () {
    const payload = {
      method: 'eth_sendTransaction',
      chainId: '0x1',
      params: [{}]
    }

    const updatedPayload = updatePayloadChain(payload)

    assert(updatedPayload.params[0].chainId === '0x1')
  })
})
