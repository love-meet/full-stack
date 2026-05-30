-- Chat gate v3 — tighter rules so casual platform mentions and word-form
-- phone numbers don't slip through.
--
-- v2 (0079) only blocked specific intent patterns ("my whatsapp is X", "dm me
-- on snap"). A plain "let's talk on whatsap" or "do you have telegram"
-- went through. Real users observed this and the gate was effectively
-- useless. v3:
--   • Names of messaging / email platforms (and their common misspellings)
--     are blocked as STANDALONE WORDS, regardless of context. False
--     positives ("I love Instagram!") are accepted as the cost — in a 1:1
--     dating chat, mentioning another platform is virtually always a
--     migration attempt.
--   • Phone-detection normalises word-form digits ("zero eight zero three
--     …") into actual digits before the run-of-digits check.
--   • Lowered the digit-run threshold from 9 to 7 — short local numbers
--     were sneaking through.

create or replace function public._detect_offplatform_contact(p_body text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text;
  digits  text;
begin
  if p_body is null or length(p_body) = 0 then return null; end if;

  cleaned := lower(p_body);

  -- " at " → "@", " dot " → "." (email obfuscation)
  cleaned := regexp_replace(cleaned, '\s+at\s+',  '@', 'g');
  cleaned := regexp_replace(cleaned, '\s+dot\s+', '.', 'g');

  -- Email
  if cleaned ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' then
    return 'email';
  end if;

  -- Replace English-word digits with real digits so "call me at zero eight
  -- zero three one two three four five six seven" becomes "08031234567".
  cleaned := regexp_replace(cleaned, '\mzero\M',  '0', 'g');
  cleaned := regexp_replace(cleaned, '\moh\M',    '0', 'g');
  cleaned := regexp_replace(cleaned, '\mone\M',   '1', 'g');
  cleaned := regexp_replace(cleaned, '\mtwo\M',   '2', 'g');
  cleaned := regexp_replace(cleaned, '\mthree\M', '3', 'g');
  cleaned := regexp_replace(cleaned, '\mfour\M',  '4', 'g');
  cleaned := regexp_replace(cleaned, '\mfive\M',  '5', 'g');
  cleaned := regexp_replace(cleaned, '\msix\M',   '6', 'g');
  cleaned := regexp_replace(cleaned, '\mseven\M', '7', 'g');
  cleaned := regexp_replace(cleaned, '\meight\M', '8', 'g');
  cleaned := regexp_replace(cleaned, '\mnine\M',  '9', 'g');

  -- Phone: 7+ digits clustered after stripping common separators.
  digits := regexp_replace(cleaned, '[\s\-\.\(\)\+]+', '', 'g');
  if digits ~ '\m\d{7,}\M' then
    return 'phone';
  end if;

  -- Direct URLs / schemes (a link is a clear migration attempt).
  if p_body ~* '(wa\.me/|api\.whatsapp\.com|t\.me/|telegram\.me/|tg://|signal\.me/|snapchat\.com/|sc\.com/|m\.me/|fb\.me/|messenger\.com/|kakao\.com/|line\.me/|wechat\.com/|skype:|imessage:|viber:|discord\.gg/|discord\.com/users/)' then
    return 'platform_url';
  end if;

  -- ANY standalone mention of a known off-platform service or its common
  -- misspelling. Aggressive on purpose — see file header.
  if p_body ~* '\m(whatsapp|whatsap|whatapp|whatsup|watsapp|watsap|whatsaap|wsap|wsapp|wassap|wassapp|telegram|telgram|tlegram|tlgrm|snapchat|snapcat|snapchatt|snap\s*chat|discord|signal\s*app|skype|skyp|viber|kakao|wechat|imessage|messenger|instagram|instgram|isntagram|tiktok|tik\s*tok|gmail|protonmail|yahoo\s*mail|hotmail|icloud|outlook\s*mail)\M' then
    return 'platform_handle';
  end if;

  -- Phrases that try to move the chat off-platform without naming the app.
  if p_body ~* '(give\s+me\s+your\s+(number|digits|contact)|drop\s+your\s+(number|digits|contact)|share\s+your\s+(number|digits|contact|email)|talk\s+(outside|elsewhere)|move\s+(this|the\s+chat)|continue\s+(outside|elsewhere)|off\s+this\s+(app|platform|site))' then
    return 'platform_intent';
  end if;

  return null;
end $$;
