// src/pages/chat/[raffleId].js
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import styles from '@/styles/chat.module.css';

export default function ChatByRaffle() {
  const router = useRouter();
  const { raffleId } = router.query;

  // Mock
  const title = `Rifa #${raffleId || '…'}`;
  const estado = 'activa';
  const messages = [
    { id: 1, me: false, name: 'Ana', time: '10:02', text: '¡Hola! ¿Quedan números del 10 al 20?' },
    { id: 2, me: true,  name: 'Yo',  time: '10:03', text: '¡Hola Ana! Sí, hay varios disponibles 😊' },
    { id: 3, me: false, name: 'Ana', time: '10:04', text: 'Perfecto, me llevo el 12 y el 17. ¿Cómo pago?' },
    { id: 4, me: true,  name: 'Yo',  time: '10:05', text: 'Puedes pagar por MP o Flow, te paso link.' },
  ];

  return (
    <>
      <Head>
        <title>Chat — {title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <section className={styles.page}>
        <div className="container">
          <div className={styles.shell}>
            {/* Header del chat */}
            <header className={styles.chatHeader}>
              <div>
                <h1 className={styles.title}>Chat — {title}</h1>
                <p className={styles.sub}>Canal de conversación de la rifa. Al cerrar la rifa, este chat se archiva.</p>
              </div>
              <span className={styles.state} data-state={estado}>{estado}</span>
            </header>

            {/* Mensajes */}
            <div className={styles.body}>
              <div className={styles.messages}>
                {messages.map(m => (
                  <div key={m.id} className={`${styles.msg} ${m.me ? styles.me : styles.other}`}>
                    <div className={styles.meta}>
                      <span className={styles.name}>{m.me ? 'Tú' : m.name}</span>
                      <span className={styles.time}>{m.time}</span>
                    </div>
                    <div className={styles.bubble}>{m.text}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Input fijo abajo */}
            <form className={styles.inputBar} onSubmit={(e) => e.preventDefault()}>
              <input className="input" placeholder="Escribe un mensaje…" />
              <button className="btn btn-primary">Enviar</button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}

ChatByRaffle.getLayout = (page) => <Layout>{page}</Layout>;
