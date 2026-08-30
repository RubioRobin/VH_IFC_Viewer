import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDirectory = resolve(process.argv[2] ?? 'frontend/dist');

if (!existsSync(distDirectory)) {
  throw new Error(`Viewer build output not found: ${distDirectory}`);
}

const indexPath = resolve(distDirectory, 'index.html');

if (!existsSync(indexPath)) {
  throw new Error(`Viewer entry file not found: ${indexPath}`);
}

const indexHtml = readFileSync(indexPath, 'utf8');
const bundleFiles = [...indexHtml.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="(\/assets\/[^"?#]+\.js)(?:\?[^"#]*)?"/g)]
  .map((match) => resolve(distDirectory, `.${match[1]}`));

if (bundleFiles.length === 0) {
  throw new Error('Direct viewer contract failed: no JavaScript viewer entry was found in dist/index.html.');
}

const bundle = bundleFiles.map((file) => readFileSync(file, 'utf8')).join('\n');

if (!bundle.includes('/functions/v1/viewer-link')) {
  throw new Error('Direct viewer contract failed: viewer-link Edge Function is absent from the build.');
}

if (!bundle.includes('https://ci.supabase.invalid')) {
  throw new Error('Direct viewer contract failed: VITE_SUPABASE_URL was not compiled into the build.');
}

if (bundle.includes('/api/share/')) {
  throw new Error('Direct viewer contract failed: a legacy /api/share/ route remains in the viewer bundle.');
}

const forbiddenLegacyValues = [
  ['http://localhost:3001', 'a localhost Express fallback'],
  ['/models/', 'a legacy model endpoint'],
  ['fileId=', 'a public file-id query fallback'],
];

for (const [value, description] of forbiddenLegacyValues) {
  if (bundle.includes(value)) {
    throw new Error(`Direct viewer contract failed: ${description} remains in the viewer bundle.`);
  }
}

const repositoryRoot = resolve(distDirectory, '..', '..');
const expectedSpaRewrite = {
  source: '/((?!assets/|.*\\..*).*)',
  destination: '/index.html',
};

for (const configFile of ['vercel.json', 'frontend/vercel.json']) {
  const configPath = resolve(repositoryRoot, configFile);
  if (!existsSync(configPath)) {
    throw new Error(`Direct viewer contract failed: missing Vercel configuration ${configFile}.`);
  }

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error(`Direct viewer contract failed: invalid JSON in ${configFile}.`);
  }

  const hasSpaRewrite = Array.isArray(config.rewrites) && config.rewrites.some((rewrite) =>
    rewrite?.source === expectedSpaRewrite.source &&
    rewrite?.destination === expectedSpaRewrite.destination
  );
  if (!hasSpaRewrite) {
    throw new Error(`Direct viewer contract failed: ${configFile} does not route /v/<token> to index.html.`);
  }
}

console.log(`Direct Supabase viewer contract verified in ${bundleFiles.length} JavaScript bundle(s), including Vercel SPA routing.`);
