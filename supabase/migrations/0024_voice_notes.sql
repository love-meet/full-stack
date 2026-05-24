-- Voice notes in chat: allow an 'audio' attachment kind on messages.
-- Reuses the existing media_url / media_kind / media_aspect columns
-- (added in 0021). Audio is stored on Cloudinary under the `video`
-- resource type, which is how Cloudinary handles audio-only assets.

alter type public.message_media_kind add value if not exists 'audio';
