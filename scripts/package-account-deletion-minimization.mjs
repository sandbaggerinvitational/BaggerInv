import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function accountDeletionMinimizationSql(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const files = ['attribution-minimization', 'external-identifier-redaction', 'completion-work-item', 'completion-queue'];
  const parts = files.map(name => {
    const sql = readFileSync(path.join(root, `supabase/production_incremental/account-deletion-${name}.sql`), 'utf8');
    if (!/^begin;$/m.test(sql) || !/commit;\s*$/i.test(sql)) throw Error('INVALID_DELETION_PACKAGE_BOUNDARY');
    return sql.replace(/^begin;\n/m, '').replace(/commit;\s*$/i, '');
  });
  return '-- Complete account-deletion minimization candidate; install atomically.\n'
    + 'begin;\nset local lock_timeout = \'5s\';\nset local statement_timeout = \'60s\';\n'
    + parts.join('\n') + '\ncommit;\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(accountDeletionMinimizationSql());
}
