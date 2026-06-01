# Next.js Migration for RaveMatch App

This document outlines the migration from Create React App (CRA) to Next.js for the RaveMatch application, providing a more scalable architecture with proper backend API endpoints.

## 🏗️ Architecture Overview

### Directory Structure
```
rave-match-app/
├── app/                    # Next.js 13+ App Router
│   ├── layout.js          # Root layout with metadata
│   ├── page.js            # Home page (EventForm)
│   └── globals.css        # Global styles
├── lib/                   # Shared utilities and API functions
│   ├── supabaseClient.js  # Shared Supabase client
│   └── api/               # Modular API functions
│       ├── matches.js     # Match-related operations
│       ├── chat.js        # Chat-related operations
│       └── profiles.js    # Profile-related operations
├── pages/                 # API routes (Pages Router)
│   └── api/               # Backend API endpoints
│       ├── chat/          # Chat API endpoints
│       │   ├── send.js    # POST /api/chat/send
│       │   └── conversation.js # GET /api/chat/conversation
│       └── match/         # Match API endpoints
│           ├── create.js  # POST /api/match/create
│           └── get.js     # GET /api/match/get
└── src/                   # Legacy CRA components (to be migrated)
```

## 🔧 Key Changes

### 1. Package.json Updates
- Replaced Vite with Next.js
- Updated scripts for Next.js development
- Removed React Router (using Next.js routing)
- Added Next.js specific dependencies

### 2. Shared Supabase Client
The `lib/supabaseClient.js` provides:
- Client-side Supabase instance for frontend
- Server-side Supabase instance for API routes
- Proper environment variable handling for Next.js

### 3. Modular API Functions
All business logic is now modularized in `lib/api/`:
- **matches.js**: Match creation, retrieval, mutual match checking
- **chat.js**: Message sending, conversation retrieval, read status
- **profiles.js**: Profile management, photo uploads, user sessions

## 🚀 API Endpoints

### Chat Endpoints

#### POST /api/chat/send
Send a message between users.

**Request Body:**
```json
{
  "fromUserId": "user-id",
  "toUserId": "recipient-id", 
  "message": "Hello!",
  "messageType": "text" // optional, defaults to "text"
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "id": "msg-id",
    "from_user_id": "user-id",
    "to_user_id": "recipient-id",
    "message": "Hello!",
    "message_type": "text",
    "sent_at": "2024-01-01T00:00:00Z"
  }
}
```

#### GET /api/chat/conversation
Get conversation between two users.

**Query Parameters:**
- `userId1`: First user ID
- `userId2`: Second user ID
- `limit`: Number of messages (default: 50, max: 100)
- `markAsRead`: Mark messages as read (default: false)

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg-id",
      "from_user_id": "user-id",
      "to_user_id": "recipient-id",
      "message": "Hello!",
      "message_type": "text",
      "sent_at": "2024-01-01T00:00:00Z",
      "read_at": null,
      "sender": {
        "id": "user-id",
        "name": "User Name",
        "photo": "photo-url"
      }
    }
  ],
  "count": 1
}
```

### Match Endpoints

#### POST /api/match/create
Create a like/match between users.

**Request Body:**
```json
{
  "fromUserId": "user-id",
  "toUserId": "target-user-id",
  "liked": true
}
```

**Response:**
```json
{
  "success": true,
  "like": {
    "id": "like-id",
    "from_user_id": "user-id",
    "to_user_id": "target-user-id",
    "liked": true,
    "created_at": "2024-01-01T00:00:00Z"
  },
  "isMutualMatch": false
}
```

#### GET /api/match/get
Get matches for a user based on event preferences.

**Query Parameters:**
- `userId`: User ID
- `eventName`: Event name
- `city`: City name
- `date`: Event date (optional)

**Response:**
```json
{
  "success": true,
  "matches": [
    {
      "id": "user-id",
      "name": "User Name",
      "instagram": "@username",
      "about_me": "About me...",
      "vibe_tags": ["House", "Techno"],
      "is_real": true,
      "role": null,
      "photos": [
        {
          "image_url": "photo-url",
          "position": 0
        }
      ]
    }
  ],
  "count": 1
}
```

## 📱 Mobile App Integration

The modular API structure makes it easy to integrate with mobile apps:

1. **Shared API Functions**: All business logic is in `lib/api/` and can be reused
2. **RESTful Endpoints**: Standard HTTP endpoints for mobile consumption
3. **Consistent Data Models**: Same data structures across web and mobile
4. **Authentication Ready**: Supabase auth can be used for mobile apps

## 🔄 Migration Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Development
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
npm start
```

## 🎯 Benefits of This Architecture

1. **Separation of Concerns**: Frontend and backend logic are clearly separated
2. **Reusability**: API functions can be used in both frontend and API routes
3. **Scalability**: Easy to add new endpoints and features
4. **Mobile Ready**: API endpoints are ready for mobile app integration
5. **Type Safety**: Can easily add TypeScript for better development experience
6. **Performance**: Next.js provides better performance and SEO capabilities

## 🔮 Next Steps

1. **Migrate Components**: Move remaining components from `src/` to `app/`
2. **Add TypeScript**: Convert to TypeScript for better type safety
3. **Add Authentication**: Implement proper auth middleware for API routes
4. **Add Real-time Features**: Implement WebSocket connections for real-time chat
5. **Mobile App**: Use the API endpoints to build React Native or Flutter apps

## 🛠️ Development Tips

### Using API Functions in Components
```javascript
import { createUserEvent } from '../lib/api/matches';

// In your component
const handleSubmit = async () => {
  try {
    const event = await createUserEvent(userId, eventName, city, date);
    // Handle success
  } catch (error) {
    // Handle error
  }
};
```

### Using API Endpoints
```javascript
// Send a message
const response = await fetch('/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fromUserId: 'user-id',
    toUserId: 'recipient-id',
    message: 'Hello!'
  })
});

// Get matches
const response = await fetch('/api/match/get?userId=user-id&eventName=EDC&city=Las Vegas');
```

This migration provides a solid foundation for scaling the RaveMatch application while maintaining clean, modular code that can be easily extended and maintained. 