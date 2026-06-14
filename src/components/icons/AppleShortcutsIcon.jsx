export function AppleShortcutsIcon({
  size = 16,
  className = "",
  title,
  ...props
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.16593 7.54673c-1.13208-.72047-1.13208-2.37303.00001-3.09344L6.29993 1.82256a3.16666 3.16666 0 0 1 3.4002 0l4.134 2.63073c1.13207.72042 1.13207 2.37298 0 3.09344l-4.134 2.63074a3.16666 3.16666 0 0 1-3.4002 0L2.16593 7.54673Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.1072 7.99067 9.70013 5.82255a3.16658 3.16658 0 0 0-3.40018 0L2.89289 7.99067l3.94391 2.5098a2.16678 2.16678 0 0 0 2.32647 0l3.94393-2.5098Zm.9072.59266a2.185 2.185 0 0 1-.18027.13007L9.70013 11.34413a3.16666 3.16666 0 0 1-3.4002 0L2.16593 8.7134a2.1804 2.1804 0 0 1-.18024-.13007c-.94824.77327-.88815 2.28347.18026 2.96334l4.13399 2.63073a3.16656 3.16656 0 0 0 3.40019 0l4.134-2.63073c1.06847-.67987 1.12853-2.19007.18027-2.96334Z"
        fill="currentColor"
      />
    </svg>
  );
}
