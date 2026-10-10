'use client';
export default function ErrorPage({reset}: {reset: () => void}) {
  return <main className="loading"><div><h1>Ada yang belum beres.</h1><p>Data tersimpan di server. Coba muat halaman kembali.</p><button className="primary" onClick={reset}>Coba lagi</button></div></main>;
}
