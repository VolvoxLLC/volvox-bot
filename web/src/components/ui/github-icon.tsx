import { siGithub } from 'simple-icons';

interface GithubIconProps {
  className?: string;
}

export function GithubIcon({ className }: GithubIconProps) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={siGithub.path} />
    </svg>
  );
}
