import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { supabase } from '../db';

// Google OAuth Strategy
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
}, async (accessToken, refreshToken, profile, done) => {
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
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: new Date(Date.now() + 3600 * 1000),
          name,
          picture,
          updated_at: new Date()
        })
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateError) {
        return done(updateError, undefined);
      }
      user = updatedUser;
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          google_id: googleId,
          email,
          name,
          picture,
          access_token: accessToken,
          refresh_token: refreshToken,
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
