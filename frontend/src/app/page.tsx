import dynamic from 'next/dynamic'

const SplineScene = dynamic(() => import('@/components/SplineScene'), { ssr: false })

export default function Home() {
  return (
    <main
      className="flex min-h-screen flex-col"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        color: '#e5e5e5',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <SplineScene />
    </main>
  )
}