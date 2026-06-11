import { execSync } from 'child_process';
import fs from 'fs';

let content = execSync('git show HEAD:app/page.tsx', { encoding: 'utf8' });
content = content
  .replace(/from '\.\/components\//g, "from '@/app/components/")
  .replace(/from '\.\/lib\//g, "from '@/app/lib/")
  .replace(/from '\.\/utils\//g, "from '@/app/utils/")
  .replace(/from '\.\/types'/g, "from '@/app/types'");

fs.writeFileSync('app/tax/comprehensive/page.tsx', content, 'utf8');
console.log('written', content.length, 'chars');
