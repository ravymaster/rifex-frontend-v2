// pages/icons.js
import dynamic from "next/dynamic";
import Layout from "@/components/Layout";
const IconsGrid = dynamic(() => import("../components/IconsGrid"), { ssr: false });

export default function IconsPage() {
  return (
    <main style={{ padding: 24 }}>
      <IconsGrid />
    </main>
  );
}

IconsPage.getLayout = (page) => <Layout>{page}</Layout>;
