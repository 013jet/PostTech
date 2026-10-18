/** Trust only deployment names supplied by Vercel, never a request's Host/Origin. */
export function deploymentOptions(env: NodeJS.ProcessEnv = process.env) {
  const hosts = [...new Set([env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL,
    ...(env.ALLOWED_HOSTS || '').split(',')].filter((value): value is string => Boolean(value?.trim()))
    .map(value => value.trim().toLowerCase()))]
  if (!hosts.length || hosts.some(host => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)))
    throw new Error('Deployment requires explicit valid public hostnames')
  const origins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(value => value.trim()) : hosts.map(host => `https://${host}`)
  if (origins.some(origin => new URL(origin).protocol !== 'https:')) throw new Error('Deployment origins must use HTTPS')
  return { hosts, origins, secureCookies: true }
}
