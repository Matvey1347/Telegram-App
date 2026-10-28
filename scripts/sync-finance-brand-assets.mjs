import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'products/finance/assets');
const targets = [
  join(root, 'apps/web/public/brand'),
  join(root, 'apps/standalone/finance/web/public/brand'),
];
const icons = [
  'groshly-icon.png',
  'groshly-dev-icon.png',
  'groshly-dark-icon.png',
  'groshly-dev-dark-icon.png',
];
for (const target of targets) {
  mkdirSync(target, { recursive: true });
  for (const icon of icons) copyFileSync(join(source, icon), join(target, icon));
}
for (const icon of ['groshly-icon-192.png', 'groshly-dev-icon-192.png']) {
  copyFileSync(join(source, icon), join(targets[1], icon));
}
