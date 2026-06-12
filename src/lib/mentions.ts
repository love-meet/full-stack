import { supabase } from './supabase'

/**
 * Extracts @handles from a text string, looks up their user IDs,
 * and inserts them into the comment_mentions table.
 */
export async function processMentions(
  body: string,
  commentId: string,
  type: 'post' | 'group'
) {
  // Extract unique handles (remove the @)
  const matches = body.match(/@[a-zA-Z0-9_]+/g)
  if (!matches || matches.length === 0) return

  const handles = Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())))
  if (handles.length === 0) return

  // Lookup the user IDs for these handles
  const { data: profiles, error: lookupError } = await supabase
    .from('profiles')
    .select('id, handle')
    // Unfortunately Supabase JS .in() doesn't do case-insensitive arrays natively
    // in an easy way, but usernames are generally enforced lowercase anyway.
    .in('handle', handles)

  if (lookupError || !profiles || profiles.length === 0) {
    console.error('Failed to lookup mentioned handles:', lookupError)
    return
  }

  // Build the insert payload
  const inserts = profiles.map((p) => ({
    [type === 'post' ? 'comment_id' : 'group_comment_id']: commentId,
    mentioned_user_id: p.id,
  }))

  // Insert into comment_mentions
  const { error: insertError } = await supabase
    .from('comment_mentions')
    .insert(inserts)

  if (insertError) {
    console.error('Failed to insert comment mentions:', insertError)
  }
}
