import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDirectory = resolve(apiDirectory, '../..');
const distDirectory = resolve(apiDirectory, 'dist');
const packageJson = JSON.parse(await readFile(resolve(apiDirectory, 'package.json'), 'utf8'));
const lockfile = JSON.parse(await readFile(resolve(repositoryDirectory, 'package-lock.json'), 'utf8'));

function installedVersion(name) {
  const version = lockfile.packages?.[`node_modules/${name}`]?.version;
  if (!version) throw new Error(`Unable to resolve the installed version of ${name} for the Compute artifact.`);
  return version;
}

const dependencies = Object.fromEntries(
  Object.keys(packageJson.dependencies ?? {}).map((name) => [name, installedVersion(name)]),
);

// Compute stages only build.outputDirectory. Include an exact runtime manifest
// and production dependency closure instead of relying on a fresh Bun install.
await writeFile(resolve(distDirectory, 'package.json'), `${JSON.stringify({
  name: '@notification-platform/api-runtime',
  private: true,
  type: 'commonjs',
  dependencies,
}, null, 2)}\n`);

const nodeModulesDirectory = resolve(distDirectory, 'node_modules');
await mkdir(nodeModulesDirectory, { recursive: true });

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveInstalledPackage(name, fromDirectory) {
  let currentDirectory = fromDirectory;

  while (currentDirectory.startsWith(repositoryDirectory)) {
    const candidate = basename(currentDirectory) === 'node_modules'
      ? resolve(currentDirectory, name)
      : resolve(currentDirectory, 'node_modules', name);

    if (await exists(resolve(candidate, 'package.json'))) return candidate;
    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) break;
    currentDirectory = parentDirectory;
  }

  return undefined;
}

const copiedPackages = new Set();

async function copyRuntimePackage(name, fromDirectory, optional = false) {
  const sourceDirectory = await resolveInstalledPackage(name, fromDirectory);
  if (!sourceDirectory) {
    if (optional) return;
    throw new Error(`Unable to find runtime dependency ${name} for the Compute artifact.`);
  }

  if (copiedPackages.has(sourceDirectory)) return;
  copiedPackages.add(sourceDirectory);

  const targetDirectory = resolve(nodeModulesDirectory, name);
  await cp(sourceDirectory, targetDirectory, { recursive: true });

  const sourcePackage = JSON.parse(await readFile(resolve(sourceDirectory, 'package.json'), 'utf8'));
  const optionalDependencies = sourcePackage.optionalDependencies ?? {};
  const peerDependencyMeta = sourcePackage.peerDependenciesMeta ?? {};
  const requiredDependencies = Object.keys(sourcePackage.dependencies ?? {});
  const requiredPeerDependencies = Object.keys(sourcePackage.peerDependencies ?? {})
    .filter((dependency) => peerDependencyMeta[dependency]?.optional !== true);

  await Promise.all([
    ...requiredDependencies.map((dependency) => copyRuntimePackage(dependency, sourceDirectory)),
    ...requiredPeerDependencies.map((dependency) => copyRuntimePackage(dependency, sourceDirectory)),
    ...Object.keys(optionalDependencies).map((dependency) => copyRuntimePackage(dependency, sourceDirectory, true)),
  ]);
}

await Promise.all(Object.keys(dependencies).map((dependency) => copyRuntimePackage(dependency, apiDirectory)));

// Prisma Client's generated output sits outside its package directory.
await cp(resolve(repositoryDirectory, 'node_modules/.prisma'), resolve(nodeModulesDirectory, '.prisma'), { recursive: true });
