#!/usr/bin/env node
/**
 * Validates every content pack under public/packs/<id>/pack.json with the same validator the app uses
 * (src/content/schema.ts, run directly by Node's type stripping), strictly: unknown vocabulary is an error here,
 * because a shipped pack must only use what this client understands. Also checks that every referenced file exists
 * inside public/. Runs first in `npm run build`.
 *
 *   npm run packs:check
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePack } from '../src/content/schema.ts';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PACKS = join(PUBLIC, 'packs');

const ids = readdirSync(PACKS)
    .filter((name) => statSync(join(PACKS, name)).isDirectory())
    .sort();
let failed = 0;
for (const id of ids) {
    const folder = join(PACKS, id);
    const errors = [];
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(join(folder, 'pack.json'), 'utf8'));
    } catch (error) {
        errors.push(`pack.json: ${error.message}`);
    }
    if (manifest !== undefined) {
        const exists = (path) => {
            const file = resolve(folder, path);
            // `..` may reach shared assets (classic points at /cards), never outside what nginx serves.
            return file.startsWith(PUBLIC + sep) && existsSync(file) && statSync(file).isFile();
        };
        errors.push(...validatePack(manifest, { strict: true, exists }).errors);
        if (manifest && manifest.id !== id) {
            errors.push(`id: "${manifest.id}" does not match its folder "${id}"`);
        }
    }
    if (errors.length > 0) {
        failed++;
        console.error(`✗ ${relative(process.cwd(), folder)}`);
        for (const error of errors) {
            console.error(`    ${error}`);
        }
    } else {
        console.log(`✓ ${id}`);
    }
}
if (ids.length === 0) {
    console.error('No packs found under public/packs');
    process.exit(1);
}
if (failed > 0) {
    process.exit(1);
}
