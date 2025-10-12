import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, role: 'admin' | 'miner', rfid?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const logActivity = async (
    email: string,
    activityType: 'signup' | 'login' | 'logout',
    status: 'success' | 'failed',
    userId?: string
  ) => {
    try {
      await supabase.from('user_activity_log').insert({
        user_id: userId || null,
        email,
        activity_type: activityType,
        status,
        ip_address: null,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      let { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser?.user) {
          const metadata = authUser.user.user_metadata;
          const { error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              id: userId,
              email: authUser.user.email || '',
              full_name: metadata?.full_name || 'User',
              role: metadata?.role || 'admin',
              rfid: metadata?.rfid || null,
            });

          if (insertError) {
            console.error('Error creating profile:', insertError);
          } else {
            const { data: newProfile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle();
            data = newProfile;
          }
        }
      }

      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        await logActivity(email, 'login', 'failed');
        return { error };
      }

      if (data.user) {
        await logActivity(email, 'login', 'success', data.user.id);
      }

      return { error: null };
    } catch (error) {
      await logActivity(email, 'login', 'failed');
      return { error: error as Error };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: 'admin' | 'miner',
    rfid?: string
  ) => {
    try {
      const metadata: Record<string, string> = {
        full_name: fullName,
        role,
      };

      if (role === 'miner' && rfid) {
        metadata.rfid = rfid;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (error) {
        await logActivity(email, 'signup', 'failed');
        return { error };
      }

      if (data.user) {
        await logActivity(email, 'signup', 'success', data.user.id);
      }

      return { error: null };
    } catch (error) {
      await logActivity(email, 'signup', 'failed');
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    if (user?.email) {
      await logActivity(user.email, 'logout', 'success', user.id);
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  const value = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
