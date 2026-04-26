import Image from "next/image";
import Link from "next/link";
import { AccountPicker } from "./AccountPicker";

const NAV_LINKS = [
  { label: "Transactions", href: "/" },
  { label: "Summary", href: "/summary" },
  { label: "Edit", href: "/edit" },
  { label: "Import", href: "/import" },
  { label: "Accounts", href: "/accounts" },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-mc-gray/15">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16 gap-6">
        <a href="https://machcomputing.com" className="flex items-center gap-3">
          <Image src="/logo.png" alt="MACH COMPUTING" width={36} height={36} />
          <Image
            src="/text_logo.png"
            alt="MACH COMPUTING"
            width={160}
            height={20}
            className="hidden sm:block"
          />
        </a>
        <div className="flex items-center gap-4 lg:gap-8">
          <div className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-mc-gray hover:text-mc-dark transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <AccountPicker />
        </div>
      </div>
    </nav>
  );
}
