-- Track whether the device actually has active management (Device Owner).
-- Without this, the dashboard could falsely show a device as "protected".
alter table device_enrollments
  add column if not exists management_active boolean default false,
  add column if not exists management_checked_at timestamptz;
