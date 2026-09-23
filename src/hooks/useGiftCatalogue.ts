import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../stores/auth'

/**
 * The gift catalogue, from the database (HS-LM-v1 §06).
 *
 * It used to be a TypeScript array in src/lib/gifts.ts. It cannot stay there
 * now that gifts cost coins: if the price lives in the client, the browser is
 * telling the server what to charge, and anyone could send the dearest gift
 * for one coin. The server reads gift_catalogue and ignores whatever the
 * client thinks — this hook exists only so the sheet can *display* the price.
 */
export type CatalogueGift = {
  gift_id: string
  name: string
  image: string | null
  /** What the sender pays. */
  cost_coins: number
  /** What the receiver gets — always strictly less, which is the rule that
   *  stops two accounts gifting in a circle and never paying. */
  value_coins: number
  sort_order: number
}

export function useGiftCatalogue() {
  const session = useAuth((s) => s.session)
  return useQuery<CatalogueGift[]>({
    queryKey: ['gift-catalogue'],
    enabled: !!session,
    // Prices change about never; no reason to refetch on every sheet open.
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gift_catalogue')
        .select('gift_id, name, image, cost_coins, value_coins, sort_order')
        .eq('active', true)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as CatalogueGift[]
    },
  })
}

/** True when the server refused because the sender can't afford the gift. */
export function isInsufficientCoins(e: unknown): boolean {
  return e instanceof Error && e.message.includes('insufficient_coins')
}
