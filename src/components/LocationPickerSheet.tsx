import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Drawer } from 'vaul'
import { useDrawerLock } from '../stores/ui'

export type LocationResult = {
  label: string
  lat: number
  lon: number
}

type Props = {
  onSelect: (location: LocationResult) => void
  onClose: () => void
}

type SearchResult = {
  display_name: string
  lat: string
  lon: string
}

export default function LocationPickerSheet({ onSelect, onClose }: Props) {
  useDrawerLock()
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usingGeolocation, setUsingGeolocation] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  // Search via OpenStreetMap Nominatim
  async function handleSearch(query: string) {
    setSearchQuery(query)
    setError(null)

    if (!query.trim()) {
      setResults([])
      return
    }

    // Debounce
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8`,
          {
            headers: {
              'User-Agent': 'LoveMeetApp/1.0',
              'Accept-Language': 'en',
            },
          }
        )
        if (!response.ok) throw new Error(`Search failed: ${response.status}`)
        const data = (await response.json()) as SearchResult[]
        setResults(data)
      } catch (err) {
        setError('Could not search locations. Try again.')
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }

  // Get current location
  async function handleCurrentLocation() {
    setError(null)

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }

    setUsingGeolocation(true)

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 0,
        })
      })

      const { latitude, longitude } = position.coords

      // Reverse geocode to get place name
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          {
            headers: {
              'User-Agent': 'LoveMeetApp/1.0',
              'Accept-Language': 'en',
            },
          }
        )
        if (!response.ok) throw new Error(`Reverse geocode failed: ${response.status}`)
        const data = (await response.json()) as { display_name: string }

        onSelect({
          label: data.display_name,
          lat: latitude,
          lon: longitude,
        })
        onClose()
      } catch {
        onSelect({
          label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          lat: latitude,
          lon: longitude,
        })
        onClose()
      }
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied. Please enable it in your browser settings.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('Location unavailable. Try searching manually instead.')
        } else if (err.code === err.TIMEOUT) {
          setError('Location request timed out. Try again.')
        } else {
          setError('Could not get your location.')
        }
      } else {
        setError('Could not get your location.')
      }
    } finally {
      setUsingGeolocation(false)
    }
  }

  function handleSelectResult(result: SearchResult) {
    onSelect({
      label: result.display_name,
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
    })
    onClose()
  }

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose() }} modal>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md bg-surface-2 rounded-t-3xl flex flex-col outline-none"
          style={{ maxHeight: '95dvh' }}
        >
          <div className="pt-3 pb-1 shrink-0">
            <div className="mx-auto w-10 h-1 rounded-full bg-ink-muted/40" />
          </div>

          <Drawer.Title className="sr-only">Pick a location</Drawer.Title>

          {/* Search box */}
          <div className="px-5 pt-3 pb-2 shrink-0 space-y-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search a place…"
              className="w-full bg-surface-3 rounded-full px-4 py-2.5 text-ink placeholder:text-ink-muted outline-none transition-colors focus:ring-1 focus:ring-white/20"
              autoFocus
            />

            <button
              onClick={handleCurrentLocation}
              disabled={usingGeolocation}
              className="w-full flex items-center justify-center gap-2 bg-gradient-brand glow-rose rounded-full px-4 py-2.5 text-white font-semibold text-sm transition-opacity disabled:opacity-70"
            >
              {usingGeolocation ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Getting location…
                </>
              ) : (
                <>
                  📍 Use my current location
                </>
              )}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="px-5 pb-2">
              <div className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">
                {error}
              </div>
            </div>
          )}

          {/* Results list */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
            {isSearching && searchQuery ? (
              <div className="text-center text-ink-muted text-sm py-8">
                <div className="inline-block w-4 h-4 border-2 border-ink-muted/30 border-t-ink-muted rounded-full animate-spin mb-2" />
                <div>Searching…</div>
              </div>
            ) : results.length > 0 ? (
              <ul className="space-y-1">
                {results.map((result, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => handleSelectResult(result)}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.08] transition-colors text-sm text-ink active:bg-white/10"
                    >
                      <div className="font-medium truncate">{result.display_name}</div>
                      <div className="text-xs text-ink-muted">
                        {parseFloat(result.lat).toFixed(4)}, {parseFloat(result.lon).toFixed(4)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : searchQuery ? (
              <div className="text-center text-ink-muted text-sm py-8">
                No places found. Try a different search.
              </div>
            ) : (
              <div className="text-center text-ink-muted text-sm py-8">
                Search for a place or use your current location.
              </div>
            )}
          </div>

          {/* Close button */}
          <div className="px-5 pb-3 shrink-0 border-t border-white/5">
            <button
              onClick={onClose}
              className="w-full rounded-full py-3 glass text-ink-2 hover:text-ink font-semibold text-sm"
            >
              Cancel
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
