#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const backendEntry = path.join(backendDir, 'server.js');
const viteEntry = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');
const children = [];
const smokeTest = process.argv.includes('--smoke-test');
const checkOnly = process.argv.includes('--check');

let stopping = false;
let resolveStopped;
const stopped = new Promise((resolve) => {
  resolveStopped = resolve;
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assertRuntimeFiles() {
  const missing = [backendEntry, viteEntry].filter((file) => !fs.existsSync(file));
  const packageSets = [
    { directory: backendDir, includeDevDependencies: false },
    { directory: frontendDir, includeDevDependencies: true },
  ];

  for (const { directory, includeDevDependencies } of packageSets) {
    const manifestPath = path.join(directory, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      missing.push(manifestPath);
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const packages = {
      ...(manifest.dependencies || {}),
      ...(includeDevDependencies ? manifest.devDependencies || {} : {}),
    };
    for (const packageName of Object.keys(packages)) {
      const packageManifest = path.join(directory, 'node_modules', ...packageName.split('/'), 'package.json');
      if (!fs.existsSync(packageManifest)) missing.push(packageManifest);
    }
  }

  if (missing.length) {
    throw new Error(`Missing runtime files:\n${missing.join('\n')}\nRun npm install in backend and frontend.`);
  }
}

function findAvailablePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > 65535) {
        reject(new Error(`No available port found starting at ${preferredPort}`));
        return;
      }

      const probe = net.createServer();
      probe.unref();
      probe.once('error', (error) => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });
      // Probe the wildcard address because both application servers accept LAN
      // traffic; probing loopback alone can miss a port used on another NIC.
      probe.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
        probe.close(() => resolve(port));
      });
    };

    tryPort(preferredPort);
  });
}

function requestIsHealthy(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 300);
    });
    request.setTimeout(1000, () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function waitForHealthy(label, url, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopping) throw new Error(`${label} startup was interrupted`);
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${label} exited before it became ready`);
    }
    if (await requestIsHealthy(url)) return;
    await delay(250);
  }
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000} seconds (${url})`);
}

function startChild(label, args, options) {
  const child = spawn(process.execPath, args, {
    ...options,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);

  child.once('error', (error) => {
    if (!stopping) {
      console.error(`[runner] Could not start ${label}: ${error.message}`);
      void finish(1);
    }
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      console.error(`[runner] ${label} exited unexpectedly (${reason}).`);
      void finish(code || 1);
    }
  });

  return child;
}

async function finish(exitCode) {
  if (stopping) return;
  stopping = true;

  const liveChildren = children.filter((child) => child.exitCode === null && child.signalCode === null);
  await Promise.all(liveChildren.map((child) => new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    const timeout = setTimeout(resolve, 2000);
    timeout.unref();
  })));

  process.exitCode = exitCode;
  resolveStopped();
}

function getLanUrls(port) {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return addresses;
}

async function main() {
  assertRuntimeFiles();

  const preferredBackendPort = Number.parseInt(process.env.BACKEND_PORT || '3001', 10);
  const preferredFrontendPort = Number.parseInt(process.env.FRONTEND_PORT || '5173', 10);
  const backendPort = await findAvailablePort(
    Number.isInteger(preferredBackendPort) && preferredBackendPort > 0 && preferredBackendPort <= 65535
      ? preferredBackendPort
      : 3001,
  );

  console.log(`[runner] Starting backend on port ${backendPort}...`);
  const backend = startChild('backend', [backendEntry], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(backendPort) },
  });
  await waitForHealthy('Backend', `http://127.0.0.1:${backendPort}/api/health`, backend);

  const frontendPort = await findAvailablePort(
    Number.isInteger(preferredFrontendPort) && preferredFrontendPort > 0 && preferredFrontendPort <= 65535
      ? preferredFrontendPort
      : 5173,
  );
  console.log(`[runner] Starting Web UI on port ${frontendPort}...`);
  const frontend = startChild('Web UI', [
    viteEntry,
    '--host', '0.0.0.0',
    '--port', String(frontendPort),
    '--strictPort',
    '--clearScreen=false',
    '--configLoader', 'runner',
  ], {
    cwd: frontendDir,
    env: {
      ...process.env,
      BACKEND_PORT: String(backendPort),
      VITE_API_BASE: '/api',
    },
  });
  await waitForHealthy('Frontend/API connection', `http://127.0.0.1:${frontendPort}/api/health`, frontend);

  console.log('\n[runner] App is ready and the frontend-to-backend connection is healthy.');
  console.log(`[runner] Local:   http://localhost:${frontendPort}`);
  for (const url of getLanUrls(frontendPort)) {
    console.log(`[runner] Network: ${url}`);
  }
  console.log('[runner] Press Ctrl+C to stop both services.\n');

  if (smokeTest) {
    console.log('[runner] Smoke test passed; stopping both services.');
    await finish(0);
    return;
  }

  await stopped;
}

if (checkOnly) {
  try {
    assertRuntimeFiles();
  } catch (error) {
    console.error(`[runner] Dependency check failed: ${error.message}`);
    process.exitCode = 1;
  }
} else {
  process.once('SIGINT', () => void finish(0));
  process.once('SIGTERM', () => void finish(0));

  main().catch(async (error) => {
    console.error(`[runner] Startup failed: ${error.message}`);
    await finish(1);
  });
}
