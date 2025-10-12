/*
  # User Activity Logging System

  ## Overview
  This migration creates a table to track user login and signup activities.

  ## New Tables
  
  ### `user_activity_log`
  Tracks all user authentication activities
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, nullable) - References auth.users, nullable for failed attempts
  - `email` (text) - Email address used for login/signup
  - `activity_type` (text) - Type of activity: 'signup', 'login', 'logout'
  - `status` (text) - Status: 'success', 'failed'
  - `ip_address` (text, nullable) - User IP address
  - `user_agent` (text, nullable) - Browser user agent
  - `created_at` (timestamptz) - Activity timestamp

  ## Security
  - RLS enabled on user_activity_log table
  - Only admins can view activity logs
  - Automatic logging of all auth activities
  
  ## Notes
  1. Tracks both successful and failed authentication attempts
  2. Helps with security auditing and user behavior analysis
  3. Admins can monitor login patterns and detect suspicious activities
*/

-- Create user_activity_log table
CREATE TABLE IF NOT EXISTS user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('signup', 'login', 'logout')),
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_email ON user_activity_log(email);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_created_at ON user_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_activity_type ON user_activity_log(activity_type);

-- Enable RLS
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can view activity logs
CREATE POLICY "Admins can view all activity logs"
  ON user_activity_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policy: Allow system to insert activity logs
CREATE POLICY "System can insert activity logs"
  ON user_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anonymous can insert activity logs"
  ON user_activity_log
  FOR INSERT
  TO anon
  WITH CHECK (true);
