-- 0019: record whether the phone's bootloader is locked (reported by the app at enrollment).
-- An unlocked bootloader lets someone erase the phone from a computer, so the website flags it.
alter table public.device_enrollments add column if not exists bootloader_state text;
