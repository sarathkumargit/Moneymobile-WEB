-- Firebase push token per phone, so the server can reach it even on limited data.
alter table device_enrollments add column if not exists fcm_token text;
