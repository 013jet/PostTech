import { spawn } from 'node:child_process'
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'reports', 'hackathon-audit')
await mkdir(output, { recursive: true })
const read = (path) => readFile(join(root, path), 'utf8')
const node = process.execPath

async function run(name, directory, command, args) {
  const started = Date.now()
  const result = await new Promise((resolve) => {
    const child = spawn(command, args, { cwd: join(root, directory), windowsHide: true, shell: false, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } })
    let stdout = '', stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => resolve({ exitCode: -1, stdout, stderr: `${stderr}\n${error.message}` }))
    child.once('close', (code) => resolve({ exitCode: code ?? -1, stdout, stderr }))
  })
  await writeFile(join(output, `${name}.log`), result.stdout + result.stderr)
  const metric = (key) => Number(result.stdout.match(new RegExp(`^# ${key} (\\d+)`, 'm'))?.[1] ?? 0)
  const cases = [...result.stdout.matchAll(/^\s*(ok|not ok) \d+ - \[(HR-\d+)\] (.+)$/gm)].map((match) => ({ id: match[2], passed: match[1] === 'ok', title: match[3] }))
  const summary = { name, directory: directory || '.', command: [command === node ? 'node' : command, ...args], exitCode: result.exitCode, durationMs: Date.now() - started, tests: metric('tests'), passed: metric('pass'), failed: metric('fail'), log: `reports/hackathon-audit/${name}.log`, ...(cases.length ? { cases } : {}) }
  console.log(`${name}: exit=${summary.exitCode}${summary.tests ? ` tests=${summary.tests} pass=${summary.passed} fail=${summary.failed}` : ''}`)
  return summary
}
const frontendPackage = JSON.parse(await read('frontend/package.json'))
const frontendTests = frontendPackage.scripts.test.split(/\s+/).slice(2)
const backendTests = (await readdir(join(root, 'backend', 'test'))).filter((name) => name.endsWith('.test.ts')).map((name) => `test/${name}`)
const results = await Promise.all([
  run('frontend-tests', 'frontend', node, ['--test', '--test-reporter=tap', ...frontendTests]),
  run('backend-tests', 'backend', node, ['--import', 'tsx', '--test', '--test-reporter=tap', ...backendTests]),
  run('pdf-requirements', 'backend', node, ['--import', 'tsx', '--test', '--test-reporter=tap', 'audit/hackathon.test.ts']),
  run('frontend-types', 'frontend', node, ['node_modules/typescript/bin/tsc', '-b']),
  run('backend-build', 'backend', node, ['node_modules/typescript/bin/tsc']),
])
if (results.find((item) => item.name === 'frontend-types').exitCode === 0)
  results.push(await run('frontend-build', 'frontend', node, ['node_modules/vite/bin/vite.js', 'build']))

async function walk(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', '.local', 'tmp', 'reports'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await walk(path))
    else found.push(relative(root, path).replaceAll('\\', '/'))
  }
  return found
}
const files = await walk(root)
const app = await read('backend/src/app.ts')
const migrations = (await readdir(join(root, 'backend', 'migrations'))).filter((file) => file.endsWith('.sql')).sort()
const schema = (await Promise.all(migrations.map((file) => read(`backend/migrations/${file}`)))).join('\n')
const roleConstraint = [...schema.matchAll(/role IN \(([^)]+)\)/g)].at(-1)?.[1] || ''
const roles = [...roleConstraint.matchAll(/'([^']+)'/g)].map((match) => match[1])
const sourceFiles = files.filter((file) => /^(backend\/src|backend\/migrations|frontend\/src)\//.test(file))
const documentation = files.filter((file) => /\.md$/i.test(file) && !file.startsWith('scripts/'))
const inventory = {
  configuredServerRoles: roles,
  apiPaths: [...new Set([...app.matchAll(/'(\/api\/[^']+)'/g)].map((match) => match[1]))],
  architectureArtifacts: files.filter((file) => /architect|архитект|\.drawio$|\.puml$/i.test(file) && !file.includes('node_modules')),
  presentationArtifacts: files.filter((file) => /\.(pptx|odp)$|presentation|slides|презентац/i.test(file)),
  dockerArtifacts: files.filter((file) => /(^|\/)(Dockerfile[^/]*|(?:docker-)?compose[^/]*\.ya?ml)$/i.test(file)),
  integrationCodeFiles: [],
  integrationDocumentationFiles: [],
  localizationFiles: files.filter((file) => /^frontend\/src\//.test(file) && /(^|\/)(i18n|locales|translations)(\/|\.)/i.test(file)),
  hardcodedLocalSeedPassword: /export const localPassword\s*=\s*['"]/.test(await read('backend/src/seed.ts')),
}
for (const file of sourceFiles) {
  if (/Documentolog|1С:ЗУП|1C:ZUP/i.test(await read(file))) inventory.integrationCodeFiles.push(file)
}
for (const file of documentation) {
  if (/Documentolog|1С:ЗУП|1C:ZUP/i.test(await read(file))) inventory.integrationDocumentationFiles.push(file)
}
const git = await run('git-tracked-files', '', 'git', ['ls-files', '--', 'backend', 'frontend', 'README.md'])
const tracked = (await readFile(join(output, 'git-tracked-files.log'), 'utf8')).trim().split(/\r?\n/).filter(Boolean)
const ignores = await run('git-runtime-ignores', '', 'git', ['check-ignore', 'backend/.local/database.json', 'backend/.local/postgres/PG_VERSION', 'backend/node_modules', 'frontend/node_modules'])
inventory.trackedSourceFiles = tracked.filter((file) => /^(backend|frontend)\//.test(file)).length
inventory.gitRuntimeIgnoresPassed = ignores.exitCode === 0
const audit = results.find((item) => item.name === 'pdf-requirements')
const report = {
  generatedAt: new Date().toISOString(),
  source: { path: 'C:/Users/nitro/Downloads/Jana_Post_Terricon_Hackathon_2026 1.pdf', challenge: '02 Digital HR', physicalPdfPages: [13, 14, 15, 16, 17, 18, 19] },
  scope: 'Local source, isolated PostgreSQL integration tests, frontend tests and builds. No deployment, GitHub upload, UX score or production security certification.',
  regressionChecksPassed: results.filter((item) => item.name !== 'pdf-requirements').every((item) => item.exitCode === 0),
  requirementsChecksExecuted: audit.cases?.length === 8,
  requirementsChecksPassed: audit.exitCode === 0,
  results, inventory,
  limitations: ['Static artifact discovery does not prove architectural quality.', 'A passing test is evidence for its scenario, not full PDF compliance.', 'Public test-account password is detected separately from real secrets; private .local data is never scanned or printed.', 'No live GitHub state, presentation quality or RU/KZ translation quality was checked.'],
}
await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`Report: ${relative(root, join(output, 'results.json'))}`)
process.exitCode = report.regressionChecksPassed && report.requirementsChecksPassed ? 0 : 1
