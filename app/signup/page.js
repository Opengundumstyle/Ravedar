'use client';

import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import RadarLoader from '../components/RadarLoader';
import GraffitiWall from '../components/GraffitiWall';
import { useAuth } from '../components/AuthContext';

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    instagram: '',
    aboutMe: '',
    vibeTags: [],
  });

  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const availableVibeTags = [
    'House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'Hardstyle',
    'Progressive', 'Melodic', 'Bass', 'Trap', 'Future Bass', 'Psytrance',
    'Underground', 'Mainstage', 'Chill', 'Energy', 'PLUR', 'Festival',
    'Club', 'Warehouse', 'Outdoor', 'Sunset', 'Sunrise', 'Late Night',
  ];

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) router.push('/matches');
  }, [isAuthenticated, user, router]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVibeTagToggle = (tag) => {
    setFormData((prev) => ({
      ...prev,
      vibeTags: prev.vibeTags.includes(tag)
        ? prev.vibeTags.filter((t) => t !== tag)
        : [...prev.vibeTags, tag].slice(0, 5),
    }));
  };

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
        if (!file.type.startsWith('image/')) {
          throw new Error('image files only.');
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error('files must be under 5mb.');
        }
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
        uploaded.push({
          image_url: publicUrl,
          position: photos.length + uploaded.length,
        });
      }
      setPhotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSignup = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');

    // Capture the anon profile id (if any) BEFORE signUp overwrites localStorage downstream.
    const anonId = typeof window !== 'undefined'
      ? localStorage.getItem('user_profile_id')
      : null;

    try {
      if (formData.password !== formData.confirmPassword) {
        throw new Error('passwords do not match.');
      }
      if (formData.password.length < 6) {
        throw new Error('password must be at least 6 characters.');
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            instagram: formData.instagram,
            about_me: formData.aboutMe,
            vibe_tags: formData.vibeTags,
          },
          emailRedirectTo: `${window.location.origin}/oauth/callback`,
        },
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('failed to create account.');

      // Reparent the anon's likes / user_events to the new real id, then drop the anon row.
      // Runs before the email-confirmation branch so reparenting is durable in both paths.
      if (anonId && anonId !== authData.user.id) {
        const { error: claimError } = await supabase.rpc('claim_anon_profile', {
          anon_id: anonId,
          real_id: authData.user.id,
        });
        if (claimError) {
          // Non-fatal — the new account still works; the anon's likes are just stranded.
          console.error('claim_anon_profile failed:', claimError);
        }
      }

      // Email confirmation flow
      if (authData.user.email_confirmed_at === null) {
        sessionStorage.setItem('just_signed_up', '1');
        setSuccess('▸ account created. check your email to confirm.');
        setTimeout(() => {
          setLoading(false);
          setSuccess('');
          router.push('/signin');
        }, 4000);
        return;
      }

      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      // Ensure user_sessions row
      const { data: existingSession, error: sessionCheckError } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('id', authData.user.id)
        .single();
      if (sessionCheckError && sessionCheckError.code !== 'PGRST116') {
        throw new Error('failed to check session.');
      }
      if (!existingSession) {
        const { error: sessionError } = await supabase
          .from('user_sessions')
          .insert({ id: authData.user.id, expires_at: expiresAt });
        if (sessionError) throw new Error(`failed to create session: ${sessionError.message}`);
      } else {
        await supabase
          .from('user_sessions')
          .update({ expires_at: expiresAt })
          .eq('id', authData.user.id);
      }

      // Profile upsert
      const { data: existingProfile, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', authData.user.id)
        .single();
      if (checkError && checkError.code !== 'PGRST116') {
        throw new Error('failed to check profile.');
      }
      if (existingProfile) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            name: formData.name,
            instagram: formData.instagram,
            about_me: formData.aboutMe,
            vibe_tags: formData.vibeTags,
            is_real: true,
            expires_at: expiresAt,
          })
          .eq('id', authData.user.id);
        if (updateError) throw new Error(`failed to update profile: ${updateError.message}`);
      } else {
        const { error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            name: formData.name,
            instagram: formData.instagram,
            about_me: formData.aboutMe,
            vibe_tags: formData.vibeTags,
            is_real: true,
            expires_at: expiresAt,
          });
        if (createError) throw new Error(`failed to create profile: ${createError.message}`);
      }

      // Photo rows
      for (let i = 0; i < photos.length; i++) {
        await supabase
          .from('user_photos')
          .insert({
            user_id: authData.user.id,
            image_url: photos[i].image_url,
            position: i,
          });
      }

      localStorage.setItem('user_profile_id', authData.user.id);
      sessionStorage.setItem('just_signed_up', '1');
      localStorage.removeItem('user_section_id');
      localStorage.removeItem('user_event_data');

      setSuccess('▸ tagged in. welcome to ravedar.');
      setTimeout(() => {
        setLoading(false);
        setSuccess('');
        router.push('/');
      }, 1800);
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message || 'failed to create account.');
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 1) {
      if (!formData.email || !formData.password || !formData.confirmPassword) {
        setError('▸ all fields are required.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('▸ passwords do not match.');
        return;
      }
      if (formData.password.length < 6) {
        setError('▸ password must be at least 6 characters.');
        return;
      }
      if (!formData.email.includes('@')) {
        setError('▸ enter a valid email.');
        return;
      }
    }
    if (step === 2 && !formData.name) {
      setError('▸ what should we tag you?');
      return;
    }
    if (step === 3 && formData.vibeTags.length === 0) {
      setError('▸ pick at least one vibe.');
      return;
    }
    setStep((p) => p + 1);
    setError('');
  };

  const prevStep = () => {
    setStep((p) => p - 1);
    setError('');
  };

  if (loading && step === 4) {
    return <RadarLoader eventName="creating your profile..." />;
  }

  return (
    <div className="rd-screen scrollable">
      <GraffitiWall ambientLaser />

      <div style={layout.container}>
        {/* HEADER */}
        <div style={layout.header}>
          <div className="rd-status-pill" style={{ marginBottom: '1.2rem' }}>
            <span className="rd-status-dot" />
            RAVEDAR ▸ SIGN UP
          </div>
          <h1 className="rd-neon-title" style={layout.title}>TAG IN</h1>
          <div className="font-mono-accent" style={layout.subtitle}>
            join the wall · find your rave match
          </div>
        </div>

        {/* STEP INDICATOR */}
        <div style={stepRow.container}>
          {[1, 2, 3, 4].map((n) => {
            const isActive = n <= step;
            return (
              <div
                key={n}
                style={{
                  ...stepRow.dot,
                  background: isActive ? 'var(--rd-spray-pink)' : 'rgba(0,0,0,0.5)',
                  borderColor: isActive ? 'var(--rd-spray-pink)' : 'rgba(255,255,255,0.18)',
                  boxShadow: isActive ? '0 0 12px rgba(255,26,138,0.45)' : 'none',
                  color: isActive ? '#000' : 'rgba(255,255,255,0.45)',
                }}
              >
                0{n}
              </div>
            );
          })}
        </div>

        {/* STEP CONTENT */}
        <form onSubmit={(e) => e.preventDefault()}>
          {step === 1 && (
            <>
              <div className="rd-field">
                <label className="rd-field-label">
                  <span className="rd-field-num">01</span>
                  <span className="rd-field-arrow">▸</span>
                  EMAIL
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="rd-input"
                  placeholder="email@vibe.zone"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="rd-field">
                <label className="rd-field-label">
                  <span className="rd-field-num">02</span>
                  <span className="rd-field-arrow">▸</span>
                  PASSWORD
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="rd-input"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="rd-field">
                <label className="rd-field-label">
                  <span className="rd-field-num">03</span>
                  <span className="rd-field-arrow">▸</span>
                  CONFIRM
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="rd-input"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="rd-field">
                <label className="rd-field-label">
                  <span className="rd-field-num">01</span>
                  <span className="rd-field-arrow">▸</span>
                  NAME
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
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
                  value={formData.instagram}
                  onChange={handleInputChange}
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
                  value={formData.aboutMe}
                  onChange={handleInputChange}
                  rows="3"
                  className="rd-input"
                  placeholder="your rave story ···"
                  style={{ resize: 'none' }}
                />
              </div>
            </>
          )}

          {step === 3 && (
            <div className="rd-field">
              <label className="rd-field-label">
                <span className="rd-field-num">01</span>
                <span className="rd-field-arrow">▸</span>
                VIBE TAGS <span className="rd-field-opt">(max 5)</span>
              </label>
              <div style={vibeGrid.container}>
                {availableVibeTags.map((tag) => {
                  const active = formData.vibeTags.includes(tag);
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
              <div
                className="font-mono-accent"
                style={{
                  fontSize: '0.62rem',
                  letterSpacing: '0.28em',
                  color: 'rgba(255,255,255,0.4)',
                  marginTop: '0.8rem',
                  textTransform: 'uppercase',
                }}
              >
                ▸ {formData.vibeTags.length} / 5 selected
              </div>
            </div>
          )}

          {step === 4 && (
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
                <div
                  className="font-mono-accent"
                  style={{
                    fontSize: '0.72rem',
                    letterSpacing: '0.3em',
                    color: 'rgba(255,255,255,0.75)',
                    textTransform: 'uppercase',
                  }}
                >
                  drop photos here
                </div>
                <div
                  className="font-mono-accent"
                  style={{
                    fontSize: '0.6rem',
                    letterSpacing: '0.3em',
                    color: 'rgba(255,255,255,0.4)',
                    marginTop: '0.4rem',
                    textTransform: 'uppercase',
                  }}
                >
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
                    <div key={idx} style={photoGrid.item}>
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
          )}

          {error && <div className="rd-banner rd-banner--error">{error}</div>}
          {success && <div className="rd-banner rd-banner--success">{success}</div>}

          {/* ACTION BUTTONS */}
          <div style={btnRow.container}>
            {step > 1 && (
              <button
                type="button"
                onClick={prevStep}
                className="rd-btn-ghost"
                style={{ flex: 1 }}
              >
                ◄ BACK
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={nextStep}
                className="rd-btn-neon"
                style={{ flex: step > 1 ? 1.4 : 1 }}
              >
                CONTINUE
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignup}
                disabled={loading}
                className="rd-btn-neon"
                style={{ flex: step > 1 ? 1.4 : 1 }}
              >
                {loading ? 'TAGGING IN ···' : 'DROP IN'}
              </button>
            )}
          </div>

          {/* FOOTER LINKS */}
          <div style={{ textAlign: 'center', marginTop: '1.8rem' }}>
            <span
              className="font-mono-accent"
              style={{
                fontSize: '0.7rem',
                letterSpacing: '0.2em',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              got an account?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/signin')}
              className="rd-stencil-link"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <span className="rd-arrow">▸</span> SIGN IN
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: '0.8rem' }}>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rd-stencil-link"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              ◄ BACK TO HOME
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const layout = {
  container: {
    position: 'relative',
    zIndex: 10,
    maxWidth: '460px',
    margin: '0 auto',
    padding: '2.5rem 1.5rem 5rem',
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

const stepRow = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.45rem',
    marginBottom: '2.2rem',
  },
  dot: {
    width: '48px',
    height: '26px',
    borderRadius: '2px',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.2em',
    transition: 'background 0.25s, box-shadow 0.25s, color 0.25s, border-color 0.25s',
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

const btnRow = {
  container: {
    display: 'flex',
    gap: '0.7rem',
    marginTop: '1.8rem',
  },
};
