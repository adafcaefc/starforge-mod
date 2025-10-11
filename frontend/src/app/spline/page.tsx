import dynamic from "next/dynamic";

const SplineScene = dynamic(() => import("../../components/SplineScene"), { ssr: false });

export default function SplinePage() {
  return <SplineScene />;
}
