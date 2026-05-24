-- Email-notification preference. When true (default), the notify-email Edge
-- Function emails the user for each in-app notification. Users can switch it
-- off in Settings. The actual send happens in the Edge Function (SMTP), fired
-- by a Database Webhook on notifications insert.

alter table public.profiles
  add column if not exists email_notifications boolean not null default true;
