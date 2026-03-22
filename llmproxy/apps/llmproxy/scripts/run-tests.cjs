const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const appRoot = path.resolve(__dirname, '..');
const appsRoot = path.resolve(appRoot, '..');
const isCheckOnly = process.argv.includes('--check');

function collectTestFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.nuxt' || entry.name === '.output' || entry.name === 'dist') {
        continue;
      }

      files.push(...collectTestFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = collectTestFiles(appsRoot);
if (testFiles.length === 0) {
  console.error('No TypeScript test files were found under apps.');
  process.exit(1);
}

if (isCheckOnly) {
  process.stdout.write(`Discovered ${testFiles.length} test files.\n`);
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...testFiles], {
  cwd: appRoot,
  stdio: 'inherit',
  windowsHide: false,
});

process.exit(result.status ?? 1);
