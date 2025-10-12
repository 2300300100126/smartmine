/*
  # Complete Smart Mining System Database Schema

  ## Overview
  This migration creates the complete database structure including:
  - User profiles with role-based access (admin/miner)
  - Sensor readings linked to miners via RFID
  - Feedback and contact form submissions
  - Authentication and authorization system

  ## New Tables

  ### 1. `user_profiles`
  Stores user information and role assignments
  - `id` (uuid, primary key, references auth.users) - User identifier
  - `email` (text, unique) - User email address
  - `full_name` (text) - User's full name
  - `role` (text) - User role: 'admin' or 'miner'
  - `rfid` (text, unique, nullable) - RFID tag for miners
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. `sensor_readings`
  Stores real-time sensor data from mining kits
  - `id` (uuid, primary key) - Unique identifier
  - `miner_id` (text) - Display identifier for the miner
  - `rfid` (text) - RFID linking to user_profiles
  - `heart_rate` (integer) - Heart rate in BPM
  - `air_toxicity` (numeric) - Air toxicity level (PPM)
  - `zone` (text) - Mining zone identifier
  - `gps_latitude` (numeric) - GPS latitude
  - `gps_longitude` (numeric) - GPS longitude
  - `temperature` (numeric) - Temperature in Celsius
  - `humidity` (numeric) - Humidity percentage
  - `created_at` (timestamptz) - Reading timestamp

  ### 3. `feedback`
  Stores feedback submissions from home page
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text) - Submitter name
  - `email` (text) - Email address
  - `message` (text) - Feedback content
  - `created_at` (timestamptz) - Submission timestamp

  ### 4. `contact_submissions`
  Stores contact form submissions
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text) - Contact name
  - `email` (text) - Contact email
  - `subject` (text) - Subject line
  - `message` (text) - Message content
  - `created_at` (timestamptz) - Submission timestamp

  ## Security
  - RLS enabled on all tables
  - Admins can view all data
  - Miners can only view their own data via RFID matching
  - Public can submit feedback and contact forms

  ## Notes
  1. RFID is unique and required for miners
  2. Automatic profile creation on user signup
  3. Role-based access control throughout
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'miner')),
  rfid text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sensor_readings table
CREATE TABLE IF NOT EXISTS sensor_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  miner_id text NOT NULL,
  rfid text,
  heart_rate integer NOT NULL,
  air_toxicity numeric NOT NULL,
  zone text NOT NULL,
  gps_latitude numeric NOT NULL,
  gps_longitude numeric NOT NULL,
  temperature numeric DEFAULT 25,
  humidity numeric DEFAULT 60,
  created_at timestamptz DEFAULT now()
);

-- Create feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create contact_submissions table
CREATE TABLE IF NOT EXISTS contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_rfid ON user_profiles(rfid);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_rfid ON sensor_readings(rfid);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_created_at ON sensor_readings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_zone ON sensor_readings(zone);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_miner_id ON sensor_readings(miner_id);

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles

CREATE POLICY "Users can view own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'admin'
    )
  );

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Allow profile creation during signup"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- RLS Policies for sensor_readings

CREATE POLICY "Admins can view all sensor readings"
  ON sensor_readings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Miners can view own sensor readings"
  ON sensor_readings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'miner'
      AND user_profiles.rfid = sensor_readings.rfid
    )
  );

CREATE POLICY "Allow sensor data insertion"
  ON sensor_readings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can insert sensor data"
  ON sensor_readings
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- RLS Policies for feedback

CREATE POLICY "Anyone can submit feedback"
  ON feedback
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated users can submit feedback"
  ON feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read feedback"
  ON feedback
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for contact_submissions

CREATE POLICY "Anyone can submit contact form"
  ON contact_submissions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated users can submit contact form"
  ON contact_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read contact submissions"
  ON contact_submissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, rfid)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'miner'),
    NEW.raw_user_meta_data->>'rfid'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on profile changes
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
