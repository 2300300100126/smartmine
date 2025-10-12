import { Heart, Wind, MapPin, ThermometerSun, Droplets, AlertTriangle, Loader2, Bell, TrendingUp, Calendar } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, SensorReading } from '../lib/supabase';

interface CriticalAlert {
  minerId: string;
  startTime: number;
  lastAlertTime: number;
  hasAlerted: boolean;
  lastHeartRate: number;
  lastAirToxicity: number;
  readingsChanged: boolean;
}

interface MonthlyStats {
  minerId: string;
  rfid: string;
  month: string;
  avgHeartRate: number;
  avgAirToxicity: number;
  avgTemperature: number;
  avgHumidity: number;
  totalReadings: number;
  criticalAlerts: number;
  warningAlerts: number;
  hoursWorked: number;
}

interface DailyStats {
  date: string;
  avgHeartRate: number;
  avgAirToxicity: number;
  avgTemperature: number;
  avgHumidity: number;
  criticalAlerts: number;
  totalReadings: number;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [sensorData, setSensorData] = useState<SensorReading[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [selectedMiner, setSelectedMiner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const criticalAlertsRef = useRef<Map<string, CriticalAlert>>(new Map());
  const [activeAlerts, setActiveAlerts] = useState<string[]>([]);
  const [criticalMinerModal, setCriticalMinerModal] = useState<SensorReading | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [showMonthlyStats, setShowMonthlyStats] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [loadingStats, setLoadingStats] = useState(false);
  const [dailyStatsMap, setDailyStatsMap] = useState<Map<string, DailyStats[]>>(new Map());

  useEffect(() => {
    if (!user) {
      setError('Please sign in to view the dashboard');
      setLoading(false);
      return;
    }

    loadSensorData();
    loadMonthlyStats();

    const interval = setInterval(() => {
      loadSensorData();
    }, 5000);

    return () => clearInterval(interval);
  }, [user, profile]);

  const loadMonthlyStats = async () => {
    setLoadingStats(true);
    try {
      let query = supabase
        .from('sensor_readings')
        .select('*')
        .order('created_at', { ascending: false });

      if (profile?.role === 'miner' && profile.rfid) {
        query = query.eq('rfid', profile.rfid);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        const stats = calculateMonthlyStats(data);
        setMonthlyStats(stats);

        const dailyStats = calculateDailyStats(data);
        setDailyStatsMap(dailyStats);

        if (stats.length > 0 && !selectedMonth) {
          setSelectedMonth(stats[0].month);
        }
      }
    } catch (err) {
      console.error('Error loading monthly stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const calculateMonthlyStats = (data: SensorReading[]): MonthlyStats[] => {
    const statsByMinerAndMonth = new Map<string, {
      minerId: string;
      rfid: string;
      month: string;
      readings: SensorReading[];
    }>();

    data.forEach((reading) => {
      const date = new Date(reading.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const key = `${reading.miner_id}-${monthKey}`;

      if (!statsByMinerAndMonth.has(key)) {
        statsByMinerAndMonth.set(key, {
          minerId: reading.miner_id,
          rfid: reading.rfid || '',
          month: monthKey,
          readings: [],
        });
      }

      statsByMinerAndMonth.get(key)!.readings.push(reading);
    });

    const stats: MonthlyStats[] = [];

    statsByMinerAndMonth.forEach((value) => {
      const { minerId, rfid, month, readings } = value;

      const avgHeartRate = readings.reduce((sum, r) => sum + r.heart_rate, 0) / readings.length;
      const avgAirToxicity = readings.reduce((sum, r) => sum + r.air_toxicity, 0) / readings.length;
      const avgTemperature = readings.reduce((sum, r) => sum + r.temperature, 0) / readings.length;
      const avgHumidity = readings.reduce((sum, r) => sum + r.humidity, 0) / readings.length;

      const criticalAlerts = readings.filter(r => r.heart_rate > 100 || r.air_toxicity > 20).length;
      const warningAlerts = readings.filter(r =>
        (r.heart_rate > 90 && r.heart_rate <= 100) ||
        (r.air_toxicity > 15 && r.air_toxicity <= 20)
      ).length;

      const sortedReadings = [...readings].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const firstReading = new Date(sortedReadings[0].created_at).getTime();
      const lastReading = new Date(sortedReadings[sortedReadings.length - 1].created_at).getTime();
      const hoursWorked = (lastReading - firstReading) / (1000 * 60 * 60);

      stats.push({
        minerId,
        rfid,
        month,
        avgHeartRate,
        avgAirToxicity,
        avgTemperature,
        avgHumidity,
        totalReadings: readings.length,
        criticalAlerts,
        warningAlerts,
        hoursWorked,
      });
    });

    return stats.sort((a, b) => b.month.localeCompare(a.month));
  };

  const calculateDailyStats = (data: SensorReading[]): Map<string, DailyStats[]> => {
    const statsByMinerAndDay = new Map<string, Map<string, SensorReading[]>>();

    data.forEach((reading) => {
      const date = new Date(reading.created_at);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const minerId = reading.miner_id;

      if (!statsByMinerAndDay.has(minerId)) {
        statsByMinerAndDay.set(minerId, new Map());
      }

      const minerDays = statsByMinerAndDay.get(minerId)!;
      if (!minerDays.has(dateKey)) {
        minerDays.set(dateKey, []);
      }

      minerDays.get(dateKey)!.push(reading);
    });

    const dailyStatsMap = new Map<string, DailyStats[]>();

    statsByMinerAndDay.forEach((days, minerId) => {
      const dailyStats: DailyStats[] = [];

      days.forEach((readings, dateKey) => {
        const avgHeartRate = readings.reduce((sum, r) => sum + r.heart_rate, 0) / readings.length;
        const avgAirToxicity = readings.reduce((sum, r) => sum + r.air_toxicity, 0) / readings.length;
        const avgTemperature = readings.reduce((sum, r) => sum + r.temperature, 0) / readings.length;
        const avgHumidity = readings.reduce((sum, r) => sum + r.humidity, 0) / readings.length;
        const criticalAlerts = readings.filter(r => r.heart_rate > 100 || r.air_toxicity > 20).length;

        dailyStats.push({
          date: dateKey,
          avgHeartRate,
          avgAirToxicity,
          avgTemperature,
          avgHumidity,
          criticalAlerts,
          totalReadings: readings.length,
        });
      });

      dailyStats.sort((a, b) => a.date.localeCompare(b.date));
      dailyStatsMap.set(minerId, dailyStats);
    });

    return dailyStatsMap;
  };

  const getDataRangeInfo = (dailyStats: DailyStats[]) => {
    if (!dailyStats || dailyStats.length === 0) return '';

    const firstDate = new Date(dailyStats[0].date);
    const lastDate = new Date(dailyStats[dailyStats.length - 1].date);
    const daysDiff = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return `${dailyStats.length} day${dailyStats.length > 1 ? 's' : ''} of data (${daysDiff} day span)`;
  };

  const getMonthName = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const checkCriticalCondition = (heartRate: number, airToxicity: number): boolean => {
    return heartRate > 100 || airToxicity > 20;
  };

  const showMedicalAlertModal = (reading: SensorReading) => {
    setCriticalMinerModal(reading);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('CRITICAL MEDICAL ALERT', {
        body: `URGENT: Miner ${reading.miner_id} requires IMMEDIATE MEDICAL ATTENTION!`,
        icon: '/alert-icon.png',
        requireInteraction: true,
        tag: `critical-${reading.miner_id}`,
      });
    }
  };

  const monitorCriticalAlerts = (data: SensorReading[]) => {
    const currentTime = Date.now();
    const criticalAlerts = criticalAlertsRef.current;
    const newActiveAlerts: string[] = [];

    data.forEach((reading) => {
      const isCritical = checkCriticalCondition(reading.heart_rate, reading.air_toxicity);
      const minerId = reading.miner_id;

      if (isCritical) {
        if (!criticalAlerts.has(minerId)) {
          criticalAlerts.set(minerId, {
            minerId,
            startTime: currentTime,
            lastAlertTime: currentTime,
            hasAlerted: false,
            lastHeartRate: reading.heart_rate,
            lastAirToxicity: reading.air_toxicity,
            readingsChanged: false,
          });
        } else {
          const alert = criticalAlerts.get(minerId)!;
          const duration = currentTime - alert.startTime;

          const heartRateChanged = Math.abs(alert.lastHeartRate - reading.heart_rate) > 2;
          const airToxicityChanged = Math.abs(alert.lastAirToxicity - reading.air_toxicity) > 1;

          if (heartRateChanged || airToxicityChanged) {
            alert.readingsChanged = true;
            alert.startTime = currentTime;
            alert.hasAlerted = false;
          }

          alert.lastHeartRate = reading.heart_rate;
          alert.lastAirToxicity = reading.air_toxicity;

          if (duration >= 30000 && !alert.hasAlerted && !alert.readingsChanged) {
            showMedicalAlertModal(reading);
            alert.hasAlerted = true;
            alert.lastAlertTime = currentTime;
          }
        }
        newActiveAlerts.push(minerId);
      } else {
        if (criticalAlerts.has(minerId)) {
          criticalAlerts.delete(minerId);
        }
      }
    });

    setActiveAlerts(newActiveAlerts);
  };

  const loadSensorData = async () => {
    try {
      let query = supabase
        .from('sensor_readings')
        .select('*')
        .order('created_at', { ascending: false });

      if (profile?.role === 'miner' && profile.rfid) {
        query = query.eq('rfid', profile.rfid);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        setSensorData(data);
        monitorCriticalAlerts(data);
      } else {
        generateMockData();
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading sensor data:', err);
      generateMockData();
      setLoading(false);
    }
  };

  const generateMockData = () => {
    const mockRfids = ['RFID-001', 'RFID-002', 'RFID-003', 'RFID-004', 'RFID-005', 'RFID-006'];
    const zones = ['Zone A', 'Zone B', 'Zone C'];

    const mockData: SensorReading[] = [];

    for (let i = 0; i < 6; i++) {
      const rfid = mockRfids[i];

      if (profile?.role === 'miner' && profile.rfid && profile.rfid !== rfid) {
        continue;
      }

      mockData.push({
        id: `mock-${i + 1}`,
        miner_id: `M-${String(i + 1).padStart(3, '0')}`,
        rfid: rfid,
        heart_rate: Math.floor(Math.random() * 40) + 70,
        air_toxicity: Math.random() * 25,
        zone: zones[i % 3],
        gps_latitude: 40.7128 + (Math.random() * 0.01),
        gps_longitude: -74.0060 - (Math.random() * 0.01),
        temperature: 25 + Math.random() * 10,
        humidity: 55 + Math.random() * 25,
        created_at: new Date().toISOString(),
      });
    }

    setSensorData(mockData);
    monitorCriticalAlerts(mockData);
  };

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center py-8">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Authentication Required
          </h2>
          <p className="text-gray-600 mb-6">
            Please sign in to access the dashboard and view sensor data.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading sensor data...</p>
        </div>
      </div>
    );
  }

  const zones = ['all', ...Array.from(new Set(sensorData.map((d) => d.zone)))];
  const filteredData = selectedZone === 'all'
    ? sensorData
    : sensorData.filter((d) => d.zone === selectedZone);

  const getStatusColor = (heartRate: number, airToxicity: number) => {
    if (heartRate > 100 || airToxicity > 20) return 'bg-red-100 border-red-300';
    if (heartRate > 90 || airToxicity > 15) return 'bg-yellow-100 border-yellow-300';
    return 'bg-green-100 border-green-300';
  };

  const getAlertLevel = (heartRate: number, airToxicity: number) => {
    if (heartRate > 100 || airToxicity > 20) return { level: 'Critical', color: 'text-red-600' };
    if (heartRate > 90 || airToxicity > 15) return { level: 'Warning', color: 'text-yellow-600' };
    return { level: 'Normal', color: 'text-green-600' };
  };

  const avgHeartRate = filteredData.length > 0
    ? (filteredData.reduce((sum, d) => sum + d.heart_rate, 0) / filteredData.length).toFixed(1)
    : '0';
  const avgAirToxicity = filteredData.length > 0
    ? (filteredData.reduce((sum, d) => sum + d.air_toxicity, 0) / filteredData.length).toFixed(1)
    : '0';
  const criticalAlerts = filteredData.filter((d) => d.heart_rate > 100 || d.air_toxicity > 20).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">
                Mining Operations Dashboard
              </h1>
              <p className="text-gray-600">
                Real-time monitoring of miner health and environmental conditions
              </p>
            </div>
            {profile && (
              <div className="text-right">
                <p className="text-sm text-gray-600">Viewing as</p>
                <p className="text-lg font-semibold text-slate-900">{profile.full_name}</p>
                <span className="inline-block px-3 py-1 bg-amber-500 text-white rounded-full text-sm font-semibold">
                  {profile.role}
                </span>
                {profile.role === 'miner' && profile.rfid && (
                  <p className="text-xs text-gray-500 mt-1">RFID: {profile.rfid}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-600">
                {profile?.role === 'admin' ? 'Active Miners' : 'Your Status'}
              </h3>
              <Heart className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{filteredData.length}</p>
            <p className="text-xs text-gray-500 mt-1">
              {profile?.role === 'admin' ? 'Currently monitored' : 'Active readings'}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-600">Avg Heart Rate</h3>
              <Heart className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{avgHeartRate}</p>
            <p className="text-xs text-gray-500 mt-1">BPM {profile?.role === 'admin' ? 'across team' : 'average'}</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-amber-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-600">Avg Air Toxicity</h3>
              <Wind className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{avgAirToxicity}</p>
            <p className="text-xs text-gray-500 mt-1">PPM average</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-600">Critical Alerts</h3>
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{criticalAlerts}</p>
            <p className="text-xs text-gray-500 mt-1">Requiring attention</p>
          </div>
        </div>

        <div className="flex gap-4 mb-6 items-end">
          {profile?.role === 'admin' && zones.length > 1 && (
            <div className="flex-1">
              <label htmlFor="zone-filter" className="block text-sm font-semibold text-gray-700 mb-2">
                Filter by Zone
              </label>
              <select
                id="zone-filter"
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone === 'all' ? 'All Zones' : zone}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowMonthlyStats(!showMonthlyStats)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-md"
          >
            <TrendingUp className="w-5 h-5" />
            {showMonthlyStats ? 'Hide' : 'Show'} Monthly Stats
          </button>
        </div>

        {activeAlerts.length > 0 && (
          <div className="mb-6 bg-red-600 text-white rounded-xl shadow-lg p-6 animate-pulse">
            <div className="flex items-center gap-4">
              <Bell className="w-8 h-8" />
              <div>
                <h3 className="text-xl font-bold mb-1">CRITICAL ALERT</h3>
                <p className="text-sm">
                  {activeAlerts.length} miner{activeAlerts.length > 1 ? 's' : ''} in critical condition
                  {activeAlerts.length === 1 ? ` - Miner ${activeAlerts[0]}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {showMonthlyStats && (
          <div className="mb-6 bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Calendar className="w-7 h-7 text-blue-600" />
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Historical Statistics</h2>
                  <p className="text-sm text-gray-600">Showing all available data</p>
                </div>
              </div>
              {monthlyStats.length > 0 && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {Array.from(new Set(monthlyStats.map(s => s.month))).map((month) => (
                    <option key={month} value={month}>
                      {getMonthName(month)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {loadingStats ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
                <p className="text-gray-600">Loading statistics...</p>
              </div>
            ) : monthlyStats.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No statistics available yet.</p>
                <p className="text-sm text-gray-500 mt-2">Statistics will appear once sensor data is collected.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Data Range:</strong> Showing all available historical data.
                    {monthlyStats.length === 1 && dailyStatsMap.size > 0 ? (
                      <span className="ml-1">
                        {Array.from(dailyStatsMap.values())[0]?.length === 1
                          ? 'Currently displaying single day of data.'
                          : `Currently displaying ${Array.from(dailyStatsMap.values())[0]?.length} days of data.`}
                      </span>
                    ) : (
                      <span className="ml-1">
                        Data spans across {monthlyStats.length} month{monthlyStats.length > 1 ? 's' : ''}.
                      </span>
                    )}
                  </p>
                </div>
              <div className="grid gap-4">
                {monthlyStats
                  .filter(stat => stat.month === selectedMonth)
                  .map((stat) => (
                    <div
                      key={`${stat.minerId}-${stat.month}`}
                      className="border-2 border-gray-200 rounded-lg p-5 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-slate-900">
                            Miner {stat.minerId}
                          </h3>
                          {stat.rfid && (
                            <p className="text-sm text-gray-600">RFID: {stat.rfid}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            {stat.hoursWorked.toFixed(1)}h
                          </p>
                          <p className="text-xs text-gray-600">Hours Worked</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-3 border border-red-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Heart className="w-4 h-4 text-red-600" />
                            <span className="text-xs font-semibold text-gray-700">Avg Heart Rate</span>
                          </div>
                          <p className="text-xl font-bold text-slate-900">
                            {stat.avgHeartRate.toFixed(0)}
                          </p>
                          <p className="text-xs text-gray-600">BPM</p>
                        </div>

                        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-3 border border-amber-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Wind className="w-4 h-4 text-amber-600" />
                            <span className="text-xs font-semibold text-gray-700">Avg Air Toxicity</span>
                          </div>
                          <p className="text-xl font-bold text-slate-900">
                            {stat.avgAirToxicity.toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-600">PPM</p>
                        </div>

                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3 border border-orange-200">
                          <div className="flex items-center gap-2 mb-1">
                            <ThermometerSun className="w-4 h-4 text-orange-600" />
                            <span className="text-xs font-semibold text-gray-700">Avg Temp</span>
                          </div>
                          <p className="text-xl font-bold text-slate-900">
                            {stat.avgTemperature.toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-600">°C</p>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Droplets className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-semibold text-gray-700">Avg Humidity</span>
                          </div>
                          <p className="text-xl font-bold text-slate-900">
                            {stat.avgHumidity.toFixed(0)}
                          </p>
                          <p className="text-xs text-gray-600">%</p>
                        </div>

                        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-3 border border-red-200">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            <span className="text-xs font-semibold text-gray-700">Critical</span>
                          </div>
                          <p className="text-xl font-bold text-red-600">
                            {stat.criticalAlerts}
                          </p>
                          <p className="text-xs text-gray-600">Alerts</p>
                        </div>

                        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-3 border border-yellow-200">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                            <span className="text-xs font-semibold text-gray-700">Warning</span>
                          </div>
                          <p className="text-xl font-bold text-yellow-600">
                            {stat.warningAlerts}
                          </p>
                          <p className="text-xs text-gray-600">Alerts</p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>Total Readings: <strong className="text-slate-900">{stat.totalReadings}</strong></span>
                          <span>
                            Safety Score:
                            <strong className={`ml-1 ${
                              stat.criticalAlerts === 0 ? 'text-green-600' :
                              stat.criticalAlerts < 5 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {stat.criticalAlerts === 0 ? 'Excellent' :
                               stat.criticalAlerts < 5 ? 'Good' : 'Needs Attention'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {dailyStatsMap.has(stat.minerId) && dailyStatsMap.get(stat.minerId)!.length > 0 && (
                        <div className="mt-6">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold text-gray-700">
                              Daily Trends
                            </h4>
                            <div className="text-xs text-gray-500">
                              {getDataRangeInfo(dailyStatsMap.get(stat.minerId)!)}
                            </div>
                          </div>

                          {dailyStatsMap.get(stat.minerId)!.length === 1 && (
                            <div className="mb-4 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                              <strong>Note:</strong> Only one day of data available. Graphs will show more detail as more data is collected.
                            </div>
                          )}

                          <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-600">Heart Rate (BPM)</span>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <div className="w-3 h-0.5 bg-red-500"></div>
                                  Critical (100+)
                                </span>
                                <span className="flex items-center gap-1">
                                  <div className="w-3 h-0.5 bg-yellow-500"></div>
                                  Warning (90-100)
                                </span>
                              </div>
                            </div>
                            <div className="relative h-32 bg-gradient-to-t from-gray-50 to-white border border-gray-200 rounded-lg p-3">
                              <div className="absolute inset-x-3 top-3 bottom-3 flex items-end justify-between gap-1">
                                {dailyStatsMap.get(stat.minerId)!.map((day, idx) => {
                                  const maxHeartRate = Math.max(...dailyStatsMap.get(stat.minerId)!.map(d => d.avgHeartRate));
                                  const height = (day.avgHeartRate / maxHeartRate) * 100;
                                  const isWarning = day.avgHeartRate > 90 && day.avgHeartRate <= 100;
                                  const isCritical = day.avgHeartRate > 100;

                                  return (
                                    <div key={idx} className="flex-1 flex flex-col justify-end h-full group relative">
                                      <div
                                        className={`w-full rounded-t transition-all ${
                                          isCritical ? 'bg-red-500' :
                                          isWarning ? 'bg-yellow-500' : 'bg-green-500'
                                        }`}
                                        style={{ height: `${height}%` }}
                                      ></div>
                                      <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none z-10">
                                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br/>
                                        {day.avgHeartRate.toFixed(0)} BPM
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-600">Air Toxicity (PPM)</span>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                  <div className="w-3 h-0.5 bg-red-500"></div>
                                  Critical (20+)
                                </span>
                                <span className="flex items-center gap-1">
                                  <div className="w-3 h-0.5 bg-yellow-500"></div>
                                  Warning (15-20)
                                </span>
                              </div>
                            </div>
                            <div className="relative h-32 bg-gradient-to-t from-gray-50 to-white border border-gray-200 rounded-lg p-3">
                              <div className="absolute inset-x-3 top-3 bottom-3 flex items-end justify-between gap-1">
                                {dailyStatsMap.get(stat.minerId)!.map((day, idx) => {
                                  const maxToxicity = Math.max(...dailyStatsMap.get(stat.minerId)!.map(d => d.avgAirToxicity));
                                  const height = (day.avgAirToxicity / maxToxicity) * 100;
                                  const isWarning = day.avgAirToxicity > 15 && day.avgAirToxicity <= 20;
                                  const isCritical = day.avgAirToxicity > 20;

                                  return (
                                    <div key={idx} className="flex-1 flex flex-col justify-end h-full group relative">
                                      <div
                                        className={`w-full rounded-t transition-all ${
                                          isCritical ? 'bg-red-500' :
                                          isWarning ? 'bg-yellow-500' : 'bg-green-500'
                                        }`}
                                        style={{ height: `${height}%` }}
                                      ></div>
                                      <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none z-10">
                                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br/>
                                        {day.avgAirToxicity.toFixed(1)} PPM
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-600">Temperature (°C)</span>
                            </div>
                            <div className="relative h-32 bg-gradient-to-t from-gray-50 to-white border border-gray-200 rounded-lg p-3">
                              <div className="absolute inset-x-3 top-3 bottom-3 flex items-end justify-between gap-1">
                                {dailyStatsMap.get(stat.minerId)!.map((day, idx) => {
                                  const temps = dailyStatsMap.get(stat.minerId)!.map(d => d.avgTemperature);
                                  const minTemp = Math.min(...temps);
                                  const maxTemp = Math.max(...temps);
                                  const range = maxTemp - minTemp || 1;
                                  const height = ((day.avgTemperature - minTemp) / range) * 100;

                                  return (
                                    <div key={idx} className="flex-1 flex flex-col justify-end h-full group relative">
                                      <div
                                        className="w-full rounded-t bg-gradient-to-t from-orange-500 to-orange-400 transition-all"
                                        style={{ height: `${height}%` }}
                                      ></div>
                                      <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none z-10">
                                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br/>
                                        {day.avgTemperature.toFixed(1)}°C
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-600">Daily Readings Count</span>
                            </div>
                            <div className="relative h-32 bg-gradient-to-t from-gray-50 to-white border border-gray-200 rounded-lg p-3">
                              <div className="absolute inset-x-3 top-3 bottom-3 flex items-end justify-between gap-1">
                                {dailyStatsMap.get(stat.minerId)!.map((day, idx) => {
                                  const maxReadings = Math.max(...dailyStatsMap.get(stat.minerId)!.map(d => d.totalReadings));
                                  const height = (day.totalReadings / maxReadings) * 100;

                                  return (
                                    <div key={idx} className="flex-1 flex flex-col justify-end h-full group relative">
                                      <div
                                        className="w-full rounded-t bg-gradient-to-t from-blue-500 to-blue-400 transition-all"
                                        style={{ height: `${height}%` }}
                                      ></div>
                                      <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap pointer-events-none z-10">
                                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br/>
                                        {day.totalReadings} readings
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              </>
            )}
          </div>
        )}

        <div className="grid gap-6">
          {filteredData.map((data) => {
            const alert = getAlertLevel(data.heart_rate, data.air_toxicity);
            const isSelected = selectedMiner === data.miner_id;
            const isCritical = activeAlerts.includes(data.miner_id);

            return (
              <div
                key={data.id}
                className={`bg-white rounded-xl shadow-lg border-2 transition-all cursor-pointer ${
                  getStatusColor(data.heart_rate, data.air_toxicity)
                } ${isSelected ? 'ring-4 ring-amber-500' : ''} ${isCritical ? 'animate-pulse' : ''}`}
                onClick={() => setSelectedMiner(isSelected ? null : data.miner_id)}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-bold text-slate-900">
                          Miner {data.miner_id}
                        </h3>
                        {isCritical && (
                          <Bell className="w-6 h-6 text-red-600 animate-bounce" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        Last updated: {new Date(data.created_at).toLocaleTimeString()}
                      </p>
                      {data.rfid && (
                        <p className="text-xs text-gray-500">RFID: {data.rfid}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-lg font-bold ${alert.color}`}>
                        {alert.level}
                      </span>
                      <p className="text-sm text-gray-600">{data.zone}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-white rounded-lg p-4 shadow border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Heart className="w-5 h-5 text-red-500" />
                        <span className="text-xs font-semibold text-gray-600">Heart Rate</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">
                        {data.heart_rate.toFixed(0)}
                      </p>
                      <p className="text-xs text-gray-500">BPM</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 shadow border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Wind className="w-5 h-5 text-amber-500" />
                        <span className="text-xs font-semibold text-gray-600">Air Toxicity</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">
                        {data.air_toxicity.toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-500">PPM</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 shadow border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <ThermometerSun className="w-5 h-5 text-orange-500" />
                        <span className="text-xs font-semibold text-gray-600">Temperature</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">
                        {data.temperature.toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-500">°C</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 shadow border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Droplets className="w-5 h-5 text-blue-500" />
                        <span className="text-xs font-semibold text-gray-600">Humidity</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-900">
                        {data.humidity.toFixed(0)}
                      </p>
                      <p className="text-xs text-gray-500">%</p>
                    </div>

                    <div className="bg-white rounded-lg p-4 shadow border border-gray-200 col-span-2">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-5 h-5 text-green-500" />
                        <span className="text-xs font-semibold text-gray-600">GPS Location</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900">
                        {data.gps_latitude.toFixed(4)}, {data.gps_longitude.toFixed(4)}
                      </p>
                      <p className="text-xs text-gray-500">{data.zone}</p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="font-semibold text-gray-700 mb-2">Additional Details</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Status:</span>
                          <span className={`ml-2 font-semibold ${alert.color}`}>
                            {alert.level}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Zone:</span>
                          <span className="ml-2 font-semibold text-slate-900">{data.zone}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Miner ID:</span>
                          <span className="ml-2 font-semibold text-slate-900">{data.miner_id}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Device ID:</span>
                          <span className="ml-2 font-semibold text-slate-900">{data.id}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredData.length === 0 && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No Data Available
            </h3>
            <p className="text-gray-600">
              {profile?.role === 'miner'
                ? 'No sensor readings found for your RFID. Please ensure your mining kit is active.'
                : 'No miners are currently active in the selected zone.'}
            </p>
          </div>
        )}
      </div>

      {criticalMinerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-red-600 text-white p-6 rounded-t-2xl">
              <div className="flex items-center gap-4">
                <Bell className="w-10 h-10 animate-bounce" />
                <div>
                  <h2 className="text-2xl font-bold">CRITICAL MEDICAL ALERT</h2>
                  <p className="text-sm opacity-90">Immediate attention required</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Miner {criticalMinerModal.miner_id}
                </h3>
                <p className="text-gray-600">
                  Critical condition sustained for more than 30 seconds
                </p>
                {criticalMinerModal.rfid && (
                  <p className="text-sm text-gray-500 mt-1">RFID: {criticalMinerModal.rfid}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="w-6 h-6 text-red-600" />
                    <span className="text-sm font-semibold text-gray-700">Heart Rate</span>
                  </div>
                  <p className="text-3xl font-bold text-red-600">
                    {criticalMinerModal.heart_rate.toFixed(0)} BPM
                  </p>
                  <p className="text-xs text-red-700 mt-1">Critical threshold: &gt;100 BPM</p>
                </div>

                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wind className="w-6 h-6 text-red-600" />
                    <span className="text-sm font-semibold text-gray-700">Air Toxicity</span>
                  </div>
                  <p className="text-3xl font-bold text-red-600">
                    {criticalMinerModal.air_toxicity.toFixed(1)} PPM
                  </p>
                  <p className="text-xs text-red-700 mt-1">Critical threshold: &gt;20 PPM</p>
                </div>

                <div className="bg-slate-50 border border-gray-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ThermometerSun className="w-6 h-6 text-orange-500" />
                    <span className="text-sm font-semibold text-gray-700">Temperature</span>
                  </div>
                  <p className="text-3xl font-bold text-slate-900">
                    {criticalMinerModal.temperature.toFixed(1)}°C
                  </p>
                </div>

                <div className="bg-slate-50 border border-gray-300 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className="w-6 h-6 text-blue-500" />
                    <span className="text-sm font-semibold text-gray-700">Humidity</span>
                  </div>
                  <p className="text-3xl font-bold text-slate-900">
                    {criticalMinerModal.humidity.toFixed(0)}%
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-6 h-6 text-amber-600" />
                  <span className="text-sm font-semibold text-gray-700">Location</span>
                </div>
                <p className="text-lg font-bold text-slate-900 mb-1">
                  {criticalMinerModal.zone}
                </p>
                <p className="text-sm text-gray-600">
                  GPS: {criticalMinerModal.gps_latitude.toFixed(4)}, {criticalMinerModal.gps_longitude.toFixed(4)}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${criticalMinerModal.gps_latitude},${criticalMinerModal.gps_longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm underline mt-2 inline-block"
                >
                  Open in Google Maps
                </a>
              </div>

              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-700">
                  <strong>Last Updated:</strong> {new Date(criticalMinerModal.created_at).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => setCriticalMinerModal(null)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Acknowledge Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}