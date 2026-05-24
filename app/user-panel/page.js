'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import RadarLoader from '../components/RadarLoader';
import GraffitiWall from '../components/GraffitiWall';
import { useAuth } from '../components/AuthContext';

const TABS = [
  { key: 'profile', label: 'TAG' },
  { key: 'photos', label: 'GALLERY' },
  { key: 'settings', label: 'RIG' },
];

const AVAILABLE_VIBE_TAGS = [
  'House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'Hardstyle',
  'Progressive', 'Melodic', 'Bass', 'Trap', 'Future Bass', 'Psytrance',
  'Underground', 'Mainstage', 'Chill', 'Energy', 'PLUR', 'Festival',
  'Club', 'Warehouse', 'Outdoor', 'Sunset', 'Sunrise', 'Late Night',
];

export default function UserPanelPage() {
  const router = useRouter();
  const { signOut } = useAuth();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [eventPushOptOut, setEventPushOptOut] = useState(false);
  const [pushToggleSaving, setPushToggleSaving] = useState(false);
  const [photos, setPhotos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [activeTab, setActiveTab] = useState('profile');
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          router.push('/signin');
          return;
        }
        setUser(authUser);

        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();
        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Profile fetch error:', profileError);
        } else if (profileData) {
          setProfile(profileData);
          setEventPushOptOut(Boolean(profileData.event_push_opt_out));
        }

        const { data: photosData, error: photosError } = await supabase
          .from('user_photos')
          .select('*')
          .eq('user_id', authUser.id)
          .order('position');
        if (photosError) {
          console.error('Photos fetch error:', photosError);
        } else {
          setPhotos(photosData || []);
        }
      } catch (err) {
        console.error('User data fetch error:', err);
        setError('▸ failed to load your tag.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (photos.length + files.length > 6) {
      setError('▸ max 6 photos.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) throw new Error('image files only.');
        if (file.size > 5 * 1024 * 1024) throw new Error('files must be under 5mb.');

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `user-photos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('user-photos')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('user-photos')
          .getPublicUrl(filePath);

        const position = photos.length + uploaded.length;
        const { data: inserted, error: insertError } = await supabase
          .from('user_photos')
          .insert({ user_id: user.id, image_url: publicUrl, position })
          .select()
          .single();
        if (insertError) throw insertError;

        uploaded.push(inserted);
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = async (index) => {
    try {
      const photoToRemove = photos[index];
      if (photoToRemove?.id) {
        const { error: delErr } = await supabase
          .from('user_photos')
          .delete()
          .eq('id', photoToRemove.id);
        if (delErr) throw delErr;
      }
      setPhotos((prev) => prev.filter((_, i) => i !== index));
    } catch (err) {
      setError('▸ failed to remove photo.');
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const formData = new FormData(e.target);
      const updateData = {
        name: formData.get('name'),
        instagram: formData.get('instagram'),
        about_me: formData.get('aboutMe'),
        vibe_tags: profile?.vibe_tags || [],
      };
      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      setProfile((prev) => ({ ...prev, ...updateData }));
      setSuccess('▸ tag updated.');
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError('▸ failed to update tag.');
    } finally {
      setSaving(false);
    }
  };

  const handleVibeTagToggle = (tag) => {
    setProfile((prev) => {
      const current = prev?.vibe_tags || [];
      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag].slice(0, 5);
      return { ...prev, vibe_tags: next };
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleTogglePush = async () => {
    if (!user) return;
    const next = !eventPushOptOut;
    setPushToggleSaving(true);
    const prev = eventPushOptOut;
    setEventPushOptOut(next);
    const { error } = await supabase
      .from('user_profiles')
      .update({ event_push_opt_out: next })
      .eq('id', user.id);
    setPushToggleSaving(false);
    if (error) {
      setEventPushOptOut(prev);
      console.error('toggle failed', error);
    }
  };

  if (loading) return <RadarLoader eventName="loading your tag..." />;

  return (
    <div className="rd-screen scrollable">
      <GraffitiWall ambientLaser />

      {/* TOP BAR */}
      <div style={topBar.container}>
        <button
          className="rd-nav-chip"
          onClick={() => router.push('/matches')}
          style={{ pointerEvents: 'auto' }}
        >
          ◄ BACK
        </button>
        <div className="rd-bpm-tag" style={{ pointerEvents: 'auto' }}>
          <span className="rd-bpm-dot" />
          128 BPM
        </div>
      </div>

      <div style={layout.container}>
        {/* HEADER */}
        <div style={layout.header}>
          <div className="rd-status-pill" style={{ marginBottom: '1.2rem' }}>
            <span className="rd-status-dot" />
            RAVEDAR ▸ YOUR TAG
          </div>
          <h1 className="rd-neon-title" style={layout.title}>MY TAG</h1>
          <div className="font-mono-accent" style={layout.subtitle}>
            edit your tag · update your vibe
          </div>
        </div>

        {/* TABS */}
        <div style={tabs.row}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setActiveTab(t.key);
                  setError('');
                  setSuccess('');
                }}
                style={{
                  ...tabs.btn,
                  ...(active ? tabs.btnActive : null),
                }}
              >
                <span style={tabs.arrow}>▸</span> {t.label}
              </button>
            );
          })}
        </div>

        {/* CONTENT */}
        {activeTab === 'profile' && (
          <form onSubmit={handleProfileUpdate}>
            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">01</span>
                <span className="rd-field-arrow">▸</span>
                NAME
              </label>
              <input
                type="text"
                name="name"
                defaultValue={profile?.name || ''}
                className="rd-input"
                placeholder="how should we tag you"
                required
              />
            </div>

            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">02</span>
                <span className="rd-field-arrow">▸</span>
                INSTAGRAM <span className="rd-field-opt">(opt.)</span>
              </label>
              <input
                type="text"
                name="instagram"
                defaultValue={profile?.instagram || ''}
                className="rd-input"
                placeholder="@yourhandle"
              />
            </div>

            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">03</span>
                <span className="rd-field-arrow">▸</span>
                ABOUT <span className="rd-field-opt">(opt.)</span>
              </label>
              <textarea
                name="aboutMe"
                defaultValue={profile?.about_me || ''}
                rows="3"
                className="rd-input"
                placeholder="your rave story ···"
                style={{ resize: 'none' }}
              />
            </div>

            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">04</span>
                <span className="rd-field-arrow">▸</span>
                VIBE TAGS <span className="rd-field-opt">(max 5)</span>
              </label>
              <div style={vibeGrid.container}>
                {AVAILABLE_VIBE_TAGS.map((tag) => {
                  const active = profile?.vibe_tags?.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleVibeTagToggle(tag)}
                      style={{
                        ...vibeGrid.chip,
                        ...(active ? vibeGrid.chipActive : null),
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div className="font-mono-accent" style={vibeGrid.counter}>
                ▸ {(profile?.vibe_tags?.length || 0)} / 5 selected
              </div>
            </div>

            {error && <div className="rd-banner rd-banner--error">{error}</div>}
            {success && <div className="rd-banner rd-banner--success">{success}</div>}

            <div className="rd-btn-wrap" style={{ marginTop: '1.8rem' }}>
              <button
                type="submit"
                disabled={saving}
                className="rd-btn-neon"
              >
                {saving ? 'SAVING ···' : 'SAVE TAG'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'photos' && (
          <div>
            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">01</span>
                <span className="rd-field-arrow">▸</span>
                PHOTOS <span className="rd-field-opt">(max 6)</span>
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                style={photoDrop.container}
              >
                <div style={photoDrop.arrow}>▼</div>
                <div className="font-mono-accent" style={photoDrop.title}>
                  drop photos here
                </div>
                <div className="font-mono-accent" style={photoDrop.subtitle}>
                  jpg · png · up to 5mb each
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />

              {photos.length > 0 && (
                <div style={photoGrid.container}>
                  {photos.map((photo, idx) => (
                    <div key={photo.id || idx} style={photoGrid.item}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.image_url}
                        alt={`photo-${idx}`}
                        style={photoGrid.img}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        style={photoGrid.remove}
                        aria-label="remove photo"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploading && (
                <div className="rd-banner" style={{ marginTop: '0.8rem' }}>
                  ▸ uploading ···
                </div>
              )}
            </div>

            {error && <div className="rd-banner rd-banner--error">{error}</div>}
            {success && <div className="rd-banner rd-banner--success">{success}</div>}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">01</span>
                <span className="rd-field-arrow">▸</span>
                ACCOUNT
              </label>
              <div style={settings.card}>
                <div style={settings.row}>
                  <span className="font-mono-accent" style={settings.label}>EMAIL</span>
                  <span style={settings.value}>{user?.email || '—'}</span>
                </div>
                <div style={settings.row}>
                  <span className="font-mono-accent" style={settings.label}>JOINED</span>
                  <span style={settings.value}>
                    {user?.created_at
                      ? new Date(user.created_at).toLocaleDateString()
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">02</span>
                <span className="rd-field-arrow">▸</span>
                NOTIFICATIONS
              </label>
              <div style={settings.card}>
                <div style={{ ...settings.row, borderBottom: 'none', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, paddingRight: '1rem' }}>
                    <div className="font-mono-accent" style={settings.label}>EVENT PUSHES</div>
                    <div style={{ ...settings.value, fontSize: '0.72rem', marginTop: '0.25rem', opacity: 0.7 }}>
                      ping me when new ravers join an event i'm scanning
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTogglePush}
                    disabled={pushToggleSaving}
                    aria-pressed={!eventPushOptOut}
                    style={{
                      width: '44px',
                      height: '24px',
                      borderRadius: '12px',
                      border: '1px solid var(--rd-spray-pink)',
                      background: eventPushOptOut ? 'transparent' : 'var(--rd-spray-pink)',
                      position: 'relative',
                      cursor: pushToggleSaving ? 'wait' : 'pointer',
                      transition: 'background 160ms ease',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      top: '2px',
                      left: eventPushOptOut ? '2px' : '22px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 160ms ease',
                    }} />
                  </button>
                </div>
              </div>
            </div>

            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">03</span>
                <span className="rd-field-arrow">▸</span>
                DANGER ZONE
              </label>
              <div className="font-mono-accent" style={settings.dangerNote}>
                ▸ peace out · sign out of ravedar
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="rd-btn-ghost"
                style={{ width: '100%' }}
              >
                SIGN OUT
              </button>
            </div>

            <button
              className="rd-stencil-link"
              onClick={() => router.push('/settings')}
              style={{ marginTop: '1.2rem', display: 'block' }}
            >
              <span className="rd-arrow">▸</span> settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const topBar = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.1rem 1.25rem',
    pointerEvents: 'none',
  },
};

const layout = {
  container: {
    position: 'relative',
    zIndex: 10,
    maxWidth: '460px',
    margin: '0 auto',
    padding: '5rem 1.5rem 5rem',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  title: {
    fontSize: 'clamp(2.6rem, 10vw, 4.2rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    marginBottom: '0.8rem',
    lineHeight: 1,
  },
  subtitle: {
    fontSize: '0.7rem',
    letterSpacing: '0.32em',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
  },
};

const tabs = {
  row: {
    display: 'flex',
    gap: '0.45rem',
    justifyContent: 'center',
    marginBottom: '2rem',
  },
  btn: {
    flex: 1,
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.18)',
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.68rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    padding: '0.65rem 0.5rem',
    borderRadius: '2px',
    cursor: 'pointer',
    transition: 'all 0.18s',
  },
  btnActive: {
    background: 'rgba(255, 26, 138, 0.14)',
    borderColor: 'var(--rd-spray-pink)',
    color: 'var(--rd-spray-pink)',
    boxShadow: '0 0 12px rgba(255,26,138,0.35), inset 0 0 14px rgba(255,26,138,0.18)',
  },
  arrow: {
    color: 'var(--rd-spray-cyan)',
    marginRight: '0.25rem',
  },
};

const vibeGrid = {
  container: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
  },
  chip: {
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.18)',
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.62rem',
    letterSpacing: '0.18em',
    padding: '0.6rem 0.4rem',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'all 0.18s',
    borderRadius: '2px',
  },
  chipActive: {
    background: 'rgba(255, 26, 138, 0.16)',
    borderColor: 'var(--rd-spray-pink)',
    color: 'var(--rd-spray-pink)',
    textShadow: '0 0 8px rgba(255,26,138,0.55)',
    boxShadow: 'inset 0 0 14px rgba(255,26,138,0.25)',
  },
  counter: {
    fontSize: '0.62rem',
    letterSpacing: '0.28em',
    color: 'rgba(255,255,255,0.4)',
    marginTop: '0.8rem',
    textTransform: 'uppercase',
  },
};

const photoDrop = {
  container: {
    border: '1px dashed rgba(255,255,255,0.28)',
    background: 'rgba(0,0,0,0.35)',
    borderRadius: '2px',
    padding: '1.8rem 1rem',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  arrow: {
    fontSize: '1.6rem',
    color: 'var(--rd-spray-pink)',
    marginBottom: '0.5rem',
    textShadow: '0 0 12px rgba(255,26,138,0.6)',
  },
  title: {
    fontSize: '0.72rem',
    letterSpacing: '0.3em',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: '0.6rem',
    letterSpacing: '0.3em',
    color: 'rgba(255,255,255,0.4)',
    marginTop: '0.4rem',
    textTransform: 'uppercase',
  },
};

const photoGrid = {
  container: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginTop: '0.9rem',
  },
  item: {
    position: 'relative',
    aspectRatio: '1 / 1',
    overflow: 'hidden',
    borderRadius: '2px',
    border: '1px solid rgba(255,255,255,0.15)',
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  remove: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.75)',
    border: '1px solid var(--rd-spray-pink)',
    color: 'var(--rd-spray-pink)',
    cursor: 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

const settings = {
  card: {
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '2px',
    padding: '1rem 1rem',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.45rem 0',
    borderBottom: '1px dashed rgba(255,255,255,0.08)',
  },
  label: {
    fontSize: '0.62rem',
    letterSpacing: '0.3em',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.9)',
  },
  dangerNote: {
    fontSize: '0.62rem',
    letterSpacing: '0.28em',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: '0.9rem',
    textTransform: 'uppercase',
  },
};
