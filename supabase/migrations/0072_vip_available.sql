-- VIP is no longer "coming soon" — it's purchasable now alongside Premium.
update public.subscription_plans
   set coming_soon = false
 where id = 'soulmate';
