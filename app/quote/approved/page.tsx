"use client";
import { Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
function Continue() {
  const params = useParams();
  const query = useSearchParams();
  useEffect(() => {
    const ref = query.get("jobId") || params?.jobId;
    const token = query.get("t");
    if (ref && token)
      window.location.replace(
        "https://newforestdevicerepairs.co.uk/repair-quote/?ref=" +
          encodeURIComponent(String(ref)) +
          "&t=" +
          encodeURIComponent(token),
      );
  }, [params, query]);
  return <p className="p-8">Opening your repair details…</p>;
}
export default function Page() {
  return (
    <Suspense>
      <Continue />
    </Suspense>
  );
}
