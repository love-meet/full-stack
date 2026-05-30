-- Draughts pieces now carry a stable per-piece `id` so the client can
-- animate piece movement smoothly between squares (Framer Motion's
-- layoutId needs a stable identity to lerp between positions). Without
-- this, every move teleports because each cell's piece is a new element.

create or replace function public._draughts_initial_board()
returns jsonb language sql immutable as $$
  with pieces as (
    select 'r'::text as color, r, c from generate_series(0,2) r, generate_series(0,7) c where (r+c)%2 = 1
    union all
    select 'b'::text as color, r, c from generate_series(5,7) r, generate_series(0,7) c where (r+c)%2 = 1
  ),
  numbered as (
    select row_number() over (order by r, c) - 1 as id, color, r, c from pieces
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'r', r, 'c', c, 'color', color, 'king', false)),
    '[]'::jsonb
  ) from numbered
$$;

-- Update submit_draughts_move to preserve piece IDs and assign a fresh id
-- to a piece that wasn't already tagged (handles any in-flight boards from
-- the v1 migration that don't have ids yet).
create or replace function public.submit_draughts_move(
  p_game_id uuid,
  p_round int,
  p_from_r int, p_from_c int,
  p_to_r   int, p_to_c   int,
  p_captures jsonb
)
returns public.draughts_rounds
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid(); g public.games; r public.draughts_rounds;
  my_color text; opp_color text; cap_count int := 0;
  board jsonb; new_board jsonb := '[]'::jsonb; piece jsonb;
  captured_ids int[] := ARRAY[]::int[];
  i int; j int; my_idx int := -1;
  dr int; dc int; promoted boolean := false;
  cr int; cc int; found boolean;
  is_king boolean; opp_pieces_left int := 0;
  moving_piece_id int;
  next_piece_id int := 0;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into g from public.games where id = p_game_id;
  if g.id is null or g.status <> 'active' or g.current_round <> p_round then
    raise exception 'round not active';
  end if;
  select * into r from public.draughts_rounds
    where game_id = p_game_id and round_no = p_round for update;
  if r.round_no is null or r.status <> 'playing' then
    raise exception 'round not in play';
  end if;
  if r.turn_user_id <> me then raise exception 'not your turn'; end if;

  my_color  := public._draughts_player_color(p_game_id, me);
  opp_color := case when my_color = 'r' then 'b' else 'r' end;
  board := r.board;
  if p_captures is not null then cap_count := jsonb_array_length(p_captures); end if;

  for i in 0 .. jsonb_array_length(board) - 1 loop
    piece := board -> i;
    -- Track the largest existing id so a new piece gets a unique one.
    if (piece ? 'id') and (piece->>'id')::int >= next_piece_id then
      next_piece_id := (piece->>'id')::int + 1;
    end if;
    if (piece->>'r')::int = p_from_r and (piece->>'c')::int = p_from_c then
      if piece->>'color' <> my_color then raise exception 'not your piece'; end if;
      my_idx := i;
    end if;
  end loop;
  if my_idx < 0 then raise exception 'no piece on source square'; end if;
  is_king := coalesce((board->my_idx->>'king')::boolean, false);
  moving_piece_id := coalesce((board->my_idx->>'id')::int, next_piece_id);

  if p_to_r < 0 or p_to_r > 7 or p_to_c < 0 or p_to_c > 7 then
    raise exception 'destination off board';
  end if;
  for i in 0 .. jsonb_array_length(board) - 1 loop
    if (board->i->>'r')::int = p_to_r and (board->i->>'c')::int = p_to_c then
      raise exception 'destination occupied';
    end if;
  end loop;

  dr := p_to_r - p_from_r;
  dc := p_to_c - p_from_c;

  if cap_count = 0 then
    if abs(dr) <> 1 or abs(dc) <> 1 then raise exception 'illegal step'; end if;
    if not is_king then
      if my_color = 'r' and dr <> 1  then raise exception 'pawn must move forward'; end if;
      if my_color = 'b' and dr <> -1 then raise exception 'pawn must move forward'; end if;
    end if;
  else
    if abs(dr) <> 2 * cap_count or abs(dc) <> 2 * cap_count then
      raise exception 'capture path doesn''t add up';
    end if;
    for i in 0 .. cap_count - 1 loop
      cr := (p_captures->i->>'r')::int;
      cc := (p_captures->i->>'c')::int;
      found := false;
      for j in 0 .. jsonb_array_length(board) - 1 loop
        if (board->j->>'r')::int = cr and (board->j->>'c')::int = cc then
          if board->j->>'color' <> opp_color then
            raise exception 'captured square not an opponent piece';
          end if;
          captured_ids := array_append(captured_ids, j);
          found := true;
          exit;
        end if;
      end loop;
      if not found then raise exception 'captured square empty'; end if;
    end loop;
  end if;

  -- Build the new board, preserving piece IDs.
  for i in 0 .. jsonb_array_length(board) - 1 loop
    if i = my_idx then continue; end if;
    if cap_count > 0 and i = ANY(captured_ids) then continue; end if;
    new_board := new_board || (board -> i);
  end loop;
  if (my_color = 'r' and p_to_r = 7) or (my_color = 'b' and p_to_r = 0) then
    promoted := true;
  end if;
  new_board := new_board || jsonb_build_object(
    'id',    moving_piece_id,
    'r',     p_to_r,
    'c',     p_to_c,
    'color', my_color,
    'king',  is_king or promoted
  );

  for i in 0 .. jsonb_array_length(new_board) - 1 loop
    if new_board->i->>'color' = opp_color then
      opp_pieces_left := opp_pieces_left + 1;
    end if;
  end loop;

  if opp_pieces_left = 0 then
    update public.draughts_rounds
       set board = new_board, status = 'done', winner_player = me, decided_at = now()
     where game_id = p_game_id and round_no = p_round
     returning * into r;
    update public.game_players set score = score + 1
      where game_id = p_game_id and user_id = me;
  else
    update public.draughts_rounds
       set board = new_board,
           turn_user_id = (
             select user_id from public.game_players
              where game_id = p_game_id and user_id <> me limit 1
           )
     where game_id = p_game_id and round_no = p_round
     returning * into r;
  end if;
  return r;
end $$;
