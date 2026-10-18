import test from 'node:test'
import assert from 'node:assert/strict'
import { deploymentOptions } from '../src/deployment.js'

test('deployment trusts exact platform domains and requires HTTPS origins', () => {
  assert.deepEqual(deploymentOptions({ VERCEL_URL: 'build.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'site.vercel.app' }), {
    hosts: ['build.vercel.app', 'site.vercel.app'], origins: ['https://build.vercel.app', 'https://site.vercel.app'], secureCookies: true,
  })
  assert.throws(() => deploymentOptions({}))
  assert.throws(() => deploymentOptions({ ALLOWED_HOSTS: '*.vercel.app' }))
  assert.throws(() => deploymentOptions({ VERCEL_URL: 'site.vercel.app', ALLOWED_ORIGINS: 'http://site.vercel.app' }))
})
