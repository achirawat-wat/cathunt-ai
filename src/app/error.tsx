'use client' // Error components must be Client Components

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('App Error Boundary caught:', error)
  }, [error])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center bg-zinc-50 dark:bg-zinc-950">
      <h2 className="text-xl font-bold text-red-500 mb-4">Something went wrong!</h2>
      <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-sm break-all bg-zinc-200 dark:bg-zinc-800 p-4 rounded-lg">
        {error.message || JSON.stringify(error)}
      </p>
      <button
        onClick={() => reset()}
        className="px-6 py-2 bg-orange-500 text-white rounded-full font-semibold active:scale-95 transition-transform"
      >
        Try again
      </button>
    </div>
  )
}
