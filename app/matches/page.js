'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import UserCard from '../components/UserCard';
import RadarLoader from '../components/RadarLoader';
import ChatNotificationModal from '../components/ChatNotificationModal';
import FounderMatchModal from '../components/FounderMatchModal';
import GraffitiWall from '../components/GraffitiWall';
import { useAuth } from '../components/AuthContext';
import GhostChip from '../components/GhostChip';
import SignupGateModal from '../components/SignupGateModal';
import SparseRoomBanner from '../components/SparseRoomBanner';
import ReportModal from '../components/ReportModal';
import ShareEventLink from '../components/ShareEventLink';
import { checkMutualMatch, getMatchesForUser, getActiveRooms } from '../../lib/api/matches';
import { createMatch } from '../../lib/api/chat';
import RoomSwitcher from '../components/RoomSwitcher';

const SLOGANS = [
  '{name} is down to vibe with you at {event}.',
  'you and {name} are vibing at {event} — go.',
  '{name} is feeling your vibe for {event}.',
  'you and {name} just synced up for {event}.',
  '{name} is ready to light up {event} with you.',
];

export default function MatchesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // ---------------- state ----------------
  const [matches, setMatches] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchOverlay, setMatchOverlay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState('');
  const [showFounderModal, setShowFounderModal] = useState(false);
  const [showSignupGate, setShowSignupGate] = useState(false);
  const [signupGateUser, setSignupGateUser] = useState(null);
  const [matchSlogan, setMatchSlogan] = useState('');
  const [showChatModal, setShowChatModal] = useState(false);
  const [matchedUser, setMatchedUser] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [totalSwipes, setTotalSwipes] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [frozenBottomCard, setFrozenBottomCard] = useState(null);
  const [activationBanner, setActivationBanner] = useState(null); // null | { count: number }
  const [realCount, setRealCount] = useState(0);
  const [myEventInfo, setMyEventInfo] = useState(null); // { name, city, date }
  const [scanAnyway, setScanAnyway] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [blockedSetVersion, setBlockedSetVersion] = useState(0);

  const [rooms, setRooms] = useState([]);
  const [currentRoomId, setCurrentRoomId] = useState(null);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);

  const currentCard = matches[currentIndex];
  const nextCard = matches[currentIndex + 1];
  const bottomCard = isAnimating ? frozenBottomCard : nextCard;

  // ---------------- effect A: load active rooms, pick current ----------------
  useEffect(() => {
    (async () => {
      const userId = localStorage.getItem('user_profile_id');
      if (!userId) {
        router.push('/');
        return;
      }

      const { data: currentUserProfile } = await supabase
        .from('user_profiles')
        .select('id, name, photos:user_photos(image_url, position)')
        .eq('id', userId)
        .single();
      setCurrentUser(currentUserProfile);

      let activeRooms = [];
      try {
        activeRooms = await getActiveRooms(userId);
      } catch (err) {
        console.error('Failed to load active rooms:', err);
      }
      if (!activeRooms || activeRooms.length === 0) {
        router.push('/');
        return;
      }
      setRooms(activeRooms);

      const stored = localStorage.getItem('current_room_id');
      const pick = activeRooms.find((r) => r.id === stored) || activeRooms[0];
      setCurrentRoomId(pick.id);
      localStorage.setItem('current_room_id', pick.id);
    })();
  }, [router]);

  // ---------------- effect B: build the deck for the current room ----------------
  useEffect(() => {
    if (!currentRoomId) return;
    const room = rooms.find((r) => r.id === currentRoomId);
    if (!room) return;

    let cancelled = false;
    const fetchAndBuffer = async () => {
      setLoading(true);
      const fetchPromise = (async () => {
        const userId = localStorage.getItem('user_profile_id');
        if (!userId) {
          router.push('/');
          return;
        }

        setEventName(room.name);
        setMyEventInfo({ name: room.name, city: room.city, date: room.date });

        const shuffle = (arr) => {
          const a = [...arr];
          let m = a.length;
          while (m) {
            const i = Math.floor(Math.random() * m--);
            [a[m], a[i]] = [a[i], a[m]];
          }
          return a;
        };

        // Real co-attendees of the same event — the only candidates that can mutually match.
        let realCoAttendees = [];
        try {
          realCoAttendees = await getMatchesForUser(
            userId,
            room.name,
            room.city,
            room.date
          );
        } catch (err) {
          console.error('Failed to load real co-attendees:', err);
        }
        setRealCount(realCoAttendees.length);
        const shuffledReal = shuffle(realCoAttendees);

        const { data: fakeProfiles } = await supabase
          .from('user_profiles')
          .select('id, name, instagram, vibe_tags, about_me, is_real, role')
          .or('is_real.eq.false,role.eq.founder,role.eq.co-founder');

        const shuffled = shuffle(fakeProfiles || []);
        const allUserIds = shuffled.map((u) => u.id);
        const { data: photos } = await supabase
          .from('user_photos')
          .select('user_id, image_url, position')
          .in('user_id', allUserIds);
        const mergePhotos = (profiles) =>
          (profiles || []).map((p) => ({
            ...p,
            photos: (photos || [])
              .filter((pp) => pp.user_id === p.id)
              .sort((a, b) => a.position - b.position),
          }));
        const mergedFake = mergePhotos(shuffled);

        // Real users first (already photo-merged by getMatchesForUser), then demo/founders, deduped.
        const seen = new Set();
        const combined = [];
        for (const p of [...shuffledReal, ...mergedFake]) {
          if (!p || seen.has(p.id)) continue;
          seen.add(p.id);
          combined.push(p);
        }

        const surveyCard = {
          id: 'survey-card',
          name: 'Quick Vibe Check',
          about_me: "how's your matching experience?",
          is_survey: true,
          survey_options: [
            { text: '👍 good', action: 'good' },
            { text: '😕 poor', action: 'poor' },
          ],
          photos: [],
        };

        if (combined.length >= 15) combined.splice(15, 0, surveyCard);
        else combined.push(surveyCard);

        if (!cancelled) setMatches(combined);
      })();

      const buffer = new Promise((r) => setTimeout(r, 2500));
      await Promise.all([fetchPromise, buffer]);
      if (!cancelled) setLoading(false);
    };
    fetchAndBuffer();
    return () => {
      cancelled = true;
    };
    // rooms intentionally omitted: the deck rebuilds on currentRoomId change;
    // the room object is resolved from rooms via closure at run time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoomId, blockedSetVersion, router]);

  // Post-signup activation: read+clear the just_signed_up flag, then
  // count pending right-swipes against real users that now resolve to mutual matches.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flag = sessionStorage.getItem('just_signed_up');
    if (!flag) return;
    sessionStorage.removeItem('just_signed_up');

    (async () => {
      const userId = localStorage.getItem('user_profile_id');
      if (!userId) return;

      // Step 1: my outgoing right-swipes
      const { data: outgoingLikes, error: likesError } = await supabase
        .from('likes')
        .select('to_user_id')
        .eq('from_user_id', userId)
        .eq('liked', true);
      if (likesError) {
        console.error('activation: fetch outgoing likes failed', likesError);
        setActivationBanner({ count: 0 });
        return;
      }
      const targetIds = (outgoingLikes || []).map((r) => r.to_user_id);
      if (targetIds.length === 0) {
        setActivationBanner({ count: 0 });
        return;
      }

      // Step 2: filter to real targets only (demo/fake never reciprocate)
      const { data: realProfiles } = await supabase
        .from('user_profiles')
        .select('id')
        .in('id', targetIds)
        .eq('is_real', true);
      const realTargetIds = (realProfiles || []).map((p) => p.id);

      // Step 3: check mutuality, create matches, count
      let activatedCount = 0;
      for (const targetId of realTargetIds) {
        try {
          const mutual = await checkMutualMatch(userId, targetId);
          if (mutual) {
            await createMatch(userId, targetId);
            activatedCount += 1;
          }
        } catch (err) {
          console.error('activation check failed for', targetId, err);
        }
      }

      setActivationBanner({ count: activatedCount });
    })();
  }, []);

  const handleSelectRoom = (roomId) => {
    if (roomId === currentRoomId) return;
    localStorage.setItem('current_room_id', roomId);
    setMatches([]);
    setCurrentIndex(0);
    setScanAnyway(false);
    setCurrentRoomId(roomId); // triggers effect B refetch for the new room
  };

  // ---------------- swipe → like ----------------
  const handleSwipe = async (direction, match) => {
    const userId = localStorage.getItem('user_profile_id');
    if (!match || !userId) return;
    if (match.is_survey) return;

    await supabase.from('likes').insert({
      from_user_id: userId,
      to_user_id: match.id,
      liked: direction === 'right',
    });

    if (direction === 'right') {
      // Anon swiping right on a real user (not founder/co-founder): gate.
      if (
        match.is_real &&
        !isAuthenticated &&
        match.role !== 'founder' &&
        match.role !== 'co-founder'
      ) {
        setSignupGateUser(match);
        setShowSignupGate(true);
        setTotalSwipes((t) => t + 1);
        return;
      }

      if (match.role === 'founder' || match.role === 'co-founder') {
        setMatchedUser(match);
        setShowFounderModal(true);
      } else if (match.is_real) {
        try {
          const mutual = await checkMutualMatch(userId, match.id);
          if (mutual) {
            await createMatch(userId, match.id);
            setMatchedUser(match);
            const tmpl = SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
            setMatchSlogan(
              tmpl.replace('{name}', match.name).replace('{event}', eventName)
            );
            setMatchOverlay(true);
            setMatchCount((c) => c + 1);
          }
        } catch (err) {
          console.error('Mutual match check failed:', err);
        }
      } else {
        setMatchedUser(match);
        const tmpl = SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
        setMatchSlogan(
          tmpl.replace('{name}', match.name).replace('{event}', eventName)
        );
        setMatchOverlay(true);
        setMatchCount((c) => c + 1);
      }
    }

    setTotalSwipes((t) => t + 1);
  };

  const handleKeepSwiping = () => setMatchOverlay(false);
  const handleStartChat = async () => {
    if (!matchedUser) return;
    const userId = localStorage.getItem('user_profile_id');
    if (!userId) return;
    try {
      // Idempotent — for real mutual matches createMatch already ran during
      // the swipe; this call covers fake matches (no swipe-time create) and
      // is a no-op when a row already exists.
      await createMatch(userId, matchedUser.id);
    } catch (err) {
      console.error('createMatch failed before chat nav:', err);
    }
    router.push(`/chat/thread?user=${matchedUser.id}`);
  };
  const handleSurveyAction = (action) => {
    switch (action) {
      case 'good':
        alert('▸ thanks for the feedback. keep raving.');
        break;
      case 'poor':
        alert('▸ noted. we will tune in tighter.');
        break;
      default:
        break;
    }
    // Animate the survey card out with a swipe transition (handleSwipe
    // short-circuits on is_survey so no API call is made).
    commitSwipe('right');
  };

  const swipeLabel = useMemo(() => {
    if (swipeOffset > 40) return 'vibe';
    if (swipeOffset < -40) return 'pass';
    return null;
  }, [swipeOffset]);

  // ---------------- drag handlers ----------------
  const handleMouseDown = (e) => {
    if (currentCard?.is_survey) return;
    setIsDragging(true);
    setDragStartX(e.clientX - swipeOffset);
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setSwipeOffset(e.clientX - dragStartX);
  };
  const handleTouchStart = (e) => {
    if (currentCard?.is_survey) return;
    setIsDragging(true);
    setDragStartX(e.touches[0].clientX - swipeOffset);
  };
  const handleTouchMove = (e) => {
    if (!isDragging) return;
    setSwipeOffset(e.touches[0].clientX - dragStartX);
  };
  const releaseDrag = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (swipeOffset > 120) commitSwipe('right');
    else if (swipeOffset < -120) commitSwipe('left');
    else setSwipeOffset(0);
  };
  const commitSwipe = (direction) => {
    setFrozenBottomCard(nextCard);
    setIsAnimating(true);
    setSwipeOffset(direction === 'right' ? 500 : -500);
    setTimeout(() => {
      handleSwipe(direction, currentCard);
      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
        setSwipeOffset(0);
        setIsAnimating(false);
        setFrozenBottomCard(null);
      }, 100);
    }, 300);
  };

  // Keyboard support
  useEffect(() => {
    const onKey = (e) => {
      if (!currentCard || matchOverlay || showChatModal || showFounderModal || showSignupGate) return;
      if (currentCard.is_survey) return;
      if (e.key === 'ArrowLeft') commitSwipe('left');
      else if (e.key === 'ArrowRight') commitSwipe('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCard, matchOverlay, showChatModal, showFounderModal, showSignupGate, nextCard]);

  // ---------------- early returns ----------------
  if (loading) return <RadarLoader eventName={eventName} />;

  if (currentIndex >= matches.length) {
    return (
      <div className="rd-screen">
        <GraffitiWall ambientLaser />
        <TopBar router={router} isAuthenticated={isAuthenticated} />
        <RoomSwitcher
          rooms={rooms}
          currentRoomId={currentRoomId}
          onSelect={handleSelectRoom}
        />
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div className="rd-empty">
            <div className="rd-empty-title">that&apos;s the wall.</div>

            {isAuthenticated ? (
              <div className="rd-empty-sub">
                you&apos;ve tagged everyone in tonight&apos;s room for{' '}
                <span style={{ color: 'var(--rd-spray-yellow)' }}>{eventName}</span>.
                <br />
                check back when the next event drops.
              </div>
            ) : (
              <div className="rd-empty-sub">
                <span style={{ color: 'var(--rd-spray-yellow)' }}>{realCount}</span> real{' '}
                {realCount === 1 ? 'raver' : 'ravers'} in this room. they can&apos;t see you yet.
              </div>
            )}

            {isAuthenticated ? (
              <div className="rd-btn-wrap">
                <button className="rd-btn-neon" onClick={() => router.push('/')}>
                  ↻ FIND A NEW VIBE
                </button>
              </div>
            ) : (
              <>
                <div className="rd-btn-wrap" style={{ marginBottom: '0.7rem' }}>
                  <button className="rd-btn-neon" onClick={() => router.push('/signup')}>
                    TAG IN TO BE SEEN
                  </button>
                </div>
                <button className="rd-btn-ghost" onClick={() => router.push('/')}>
                  ↻ FIND A NEW VIBE
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- main render ----------------
  const showTakeover = !loading && realCount === 0 && !scanAnyway && !!myEventInfo;

  return (
    <div className="rd-screen">
      <GraffitiWall ambientLaser />

      <TopBar router={router} isAuthenticated={isAuthenticated} />

      <RoomSwitcher
        rooms={rooms}
        currentRoomId={currentRoomId}
        onSelect={handleSelectRoom}
      />

      {/* Event banner */}
      {eventName && currentCard && !activationBanner && !showTakeover && (
        <div className="rd-event-banner">
          <span className="rd-arrow">▼</span>
          <span>BOTH AT</span>
          <span className="rd-event-name">{eventName}</span>
          <span className="rd-arrow">▼</span>
        </div>
      )}

      {/* Post-signup activation banner */}
      {activationBanner && (
        <div
          className="rd-banner rd-banner--success"
          style={{
            position: 'fixed',
            top: 'calc(4.5rem + env(safe-area-inset-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            maxWidth: '460px',
            width: 'calc(100% - 2.5rem)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {activationBanner.count > 0
            ? `▸ you're visible. ${activationBanner.count} pending ${activationBanner.count === 1 ? 'vibe' : 'vibes'} activated.`
            : "▸ you're visible. tag back into the radar."}
          <button
            type="button"
            onClick={() => setActivationBanner(null)}
            style={{
              marginLeft: '1rem',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
            aria-label="dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Sparse-room banner: real count 1-3 */}
      {myEventInfo && realCount >= 1 && realCount <= 3 && !showTakeover && !activationBanner && (
        <SparseRoomBanner
          realCount={realCount}
          eventName={myEventInfo.name}
          city={myEventInfo.city}
          date={myEventInfo.date}
        />
      )}

      {/* Empty-room takeover: 0 real co-attendees, user hasn't opted into the fake-padded deck */}
      {showTakeover && (
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6rem 1.5rem 5rem',
          }}
        >
          <div className="rd-empty" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div className="rd-empty-title">this room is empty.</div>
            <div className="rd-empty-sub">
              no real ravers are scanning{' '}
              <span style={{ color: 'var(--rd-spray-yellow)' }}>{myEventInfo.name}</span> yet.
              be the first — drop the link to your crew.
            </div>

            <div style={{ marginTop: '1.6rem' }}>
              <ShareEventLink
                eventName={myEventInfo.name}
                city={myEventInfo.city}
                date={myEventInfo.date}
              />
            </div>

            {!isAuthenticated && (
              <div className="rd-btn-wrap" style={{ marginTop: '0.9rem' }}>
                <button className="rd-btn-ghost" onClick={() => router.push('/signup')}>
                  TAG IN TO BE SEEN
                </button>
              </div>
            )}

            <button
              type="button"
              className="rd-stencil-link"
              onClick={() => router.push('/')}
              style={{ display: 'block', margin: '1rem auto 0.3rem', background: 'none', border: 'none' }}
            >
              ↻ FIND A NEW VIBE
            </button>
            <button
              type="button"
              className="rd-stencil-link"
              onClick={() => setScanAnyway(true)}
              style={{ display: 'block', margin: '0.4rem auto 0', background: 'none', border: 'none', opacity: 0.55, fontSize: '0.7rem' }}
            >
              scan the room anyway →
            </button>
          </div>
        </div>
      )}

      {/* Card stack */}
      {!showTakeover && (
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6rem 1.25rem 5rem',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 'min(92vw, 420px)',
            height: 'min(72vh, 640px)',
          }}
        >
          {/* Bottom card */}
          {bottomCard && (
            <div
              key="bottom-card-container"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 0,
                transform: 'scale(0.95) translateY(20px) rotate(2deg)',
                filter: 'brightness(0.7)',
                pointerEvents: 'none',
              }}
            >
              <UserCard
                user={bottomCard}
                onSurveyAction={handleSurveyAction}
                onReport={(u) => setReportTarget(u)}
                disableAnimation={true}
              />
            </div>
          )}

          {/* Top card */}
          {currentCard && (
            <div
              key={`card-${currentIndex}`}
              className="swipe-card"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
                transform: `translateX(${swipeOffset}px) rotate(${
                  swipeOffset * 0.06 - 1.5
                }deg)`,
                transition: isDragging
                  ? 'none'
                  : 'transform 0.3s ease-out, opacity 0.3s ease-out',
                opacity: Math.abs(swipeOffset) > 200 ? 0 : 1,
                cursor: currentCard.is_survey
                  ? 'default'
                  : isDragging
                  ? 'grabbing'
                  : 'grab',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={releaseDrag}
              onMouseLeave={releaseDrag}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={releaseDrag}
            >
              {swipeLabel === 'vibe' && (
                <div
                  className="rd-swipe-label rd-swipe-label--vibe"
                  style={{ opacity: Math.min(Math.abs(swipeOffset) / 100, 1) }}
                >
                  VIBE ✓
                </div>
              )}
              {swipeLabel === 'pass' && (
                <div
                  className="rd-swipe-label rd-swipe-label--pass"
                  style={{ opacity: Math.min(Math.abs(swipeOffset) / 100, 1) }}
                >
                  PASS
                </div>
              )}

              <UserCard user={currentCard} onSurveyAction={handleSurveyAction} onReport={(u) => setReportTarget(u)} />
            </div>
          )}
        </div>
      </div>
      )}

      {/* Bottom hint */}
      {!showTakeover && (
      <div className="rd-swipe-hint">
        <span className="rd-arrow">←</span>
        <span>SWIPE</span>
        <span className="rd-key">←</span>
        <span className="rd-key">→</span>
        <span>TAP KEYS</span>
        <span className="rd-arrow">→</span>
      </div>
      )}

      {/* Match overlay */}
      {matchOverlay && matchedUser && (
        <div className="rd-match-overlay is-open">
          <div className="rd-match-laser" />
          <div className="rd-match-laser rd-match-laser--b" />
          <div className="rd-match-strobe" />

          <div className="rd-match-card">
            <div className="rd-match-title">matched!</div>
            <div className="rd-match-sub">{matchSlogan}</div>

            <div className="rd-match-pair">
              <div className="rd-match-photo rd-match-photo--a">
                <div className="rd-match-mini-tape" />
                {currentUser?.photos?.[0]?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentUser.photos[0].image_url} alt="you" />
                ) : (
                  <div style={emptyPhotoStyle}>you</div>
                )}
                <div className="rd-match-mini-label">you</div>
              </div>
              <div className="rd-match-heart">♥</div>
              <div className="rd-match-photo rd-match-photo--b">
                <div className="rd-match-mini-tape" />
                {matchedUser?.photos?.[0]?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={matchedUser.photos[0].image_url} alt={matchedUser.name} />
                ) : (
                  <div style={emptyPhotoStyle}>{matchedUser.name?.[0]}</div>
                )}
                <div className="rd-match-mini-label">
                  {String(matchedUser.name).toLowerCase()}
                </div>
              </div>
            </div>

            <div className="rd-btn-wrap" style={{ marginBottom: '0.7rem' }}>
              <button className="rd-btn-neon" onClick={handleStartChat}>
                DROP IN CHAT
              </button>
            </div>
            <button className="rd-btn-ghost" onClick={handleKeepSwiping}>
              KEEP TAGGING
            </button>
          </div>
        </div>
      )}

      <FounderMatchModal
        isOpen={showFounderModal}
        onClose={() => setShowFounderModal(false)}
        matchedUser={matchedUser}
        currentUser={currentUser}
      />
      <ChatNotificationModal
        isOpen={showChatModal}
        onClose={() => {
          setShowChatModal(false);
          setMatchOverlay(false);
        }}
      />
      <SignupGateModal
        isOpen={showSignupGate}
        matchedUser={signupGateUser}
        onKeepTagging={() => {
          setShowSignupGate(false);
          setSignupGateUser(null);
        }}
      />

      {reportTarget && (
        <ReportModal
          currentUserId={currentUser?.id || (typeof window !== 'undefined' ? localStorage.getItem('user_profile_id') : null)}
          reportedUserId={reportTarget.id}
          reportedUserName={reportTarget.name}
          context="card"
          onClose={() => setReportTarget(null)}
          onDone={({ blocked }) => {
            setReportTarget(null);
            if (blocked) {
              setBlockedSetVersion((v) => v + 1);
            }
          }}
        />
      )}
    </div>
  );
}

// ---------------- TopBar ----------------
function TopBar({ router, isAuthenticated }) {
  return (
    <div
      style={{
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
      }}
    >
      <button
        className="rd-nav-chip"
        onClick={() => router.push('/')}
        style={{ pointerEvents: 'auto' }}
      >
        ◄ BACK
      </button>
      <div
        style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', pointerEvents: 'auto' }}
      >
        <div className="rd-bpm-tag">
          <span className="rd-bpm-dot" />
          128 BPM
        </div>
        {isAuthenticated ? (
          <>
            <button
              className="rd-nav-chip"
              onClick={() => router.push('/chat')}
              aria-label="messages"
            >
              MSGS ✦
            </button>
            <button
              className="rd-nav-chip"
              onClick={() => router.push('/user-panel')}
              aria-label="profile"
            >
              PROFILE ⬡
            </button>
          </>
        ) : (
          <GhostChip />
        )}
      </div>
    </div>
  );
}

const emptyPhotoStyle = {
  width: '100%',
  height: '90px',
  background: '#2a2a2a',
  color: '#fff',
  fontFamily: 'var(--font-graffiti), cursive',
  fontSize: '1.6rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
