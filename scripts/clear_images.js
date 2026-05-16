import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const BUCKET = 'user-photos';
const PLACEHOLDER_URL = 'https://placehold.co/400x600/1a1a1a/ec4899?text=Rave+Profile';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listAllPaths(prefix = '') {
  const collected = [];
  const stack = [prefix];

  while (stack.length) {
    const current = stack.pop();
    let offset = 0;
    const pageSize = 100;

    while (true) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(current, { limit: pageSize, offset });

      if (error) throw error;
      if (!data || data.length === 0) break;

      for (const item of data) {
        const fullPath = current ? `${current}/${item.name}` : item.name;
        // Folders show up with no id / metadata
        if (item.id === null || item.metadata === null) {
          stack.push(fullPath);
        } else {
          collected.push(fullPath);
        }
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }

  return collected;
}

async function main() {
  console.log(`Listing files in bucket "${BUCKET}"...`);
  const paths = await listAllPaths('');
  console.log(`Found ${paths.length} files`);

  if (paths.length > 0) {
    console.log('Deleting files...');
    const chunkSize = 100;
    let deleted = 0;
    for (let i = 0; i < paths.length; i += chunkSize) {
      const chunk = paths.slice(i, i + chunkSize);
      const { data, error } = await supabase.storage.from(BUCKET).remove(chunk);
      if (error) {
        console.error(`Error deleting chunk starting at ${i}:`, error.message);
      } else {
        deleted += data?.length ?? 0;
        console.log(`  Deleted ${deleted}/${paths.length}`);
      }
    }
  }

  console.log('Updating user_photos.image_url to placeholder...');
  const { data: rows, error: fetchError } = await supabase
    .from('user_photos')
    .select('id');

  if (fetchError) {
    console.error('Error fetching user_photos:', fetchError.message);
    process.exit(1);
  }

  console.log(`Found ${rows.length} rows to update`);

  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { error: updateError, count } = await supabase
      .from('user_photos')
      .update({ image_url: PLACEHOLDER_URL }, { count: 'exact' })
      .in('id', ids);

    if (updateError) {
      console.error('Update error:', updateError.message);
      process.exit(1);
    }
    console.log(`Updated ${count ?? rows.length} rows`);
  }

  // Verify
  console.log('Verifying...');
  const remaining = await listAllPaths('');
  const { data: sample, error: sampleErr } = await supabase
    .from('user_photos')
    .select('image_url')
    .limit(5);

  if (sampleErr) {
    console.error('Verify error:', sampleErr.message);
  }

  console.log(`\nResult:`);
  console.log(`  Files left in bucket: ${remaining.length}`);
  console.log(`  Sample image_url values:`);
  sample?.forEach((r) => console.log(`    - ${r.image_url}`));

  const allPlaceholder = sample?.every((r) => r.image_url === PLACEHOLDER_URL);
  if (remaining.length === 0 && allPlaceholder) {
    console.log('\nDone.');
  } else {
    console.log('\nFinished with warnings — check output above.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
