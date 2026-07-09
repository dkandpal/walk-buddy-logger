import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const SpotifyCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        toast.error('Failed to connect to Spotify');
        navigate('/');
        return;
      }

      if (!code) {
        navigate('/');
        return;
      }

      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spotify-auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            action: 'callback',
            code,
            state: params.get('state')
          }),
        });

        const data = await res.json();

        if (data.success) {
          toast.success('Spotify connected successfully!');
        } else {
          toast.error('Failed to complete Spotify connection');
        }
      } catch (error) {
        console.error('Callback error:', error);
        toast.error('Failed to complete Spotify connection');
      }

      navigate('/');
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
        <p className="text-lg text-muted-foreground">Connecting to Spotify...</p>
      </div>
    </div>
  );
};

export default SpotifyCallback;
