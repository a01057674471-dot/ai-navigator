#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

const production = process.argv.includes('--production');
const existingConfig = fs.existsSync('config.js')
  ? fs.readFileSync('config.js', 'utf8')
  : '';

const configuredUrl =
  existingConfig.match(/supabaseUrl:\s*'([^']*)'/)?.[1] || '';

const configuredAnonKey =
  existingConfig.match(/supabaseAnonKey:\s*'([^']*)'/)?.[1] || '';

const url = process.env.PUBLIC_SUPABASE_URL || configuredUrl;
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || configuredAnonKey;

if (production && (!url || !anonKey)) {
  console.error(
    'Production build requires Supabase public configuration.'
  );
  process.exit(1);
}

const escape = value =>
  String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', '\\n');

const content = url && anonKey
  ? `// Generated at build time. Do not commit this file.
window.AI_NAVIGATOR_CONFIG = {
  supabaseUrl: '${escape(url)}',
  supabaseAnonKey: '${escape(anonKey)}',
  adminEmails: []
};
`
  : `// Demo build
window.AI_NAVIGATOR_CONFIG =
  window.AI_NAVIGATOR_CONFIG || {
    supabaseUrl: '',
    supabaseAnonKey: '',
    adminEmails: []
  };
`;

fs.writeFileSync('config.local.js', content);

console.log(
  url && anonKey
    ? 'Generated connected config.local.js'
    : 'Generated demo config.local.js'
);
