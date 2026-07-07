import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(root, '..', 'new book', 'prototypes', 'assets');
const destRoot = path.join(root, 'public', 'review');

const ASSET_FILES = [
  'review-auth.js',
  'review-grid-core.js',
  'review-grid-edit.js',
  'review-grid-sections.js',
  'review-readable.js',
  'review-row-expand.js',
  'review-add-client.js',
  'review-client-list.js',
  'review-board-view.js',
  'review-grid-dashboard.js',
  'review-grid.js',
  'review-grid.css',
];

if (!fs.existsSync(sourceRoot)) {
  console.error('Source not found:', sourceRoot);
  process.exit(1);
}

fs.mkdirSync(destRoot, { recursive: true });

let copied = 0;
for (const name of ASSET_FILES) {
  const src = path.join(sourceRoot, name);
  const dest = path.join(destRoot, name);
  if (!fs.existsSync(src)) {
    console.warn('skip (missing):', name);
    continue;
  }
  fs.copyFileSync(src, dest);
  copied++;
  console.log('copied', name);
}

console.log(`\n${copied} files → public/review/`);
