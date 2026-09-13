export function ServerCoverArt() {
  return (
    <div className="public-cover-art" aria-hidden="true">
      <svg viewBox="0 0 360 230" fill="none">
        <path
          d="M24 167h50l28-42h156l28 42h50M180 181v31M57 67h40m166 0h40"
          stroke="currentColor"
          strokeOpacity=".25"
          strokeWidth="2"
        />
        <circle cx="24" cy="167" r="5" fill="currentColor" fillOpacity=".4" />
        <circle cx="336" cy="167" r="5" fill="currentColor" fillOpacity=".4" />
        <circle cx="180" cy="212" r="5" fill="currentColor" fillOpacity=".4" />
        <rect
          x="96"
          y="34"
          width="168"
          height="156"
          rx="18"
          fill="currentColor"
          fillOpacity=".1"
        />
        {[48, 94, 140].map((y) => (
          <g key={y}>
            <rect
              x="109"
              y={y}
              width="142"
              height="36"
              rx="8"
              fill="currentColor"
              fillOpacity={y === 94 ? ".9" : ".17"}
            />
            <path
              d={`M124 ${y + 12}h47m-47 10h32`}
              stroke={y === 94 ? "white" : "currentColor"}
              strokeOpacity=".75"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle
              cx="233"
              cy={y + 18}
              r="4"
              fill={y === 94 ? "white" : "currentColor"}
              fillOpacity=".85"
            />
            <circle
              cx="219"
              cy={y + 18}
              r="4"
              fill={y === 94 ? "white" : "currentColor"}
              fillOpacity=".4"
            />
          </g>
        ))}
        <path
          d="M291 37v20m-10-10h20M53 110v14m-7-7h14"
          stroke="currentColor"
          strokeOpacity=".35"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
