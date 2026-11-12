import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldDisplayEmployeeRole } from '../src/utils/contact-role.js'

test('mostra o badge de funcionário apenas quando o ticket foi explicitamente marcado', () => {
  assert.equal(shouldDisplayEmployeeRole(null), false)
  assert.equal(shouldDisplayEmployeeRole({}), false)
  assert.equal(shouldDisplayEmployeeRole({ is_employee: false }), false)
  assert.equal(shouldDisplayEmployeeRole({ is_employee: true }), true)
})
