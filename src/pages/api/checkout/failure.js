import Layout from '@/components/Layout';
export default function Failure(){
  return <main className="container" style={{padding:'24px'}}>
    <h1>Pago rechazado</h1>
    <p>Inténtalo nuevamente.</p>
  </main>;
}
Failure.getLayout = p => <Layout>{p}</Layout>;
