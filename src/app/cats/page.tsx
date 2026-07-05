// src/app/cats/page.tsx
'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Search, Library, MapPin, Lock, Loader2, X, Camera, Navigation } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// 📏 คำนวณระยะทางระหว่าง 2 พิกัด (หน่วยกิโลเมตร) ด้วยสูตร Haversine
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371 // รัศมีโลก (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export default function CatsGalleryPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'discovered'>('all')
  const [catsList, setCatsList] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [discoveredCount, setDiscoveredCount] = useState(0)

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 📍 ตำแหน่งผู้ใช้ปัจจุบัน
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'loading' | 'granted' | 'denied'>('loading')

  useEffect(() => {
    fetchCats()
  }, [])

  // 📍 ขอตำแหน่งผู้ใช้ตอนโหลดหน้า
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationStatus('granted')
      },
      (err) => {
        console.warn('Geolocation error:', err.message)
        setLocationStatus('denied')
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    )
  }, [])

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

  const fetchCats = async () => {
    try {
      const { data, error } = await supabase
        .from('cats')
        .select(`
          id,
          name,
          area,
          first_seen,
          encounters ( image_url, created_at, lat, lng )
        `)
        .order('first_seen', { ascending: false })

      if (error) {
        console.error('Supabase Query Error:', error.message)
        return 
      }

      if (data) {
        const formattedCats = data.map(cat => {
          let encs: any[] = []
          if (Array.isArray(cat.encounters)) {
            encs = cat.encounters
          } else if (cat.encounters) {
            encs = [cat.encounters]
          }

          const sortedEncounters = encs.sort((a, b) => 
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          )
          
          const isDiscovered = sortedEncounters.length > 0
          const latestEncounter = isDiscovered ? sortedEncounters[0] : null
          
          return {
            id: cat.id,
            name: cat.name || 'Unknown Cat',
            area: cat.area || 'Unknown Area',
            isDiscovered: isDiscovered,
            coverImage: latestEncounter?.image_url || null,
            // 📍 พิกัดจาก encounter ล่าสุด (ใช้คำนวณระยะห่าง)
            lat: latestEncounter?.lat ?? null,
            lng: latestEncounter?.lng ?? null,
          }
        })

        setCatsList(formattedCats)
        setDiscoveredCount(formattedCats.filter(c => c.isDiscovered).length)
      }
    } catch (err: any) {
      console.error('Runtime Error in fetchCats:', err.message || err)
    } finally {
      setIsLoading(false)
    }
  }

  // 📍 เพิ่มระยะทางเข้าไปในแต่ละตัว แล้ว sort ใกล้ไปไกล (ถ้ามีตำแหน่งผู้ใช้)
  const catsWithDistance = useMemo(() => {
    const withDist = catsList.map(cat => {
      const distanceKm =
        userLocation && cat.lat != null && cat.lng != null
          ? getDistanceKm(userLocation.lat, userLocation.lng, cat.lat, cat.lng)
          : null
      return { ...cat, distanceKm }
    })

    if (!userLocation) {
      // ไม่มีตำแหน่งผู้ใช้ -> คงลำดับเดิม (first_seen ล่าสุดก่อน)
      return withDist
    }

    // แยกกลุ่มที่มีพิกัด (sort ใกล้->ไกล) กับกลุ่มที่ไม่มีพิกัด (ต่อท้าย)
    const withCoords = withDist.filter(c => c.distanceKm !== null)
    const withoutCoords = withDist.filter(c => c.distanceKm === null)
    withCoords.sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number))

    return [...withCoords, ...withoutCoords]
  }, [catsList, userLocation])

  const uniqueAreas = Array.from(new Set(catsList.map(cat => cat.area ? cat.area.split(',')[0].trim() : '')))
    .filter(a => a !== '' && a !== 'Unknown Area')
    .slice(0, 6)

  const filteredCats = catsWithDistance.filter(cat => {
    const matchTab = activeTab === 'all' || cat.isDiscovered
    
    const searchLower = searchQuery.toLowerCase().trim()
    const matchSearch = searchLower === '' || 
                        cat.name?.toLowerCase().includes(searchLower) || 
                        cat.area?.toLowerCase().includes(searchLower)
    
    return matchTab && matchSearch
  })

  const CatCardContent = ({ cat }: { cat: any }) => (
    <>
      <div 
        className={`absolute inset-0 bg-cover bg-center transition-all duration-500 group-hover:scale-110 ${
          !cat.isDiscovered ? 'grayscale blur-[2px] opacity-60' : ''
        }`}
        style={{ 
          backgroundImage: `url(${cat.coverImage || 'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?q=80&w=400'})`,
          backgroundColor: '#f4f4f5' 
        }}
      ></div>
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>

      {!cat.isDiscovered && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
            <Lock className="h-5 w-5" />
          </div>
        </div>
      )}

      {/* 📍 Distance Badge */}
      {cat.distanceKm !== null && cat.distanceKm !== undefined && (
        <div className="absolute top-3 right-3 flex items-center space-x-1 bg-black/50 backdrop-blur-md px-2.5 py-1 rounded-full z-10">
          <Navigation className="h-2.5 w-2.5 text-orange-400" />
          <span className="text-[9px] font-black text-white tracking-wide">
            {formatDistance(cat.distanceKm)}
          </span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 w-full p-4 flex flex-col z-10">
        <h3 className="text-lg font-black text-white drop-shadow-md leading-tight">
          {cat.isDiscovered ? cat.name : '???'}
        </h3>
        <div className="flex items-center space-x-1 mt-1 text-orange-400">
          <MapPin className="h-3 w-3" />
          <span className="text-[9px] font-bold tracking-wider text-zinc-300 uppercase truncate">
            {cat.area.split(',')[0]}
          </span>
        </div>
      </div>
    </>
  )

  return (
    <main className="relative flex h-full w-full flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
      
      <div className="absolute top-6 left-0 right-0 z-[1000] px-6 pointer-events-none">
        <div className="flex flex-col space-y-4">
          
          {isSearchOpen ? (
            <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/95 px-4 backdrop-blur-xl border border-zinc-100 shadow-2xl shadow-zinc-200/50 pointer-events-auto animate-in slide-in-from-top-4 fade-in duration-200 dark:bg-zinc-900/95 dark:border-zinc-800 dark:shadow-none">
              <Search className="h-5 w-5 text-orange-500 shrink-0 ml-2" />
              <input 
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find by name or area..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-zinc-900 placeholder:text-zinc-400 px-3 outline-none w-full dark:text-white"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')} 
                  className="p-2 text-zinc-400 active:scale-95 shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
              <button 
                onClick={() => {
                  setIsSearchOpen(false)
                  setSearchQuery('')
                }}
                className="text-[10px] font-black tracking-widest text-zinc-500 uppercase px-3 py-2 shrink-0 border-l border-zinc-200 ml-1 active:bg-zinc-100 rounded-xl transition-colors dark:border-zinc-700 dark:active:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex h-[72px] items-center justify-between rounded-[2rem] bg-white/90 px-6 backdrop-blur-xl border border-zinc-100 shadow-xl shadow-zinc-200/50 pointer-events-auto animate-in fade-in duration-200 dark:bg-zinc-900/90 dark:border-zinc-800 dark:shadow-none">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-900 text-white shadow-inner shadow-white/20 dark:bg-white dark:text-zinc-900">
                  <Library className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-black tracking-wide text-zinc-900 dark:text-white uppercase mt-0.5">
                  Cats<span className="text-orange-500">.</span>
                </h1>
              </div>
              
              <button 
                onClick={() => setIsSearchOpen(true)}
                className="relative flex h-10 w-10 items-center justify-center rounded-[1rem] bg-zinc-100 text-zinc-900 active:scale-95 transition-transform hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          )}

          {isSearchOpen ? (
            <div className="flex space-x-2 overflow-x-auto no-scrollbar pt-1 px-2 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-300">
              <button
                onClick={() => setSearchQuery('')}
                className={`whitespace-nowrap px-4 py-2 backdrop-blur-md rounded-[1rem] text-[10px] font-black tracking-widest uppercase border shadow-sm active:scale-95 transition-all ${
                  searchQuery === '' 
                    ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white' 
                    : 'bg-white/90 text-zinc-500 border-zinc-100 dark:bg-zinc-900/90 dark:text-zinc-400 dark:border-zinc-800'
                }`}
              >
                ALL
              </button>
              {uniqueAreas.map(area => (
                <button
                  key={area}
                  onClick={() => setSearchQuery(area)}
                  className={`whitespace-nowrap px-4 py-2 backdrop-blur-md rounded-[1rem] text-[10px] font-black tracking-widest uppercase border shadow-sm active:scale-95 transition-all ${
                    searchQuery === area
                      ? 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30'
                      : 'bg-white/90 text-zinc-500 border-zinc-100 dark:bg-zinc-900/90 dark:text-zinc-400 dark:border-zinc-800'
                  }`}
                >
                  #{area}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex space-x-2 pointer-events-auto px-2 animate-in fade-in duration-300">
              <button 
                onClick={() => setActiveTab('all')}
                className={`flex-1 py-3 rounded-[1.2rem] font-black text-[11px] tracking-widest uppercase transition-all ${
                  activeTab === 'all' 
                    ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-900/20 dark:bg-white dark:text-zinc-900' 
                    : 'bg-white text-zinc-500 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400'
                }`}
              >
                All Area Cats
              </button>
              <button 
                onClick={() => setActiveTab('discovered')}
                className={`flex-1 py-3 rounded-[1.2rem] font-black text-[11px] tracking-widest uppercase transition-all ${
                  activeTab === 'discovered' 
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' 
                    : 'bg-white text-zinc-500 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400'
                }`}
              >
                Discovered ({discoveredCount})
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 px-6 pt-[164px] pb-8 overflow-y-auto no-scrollbar">

        {/* 📍 แจ้งเตือนถ้าปิด location permission (ไม่บล็อกการใช้งาน แค่บอกว่าเรียงแบบเดิม) */}
        {locationStatus === 'denied' && !isLoading && catsList.length > 0 && (
          <div className="mb-4 flex items-center space-x-2 bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 rounded-[1rem] animate-in fade-in duration-300">
            <Navigation className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
              เปิด Location เพื่อเรียงแมวตามระยะใกล้-ไกลจากคุณ
            </span>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4 pt-10">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : catsList.length === 0 ? (
           // 🌟 กรณีที่ 1: DB ไม่มีข้อมูลแมวเลยสักตัวเดียว
           <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-in fade-in zoom-in-95 duration-300 pt-10">
             <div className="w-20 h-20 bg-orange-50 rounded-[1.5rem] flex items-center justify-center mb-4 dark:bg-orange-500/10 shadow-inner">
               <Camera className="h-8 w-8 text-orange-500" />
             </div>
             <h3 className="text-zinc-900 dark:text-white font-black text-xl mb-2">Database is Empty</h3>
             <p className="text-zinc-500 text-sm font-medium leading-relaxed">
               ยังไม่มีแมวในระบบเลย!<br/>เป็นคนแรกที่ปลดล็อคประวัติศาสตร์กันเถอะ
             </p>
             <Link 
               href="/hunt"
               className="mt-6 px-6 py-3 bg-orange-500 text-white rounded-[1rem] text-[11px] font-black tracking-widest uppercase active:scale-95 transition-transform shadow-lg shadow-orange-500/30"
             >
               Start Hunting
             </Link>
           </div>
        ) : filteredCats.length === 0 ? (
           // 🌟 กรณีที่ 2: มีแมวใน DB แต่พิมพ์ค้นหาแล้วไม่เจอ
           <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-in fade-in zoom-in-95 duration-300 pt-10">
             <div className="w-20 h-20 bg-zinc-100 rounded-[1.5rem] flex items-center justify-center mb-4 dark:bg-zinc-800 shadow-inner">
               <Search className="h-8 w-8 text-zinc-400" />
             </div>
             <h3 className="text-zinc-900 dark:text-white font-black text-xl mb-2">No Cats Found</h3>
             <p className="text-zinc-500 text-sm font-medium">
               We couldn't find any cats matching<br/>"<span className="text-orange-500 font-bold">{searchQuery}</span>"
             </p>
             <button 
               onClick={() => setSearchQuery('')}
               className="mt-6 px-6 py-3 bg-zinc-900 text-white rounded-[1rem] text-[11px] font-black tracking-widest uppercase active:scale-95 transition-transform dark:bg-white dark:text-zinc-900"
             >
               Clear Search
             </button>
           </div>
        ) : (
          // 🌟 กรณีที่ 3: มีแมว และผ่านการกรอง (Search/Tabs)
          <div className="grid grid-cols-2 gap-4">
            {filteredCats.map((cat) => (
              cat.isDiscovered ? (
                <Link 
                  key={cat.id} 
                  href={`/cats/${cat.id}`} 
                  className="relative aspect-[4/5] rounded-[1.5rem] overflow-hidden group active:scale-95 transition-transform block"
                >
                  <CatCardContent cat={cat} />
                </Link>
              ) : (
                <div 
                  key={cat.id} 
                  className="relative aspect-[4/5] rounded-[1.5rem] overflow-hidden group"
                >
                  <CatCardContent cat={cat} />
                </div>
              )
            ))}
          </div>
        )}

        <div className="h-24"></div>
      </div>

    </main>
  )
}