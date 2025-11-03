import passport from 'passport';
import { Strategy as GoogleStrategy, VerifyCallback } from 'passport-google-oauth20';
import { Profile } from 'passport-google-oauth20';
import { supabase } from '../db';

// Google OAuth Strategy
// Note: access_type='offline' and prompt='consent' are added in the auth route
// to ensure refresh tokens are requested
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: process.env.GOOGLE_REDIRECT_URI!,
  scope: [
    'profile',
    'email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
  ]
}, async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
  try {
    const googleId = profile.id;
    const email = profile.emails?.[0]?.value;
    const name = profile.displayName;
    const picture = profile.photos?.[0]?.value;

    if (!email) {
      return done(new Error('No email found in Google profile'), undefined);
    }

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('google_id', googleId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return done(fetchError, undefined);
    }

    let user;

    if (existingUser) {
      // Update existing user with new tokens
      // IMPORTANT: Only update refresh_token if Google provides a new one
      // Google only sends refresh_token on first auth or when user re-consents
      // If refreshToken is undefined, preserve the existing refresh_token in DB
      const updateData: any = {
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + 3600 * 1000),
        name,
        picture,
        updated_at: new Date()
      };
      
      // Only update refresh_token if Google provided one
      // This preserves existing refresh_token if Google doesn't send a new one
      if (refreshToken) {
        updateData.refresh_token = refreshToken;
        console.log('✅ [OAuth] Google provided new refresh_token, updating database');
      } else {
        console.log('⚠️ [OAuth] Google did not provide refresh_token, preserving existing one in database');
      }
      
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateError) {
        return done(updateError, undefined);
      }
      user = updatedUser;
    } else {
      // Create new user
      // For new users, refresh_token should always be provided by Google
      if (!refreshToken) {
        console.warn('⚠️ [OAuth] No refresh_token provided for new user. Google should provide one with accessType: "offline"');
      }
      
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          google_id: googleId,
          email,
          name,
          picture,
          access_token: accessToken,
          refresh_token: refreshToken || null, // Store null if not provided (shouldn't happen for new users)
          token_expires_at: new Date(Date.now() + 3600 * 1000)
        })
        .select()
        .single();

      if (createError) {
        return done(createError, undefined);
      }
      user = newUser;
    }

    return done(null, user);
  } catch (error) {
    return done(error, undefined);
  }
}));

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, google_id, email, name, picture')
      .eq('id', id)
      .single();

    if (error) {
      return done(error, null);
    }

    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
