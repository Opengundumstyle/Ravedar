'use client';

import React from 'react';

// Horizontal chip row letting a user switch between the event rooms they've
// scanned. Presentational only — the parent owns active-room state and refetch.
// Renders nothing when the user has fewer than 2 rooms.
//
// Each room may carry an `is_live` flag (from getActiveRooms). Pending rooms
// (is_live === false) render a small lock glyph after the name.
export default function RoomSwitcher({ rooms, currentRoomId, onSelect }) {
  if (!rooms || rooms.length < 2) return null;

  return (
    <div className="rd-room-switcher" role="tablist" aria-label="your event rooms">
      {rooms.map((room) => {
        const active = room.id === currentRoomId;
        const locked = room.is_live === false;
        return (
          <button
            key={room.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(room.id)}
            className={'rd-room-chip' + (active ? ' rd-room-chip--active' : '')}
            title={locked ? 'this room is not open yet' : undefined}
          >
            {String(room.name).toLowerCase()}
            {locked && (
              <span className="rd-room-chip__lock" aria-hidden="true">🔒</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
