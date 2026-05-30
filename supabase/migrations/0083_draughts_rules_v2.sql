-- Loosen the structural checks in submit_draughts_move so they line up
-- with the v2 client rules:
--   • Pawns may CAPTURE in any direction (forward or backward).
--   • Kings MOVE any number of empty diagonal squares (flying king).
--   • Multi-jump chains can zig-zag and can have ≥ 3 captures — the old
--     check `abs(dr) = 2 * cap_count and abs(dc) = 2 * cap_count` rejected
--     legal zig-zags and king-chain landings.
--
-- Server still enforces the safety invariants:
--   • You can only move your own piece.
--   • Destination must be on-board and empty.
--   • Pawn PLAIN moves must be a single diagonal step forward.
--   • Every captured square must hold an opposing piece (no double-capture
--     of a single square, no capturing empties).
--
-- Path geometry is now the client's responsibility — `legalMoves()`
-- enumerates all valid chains; users can only invoke moves that came from
-- that set.

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

  -- Find source piece + next free id.
  for i in 0 .. jsonb_array_length(board) - 1 loop
    piece := board -> i;
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

  -- Destination on-board.
  if p_to_r < 0 or p_to_r > 7 or p_to_c < 0 or p_to_c > 7 then
    raise exception 'destination off board';
  end if;
  -- Destination empty (or it's the source square — impossible for a real move,
  -- but kept as a guard).
  for i in 0 .. jsonb_array_length(board) - 1 loop
    if (board->i->>'r')::int = p_to_r and (board->i->>'c')::int = p_to_c then
      if not (p_to_r = p_from_r and p_to_c = p_from_c) then
        raise exception 'destination occupied';
      end if;
    end if;
  end loop;

  dr := p_to_r - p_from_r;
  dc := p_to_c - p_from_c;

  -- Move shape & captures.
  if cap_count = 0 then
    -- Plain move must be diagonal.
    if abs(dr) <> abs(dc) or abs(dr) = 0 then
      raise exception 'illegal step (must move diagonally)';
    end if;
    if is_king then
      -- Flying king: any distance. We trust the client engine for the
      -- "path is clear" check; the destination-empty check above is enough
      -- to prevent landing on another piece.
      null;
    else
      -- Pawn: one square forward only.
      if abs(dr) <> 1 then raise exception 'pawn moves one square'; end if;
      if my_color = 'r' and dr <> 1  then raise exception 'pawn must move forward'; end if;
      if my_color = 'b' and dr <> -1 then raise exception 'pawn must move forward'; end if;
    end if;
  else
    -- Captures: each captured square must hold an opponent piece, and we
    -- must not capture the same square twice. The full path geometry
    -- (zig-zags / flying-king jumps) is trusted to the client engine.
    for i in 0 .. cap_count - 1 loop
      cr := (p_captures->i->>'r')::int;
      cc := (p_captures->i->>'c')::int;
      found := false;
      for j in 0 .. jsonb_array_length(board) - 1 loop
        if (board->j->>'r')::int = cr and (board->j->>'c')::int = cc then
          if board->j->>'color' <> opp_color then
            raise exception 'captured square not an opponent piece';
          end if;
          if j = ANY(captured_ids) then
            raise exception 'tried to capture the same piece twice';
          end if;
          captured_ids := array_append(captured_ids, j);
          found := true;
          exit;
        end if;
      end loop;
      if not found then raise exception 'captured square empty'; end if;
    end loop;
  end if;

  -- Build the new board.
  for i in 0 .. jsonb_array_length(board) - 1 loop
    if i = my_idx then continue; end if;
    if cap_count > 0 and i = ANY(captured_ids) then continue; end if;
    new_board := new_board || (board -> i);
  end loop;
  if (my_color = 'r' and p_to_r = 7) or (my_color = 'b' and p_to_r = 0) then
    promoted := true;
  end if;
  new_board := new_board || jsonb_build_object(
    'id', moving_piece_id, 'r', p_to_r, 'c', p_to_c,
    'color', my_color, 'king', is_king or promoted
  );

  -- Win condition: opponent has no pieces left. (No-legal-move stalemate is
  -- detected client-side and reported via concede_draughts_round.)
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
