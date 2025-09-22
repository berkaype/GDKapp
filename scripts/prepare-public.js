#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const backendDir = path.join(rootDir, 'backend');
const distDir = path.join(frontendDir, 'dist');
const publicDir = path.join(backendDir, 'public');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.error) {
    console.error(result.error);
  }

  if (result.status !== 0) {
    const code = typeof result.status === 'number' ? result.status : 1;
    process.exit(code);
  }
};

const copyDir = (src, dest) => {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

console.log('> Building frontend (VITE_API_BASE=/api)');
run('npm', ['run', 'build'], {
  cwd: frontendDir,
  env: { ...process.env, VITE_API_BASE: '/api' },
});

if (!fs.existsSync(distDir)) {
  console.error('Frontend build output not found:', distDir);
  process.exit(1);
}

console.log('> Syncing frontend/dist into backend/public');
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
copyDir(distDir, publicDir);

console.log('> Frontend assets ready at', publicDir);
