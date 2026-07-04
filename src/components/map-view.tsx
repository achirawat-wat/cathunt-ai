'use client'

import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation, ChevronRight, Loader2, MapPin } from 'lucide-react'

const catIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div class="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-orange-500 text-white shadow-xl shadow-orange-500/40 ring-[4px] ring-white active:scale-95 transition-transform dark:ring-zinc-900"><span class="text-2xl drop-shadow-sm">🐱</span></div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -28],
})

const userIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div class="relative flex h-14 w-14 items-center justify-center">
           <div class="absolute h-full w-full rounded-full bg-zinc-900/20 animate-ping dark:bg-white/20"></div>
           <div class="relative h-5 w-5 rounded-full bg-zinc-900 ring-[4px] ring-white shadow-lg dark:bg-white dark:ring-zinc-900"></div>
         </div>`,
  iconSize: [56, 56],
  iconAnchor: [28, 28],
})

// 🧩 Updater ควบคุมกล้องแบบ Ultra-Smooth
// 🧩 Updater ควบคุมกล้องแบบ Ultra-Smooth (แก้ปัญหาบัคเวลารูด Slider เร็วๆ)
function MapUpdater({ center, radius }: { center: [number, number], radius: number }) {
  const map = useMap()
  
  useEffect(() => {
    if (center && radius && map) {
      const latDelta = radius / 111.32
      const lngDelta = radius / (111.32 * Math.cos(center[0] * (Math.PI / 180)))

      const bounds = L.latLngBounds(
        [center[0] - latDelta, center[1] - lngDelta], 
        [center[0] + latDelta, center[1] + lngDelta]  
      )

      // 1. ปลดล็อคกำแพงก่อน เพื่อให้ซูมได้อย่างอิสระ
      map.setMinZoom(1)
      
      // @ts-ignore
      map.setMaxBounds(null)

      const targetZoom = map.getBoundsZoom(bounds)

      // 2. 🚨 เปลี่ยนจาก flyTo เป็น setView เพื่อไม่ให้กล้องตีโค้งซูมออก
      // ลด duration ลงเหลือ 0.5 วิ เพื่อให้มันตามนิ้วเราทันเวลารูด Slider เร็วๆ
      map.setView(center, targetZoom, { 
        animate: true,
        duration: 0.5 
      })

      // 3. สร้างฟังก์ชันล็อคกำแพงเมื่อกล้องซูมเสร็จ
      const onMoveEnd = () => {
        map.setMinZoom(targetZoom)
        map.setMaxBounds(bounds.pad(0.05))
      }

      map.once('moveend', onMoveEnd)

      // 4. 🚨 สำคัญมาก: ถ้าผู้ใช้รูด Slider ใหม่ก่อนแอนิเมชันเก่าจบ ให้ล้างคำสั่งล็อคกำแพงอันเก่าทิ้ง (กันบัคเด้งกลับ)
      return () => {
        map.off('moveend', onMoveEnd)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], radius, map])

  return null
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

interface MapViewProps {
  radius?: number
  data?: any[]
  onUpdateCount?: (count: number) => void
}

export default function MapView({ radius = 5, data = [], onUpdateCount }: MapViewProps) {
  const [userPosition, setUserPosition] = useState<[number, number]>([13.7465, 100.5327])
  const [isLocating, setIsLocating] = useState(false)

  const [customRenderer] = useState(() => L.svg({ padding: 2 }))

  const nearbyCats = data.map(encounter => {
    const distance = calculateDistance(userPosition[0], userPosition[1], encounter.lat, encounter.lng)
    return { ...encounter, distance }
  }).filter(cat => cat.distance <= radius)

  useEffect(() => {
    if (onUpdateCount) {
      onUpdateCount(nearbyCats.length)
    }
  }, [nearbyCats.length, onUpdateCount])

  const locateMe = () => {
    setIsLocating(true)
    if (!navigator.geolocation) {
      setIsLocating(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition([position.coords.latitude, position.coords.longitude])
        setIsLocating(false)
      },
      (error) => {
        console.error('Error:', error)
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    locateMe()
  }, [])

  return (
    <div className="relative h-full w-full z-0 bg-white dark:bg-zinc-950">
      <MapContainer 
        center={userPosition} 
        zoom={14} 
        zoomControl={false} 
        scrollWheelZoom={true} 
        doubleClickZoom={true} 
        touchZoom={true} 
        renderer={customRenderer}
        className="h-full w-full map-smooth-transition"
        style={{
           willChange: 'transform'
           // 🚨 เอา CSS transition ที่ซ้อนทับกันออกไป! ให้ Leaflet JS จัดการแอนิเมชันเองล้วนๆ
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          className="transition-opacity duration-1000 ease-in-out"
          keepBuffer={10} 
          updateWhenZooming={false} 
        />

        <MapUpdater center={userPosition} radius={radius} />

        <Circle 
          center={userPosition}
          radius={radius * 1000}
          pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.08, weight: 2, dashArray: '4 8' }}
        />

        <Marker position={userPosition} icon={userIcon} />

        {nearbyCats.map((cat) => (
          <Marker key={cat.id} position={[cat.lat, cat.lng]} icon={catIcon}>
            <Popup className="cat-popup">
              <div className="flex flex-col w-[180px]">
                
                <div className="w-full h-24 rounded-[1rem] overflow-hidden mb-3 bg-zinc-100">
                  <img 
                    src={cat.image_url}
                    className="w-full h-full object-cover"
                    alt={cat.cats?.name || 'Unknown Cat'}
                  />
                </div>

                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col">
                    <span className="font-black text-zinc-900 text-lg leading-none dark:text-white">
                      {cat.cats?.name || 'Unknown Cat'}
                    </span>
                    <div className="flex items-center space-x-1 mt-1 text-orange-500">
                      <MapPin className="h-3 w-3" />
                      <span className="text-[9px] font-bold tracking-widest uppercase truncate max-w-[120px]">
                        {cat.distance < 1 ? `${(cat.distance * 1000).toFixed(0)} M AWAY` : `${cat.distance.toFixed(1)} KM AWAY`}
                      </span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => window.location.href = `/cats/${cat.cats?.id}`}
                  className="flex w-full items-center justify-center space-x-1 rounded-[0.8rem] bg-zinc-900 py-2.5 text-[10px] font-black tracking-widest text-white transition-transform active:scale-95 dark:bg-white dark:text-zinc-900"
                >
                  <span>VIEW PROFILE</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <button 
        onClick={locateMe}
        disabled={isLocating}
        className="absolute bottom-[240px] right-6 z-[400] flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-white text-zinc-900 shadow-2xl shadow-zinc-900/20 ring-1 ring-zinc-100 active:scale-95 transition-transform disabled:opacity-80 dark:bg-zinc-900 dark:text-white dark:ring-zinc-800"
      >
        {isLocating ? (
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        ) : (
          <Navigation className="h-6 w-6 ml-[-2px] mb-[-2px]" />
        )}
      </button>
    </div>
  )
}