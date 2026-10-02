export function Header() {
  return (
    <header className="masthead">
      <div className="masthead-body">
        <h1 className="brand-mark">
          Signal <span aria-hidden="true">&gt;</span><span className="sr-only">greater than</span> Noise
        </h1>
        <div className="masthead-aside">
          <p className="masthead-summary">
            The stories worth knowing. The Signal explains why they matter.
          </p>
          <a className="masthead-daily-signal" href="#daily-signal">Get the Daily Signal</a>
        </div>
      </div>
    </header>
  );
}
