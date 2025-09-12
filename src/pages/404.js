import Link from 'next/link';

export default function NotFound() {
  return (
    <section style={{
      minHeight:'calc(100vh - 64px)', display:'grid', placeItems:'center',
      background:'linear-gradient(135deg, rgba(30,58,138,.08), rgba(24,169,87,.08)) #F7F8FA'
    }}>
      <div style={{
        background:'#fff', border:'1px solid #E5E7EB', borderRadius:16, padding:24,
        boxShadow:'0 12px 26px rgba(0,0,0,.06)', textAlign:'center'
      }}>
        <h1 style={{margin:0, fontSize:28, fontWeight:800, color:'#1E3A8A'}}>404</h1>
        <p style={{color:'#6B7280', margin:'6px 0 14px'}}>Página no encontrada</p>
        <Link href="/" className="btn btn-primary">Volver al inicio</Link>
      </div>
    </section>
  );
}
