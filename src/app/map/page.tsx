'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Filter, Check, Loader2, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const MapView = dynamic(() => import('@/components/map-view'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-white dark:bg-zinc-950 flex-col space-y-3">
      <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      <p className="text-[10px] font-black tracking-widest text-zinc-400 uppercase animate-pulse">
        LOADING MAP...
      </p>
    </div>
  ),
})

export default function ExplorePage() {
  const [showFilter, setShowFilter] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [radius, setRadius] = useState(5) // Default 5 KM

  const { user } = useAuthStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const [realCatsData, setRealCatsData] = useState<any[]>([])
  const [nearbyCatsCount, setNearbyCatsCount] = useState(0)

  const [userPosition, setUserPosition] = useState<[number, number]>([13.7465, 100.5327])
  const [userFollows, setUserFollows] = useState<Set<string>>(new Set())
  const [userCaptures, setUserCaptures] = useState<Set<string>>(new Set())

  const filterOptions = [
    { id: 'all', label: 'All Time' },
    { id: 'recent', label: 'Spotted Recently (7 Days)' }
  ]

  const locateMe = () => {
    if (!navigator.geolocation) {
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition([position.coords.latitude, position.coords.longitude])
      },
      (error) => {
        console.error('Error:', error)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    locateMe()
  }, [])

  useEffect(() => {
    const fetchMapData = async () => {
      try {
        const { data, error } = await supabase
          .from('encounters')
          .select(`
            id,
            lat,
            lng,
            image_url,
            created_at,
            cats ( id, name, area )
          `)
          .order('created_at', { ascending: false })

        if (error) throw error

        if (data) {
          const uniqueCatsMap = new Map()

          data.forEach((encounter: any) => {
            const catInfo = Array.isArray(encounter.cats) ? encounter.cats[0] : encounter.cats;
            if (catInfo && encounter.lat && encounter.lng) {
              if (!uniqueCatsMap.has(catInfo.id)) {
                uniqueCatsMap.set(catInfo.id, {
                  ...encounter,
                  cats: catInfo
                })
              }
            }
          })
          setRealCatsData(Array.from(uniqueCatsMap.values()))
        }
      } catch (err) {
        console.error('Error fetching map data:', err)
      }
    }

    const fetchUserData = async () => {
      if (!user) return

      const [followsRes, capturesRes] = await Promise.all([
        supabase.from('follows').select('cat_id').eq('user_id', user.id),
        supabase.from('encounters').select('cat_id').eq('user_id', user.id).eq('is_training', false)
      ])

      if (followsRes.data) {
        setUserFollows(new Set(followsRes.data.map(f => f.cat_id)))
      }
      if (capturesRes.data) {
        setUserCaptures(new Set(capturesRes.data.map(c => c.cat_id)))
      }
    }

    fetchMapData()
    fetchUserData()
  }, [user])

  // Prepare search results
  const searchResults = searchQuery
    ? realCatsData
      .filter(cat => cat.cats?.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      .map(cat => ({
        ...cat,
        distance: calculateDistance(userPosition[0], userPosition[1], cat.lat, cat.lng)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4)
    : []

  return (
    <main className="relative flex h-full w-full flex-col bg-white dark:bg-zinc-950 overflow-hidden">

      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white via-white/70 to-transparent z-[500] pointer-events-none dark:from-zinc-950 dark:via-zinc-950/70"></div>

      {/* 🌟 Floating Header */}
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <div className="relative">
          <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/90 px-6 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none">

            {!showSearch && (
              <div className="flex items-center space-x-3 shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-orange-500 text-white shadow-inner shadow-white/20">
                  <MapPin className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
                  Explore<span className="text-orange-500">.</span>
                </h1>
              </div>
            )}

            <div className={`flex items-center space-x-2 transition-all duration-300 ${showSearch ? 'w-full' : ''}`}>
              {!showSearch ? (
                <>
                  <div className="flex flex-col items-end mr-1">
                    <span className="text-[10px] font-black tracking-widest text-orange-500 transition-all">
                      {nearbyCatsCount} CATS
                    </span>
                    <span className="text-[9px] font-bold tracking-widest text-zinc-400">NEARBY</span>
                  </div>

                  <button
                    onClick={() => { setShowSearch(true); setShowFilter(false); }}
                    className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-100 text-zinc-900 active:scale-95 transition-all dark:bg-zinc-800 dark:text-white"
                  >
                    <Search className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => { setShowFilter(!showFilter); setShowSearch(false); }}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-[1rem] active:scale-95 transition-all ${showFilter || activeFilter !== 'all'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                      }`}
                  >
                    <Filter className="h-4 w-4" />
                    {activeFilter !== 'all' && (
                      <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-orange-500 border-2 border-zinc-900 dark:border-white"></span>
                    )}
                  </button>
                </>
              ) : (
                <div className="flex w-full items-center">
                  <Search className="h-4 w-4 text-zinc-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search cats by name..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setSelectedCatId(null) // clear selection when typing
                    }}
                    className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 w-full"
                    autoFocus
                  />
                  <button
                    onClick={() => { setShowSearch(false); setSearchQuery(''); setSelectedCatId(null); }}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 ml-2 shrink-0 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  >
                    <span className="text-xs font-black">✕</span>
                  </button>
                </div>
              )}
            </div>

            {/* 🔽 Autocomplete Dropdown */}
            {showSearch && searchResults.length > 0 && !selectedCatId && (
              <div className="absolute top-[80px] left-0 right-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-[1.5rem] shadow-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden animate-in fade-in slide-in-from-top-2 z-[1100]">
                <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                  {searchResults.map((cat) => {
                    const isTooFar = cat.distance > 15
                    return (
                      <button
                        key={cat.id}
                        disabled={isTooFar}
                        onClick={() => {
                          setSelectedCatId(cat.cats.id)
                          // Auto adjust radius if needed
                          if (cat.distance > radius && cat.distance <= 15) {
                            setRadius(Math.ceil(cat.distance))
                          }
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-[1rem] transition-colors ${isTooFar
                          ? 'opacity-50 cursor-not-allowed bg-zinc-50 dark:bg-zinc-950/50'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98]'
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <img src={cat.image_url} className="h-10 w-10 rounded-full object-cover shadow-sm bg-zinc-200" alt={cat.cats.name} />
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-black text-zinc-900 dark:text-white leading-tight">
                              {cat.cats.name}
                            </span>
                            <div className="flex items-center space-x-1 mt-0.5">
                              {userFollows.has(cat.cats.id) && (
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[8px] font-bold tracking-widest uppercase dark:bg-blue-500/10">Following</span>
                              )}
                              {userCaptures.has(cat.cats.id) && (
                                <span className="px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded-md text-[8px] font-bold tracking-widest uppercase dark:bg-orange-500/10">Captured</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className={`text-[10px] font-black tracking-widest ${isTooFar ? 'text-red-500' : 'text-orange-500'}`}>
                            {cat.distance < 1 ? `${(cat.distance * 1000).toFixed(0)} M` : `${cat.distance.toFixed(1)} KM`}
                          </span>
                          <span className="text-[8px] font-bold tracking-widest text-zinc-400">AWAY</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* 🎚️ Horizontal Radar Slider Panel (วางแนวนอน ใต้ Header) */}
      <div className={`absolute top-[104px] left-6 right-6 z-[900] pointer-events-auto transition-opacity duration-300 ${showSearch && searchQuery ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl px-4 py-3 rounded-[1.2rem] shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center space-x-3 transition-all duration-300">
          <span className="text-[10px] font-black tracking-widest text-zinc-400">1 KM</span>
          <input
            type="range"
            min="1"
            max="15"
            step="1"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-orange-500 dark:bg-zinc-800"
          />
          <span className="text-[10px] font-black tracking-widest text-zinc-400">15 KM</span>
          <div className="bg-orange-50 dark:bg-orange-500/10 text-orange-500 px-3 py-1.5 rounded-[0.8rem] text-[10px] font-black tracking-widest shadow-inner shadow-orange-500/10 ml-2 w-16 text-center">
            {radius} KM
          </div>
        </div>
      </div>

      <div className="flex-1 w-full h-full pt-[72px]">
        <MapView
          radius={radius}
          selectedCatId={selectedCatId || undefined}
          onRadiusChange={(newRadius) => setRadius(newRadius)}
          userPosition={userPosition}
          data={realCatsData.filter(cat => {
            // When a cat is selected, we only want to show that specific cat + others in radius
            // Actually, we can just pass the selected cat ID to MapView and let MapView bypass radius for it.
            if (activeFilter === 'recent') {
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              if (new Date(cat.created_at) < sevenDaysAgo) return false;
            }
            return true;
          })}
          onUpdateCount={setNearbyCatsCount}
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-white via-white/80 to-transparent z-[500] pointer-events-none dark:from-zinc-950 dark:via-zinc-950/80"></div>

    </main>
  )
}