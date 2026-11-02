// Joins the migrations into supabase/setup.sql, so someone setting up their own
// copy can paste one file into the Supabase SQL Editor. Runs before every build.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const folder = 'supabase/migrations'
const parts = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => `-- ${name}\n\n${readFileSync(`${folder}/${name}`, 'utf8').trim()}\n`)

const header = `-- Deep freeze database setup. Paste all of this into the Supabase SQL Editor
-- once, on a new project. Generated from supabase/migrations, so edit those instead.

`
writeFileSync('supabase/setup.sql', header + parts.join('\n'))
