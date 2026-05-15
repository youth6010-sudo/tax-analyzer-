/* 로컬에 Git이 없을 때 dugite 번들 Git으로 초기 커밋·추가 커밋 실행 */
const fs = require('fs');
const path = require('path');
const { exec } = require('dugite');

const root = path.resolve(__dirname, '..');

async function run(args) {
  const r = await exec(args, root, { encoding: 'utf8' });
  if (r.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} → exit ${r.exitCode}\n${r.stderr || r.stdout}`);
  }
  return r;
}

async function main() {
  const msg = process.argv.slice(2).join(' ') || 'chore: snapshot';
  if (!fs.existsSync(path.join(root, '.git'))) {
    await run(['init', '-b', 'main']);
  }
  await run(['add', '-A']);
  const st = await run(['status', '--porcelain']);
  if (!st.stdout.trim()) {
    console.log('커밋할 변경이 없습니다.');
    return;
  }
  await run([
    '-c', 'user.name=tax-analyzer',
    '-c', 'user.email=dev@local',
    'commit',
    '-m',
    msg,
  ]);
  console.log('커밋 완료:', msg);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
