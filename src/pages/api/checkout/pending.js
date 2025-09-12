import Layout from '@/components/Layout';
export default function Pending(){
  return <main className="container" style={{padding:'24px'}}>
    <h1>Pago pendiente</h1>
    <p>Esperando confirmación del medio de pago.</p>
  </main>;
}
Pending.getLayout = p => <Layout>{p}</Layout>;
