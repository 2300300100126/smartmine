import { User, Mail, Shield, CreditCard, LogOut, Calendar, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ActivityLog {
  id: string;
  activity_type: string;
  status: string;
  created_at: string;
  user_agent: string;
}

export default function Profile() {
  const { user, profile, signOut } = useAuth();
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    if (user) {
      loadActivityLogs();
    }
  }, [user]);

  const loadActivityLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('user_activity_log')
        .select('id, activity_type, status, created_at, user_agent')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setActivityLogs(data || []);
    } catch (error) {
      console.error('Error loading activity logs:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center py-8">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <User className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Not Signed In
          </h2>
          <p className="text-gray-600 mb-6">
            Please sign in to view your profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-8 py-12">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center">
                <User className="w-12 h-12 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  {profile.full_name}
                </h1>
                <div className="flex items-center gap-3">
                  <span className="px-4 py-1.5 bg-amber-500 text-white rounded-full text-sm font-semibold">
                    {profile.role}
                  </span>
                  {profile.role === 'miner' && profile.rfid && (
                    <span className="px-4 py-1.5 bg-slate-600 text-white rounded-full text-sm font-semibold">
                      RFID: {profile.rfid}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Account Information</h2>

            <div className="grid gap-6 mb-8">
              <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                <Mail className="w-6 h-6 text-slate-600 mt-1" />
                <div>
                  <p className="text-sm font-semibold text-gray-600">Email Address</p>
                  <p className="text-lg text-slate-900">{profile.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                <Shield className="w-6 h-6 text-slate-600 mt-1" />
                <div>
                  <p className="text-sm font-semibold text-gray-600">Role</p>
                  <p className="text-lg text-slate-900 capitalize">{profile.role}</p>
                </div>
              </div>

              {profile.role === 'miner' && profile.rfid && (
                <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                  <CreditCard className="w-6 h-6 text-slate-600 mt-1" />
                  <div>
                    <p className="text-sm font-semibold text-gray-600">RFID Tag</p>
                    <p className="text-lg text-slate-900">{profile.rfid}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                <Calendar className="w-6 h-6 text-slate-600 mt-1" />
                <div>
                  <p className="text-sm font-semibold text-gray-600">Member Since</p>
                  <p className="text-lg text-slate-900">
                    {new Date(profile.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Activity className="w-6 h-6" />
                Recent Activity
              </h2>

              {loadingLogs ? (
                <p className="text-gray-600">Loading activity...</p>
              ) : activityLogs.length > 0 ? (
                <div className="space-y-3">
                  {activityLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 capitalize">
                          {log.activity_type}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          log.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600">No recent activity</p>
              )}
            </div>

            <div className="pt-6 border-t border-gray-200">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-6 rounded-lg transition-colors shadow-lg"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
