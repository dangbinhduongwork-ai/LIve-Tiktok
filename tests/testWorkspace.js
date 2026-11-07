import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function createTestWorkspace(name, { publicFiles = false } = {}) {
  const parent = path.join(root, '.test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, name + '-'));
  fs.cpSync(path.join(root, 'src'), path.join(directory, 'src'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  if (publicFiles) fs.cpSync(path.join(root, 'public'), path.join(directory, 'public'), { recursive: true });
  return {
    directory,
    root,
    cleanup() {
      const resolved = path.resolve(directory);
      if (!resolved.startsWith(path.resolve(parent) + path.sep)) throw new Error('Invalid test cleanup path');
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  };
}
