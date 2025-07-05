# Ravedar Signup Feature Setup

This document outlines the setup required for the new signup feature in Ravedar.

## Features Implemented

### 1. Multi-Step Signup Form
- **Step 1**: Email/password account creation
- **Step 2**: Basic profile information (name, Instagram, about me)
- **Step 3**: Vibe tag selection (up to 5 music preferences)
- **Step 4**: Photo upload (up to 6 photos, 5MB each)

### 2. Social Login Options
- Google OAuth
- Facebook OAuth  
- Apple OAuth

### 3. Photo Upload System
- Supabase Storage integration
- Automatic file validation
- Public URL generation
- User-specific storage policies

## Environment Variables Required

Add these to your `.env` file:

```bash
# Google OAuth
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your_google_client_id
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=your_google_client_secret

# Facebook OAuth
SUPABASE_AUTH_EXTERNAL_FACEBOOK_CLIENT_ID=your_facebook_client_id
SUPABASE_AUTH_EXTERNAL_FACEBOOK_SECRET=your_facebook_client_secret

# Apple OAuth
SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID=your_apple_client_id
SUPABASE_AUTH_EXTERNAL_APPLE_SECRET=your_apple_client_secret
```

## OAuth Provider Setup

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `https://your-project.supabase.co/auth/v1/callback`
   - `http://localhost:54321/auth/v1/callback` (for local development)

### Facebook OAuth
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add Facebook Login product
4. Configure OAuth settings
5. Add redirect URIs as above

### Apple OAuth
1. Go to [Apple Developer](https://developer.apple.com/)
2. Create App ID with Sign In with Apple capability
3. Create Service ID
4. Configure redirect URIs

## Database Migrations

The following migration has been created:
- `20250608000000_user_photos_storage.sql` - Sets up storage bucket and policies

## Routes Added

- `/signup` - Main signup form
- `/oauth/callback` - OAuth callback handler

## Integration Points

### Existing Demo System
The signup system integrates with the existing demo system:
- New authenticated users replace demo user IDs in localStorage
- Seamless transition from demo to authenticated experience
- Maintains existing user flow and data

### Authentication Context
- New `AuthContext` provides user state management
- Automatic session handling
- Sign out functionality

## Usage Flow

1. **Demo Users**: Can continue using the app as before
2. **Signup Trigger**: Users can sign up via:
   - Direct navigation to `/signup`
   - CTA buttons in the matching interface
   - Social login buttons
3. **Post-Signup**: Users are automatically redirected to `/matches`
4. **Profile Creation**: Automatic profile setup with uploaded photos

## Security Features

- Row Level Security (RLS) on storage
- User-specific photo access policies
- Password validation and confirmation
- File type and size validation
- Secure OAuth flow with proper redirect handling

## Testing

To test the signup feature:

1. **Local Development**:
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:3000/signup`

2. **OAuth Testing**:
   - Use test accounts for each provider
   - Verify callback handling
   - Check profile creation

3. **Photo Upload Testing**:
   - Test various file types (JPG, PNG, WebP)
   - Test file size limits
   - Verify storage policies

## Troubleshooting

### Common Issues

1. **OAuth Redirect Errors**:
   - Verify redirect URIs in provider settings
   - Check Supabase config.toml redirect URLs

2. **Storage Upload Failures**:
   - Ensure storage bucket exists
   - Check RLS policies
   - Verify file size limits

3. **Profile Creation Errors**:
   - Check database permissions
   - Verify user_profiles table structure

### Debug Steps

1. Check browser console for errors
2. Verify environment variables are set
3. Test Supabase connection
4. Check network requests in dev tools

## Future Enhancements

- Email verification flow
- Profile completion reminders
- Advanced photo editing
- Social media integration
- Two-factor authentication 