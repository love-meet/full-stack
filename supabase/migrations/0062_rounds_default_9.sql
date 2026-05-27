-- 20 rounds dragged on too long. Make a match 9 rounds.
alter table public.games alter column rounds_total set default 9;

-- Apply to games that haven't started yet so they pick up the new length.
update public.games set rounds_total = 9
 where status = 'lobby' and rounds_total = 20;
