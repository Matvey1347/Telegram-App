import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

export type FinanceBrandEnvironment = 'LOCAL' | 'PRODUCTION';
const images = new Map<string, Buffer>();

function assetPath(name: string) {
  let directory = process.cwd();
  while (true) {
    const candidate = join(directory, 'products', 'finance', 'assets', name);
    if (existsSync(candidate)) return candidate;
    if (directory === parse(directory).root) throw new Error(`Finance brand asset ${name} is missing`);
    directory = dirname(directory);
  }
}

export function financeBrandImage(environment: FinanceBrandEnvironment, theme: 'light' | 'dark' = 'light') {
  const name = theme === 'dark'
    ? environment === 'LOCAL' ? 'groshly-dev-dark-icon.png' : 'groshly-dark-icon.png'
    : environment === 'LOCAL' ? 'groshly-dev-icon.png' : 'groshly-icon.png';
  let image = images.get(name);
  if (!image) {
    image = readFileSync(assetPath(name));
    images.set(name, image);
  }
  return image;
}
