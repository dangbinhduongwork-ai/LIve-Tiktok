import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTestWorkspace } from './testWorkspace.js';

const workspace = createTestWorkspace('smoke');
try {
  fs.mkdirSync(path.join(workspace.directory, 'tests'));
  fs.copyFileSync(path.join(workspace.root, 'tests/smokeTest.js'), path.join(workspace.directory, 'tests/smokeTest.js'));
  const result = spawnSync(process.execPath, ['tests/smokeTest.js'], { cwd: workspace.directory, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  workspace.cleanup();
}
