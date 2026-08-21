import type { UserRole } from "@/types";

// A small "engineer" glyph (hard hat + shoulders) drawn on a colored circle,
// used everywhere we'd otherwise show a first-letter avatar. The color
// encodes the role so it stays a quick visual cue rather than pure
// decoration, and it works even when full_name is missing (a letter avatar
// falls back to "?").
const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-violet-600",
  manager: "bg-blue-600",
  consultant: "bg-teal-600",
  safety_officer: "bg-amber-500",
  contractor: "bg-amber-500",
};

const SIZE_CLASSES = {
  sm: { wrapper: "w-8 h-8", icon: "w-4 h-4" },
  md: { wrapper: "w-11 h-11", icon: "w-5 h-5" },
  lg: { wrapper: "w-14 h-14", icon: "w-6 h-6" },
} as const;

interface RoleAvatarProps {
  role: UserRole | string | null | undefined;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export default function RoleAvatar({ role, size = "md", className = "" }: RoleAvatarProps) {
  // A caller-supplied className is used verbatim in place of the role
  // color (e.g. the translucent circle on a colored stat card) — merging
  // two bg- utilities on one element is a coin flip on which one paints.
  const colorClass = className || (role && ROLE_COLORS[role as UserRole]) || "bg-slate-500";
  const { wrapper, icon } = SIZE_CLASSES[size];

  return (
    <div
      className={`${wrapper} rounded-full ${colorClass} text-white flex items-center justify-center shrink-0`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={icon}
        aria-hidden="true"
      >
        {/* hard hat */}
        <path
          d="M4.5 11.5C4.5 7.91 7.41 5 11 5h2c3.59 0 6.5 2.91 6.5 6.5V12H4.5v-.5Z"
          fill="currentColor"
        />
        <rect x="3.5" y="12" width="17" height="1.8" rx="0.9" fill="currentColor" />
        <rect x="11" y="3.2" width="2" height="2.2" rx="0.6" fill="currentColor" />
        {/* bust / shoulders */}
        <circle cx="12" cy="16.6" r="1.9" fill="currentColor" />
        <path
          d="M6.8 21.5c0-2.98 2.33-5.4 5.2-5.4s5.2 2.42 5.2 5.4"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
