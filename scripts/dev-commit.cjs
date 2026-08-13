/* 시스템 Git으로 스냅샷 커밋 (로컬 전용) */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function run(args) {
  const r = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'tax-analyzer',
      GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'dev@local',
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'tax-analyzer',
      GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'dev@local',
    },
  });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} → exit ${r.status}\n${r.stderr || r.stdout || ''}`,
    );
  }
  return r;
}

function main() {
  const msg = process.argv.slice(2).join(' ') || 'chore: snapshot';
  if (!fs.existsSync(path.join(root, '.git'))) {
    run(['init', '-b', 'main']);
  }
  run(['add', '-A']);
  const st = run(['status', '--porcelain']);
  if (!String(st.stdout || '').trim()) {
    console.log('커밋할 변경이 없습니다.');
    return;
  }
  run(['commit', '-m', msg]);
  console.log('커밋 완료:', msg);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
