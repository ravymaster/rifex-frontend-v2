// pages/icons.js
import dynamic from "next/dynamic";
const IconsGrid = dynamic(() => import("../components/IconsGrid"), { ssr: false });

export default function IconsPage() {
  return (
    <main style={{ padding: 24 }}>
      <IconsGrid />
    </main>
  );
}
