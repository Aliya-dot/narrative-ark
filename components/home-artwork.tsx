type JourneyKind = "define" | "remember" | "continue";

export function HeroBotanicalArtwork() {
  return (
    <svg aria-hidden="true" viewBox="0 0 190 420">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M20 395c54-78 45-169 72-250 12-36 29-68 57-97" />
        <path d="M68 246c-31-22-54-17-66 11 31 19 53 13 66-11Z" />
        <path d="M87 191c-27-29-51-29-68-4 27 25 50 25 68 4Z" />
        <path d="M105 135c-10-35 2-56 32-63 7 34-4 55-32 63Z" />
        <path d="M52 317c-25-17-43-12-52 13 25 14 42 10 52-13Z" />
        <path d="m29 330 28-9m-32-132 53-1m59-116-25 55" />
        <path d="m5 289 45-38 24 22-20 53-48 51Z" />
        <path d="m50 251-17 37 21 38 20-53-24-22Z" />
        <circle cx="48" cy="289" r="4" />
      </g>
    </svg>
  );
}

export function JourneyArtwork({ kind }: { kind: JourneyKind }) {
  if (kind === "remember") {
    return (
      <svg aria-hidden="true" viewBox="0 0 100 78">
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <path d="M9 19c17-5 29-1 41 9v39C38 57 26 53 9 58V19Z" />
          <path d="M91 19c-17-5-29-1-41 9v39c12-10 24-14 41-9V19ZM50 28v39" />
          <path d="M18 29c9-1 16 1 24 6M18 39c9-1 16 1 24 6M82 29c-9-1-16 1-24 6M82 39c-9-1-16 1-24 6" />
        </g>
      </svg>
    );
  }

  if (kind === "continue") {
    return (
      <svg aria-hidden="true" viewBox="0 0 100 78">
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <path d="M18 68h64M28 68V31C28 14 38 5 52 5s24 9 24 26v37" />
          <path d="M38 68V31c0-10 6-16 14-16s14 6 14 16v37M66 68l10-5" />
          <circle cx="58" cy="42" r="1.5" />
          <path d="M76 38c9-9 15-8 19 1-8 7-14 7-19-1Zm2 13c8-5 13-3 15 5-8 4-13 2-15-5Z" />
        </g>
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 100 78">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M49 69V36M49 50c-17-1-26-10-26-26 17 1 26 10 26 26Zm1-5c2-18 12-28 29-29-1 18-11 28-29 29Z" />
        <path d="M50 59c10-9 20-11 31-6-9 10-19 12-31 6ZM33 69h34" />
      </g>
    </svg>
  );
}

export function ProjectArtwork({ variant }: { variant: number }) {
  if (variant === 1) {
    return (
      <svg aria-hidden="true" viewBox="0 0 120 96">
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <path d="M18 91c34-32 47-57 58-86M33 81c-19-1-27-10-24-27 19 2 27 11 24 27Zm18-22c-15-7-19-17-11-30 15 7 19 17 11 30Zm17-23c1-16 9-24 24-24-1 16-9 24-24 24Zm-7 21c11-12 22-14 34-5-11 11-22 13-34 5Z" />
        </g>
      </svg>
    );
  }

  if (variant === 2) {
    return (
      <svg aria-hidden="true" viewBox="0 0 120 96">
        <g fill="none" stroke="currentColor" strokeLinecap="round">
          <path d="M48 87h42M60 87V37h22v50M56 37h30L72 16 56 37Z" />
          <path d="M66 16V6h7v10M66 48h10M66 59h10M66 70h10M46 87c0-16-9-24-26-24 1 15 9 23 26 24Z" />
        </g>
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 120 96">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M31 91V39C31 18 43 7 60 7s29 11 29 32v52M43 91V39c0-13 7-20 17-20s17 7 17 20v52" />
        <path d="M60 20v71M44 39h33M24 91h72M77 91l12-7" />
        <circle cx="69" cy="57" r="2" />
      </g>
    </svg>
  );
}
