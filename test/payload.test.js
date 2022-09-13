import assert from 'assert'
import { create as createPayload } from '../payload'

describe('#create', function () {
  it('should fail if the chain in the payload does not match the chain in a transaction', function () {
    const tx = { chainId: '0x4' }

    assert.throws(() => createPayload('eth_sendTransaction', [tx], 12, '0x1'))
  })

  it('sets a missing transaction chain id to the one specified in the payload', function () {
    const updatedPayload = createPayload('eth_sendTransaction', [{}], 12, '0x1')

    assert(updatedPayload.params[0].chainId === '0x1')
  })
})
