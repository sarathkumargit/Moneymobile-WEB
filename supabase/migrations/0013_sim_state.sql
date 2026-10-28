-- Live SIM status reported by the phone on every check-in ("present" / "absent"),
-- shown on the customer page and used by the server as a backup SIM-removal lock.
-- Safe to re-run. Until applied, the app keeps working; the SIM line just shows "unknown".
alter table device_enrollments add column if not exists sim_state text;
alter table device_enrollments add column if not exists sim_state_at timestamptz;
