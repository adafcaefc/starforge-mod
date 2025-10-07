import ThreeSceneStatic from '@/components/ThreeSceneStatic'
import Link from 'next/link'

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
      {/* Navigation */}
      <nav className="absolute top-4 right-4 z-10">
        <Link
          href="/spaceship"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          🚀 Spaceship Scene
        </Link>
      </nav>
      
      <ThreeSceneStatic />
      {/* Lorem Ipsum content for scrolling */}
      <div style={{
        minHeight: '200vh',
        background: 'transparent',
        color: 'inherit',
        padding: '4rem 2rem',
        fontFamily: 'inherit',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', lineHeight: '1.8' }}>
          <h1 style={{ fontSize: '3rem', marginBottom: '2rem', textAlign: 'center', color: '#fff' }}>
            Lorem Ipsum Scroll Content
          </h1>
          
          <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: '#ccc' }}>
            What is Lorem Ipsum?
          </h2>
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
            Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged.
          </p>
          
          <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: '#ccc' }}>
            Why do we use it?
          </h2>
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
            It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using 'Content here, content here', making it look like readable English.
          </p>
          
          <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: '#ccc' }}>
            The Standard Chunk
          </h2>
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          </p>
          
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.
          </p>
          
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
            Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur.
          </p>
          
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
            At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga.
          </p>
          
          <h2 style={{ fontSize: '2rem', marginBottom: '1.5rem', color: '#ccc' }}>
            More Lorem Ipsum
          </h2>
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
            Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.
          </p>
          
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem' }}>
            Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          </p>
          
          <div style={{ textAlign: 'center', padding: '3rem 0', fontSize: '1.5rem', color: '#888' }}>
            🎯 Scroll up to interact with the 3D laptop! 🎯
          </div>
        </div>
      </div>
    </main>
  )
}