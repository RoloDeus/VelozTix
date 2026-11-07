import { spawn } from 'node:child_process';

console.log('================================================================');
console.log('  VELOZTIX FULL-STACK DEV ORCHESTRATOR');
console.log('  Iniciando Backend Merchant (:8000) y Frontend React (:5173)');
console.log('================================================================\n');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const backend = spawn(npmCmd, ['--prefix', 'backend', 'run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

const frontend = spawn(npmCmd, ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  console.log('\n[VelozTix] Deteniendo servicios...');
  try {
    backend.kill();
    frontend.kill();
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
