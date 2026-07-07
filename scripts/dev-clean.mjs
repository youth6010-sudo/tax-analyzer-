#!/usr/bin/env node
/**
 * Windows dev 서버 꼬임 복구: 3000 포트 종료 → .next 삭제 → dev 재시작
 * 사용: npm run dev:clean
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT || '3000';

function killPort(winPort) {
  if (process.platform !== 'win32') {
    try {
      execSync(`lsof -ti:${winPort} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', shell: true });
    } catch {
      /* none */
    }
    return;
  }
  try {
    const out = execSync(`netstat -ano | findstr :${winPort}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1], 10);
      if (pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`[dev:clean] 종료 PID ${pid} (포트 ${winPort})`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    console.log(`[dev:clean] 포트 ${winPort} 사용 프로세스 없음`);
  }
}

killPort(port);

const nextDir = path.join(root, '.next');
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log('[dev:clean] .next 삭제 완료');
}

console.log('[dev:clean] npm run dev 시작…');
const child = spawn('npm', ['run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', code => process.exit(code ?? 0));
