#!/usr/bin/env node
/**
 * 검토표 연동 준비 검증 (메뉴 등록 전)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function companyLinkKey(name) {
  if (name == null || name === '') return '';
  let base = String(name).trim().normalize('NFKC').replace(/\s+/g, '');
  base = base.replace(/주식회사|\(주\)|㈜/gi, '');
  base = base.replace(/[()（）\[\]/\\+]/g, '');
  return base.toLowerCase();
}

const REVIEW_MASTER_LOGIN_IDS = new Set(['charlie', 'indie']);

function isReviewMaster(user) {
  const loginId = user?.loginId?.trim().toLowerCase() ?? '';
  return REVIEW_MASTER_LOGIN_IDS.has(loginId);
}

function resolveReviewOwner(user) {
  const owners = ['페리', '블루', '다야', '윈터', '리아', '인디', '찰리'];
  const name = user.name?.trim() ?? '';
  if (owners.includes(name)) return name;
  return name;
}

let failed = 0;
function ok(msg) {
  console.log('  ✓', msg);
}
function fail(msg) {
  console.error('  ✗', msg);
  failed++;
}

console.log('=== 검토표 연동 검증 ===\n');

const gridPath = path.join(root, 'public', 'data', 'review-grid.json');
if (fs.existsSync(gridPath)) {
  const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8'));
  ok(`review-grid.json (${grid.sheets?.length ?? 0} sheets)`);
} else {
  fail('public/data/review-grid.json 없음 — npm run import:review');
}

const assetDir = path.join(root, 'public', 'review');
const requiredAssets = ['review-grid.js', 'review-auth.js', 'review-readable.js', 'review-grid.css'];
for (const name of requiredAssets) {
  if (fs.existsSync(path.join(assetDir, name))) ok(`public/review/${name}`);
  else fail(`public/review/${name} 없음 — npm run sync:review-assets`);
}

const apiRoutes = [
  'app/api/review/session/route.ts',
  'app/api/review/grid/route.ts',
  'app/api/review/patches/route.ts',
  'app/api/review/client-link/route.ts',
  'app/clients/review-sheet/page.tsx',
];
for (const rel of apiRoutes) {
  if (fs.existsSync(path.join(root, rel))) ok(rel);
  else fail(`${rel} 없음`);
}

console.log('\ncompanyLinkKey:');
const samples = [
  ['㈜삼양건기', '삼양건기'],
  ['THE 큰 건축사/대구', 'the큰건축사대구'],
  ['(주)블레싱에이엠씨', '블레싱에이엠씨'],
];
for (const [input, expected] of samples) {
  const key = companyLinkKey(input);
  if (key === expected) ok(`${input} → ${key}`);
  else fail(`${input} → ${key} (expected ${expected})`);
}

console.log('\nauth mapping:');
if (isReviewMaster({ loginId: 'charlie', name: '찰리' })) ok('charlie is review master');
else fail('charlie should be master');
if (!isReviewMaster({ loginId: 'blue', name: '블루' })) ok('blue is staff');
else fail('blue should not be master');
if (resolveReviewOwner({ loginId: 'blue', name: '블루' }) === '블루') ok('blue → 블루 owner');
else fail('blue owner mismatch');

const accessPath = path.join(root, 'lib', 'review', 'accessConfig.ts');
if (fs.existsSync(accessPath)) ok('lib/review/accessConfig.ts');
else fail('accessConfig.ts missing');

console.log(failed ? `\n완료 (오류 ${failed}건)` : '\n완료');
process.exit(failed ? 1 : 0);
