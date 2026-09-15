/** Run from any directory: node backend/tests/run-tests.mjs
 * Install @electric-sql/pglite@0.3.14 locally first, or set PGLITE_MODULE to an
 * absolute file path to that package's dist/index.js. No live service required.
 */
import {readFile} from 'node:fs/promises';
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
let passed = 0;
const onNotice = n => {
  if(n.message.startsWith('PASS:')) { passed += 1; console.log(n.message); }
};
const db = new PGlite();
try {
  for (const path of ['stubs.sql','../schema.sql','security.sql']) {
    await db.exec(await readFile(new URL(path, import.meta.url),'utf8'), {onNotice});
  }
  if (passed < 70) throw new Error(`Expected at least 70 test assertions, received ${passed}`);
  console.log(`\n${passed} PostgreSQL security/workflow assertions passed.`);
  console.log('Storage tests verify SQL eligibility for signed URLs; real Storage HTTP signing, MIME/size enforcement and email delivery require live integration testing.');
} finally { await db.close(); }
