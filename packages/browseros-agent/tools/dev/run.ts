/**
 * Cross-platform entry point for the browseros-dev supervisor, used by the
 * root package.json dev scripts in place of run.sh so they also work on
 * Windows, where Bun cannot execute a shell script directly.
 *
 * It mirrors run.sh: check the toolchain, rebuild the Go supervisor (the Go
 * build cache keeps unchanged rebuilds fast), then hand the terminal to it.
 * `stop` is handled here because it targets processes outside the supervisor.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const isWindows = process.platform === 'win32'
const args = process.argv.slice(2)

function has(command: string): boolean {
  return Bun.which(command) !== null
}

function fail(lines: string[]): never {
  console.error(['', ...lines.map((line) => `  ${line}`), ''].join('\n'))
  process.exit(1)
}

function stop(): void {
  if (isWindows) {
    // /T takes the supervisor's children (bun, cargo, wxt) down with it.
    spawnSync('taskkill', ['/F', '/T', '/IM', 'browseros-dev.exe'], {
      stdio: 'ignore',
    })
  } else {
    spawnSync('pkill', ['-f', 'browseros-dev watch'], { stdio: 'ignore' })
    spawnSync('pkill', ['-f', 'bun --watch'], { stdio: 'ignore' })
  }
  console.log('dev watch stopped')
}

if (args[0] === 'stop') {
  stop()
  process.exit(0)
}

if (!has('go')) {
  fail([
    'Go is required to build browseros-dev but is not installed.',
    isWindows
      ? 'Install it with:  winget install GoLang.Go'
      : 'Install it with:  brew install go',
    'Or download from: https://go.dev/dl/',
  ])
}

if (
  args[0] === 'watch' &&
  args.includes('--claw') &&
  args.includes('--rust') &&
  !has('cargo')
) {
  fail([
    'Cargo is required for dev:claw-rust:watch but is not installed.',
    'Install Rust from: https://rustup.rs/',
  ])
}

const binary = join(dir, isWindows ? 'browseros-dev.exe' : 'browseros-dev')
const build = spawnSync('go', ['build', '-o', binary, '.'], {
  cwd: dir,
  stdio: 'inherit',
})
if (build.status !== 0) process.exit(build.status ?? 1)

// Ctrl+C reaches every process on the terminal. The supervisor owns shutdown
// (first press drains children, second force-kills), so the launcher must
// survive the signal and only exit once the supervisor has.
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {})
const run = spawnSync(binary, args, { stdio: 'inherit' })
process.exit(run.status ?? 1)
