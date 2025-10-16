import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID');
    const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET');
    const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/spotify-auth/callback`;

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      throw new Error('Spotify credentials not configured');
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Handle OAuth callback
    if (action === 'callback') {
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('Authorization code missing', { 
          status: 400,
          headers: corsHeaders 
        });
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Token exchange failed:', error);
        return new Response(`Token exchange failed: ${error}`, { 
          status: 500,
          headers: corsHeaders 
        });
      }

      const tokens = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Delete old tokens and insert new one
      await supabaseClient.from('spotify_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      const { error: insertError } = await supabaseClient
        .from('spotify_tokens')
        .insert({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('Failed to store tokens:', insertError);
        throw insertError;
      }

      // Redirect back to the app
      const appUrl = url.origin.replace('supabase.co', 'lovableproject.com');
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': `${appUrl}?spotify_connected=true`,
        },
      });
    }

    // Handle authorization redirect
    if (action === 'login') {
      const authUrl = new URL('https://accounts.spotify.com/authorize');
      authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('scope', 'user-read-currently-playing user-read-playback-state');

      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': authUrl.toString(),
        },
      });
    }

    // Get current playback (default action)
    // First, get the stored token
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('spotify_tokens')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ 
        error: 'Not connected',
        connected: false 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if token is expired and refresh if needed
    let accessToken = tokenData.access_token;
    const expiresAt = new Date(tokenData.expires_at);
    
    if (expiresAt < new Date()) {
      // Refresh the token
      const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenData.refresh_token,
        }),
      });

      if (!refreshResponse.ok) {
        return new Response(JSON.stringify({ 
          error: 'Token refresh failed',
          connected: false 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newTokens = await refreshResponse.json();
      accessToken = newTokens.access_token;
      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

      // Update stored token
      await supabaseClient
        .from('spotify_tokens')
        .update({
          access_token: accessToken,
          refresh_token: newTokens.refresh_token || tokenData.refresh_token,
          expires_at: newExpiresAt.toISOString(),
        })
        .eq('id', tokenData.id);
    }

    // Fetch current playback
    const playbackResponse = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (playbackResponse.status === 204 || playbackResponse.status === 404) {
      // Nothing playing
      return new Response(JSON.stringify({
        connected: true,
        playing: false,
        title: '',
        artist: '',
        image: '',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!playbackResponse.ok) {
      const error = await playbackResponse.text();
      console.error('Playback fetch failed:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch playback',
        connected: true,
        playing: false 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const playback = await playbackResponse.json();
    
    return new Response(JSON.stringify({
      connected: true,
      playing: playback.is_playing,
      title: playback.item?.name || '',
      artist: playback.item?.artists?.map((a: any) => a.name).join(', ') || '',
      image: playback.item?.album?.images?.[0]?.url || '',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in spotify-auth function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      connected: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
