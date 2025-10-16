import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, code, state } = await req.json();

    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      throw new Error('Spotify credentials not configured');
    }

    // Get the base URL from the request
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/');
    const redirectUri = origin ? `${origin}/spotify-callback` : `${url.protocol}//${url.host}/spotify-callback`;

    console.log('Redirect URI:', redirectUri);

    if (action === 'authorize') {
      // Generate authorization URL
      const scopes = 'user-read-currently-playing user-read-playback-state';
      const authUrl = `https://accounts.spotify.com/authorize?` +
        `response_type=code&` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `state=${encodeURIComponent(state || 'spotify-auth')}`;

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'callback' && code) {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Spotify token error:', error);
        throw new Error(`Failed to get tokens: ${error}`);
      }

      const tokens = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Delete old tokens and insert new ones
      await supabase.from('spotify_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      const { error: insertError } = await supabase.from('spotify_tokens').insert({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
      });

      if (insertError) {
        console.error('DB insert error:', insertError);
        throw insertError;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'now-playing') {
      // Get current token
      const { data: tokenData, error: tokenError } = await supabase
        .from('spotify_tokens')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tokenError || !tokenData) {
        return new Response(JSON.stringify({ 
          connected: false,
          message: 'Not connected to Spotify' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let accessToken = tokenData.access_token;
      const expiresAt = new Date(tokenData.expires_at);

      // Refresh token if expired
      if (expiresAt < new Date()) {
        console.log('Token expired, refreshing...');
        const refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokenData.refresh_token,
          }).toString(),
        });

        if (!refreshResponse.ok) {
          const error = await refreshResponse.text();
          console.error('Token refresh error:', error);
          return new Response(JSON.stringify({ 
            connected: false,
            message: 'Token refresh failed. Please reconnect.' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const newTokens = await refreshResponse.json();
        const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
        accessToken = newTokens.access_token;

        await supabase
          .from('spotify_tokens')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || tokenData.refresh_token,
            expires_at: newExpiresAt.toISOString(),
          })
          .eq('id', tokenData.id);
      }

      // Get current playback
      const playbackResponse = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (playbackResponse.status === 204 || playbackResponse.status === 404) {
        return new Response(JSON.stringify({
          connected: true,
          playing: false,
          message: 'Nothing currently playing'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!playbackResponse.ok) {
        const error = await playbackResponse.text();
        console.error('Playback error:', error);
        throw new Error(`Failed to get playback: ${error}`);
      }

      const playback = await playbackResponse.json();

      return new Response(JSON.stringify({
        connected: true,
        playing: playback.is_playing,
        title: playback.item?.name || 'Unknown',
        artist: playback.item?.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
        image: playback.item?.album?.images?.[0]?.url || '',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('Spotify auth error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
