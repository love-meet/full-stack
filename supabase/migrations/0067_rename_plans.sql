-- Rename the paid plans to read like subscription tiers.
--   Sweetheart ($2)  → Premium
--   Soulmate  ($10)  → VIP
-- IDs stay the same ('sweetheart'/'soulmate') so existing subscriptions and
-- references keep working; only the display name + the text that referenced
-- the old name change.

update public.subscription_plans
   set name = 'Premium'
 where id = 'sweetheart';

update public.subscription_plans
   set name = 'VIP',
       description = 'For those who mean it. Everything in Premium, plus verified nationality and face — so serious hearts find each other.',
       features = '[
         "Everything in Premium",
         "Nationality verification",
         "Face verification",
         "Top priority with the most genuine, verified matches"
       ]'::jsonb
 where id = 'soulmate';
