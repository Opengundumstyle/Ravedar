import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function assignImagesToUsers() {
  try {
    console.log('🚀 Starting image assignment process...');

    // Step 1: Get all images from storage bucket
    console.log('📸 Fetching images from storage...');
    const { data: imageFiles, error: storageError } = await supabase.storage
      .from('user-mages')
      .list('user-photos', {
        limit: 100,
        offset: 0,
      });

    console.log('Raw imageFiles from storage:', imageFiles);

    if (storageError) {
      console.error('Error fetching images:', storageError);
      return;
    }

    const images = imageFiles.filter(file => 
      file.name && (
        file.name.endsWith('.jpg') || 
        file.name.endsWith('.jpeg') || 
        file.name.endsWith('.png') ||
        file.name.endsWith('.webp') ||
        file.name.includes('.pic_hd') ||
        file.name.includes('WechatIMG') ||
        file.name.includes('Screenshot') ||
        file.name.includes('simple_compose')
      )
    );

    console.log(`Found ${images.length} images in storage`);

    // Step 2: Get all existing user profiles
    console.log('👥 Fetching existing user profiles...');
    const { data: existingProfiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, name');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return;
    }

    console.log(`Found ${existingProfiles.length} existing profiles`);

    // Step 3: Create additional user profiles if needed
    const totalProfilesNeeded = Math.max(images.length, existingProfiles.length);
    const profilesToCreate = totalProfilesNeeded - existingProfiles.length;

    if (profilesToCreate > 0) {
      console.log(`Creating ${profilesToCreate} additional user profiles...`);
      
      for (let i = 0; i < profilesToCreate; i++) {
        const sessionId = randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 1 day from now
        
        // Create user session
        const { error: sessionError } = await supabase
          .from('user_sessions')
          .insert({
            id: sessionId,
            expires_at: expiresAt
          });

        if (sessionError) {
          console.error('Error creating session:', sessionError);
          continue;
        }

        // Create user profile
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: sessionId,
            name: `User ${existingProfiles.length + i + 1}`,
            expires_at: expiresAt
          });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          continue;
        }

        existingProfiles.push({ id: sessionId, name: `User ${existingProfiles.length + i + 1}` });
      }
    }

    // After creating new profiles and before assigning images, update missing fields for all profiles
    const defaultNames = [
      'Ravebae', 'Glowstar', 'Basshead', 'PLURkid', 'VibeSeeker', 'GrooveGuru', 'NightOwl', 'BeatJunkie', 'FestivalFox', 'DancefloorDiva',
      'TranceTiger', 'HouseHero', 'TechnoTurtle', 'DubstepDuck', 'SunsetSoul', 'SunriseSpirit', 'MainstageMaven', 'UndergroundUnicorn', 'ChillChamp', 'EnergyElf'
    ];
    const defaultBios = [
      "Ready to vibe at the next rave!",
      "Let's dance until sunrise!",
      "PLUR vibes only.",
      "Catch me at the mainstage!",
      "Music is my escape.",
      "Living for the drop.",
      "Glowsticks and good times.",
      "See you on the dancefloor!"
    ];
    const defaultTags = [
      ['House', 'Techno', 'Trance'],
      ['Dubstep', 'Bass', 'Trap'],
      ['Progressive', 'Melodic', 'Chill'],
      ['Drum & Bass', 'Hardstyle', 'Energy'],
      ['Festival', 'Club', 'Warehouse'],
      ['Sunset', 'Sunrise', 'Late Night'],
      ['PLUR', 'Mainstage', 'Underground']
    ];

    for (const user of existingProfiles) {
      const updates = {};
      if (!user.name || user.name === 'null' || user.name === 'Anonymous' || user.name.startsWith('User')) {
        updates.name = defaultNames[Math.floor(Math.random() * defaultNames.length)] + Math.floor(Math.random() * 1000);
      }
      if (!user.about_me) {
        updates.about_me = defaultBios[Math.floor(Math.random() * defaultBios.length)];
      }
      if (!user.vibe_tags || user.vibe_tags.length === 0) {
        updates.vibe_tags = defaultTags[Math.floor(Math.random() * defaultTags.length)];
      }
      if (!user.instagram || user.instagram !== 'ravedar.app') {
        updates.instagram = 'ravedar.app';
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('user_profiles').update(updates).eq('id', user.id);
      }
    }

    // Step 4: Assign images to users and create photo records
    console.log('🔗 Assigning images to users...');
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const userProfile = existingProfiles[i];
      
      if (!userProfile) {
        console.log(`No user profile available for image ${image.name}`);
        continue;
      }

      // Get public URL for the image
      const { data: { publicUrl } } = supabase.storage
        .from('user-mages')
        .getPublicUrl(`user-photos/${image.name}`);

      // Check if photo record already exists
      const { data: existingPhoto } = await supabase
        .from('user_photos')
        .select('id')
        .eq('user_id', userProfile.id)
        .eq('position', 0)
        .single();

      if (existingPhoto) {
        console.log(`Photo already exists for user ${userProfile.name}, updating...`);
        
        // Update existing photo
        const { error: updateError } = await supabase
          .from('user_photos')
          .update({ image_url: publicUrl })
          .eq('id', existingPhoto.id);

        if (updateError) {
          console.error(`Error updating photo for ${userProfile.name}:`, updateError);
        } else {
          console.log(`✅ Updated photo for ${userProfile.name}`);
        }
      } else {
        // Create new photo record
        const { error: insertError } = await supabase
          .from('user_photos')
          .insert({
            user_id: userProfile.id,
            image_url: publicUrl,
            position: 0
          });

        if (insertError) {
          console.error(`Error creating photo for ${userProfile.name}:`, insertError);
        } else {
          console.log(`✅ Created photo for ${userProfile.name}`);
        }
      }
    }

    console.log('🎉 Image assignment process completed!');

    // Step 5: Verify the results
    console.log('🔍 Verifying results...');
    const { data: finalPhotos, error: verifyError } = await supabase
      .from('user_photos')
      .select(`
        id,
        user_id,
        image_url,
        position,
        user_profiles!inner(name)
      `)
      .eq('position', 0);

    if (verifyError) {
      console.error('Error verifying results:', verifyError);
    } else {
      console.log(`✅ Successfully assigned ${finalPhotos.length} photos to users`);
      console.log('📋 Final assignment:');
      finalPhotos.forEach(photo => {
        console.log(`  - ${photo.user_profiles.name}: ${photo.image_url.split('/').pop()}`);
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the script
assignImagesToUsers(); 