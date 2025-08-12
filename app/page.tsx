export default function Home() {
  return (
    <div className="container">
      <div className="card">
        <div className="card-head">
          <strong>Realm Library</strong>
        </div>
        <div className="card-body">
          <p className="muted">Go to your library or log in.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn" href="/books">Open Library</a>
            <a className="btn-ghost" href="/login">Login</a>
          </div>
        </div>
      </div>
    </div>
  );
}
